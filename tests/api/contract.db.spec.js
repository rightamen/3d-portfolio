import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

// DB-backed contract suite (API_V1_FREEZE_PLAN.md §17). Locks the paths that
// the DB-free baseline (contract.spec.js) cannot reach:
//   1. admin 200 success envelopes with real sendPage pagination + legacy mirrors
//   2. real multipart multer errors (FILE_TOO_LARGE / INVALID_FILE_TYPE) end to end
//   3. AUTH_REQUIRED (401) when the auth store IS configured
//
// Requires a DISPOSABLE PostgreSQL provided via API_TEST_DATABASE_URL — run
// `npm run test:api:db`, which provisions a throwaway cluster in a temp
// directory and destroys it afterwards. The suite refuses to run against
// anything that does not look like a disposable test database and NEVER
// touches the production database.
const databaseUrl = process.env.API_TEST_DATABASE_URL || ''

test.skip(!databaseUrl, 'API_TEST_DATABASE_URL is not set; run npm run test:api:db')

const assertDisposableDatabaseUrl = (url) => {
  const databaseName = new URL(url).pathname.replace(/^\//, '')

  if (!/(test|e2e|local|dev)/i.test(databaseName)) {
    throw new Error(
      'API_TEST_DATABASE_URL must point to a database whose name contains test/e2e/local/dev.',
    )
  }
  if (/mrright_portfolio/i.test(databaseName)) {
    throw new Error('API_TEST_DATABASE_URL must never point to the production database.')
  }
}

const port = 4195
const baseURL = `http://127.0.0.1:${port}`
// Throwaway credential for this test process only — never logged, never persisted.
const adminToken = randomBytes(24).toString('hex')
const visitorPassword = `pw-${randomBytes(9).toString('hex')}`

let serverProcess
let visitorA // verified + logged in: { id, email, sessionToken }
let visitorB // registered but unverified: { id, email }
let seededPostId

const waitForHealth = async () => {
  const deadline = Date.now() + 30_000
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw lastError || new Error('Timed out waiting for local API server.')
}

const getJson = async (path, token) => {
  const response = await fetch(`${baseURL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const payload = await response.json()
  return { payload, response }
}

const sendJson = async (method, path, body, token) => {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  const payload = await response.json()
  return { payload, response }
}

const postForm = async (path, form, token) => {
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const payload = await response.json()
  return { payload, response }
}

// Mirrors expectContractShape in contract.spec.js (kept local so the DB-free
// baseline file stays untouched by this suite).
const expectContractShape = (payload, { legacyKeys = [] } = {}) => {
  expect(payload).toEqual(expect.any(Object))
  expect(payload).toHaveProperty('data')
  expect(payload).toHaveProperty('pagination')
  expect(payload).toHaveProperty('error')
  expect(payload.pagination).toEqual(expect.any(Object))

  if (payload.error !== null) {
    expect(payload.data).toBeNull()
    expect(payload.error).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    )
    expect(payload.error.code.length).toBeGreaterThan(0)
  }

  const allowedTopLevelKeys = new Set(['data', 'pagination', 'error', 'code', 'message', ...legacyKeys])
  for (const key of Object.keys(payload)) {
    expect(allowedTopLevelKeys.has(key), `Unexpected top-level key: ${key}`).toBe(true)
  }

  if (payload.data && typeof payload.data === 'object') {
    for (const key of legacyKeys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        expect(payload.data).toHaveProperty(key)
      }
    }
  }
}

// The six pagination fields frozen by API_V1_FREEZE_PLAN.md §8.
const expectRealPagination = (pagination) => {
  expect(Object.keys(pagination).sort()).toEqual([
    'hasNext',
    'hasPrevious',
    'limit',
    'page',
    'pages',
    'total',
  ])
  expect(pagination.hasNext).toEqual(expect.any(Boolean))
  expect(pagination.hasPrevious).toEqual(expect.any(Boolean))
  expect(pagination.limit).toEqual(expect.any(Number))
  expect(pagination.page).toEqual(expect.any(Number))
  expect(pagination.pages).toEqual(expect.any(Number))
  expect(pagination.total).toEqual(expect.any(Number))
}

const registerVisitor = async (displayName, email) => {
  const { payload, response } = await sendJson('POST', '/api/auth/register', {
    displayName,
    email,
    password: visitorPassword,
  })
  expect(response.status, `register ${email}`).toBe(201)
  // NODE_ENV !== 'production' exposes verification.devCode so the flow can be
  // completed without SMTP.
  return {
    devCode: payload.data.verification.devCode,
    id: payload.data.user.id,
  }
}

test.beforeAll(async () => {
  assertDisposableDatabaseUrl(databaseUrl)

  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      ADMIN_TOKEN: adminToken,
      // Non-production so register responses include verification.devCode.
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForHealth()

  // Seed via public APIs only (no direct SQL): two visitors, one community
  // post, one contact message — enough for non-empty admin lists and for
  // pagination math with limit=1.
  const registeredA = await registerVisitor('Contract Test Visitor A', 'contract-db-a@example.com')
  const verify = await sendJson('POST', '/api/auth/verify-email', {
    email: 'contract-db-a@example.com',
    code: registeredA.devCode,
  })
  expect(verify.response.status).toBe(200)
  visitorA = {
    id: registeredA.id,
    email: 'contract-db-a@example.com',
    sessionToken: verify.payload.data.session.token,
  }

  const registeredB = await registerVisitor('Contract Test Visitor B', 'contract-db-b@example.com')
  visitorB = { id: registeredB.id, email: 'contract-db-b@example.com' }

  const post = await sendJson(
    'POST',
    '/api/community/posts',
    { title: 'Contract test post', message: 'DB-backed contract seed post.', topic: 'general' },
    visitorA.sessionToken,
  )
  expect(post.response.status).toBe(201)
  seededPostId = post.payload.data.post.id

  const contact = await sendJson('POST', '/api/contact', {
    name: 'Contract Test',
    email: 'contract-db-contact@example.com',
    message: 'DB-backed contract seed message.',
  })
  expect(contact.response.status).toBe(201)
})

test.afterAll(async () => {
  if (!serverProcess) return
  serverProcess.kill('SIGTERM')
  await new Promise((resolve) => serverProcess.once('exit', resolve))
})

test.describe('db-backed admin 200 contract', () => {
  test('GET /api/admin/summary returns 200 envelope with legacy mirror', async () => {
    const { payload, response } = await getJson('/api/admin/summary', adminToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['summary'] })
    expect(payload.data.summary).toEqual(expect.any(Object))
    expect(payload.summary).toEqual(payload.data.summary)
    expect(payload.pagination).toEqual({})
  })

  test('GET /api/admin/visitors returns real sendPage pagination and legacy mirror', async () => {
    const { payload, response } = await getJson('/api/admin/visitors', adminToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['visitors'] })
    expect(Array.isArray(payload.data.visitors)).toBe(true)
    expect(payload.visitors).toEqual(payload.data.visitors)

    expectRealPagination(payload.pagination)
    expect(payload.pagination.page).toBe(1)
    expect(payload.pagination.limit).toBe(20)
    expect(payload.pagination.total).toBeGreaterThanOrEqual(2)
    expect(payload.pagination.hasPrevious).toBe(false)

    const emails = payload.data.visitors.map((visitor) => visitor.email)
    expect(emails).toContain(visitorA.email)
    expect(emails).toContain(visitorB.email)
  })

  test('GET /api/admin/visitors pagination math holds for limit=1', async () => {
    const firstPage = await getJson('/api/admin/visitors?page=1&limit=1', adminToken)
    expect(firstPage.response.status).toBe(200)
    expectRealPagination(firstPage.payload.pagination)
    expect(firstPage.payload.data.visitors).toHaveLength(1)
    expect(firstPage.payload.pagination.limit).toBe(1)
    expect(firstPage.payload.pagination.pages).toBeGreaterThanOrEqual(2)
    expect(firstPage.payload.pagination.hasNext).toBe(true)
    expect(firstPage.payload.pagination.hasPrevious).toBe(false)

    const secondPage = await getJson('/api/admin/visitors?page=2&limit=1', adminToken)
    expect(secondPage.response.status).toBe(200)
    expect(secondPage.payload.data.visitors).toHaveLength(1)
    expect(secondPage.payload.pagination.page).toBe(2)
    expect(secondPage.payload.pagination.hasPrevious).toBe(true)
  })

  test('GET /api/admin/visitors/:id returns visitor detail envelope', async () => {
    const { payload, response } = await getJson(`/api/admin/visitors/${visitorA.id}`, adminToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['visitor', 'recentActions'] })
    expect(payload.data.visitor.id).toBe(visitorA.id)
    expect(Array.isArray(payload.data.recentActions)).toBe(true)
  })

  test('visitor detail sub-pages return items with real pagination', async () => {
    for (const section of ['comments', 'posts', 'uploads', 'download-requests', 'actions']) {
      const { payload, response } = await getJson(
        `/api/admin/visitors/${visitorA.id}/${section}`,
        adminToken,
      )

      expect(response.status, `sub-page ${section}`).toBe(200)
      expectContractShape(payload, { legacyKeys: ['items'] })
      expect(Array.isArray(payload.data.items), `sub-page ${section} items`).toBe(true)
      expect(payload.items).toEqual(payload.data.items)
      expectRealPagination(payload.pagination)
    }

    const posts = await getJson(`/api/admin/visitors/${visitorA.id}/posts`, adminToken)
    expect(posts.payload.data.items.map((item) => item.id)).toContain(seededPostId)
  })

  test('admin list endpoints return 200 envelopes with legacy mirrors', async () => {
    const endpoints = [
      { path: '/api/admin/comments', key: 'comments' },
      { path: '/api/admin/likes', key: 'likes' },
      { path: '/api/admin/contact-messages', key: 'messages', nonEmpty: true },
      { path: '/api/admin/download-requests', key: 'requests' },
      { path: '/api/admin/projects', key: 'projects', nonEmpty: true },
      { path: '/api/admin/community-uploads', key: 'uploads' },
      { path: '/api/admin/community-posts', key: 'posts', nonEmpty: true },
      { path: '/api/admin/community-comments', key: 'comments' },
    ]

    for (const { path, key, nonEmpty } of endpoints) {
      const { payload, response } = await getJson(path, adminToken)

      expect(response.status, path).toBe(200)
      expectContractShape(payload, { legacyKeys: [key] })
      expect(Array.isArray(payload.data[key]), `${path} data.${key}`).toBe(true)
      expect(payload[key], `${path} legacy mirror`).toEqual(payload.data[key])
      if (nonEmpty) expect(payload.data[key].length, `${path} seeded`).toBeGreaterThan(0)
    }

    const communityPosts = await getJson('/api/admin/community-posts', adminToken)
    expect(communityPosts.payload.data.posts.map((post) => post.id)).toContain(seededPostId)
  })

  test('admin write returns 200 envelope and 404 VISITOR_NOT_FOUND', async () => {
    const missing = await sendJson(
      'PATCH',
      '/api/admin/visitors/does-not-exist/profile-visibility',
      { disabled: true },
      adminToken,
    )
    expect(missing.response.status).toBe(404)
    expectContractShape(missing.payload)
    expect(missing.payload.error.code).toBe('VISITOR_NOT_FOUND')

    // Round-trip on the throwaway visitor B inside the disposable database:
    // disable, assert, then restore.
    const disabled = await sendJson(
      'PATCH',
      `/api/admin/visitors/${visitorB.id}/profile-visibility`,
      { disabled: true, reason: 'contract test round-trip' },
      adminToken,
    )
    expect(disabled.response.status).toBe(200)
    expectContractShape(disabled.payload, { legacyKeys: ['visitor'] })
    expect(disabled.payload.data.visitor.profileAdminDisabled).toBe(true)

    const restored = await sendJson(
      'PATCH',
      `/api/admin/visitors/${visitorB.id}/profile-visibility`,
      { disabled: false, reason: 'contract test round-trip' },
      adminToken,
    )
    expect(restored.response.status).toBe(200)
    expect(restored.payload.data.visitor.profileAdminDisabled).toBe(false)
  })

  test('admin auth still rejects bad tokens when the store is configured', async () => {
    const { payload, response } = await getJson('/api/admin/summary', 'not-the-admin-token')

    expect(response.status).toBe(401)
    expectContractShape(payload)
    expect(payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })
})

test.describe('db-backed auth contract', () => {
  test('account endpoints return AUTH_REQUIRED when the store exists', async () => {
    for (const path of ['/api/account/profile', '/api/account/downloads', '/api/account/comments']) {
      const { payload, response } = await getJson(path)

      expect(response.status, path).toBe(401)
      expectContractShape(payload)
      expect(payload.error.code, path).toBe('AUTH_REQUIRED')
    }
  })

  test('GET /api/account/profile returns 200 envelope for a signed-in visitor', async () => {
    const { payload, response } = await getJson('/api/account/profile', visitorA.sessionToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['profile'] })
    expect(payload.data.profile.email).toBe(visitorA.email)
  })
})

test.describe('db-backed real multer upload errors', () => {
  test('oversized avatar upload returns FILE_TOO_LARGE envelope (413)', async () => {
    // Avatar limit is 2 MiB; a 3 MiB body with a valid extension + mimetype
    // passes the fileFilter and trips MulterError LIMIT_FILE_SIZE mid-stream.
    const form = new FormData()
    form.append(
      'file',
      new Blob([Buffer.alloc(3 * 1024 * 1024, 0xff)], { type: 'image/jpeg' }),
      'contract-test-huge.jpg',
    )

    const { payload, response } = await postForm('/api/account/avatar', form, visitorA.sessionToken)

    expect(response.status).toBe(413)
    expectContractShape(payload)
    expect(payload.error.code).toBe('FILE_TOO_LARGE')
    expect(typeof payload.error).not.toBe('string')
  })

  test('unsupported community upload returns INVALID_FILE_TYPE envelope (400)', async () => {
    const form = new FormData()
    form.append(
      'file',
      new Blob(['not a model or image'], { type: 'text/plain' }),
      'contract-test-notes.txt',
    )

    const { payload, response } = await postForm(
      '/api/community/uploads',
      form,
      visitorA.sessionToken,
    )

    expect(response.status).toBe(400)
    expectContractShape(payload)
    expect(payload.error.code).toBe('INVALID_FILE_TYPE')
    expect(typeof payload.error).not.toBe('string')
  })
})
