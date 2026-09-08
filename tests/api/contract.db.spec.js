import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const loginLockAfter = 3
const verificationMaxAttempts = 3

let serverProcess
let visitorA // verified + logged in: { id, email, sessionToken }
let visitorB // registered but unverified: { id, email }
let seededPostId
let uploadsBeforeRun = new Set()

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const uploadRoot = path.join(repoRoot, 'public', 'uploads')

// The database this suite runs against is disposable; the files are not. Every
// upload test posts through the real endpoint, so the server writes a real file
// into public/uploads and nobody owned it afterwards — 20 stray one-pixel PNGs
// had piled up there, and vite copies public/ wholesale into dist/, which is
// what deploy:vps ships. Snapshot the tree first and remove exactly what this
// run added: never a pre-existing file, never anything outside public/uploads.
const listUploadFiles = async (dir = uploadRoot) => {
  const found = new Set()
  let entries

  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return found // the tree is created on first upload; absent is fine
  }

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      for (const nested of await listUploadFiles(absolute)) found.add(nested)
    } else if (entry.isFile()) {
      found.add(absolute)
    }
  }

  return found
}

const removeUploadsAddedByRun = async () => {
  const removed = []

  for (const absolute of await listUploadFiles()) {
    if (uploadsBeforeRun.has(absolute)) continue
    // Belt and braces: the walk starts at uploadRoot, so this can only fail if
    // something above changed, and deleting outside it must never happen.
    if (!absolute.startsWith(`${uploadRoot}${path.sep}`)) continue

    await unlink(absolute)
    removed.push(path.relative(repoRoot, absolute))
  }

  if (removed.length) console.log(`[contract.db] removed ${removed.length} test upload(s)`)
}

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

const getJson = async (path, token, extraHeaders = {}) => {
  const response = await fetch(`${baseURL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
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
  // The test runner explicitly enables verification.devCode so this flow can
  // be completed without SMTP. Production never enables that flag.
  return {
    devCode: payload.data.verification.devCode,
    id: payload.data.user.id,
  }
}

test.beforeAll(async () => {
  assertDisposableDatabaseUrl(databaseUrl)
  uploadsBeforeRun = await listUploadFiles()

  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      ADMIN_TOKEN: adminToken,
      // Keep the test-only route available; the runner supplies the explicit
      // EXPOSE_DEV_VERIFICATION_CODE flag for verification.devCode.
      NODE_ENV: 'test',
      // Lowered so the lockout and code-budget tests do not have to issue the
      // production number of attempts. The behaviour under test is the budget
      // existing at all, not its exact size.
      LOGIN_LOCK_AFTER: String(loginLockAfter),
      LOGIN_LOCK_MINUTES: '15',
      VERIFICATION_MAX_ATTEMPTS: String(verificationMaxAttempts),
      // Stable so anonymous like identities do not change mid-suite.
      VISITOR_ID_SECRET: 'contract-test-visitor-secret',
      // The suite needs more throwaway accounts and reset mails per run than
      // the production per-IP budgets allow.
      REGISTER_LIMIT_PER_HOUR: '40',
      FORGOT_PASSWORD_LIMIT_PER_HOUR: '30',
      LOGIN_LIMIT_PER_WINDOW: '200',
      VERIFY_LIMIT_PER_WINDOW: '200',
      RESEND_LIMIT_PER_HOUR: '30',
      // Raised above the production default of 30 so the suite's own uploads
      // never trip it, while still being reachable by the quota test at the end.
      UPLOAD_QUOTA_MAX_FILES: '40',
      // The sitemap is cached for five minutes in production. The suite
      // publishes and hides a work and then reads it back, which that cache
      // would hide entirely.
      SITEMAP_CACHE_MS: '0',
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

  // Verify the actual password-login path separately from email verification:
  // this catches async password-hash regressions and proves the returned
  // session can replace the verification session.
  const login = await sendJson('POST', '/api/auth/login', {
    email: visitorA.email,
    password: visitorPassword,
  })
  expect(login.response.status).toBe(200)
  expect(login.payload.data.session.token).toEqual(expect.any(String))
  visitorA.sessionToken = login.payload.data.session.token

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
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    await new Promise((resolve) => serverProcess.once('exit', resolve))
  }

  // After the server is down, so nothing is mid-write.
  await removeUploadsAddedByRun()
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

// Reverse-mirror pagination contract for the /api/v1 dual mount (freeze plan
// §3/§16): a real sendPage endpoint must keep its top-level legacy mirror on
// /api/* while /api/v1/* stays strict (data/pagination/error only) with the
// SAME six-field pagination object. Lives in the DB suite because real
// pagination is only reachable with a configured adminStore. Uses the
// admin/visitors route mechanically — admin remains Web-only and is NOT part
// of the C++ v1 contract.
test.describe('db-backed /api/v1 strict pagination (reverse mirror)', () => {
  test('legacy /api keeps visitors mirror; /api/v1 keeps only the strict envelope', async () => {
    const legacy = await getJson('/api/admin/visitors?page=1&limit=1', adminToken)
    const v1 = await getJson('/api/v1/admin/visitors?page=1&limit=1', adminToken)

    expect(legacy.response.status).toBe(200)
    expect(v1.response.status).toBe(200)

    // Legacy: mirror present and identical to data.visitors.
    expectContractShape(legacy.payload, { legacyKeys: ['visitors'] })
    expect(legacy.payload.visitors).toEqual(legacy.payload.data.visitors)

    // Strict v1: exactly data/pagination/error, no visitors/items at top level.
    expect(Object.keys(v1.payload).sort()).toEqual(['data', 'error', 'pagination'])
    expect(v1.payload.data.visitors).toEqual(legacy.payload.data.visitors)

    // Real pagination survives unchanged in the strict envelope.
    expectRealPagination(v1.payload.pagination)
    expect(v1.payload.pagination).toEqual(legacy.payload.pagination)
    expect(v1.payload.pagination.limit).toBe(1)
  })

  test('visitor detail sub-page on /api/v1 drops the items mirror, keeps pagination', async () => {
    const v1 = await getJson(`/api/v1/admin/visitors/${visitorA.id}/posts`, adminToken)

    expect(v1.response.status).toBe(200)
    expect(Object.keys(v1.payload).sort()).toEqual(['data', 'error', 'pagination'])
    expect(Array.isArray(v1.payload.data.items)).toBe(true)
    expectRealPagination(v1.payload.pagination)
  })
})

test.describe('db-backed auth contract', () => {
  test('auth responses are explicitly non-cacheable', async () => {
    const { payload, response } = await getJson('/api/auth/me')

    expect(response.status).toBe(200)
    expect(payload.data.user).toBeNull()
    expect(response.headers.get('cache-control')).toContain('no-store')

    // A previously cached anonymous response must not turn a post-login
    // session check into an empty 304 response.
    const conditional = await getJson('/api/auth/me', '', {
      'If-None-Match': response.headers.get('etag') || 'W/"stale-auth-response"',
    })
    expect(conditional.response.status).toBe(200)
    expect(conditional.payload.data.user).toBeNull()
  })

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

  // Regression coverage: the avatar/banner fileFilter rejects with a DIFFERENT
  // message ("Only JPG, PNG, and WebP images are allowed.") than the
  // community/admin fileFilter ("Unsupported file type."). describeUploadError
  // used to match on message only, so this path fell through to the final
  // error middleware and returned INTERNAL_ERROR 500 instead of
  // INVALID_FILE_TYPE 400 (see PROJECT_PROGRESS.md 2026-07-03 technical note).
  // Both routes now attach a stable error.code, checked here on both the
  // legacy /api/* mirror and the strict /api/v1/* envelope.
  for (const { field, path } of [
    { field: 'avatar', path: '/api/account/avatar' },
    { field: 'banner', path: '/api/account/banner' },
  ]) {
    test(`unsupported ${field} upload returns INVALID_FILE_TYPE, never INTERNAL_ERROR (legacy /api)`, async () => {
      const form = new FormData()
      form.append(
        'file',
        new Blob(['not an image'], { type: 'text/plain' }),
        `contract-test-${field}.txt`,
      )

      const { payload, response } = await postForm(path, form, visitorA.sessionToken)

      expect(response.status).toBe(400)
      expectContractShape(payload)
      expect(payload.error.code).toBe('INVALID_FILE_TYPE')
      expect(typeof payload.error).not.toBe('string')
      expect(response.status).not.toBe(500)
      expect(payload.error.code).not.toBe('INTERNAL_ERROR')
    })

    test(`unsupported ${field} upload returns strict v1 INVALID_FILE_TYPE envelope (no legacy mirror)`, async () => {
      const form = new FormData()
      form.append(
        'file',
        new Blob(['not an image'], { type: 'text/plain' }),
        `contract-test-${field}-v1.txt`,
      )

      const { payload, response } = await postForm(
        `/api/v1${path.replace('/api', '')}`,
        form,
        visitorA.sessionToken,
      )

      expect(response.status).toBe(400)
      expect(Object.keys(payload).sort()).toEqual(['data', 'error', 'pagination'])
      expect(payload.data).toBeNull()
      expect(typeof payload.error).not.toBe('string')
      expect(payload.error.code).toBe('INVALID_FILE_TYPE')
    })
  }
})

// PII containment. An earlier release leaked visitor_users.email through every
// public community, profile, and interaction response, because the row mappers
// in server/postgresStores.js emitted `email: row.email` unconditionally. Email
// is now opt-in (toUserSummary's includeEmail, passed only by adminStore call
// sites) and the public-path queries no longer select the column at all.
// Nothing covered that, so the leak could come back silently.
//
// Both directions are asserted on purpose: public payloads must not contain a
// registration address anywhere, AND admin payloads must still contain it.
// Without the second half, deleting the field admin moderation depends on
// would make this suite pass.
test.describe('visitor email containment', () => {
  const publicHandle = 'contract-visitor-a'
  const projectSlug = 'fire-extinguisher-next-gen'

  const expectNoRegistrationEmail = (payload, label) => {
    const serialized = JSON.stringify(payload)
    for (const email of [visitorA.email, visitorB.email]) {
      expect(serialized.includes(email), `${label} leaked ${email}`).toBe(false)
    }
  }

  test.beforeAll(async () => {
    // /api/users/:handle only resolves once the account has a public handle.
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      {
        activityPublic: true,
        contactsPublic: false,
        displayName: 'Contract Test Visitor A',
        handle: publicHandle,
        profilePublic: true,
      },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)

    // Author-bearing rows on both comment tables, so the assertions below run
    // against populated user summaries rather than empty lists.
    const communityComment = await sendJson(
      'POST',
      `/api/community/posts/${seededPostId}/comments`,
      { message: 'Email containment seed comment.' },
      visitorA.sessionToken,
    )
    expect(communityComment.response.status).toBe(201)

    const projectComment = await sendJson(
      'POST',
      `/api/projects/${projectSlug}/comments`,
      { message: 'Email containment seed project comment.' },
      visitorA.sessionToken,
    )
    expect(projectComment.response.status).toBe(201)
  })
  test('public read endpoints never expose a registration email', async () => {
    const publicPaths = [
      '/api/community/posts',
      '/api/community/uploads',
      `/api/community/posts/${seededPostId}`,
      `/api/community/posts/${seededPostId}/comments`,
      `/api/projects/${projectSlug}/interactions`,
      `/api/users/${publicHandle}`,
      `/api/users/${publicHandle}/posts`,
      `/api/users/${publicHandle}/resources`,
      `/api/users/${publicHandle}/activity`,
    ]

    for (const path of publicPaths) {
      const { payload, response } = await getJson(path)
      expect(response.status, `${path} status`).toBe(200)
      expectNoRegistrationEmail(payload, path)
    }
  })

  test('an authenticated viewer does not see emails either, including their own rows', async () => {
    // The viewer's own email is legitimately available from /api/account/profile.
    // It must still not ride along on shared community content, which is what
    // the old mappers did.
    for (const path of [
      '/api/community/posts',
      `/api/community/posts/${seededPostId}/comments`,
      '/api/account/community',
    ]) {
      const { payload, response } = await getJson(path, visitorA.sessionToken)
      expect(response.status, `${path} status`).toBe(200)
      expectNoRegistrationEmail(payload, `${path} (authenticated)`)
    }
  })

  test('public user summaries carry exactly id/displayName/accessLevel', async () => {
    const { payload, response } = await getJson(
      `/api/community/posts/${seededPostId}/comments`,
      visitorA.sessionToken,
    )
    expect(response.status).toBe(200)

    const summaries = payload.data.comments.map((comment) => comment.user).filter(Boolean)
    expect(summaries.length).toBeGreaterThan(0)
    for (const summary of summaries) {
      expect(Object.keys(summary).sort()).toEqual(['accessLevel', 'displayName', 'id'])
    }
  })

  test('admin responses still include the email that moderation depends on', async () => {
    // The mirror of the assertions above: proves the email was removed from the
    // public path only, not dropped everywhere. Without this, deleting the
    // column from every query would still pass the leak tests.
    for (const path of ['/api/admin/community-posts', '/api/admin/comments', '/api/admin/visitors']) {
      const { payload, response } = await getJson(path, adminToken)
      expect(response.status, `${path} status`).toBe(200)
      expect(JSON.stringify(payload), `${path} should retain email`).toContain(visitorA.email)
    }
  })
})

test.describe('project source download authorization', () => {
  const projectSlug = 'fire-extinguisher-next-gen'
  const downloadPath = `/api/projects/${projectSlug}/download`

  test('download without approved request returns 403 RESOURCE_FORBIDDEN', async () => {
    const { payload, response } = await getJson(downloadPath, visitorB.sessionToken)

    expect(response.status).toBe(403)
    expectContractShape(payload)
    expect(payload.error.code).toBe('RESOURCE_FORBIDDEN')
    expect(payload.error.message).toContain('approved request')
  })

  test('download with admin token bypasses authorization (even if archive missing)', async () => {
    // Archive doesn't exist in the test environment, so admin gets 404 from
    // file-not-found rather than 403 from lack-of-approval.
    const { payload, response } = await getJson(downloadPath, adminToken)

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('PROJECT_NOT_FOUND')
    expect(payload.error.message).toContain('Source archive not available')
  })

  test('download with approved request returns 404 when archive missing', async () => {
    // Submit and approve a download request for visitorA
    const requestRes = await sendJson(
      'POST',
      `/api/projects/${projectSlug}/download-requests`,
      {
        name: visitorA.displayName || 'Contract Test Visitor A',
        email: visitorA.email,
        purpose: 'Testing download authorization flow.',
      },
      visitorA.sessionToken,
    )
    expect(requestRes.response.status).toBe(201)

    const requestId = requestRes.payload.data.request.id
    const approveRes = await sendJson(
      'PATCH',
      `/api/admin/download-requests/${requestId}`,
      { status: 'approved' },
      adminToken,
    )
    expect(approveRes.response.status).toBe(200)

    // Now the approval exists, but the archive file doesn't
    const { payload, response } = await getJson(downloadPath, visitorA.sessionToken)

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('PROJECT_NOT_FOUND')
  })

  test('download ticket is refused without an approved request', async () => {
    const { payload, response } = await sendJson(
      'POST',
      `/api/projects/${projectSlug}/download-ticket`,
      {},
      visitorB.sessionToken,
    )

    expect(response.status).toBe(403)
    expectContractShape(payload)
    expect(payload.error.code).toBe('RESOURCE_FORBIDDEN')
  })

  test('download ticket is single-use', async () => {
    // visitorA's request was approved by the previous test in this group.
    const issued = await sendJson(
      'POST',
      `/api/projects/${projectSlug}/download-ticket`,
      {},
      visitorA.sessionToken,
    )
    expect(issued.response.status).toBe(201)
    const ticket = issued.payload.data.ticket.token
    expect(ticket).toEqual(expect.any(String))

    // First redemption gets past authorization and fails only because the
    // archive is absent in the test environment — the ticket is spent.
    const first = await getJson(`${downloadPath}?ticket=${ticket}`)
    expect(first.response.status).toBe(404)
    expect(first.payload.error.code).toBe('PROJECT_NOT_FOUND')

    const replay = await getJson(`${downloadPath}?ticket=${ticket}`)
    expect(replay.response.status).toBe(403)
    expectContractShape(replay.payload)
    expect(replay.payload.error.code).toBe('DOWNLOAD_TICKET_INVALID')
  })

  test('a forged ticket is rejected', async () => {
    const { payload, response } = await getJson(`${downloadPath}?ticket=not-a-real-ticket`)

    expect(response.status).toBe(403)
    expectContractShape(payload)
    expect(payload.error.code).toBe('DOWNLOAD_TICKET_INVALID')
  })
})

// Registers and verifies a throwaway account so tests that lock out, rotate
// credentials, or delete an account never disturb the shared visitorA/visitorB.
const createVerifiedVisitor = async (label) => {
  const email = `contract-db-${label}@example.com`
  const registered = await registerVisitor(`Contract ${label}`, email)
  const verified = await sendJson('POST', '/api/auth/verify-email', {
    email,
    code: registered.devCode,
  })
  expect(verified.response.status, `verify ${email}`).toBe(200)

  return { email, id: registered.id, sessionToken: verified.payload.data.session.token }
}

test.describe('per-account credential throttling', () => {
  test('repeated wrong passwords lock the account, even for the correct password', async () => {
    const visitor = await createVerifiedVisitor('lockout')

    for (let attempt = 0; attempt < loginLockAfter; attempt += 1) {
      const wrong = await sendJson('POST', '/api/auth/login', {
        email: visitor.email,
        password: 'definitely-not-the-password',
      })
      expect(wrong.response.status, `attempt ${attempt + 1}`).toBe(401)
      expect(wrong.payload.error.code).toBe('VALIDATION_ERROR')
    }

    // The whole point: the budget is spent, so even the real password is
    // refused. An attacker who guesses it inside the window gains nothing.
    const correct = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(correct.response.status).toBe(423)
    expectContractShape(correct.payload)
    expect(correct.payload.error.code).toBe('ACCOUNT_LOCKED')
  })

  test('a successful sign-in clears the failure budget', async () => {
    const visitor = await createVerifiedVisitor('lockout-reset')

    const wrong = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: 'wrong-password-once',
    })
    expect(wrong.response.status).toBe(401)

    const good = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(good.response.status).toBe(200)

    // Without the reset, this run of failures would trip the lock one attempt
    // early and the account would be locked below.
    for (let attempt = 0; attempt < loginLockAfter - 1; attempt += 1) {
      await sendJson('POST', '/api/auth/login', {
        email: visitor.email,
        password: 'wrong-password-again',
      })
    }

    const stillOpen = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(stillOpen.response.status).toBe(200)
  })

  test('an unknown address never locks and never reveals itself', async () => {
    for (let attempt = 0; attempt < loginLockAfter + 2; attempt += 1) {
      const { payload, response } = await sendJson('POST', '/api/auth/login', {
        email: 'contract-db-nobody@example.com',
        password: 'whatever',
      })

      // Always the same 401 VALIDATION_ERROR a wrong password gets: a 423 here
      // would confirm the address is registered.
      expect(response.status).toBe(401)
      expect(payload.error.code).toBe('VALIDATION_ERROR')
    }
  })

  test('wrong verification codes burn a per-account budget and void the code', async () => {
    const email = 'contract-db-codebudget@example.com'
    const registered = await registerVisitor('Contract Code Budget', email)

    for (let attempt = 0; attempt < verificationMaxAttempts; attempt += 1) {
      const wrong = await sendJson('POST', '/api/auth/verify-email', { email, code: '000000' })
      expect(wrong.response.status).toBe(400)
    }

    // Six digits is a million guesses; without this budget an attacker rotating
    // IPs walks the space and takes over the unverified registration.
    const withRealCode = await sendJson('POST', '/api/auth/verify-email', {
      email,
      code: registered.devCode,
    })
    expect(withRealCode.response.status).toBe(400)
    expect(withRealCode.payload.error.code).toBe('VALIDATION_ERROR')

    // A fresh code resets the budget, otherwise the account is bricked.
    const resent = await sendJson('POST', '/api/auth/resend-verification', { email })
    expect(resent.response.status).toBe(200)

    const completed = await sendJson('POST', '/api/auth/verify-email', {
      email,
      code: resent.payload.data.verification.devCode,
    })
    expect(completed.response.status).toBe(200)
  })
})

test.describe('password reset', () => {
  test('forgot-password answers identically for registered and unknown addresses', async () => {
    const unknown = await sendJson('POST', '/api/auth/forgot-password', {
      email: 'contract-db-not-registered@example.com',
    })

    expect(unknown.response.status).toBe(200)
    expectContractShape(unknown.payload, { legacyKeys: ['reset'] })
    expect(unknown.payload.data.reset.delivery).toBe('accepted')
    // No code is minted for an address that does not exist, and the response
    // must not hint at that.
    expect(unknown.payload.data.reset.devCode).toBeUndefined()
  })

  test('a reset replaces the password and invalidates every existing session', async () => {
    const visitor = await createVerifiedVisitor('reset')
    const newPassword = `reset-${randomBytes(8).toString('hex')}`

    // Prove the session works before the reset.
    const before = await getJson('/api/account/profile', visitor.sessionToken)
    expect(before.response.status).toBe(200)

    const requested = await sendJson('POST', '/api/auth/forgot-password', { email: visitor.email })
    expect(requested.response.status).toBe(200)
    const code = requested.payload.data.reset.devCode
    expect(code).toEqual(expect.any(String))

    const wrongCode = await sendJson('POST', '/api/auth/reset-password', {
      email: visitor.email,
      code: '000000',
      password: newPassword,
    })
    expect(wrongCode.response.status).toBe(400)
    expect(wrongCode.payload.error.code).toBe('PASSWORD_RESET_INVALID')

    const reset = await sendJson('POST', '/api/auth/reset-password', {
      email: visitor.email,
      code,
      password: newPassword,
    })
    expect(reset.response.status).toBe(200)
    expect(reset.payload.data.session.token).toEqual(expect.any(String))

    // Resetting after a suspected compromise is worthless if the attacker's
    // session survives it.
    const after = await getJson('/api/account/profile', visitor.sessionToken)
    expect(after.response.status).toBe(401)

    const oldPassword = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(oldPassword.response.status).toBe(401)

    const newLogin = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: newPassword,
    })
    expect(newLogin.response.status).toBe(200)
  })

  test('a weak password is refused at reset time', async () => {
    const { payload, response } = await sendJson('POST', '/api/auth/reset-password', {
      email: 'contract-db-reset@example.com',
      code: '123456',
      password: 'password',
    })

    // Rejected on strength before the code is even considered.
    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toContain('too common')
  })
})

test.describe('account security self-service', () => {
  test('changing the password requires the current one and drops other sessions', async () => {
    const visitor = await createVerifiedVisitor('pwchange')
    const newPassword = `changed-${randomBytes(8).toString('hex')}`

    // A second sign-in stands in for "the same account on another device".
    const other = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(other.response.status).toBe(200)
    const otherSessionToken = other.payload.data.session.token

    const wrong = await sendJson(
      'PUT',
      '/api/account/password',
      { currentPassword: 'not-the-current-password', newPassword },
      visitor.sessionToken,
    )
    expect(wrong.response.status).toBe(403)
    expectContractShape(wrong.payload)
    expect(wrong.payload.error.code).toBe('PASSWORD_INCORRECT')

    const changed = await sendJson(
      'PUT',
      '/api/account/password',
      { currentPassword: visitorPassword, newPassword },
      visitor.sessionToken,
    )
    expect(changed.response.status).toBe(200)

    // The device that made the change stays signed in; the other one does not.
    const current = await getJson('/api/account/profile', visitor.sessionToken)
    expect(current.response.status).toBe(200)

    const revoked = await getJson('/api/account/profile', otherSessionToken)
    expect(revoked.response.status).toBe(401)
  })

  test('email change confirms control of the new address before switching', async () => {
    const visitor = await createVerifiedVisitor('emailchange')
    const newEmail = 'contract-db-emailchange-new@example.com'

    const unauthorized = await sendJson(
      'POST',
      '/api/account/email',
      { currentPassword: 'wrong', email: newEmail },
      visitor.sessionToken,
    )
    expect(unauthorized.response.status).toBe(403)
    expect(unauthorized.payload.error.code).toBe('PASSWORD_INCORRECT')

    const requested = await sendJson(
      'POST',
      '/api/account/email',
      { currentPassword: visitorPassword, email: newEmail },
      visitor.sessionToken,
    )
    expect(requested.response.status).toBe(200)
    const code = requested.payload.data.pendingEmail.devCode
    expect(code).toEqual(expect.any(String))

    // Still signed in under the OLD address until confirmation.
    const stillOld = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(stillOld.response.status).toBe(200)

    const wrongCode = await sendJson(
      'POST',
      '/api/account/email/confirm',
      { code: '000000' },
      visitor.sessionToken,
    )
    expect(wrongCode.response.status).toBe(400)
    expect(wrongCode.payload.error.code).toBe('EMAIL_CHANGE_INVALID')

    const confirmed = await sendJson(
      'POST',
      '/api/account/email/confirm',
      { code },
      visitor.sessionToken,
    )
    expect(confirmed.response.status).toBe(200)
    expect(confirmed.payload.data.profile.email).toBe(newEmail)

    const newLogin = await sendJson('POST', '/api/auth/login', {
      email: newEmail,
      password: visitorPassword,
    })
    expect(newLogin.response.status).toBe(200)

    const oldLogin = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(oldLogin.response.status).toBe(401)
  })

  test('account deletion needs the password plus an explicit confirmation', async () => {
    const visitor = await createVerifiedVisitor('delete')

    const noConfirm = await sendJson(
      'DELETE',
      '/api/account',
      { currentPassword: visitorPassword },
      visitor.sessionToken,
    )
    expect(noConfirm.response.status).toBe(400)
    expect(noConfirm.payload.error.code).toBe('VALIDATION_ERROR')

    const wrongPassword = await sendJson(
      'DELETE',
      '/api/account',
      { confirm: 'DELETE', currentPassword: 'nope' },
      visitor.sessionToken,
    )
    expect(wrongPassword.response.status).toBe(403)
    expect(wrongPassword.payload.error.code).toBe('PASSWORD_INCORRECT')

    const deleted = await sendJson(
      'DELETE',
      '/api/account',
      { confirm: 'DELETE', currentPassword: visitorPassword },
      visitor.sessionToken,
    )
    expect(deleted.response.status).toBe(200)

    const afterSession = await getJson('/api/account/profile', visitor.sessionToken)
    expect(afterSession.response.status).toBe(401)

    const afterLogin = await sendJson('POST', '/api/auth/login', {
      email: visitor.email,
      password: visitorPassword,
    })
    expect(afterLogin.response.status).toBe(401)
  })
})

test.describe('admin session exchange', () => {
  test('the static token mints a session that authorizes admin routes', async () => {
    const issued = await sendJson('POST', '/api/admin/session', {}, adminToken)

    expect(issued.response.status).toBe(201)
    expectContractShape(issued.payload, { legacyKeys: ['session'] })
    const sessionToken = issued.payload.data.session.token
    expect(sessionToken).toEqual(expect.any(String))
    expect(sessionToken).not.toBe(adminToken)

    const authorized = await getJson('/api/admin/summary', sessionToken)
    expect(authorized.response.status).toBe(200)

    const revoked = await sendJson('DELETE', '/api/admin/session', {}, sessionToken)
    expect(revoked.response.status).toBe(200)

    // Revocation is the property the permanent static token never had.
    const afterRevoke = await getJson('/api/admin/summary', sessionToken)
    expect(afterRevoke.response.status).toBe(401)
    expect(afterRevoke.payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  test('a token that was never issued is refused', async () => {
    const forged = randomBytes(32).toString('base64url')

    const minting = await sendJson('POST', '/api/admin/session', {}, forged)
    expect(minting.response.status).toBe(401)

    const using = await getJson('/api/admin/summary', forged)
    expect(using.response.status).toBe(401)
    expect(using.payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })
})

test.describe('upload content validation', () => {
  test('bytes that do not match the claimed extension are rejected', async () => {
    const form = new FormData()
    // A .png name over content that is not a PNG. The extension was previously
    // the only thing checked, so this was stored and served as an image.
    form.append('file', new Blob(['<?php echo 1; ?>'], { type: 'image/png' }), 'not-really.png')
    form.append('title', 'Signature mismatch')
    form.append('description', 'Should never be stored.')

    const { payload, response } = await postForm(
      '/api/community/uploads',
      form,
      visitorA.sessionToken,
    )

    expect(response.status).toBe(400)
    expectContractShape(payload)
    expect(payload.error.code).toBe('INVALID_FILE_TYPE')
  })

  test('a real PNG passes the signature check', async () => {
    // 1x1 transparent PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const form = new FormData()
    form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png')
    form.append('title', 'Valid PNG upload')
    form.append('description', 'A genuine one-pixel PNG.')

    const { payload, response } = await postForm(
      '/api/community/uploads',
      form,
      visitorA.sessionToken,
    )

    expect(response.status).toBe(201)
    expectContractShape(payload, { legacyKeys: ['upload'] })
    expect(payload.data.upload.fileType).toBe('image')
  })
})

// The row and the file are two separate things, and only one of them is in the
// database. Nothing rendered community uploads, so nothing ever noticed when
// they diverged -- the content health checker never looked at them at all.
test.describe('content health covers community uploads', () => {
  test('an intact upload is clean and a vanished file is reported', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const form = new FormData()
    form.append('file', new Blob([png], { type: 'image/png' }), 'health-checked.png')
    form.append('title', 'Health checked upload')
    form.append('description', 'Present on disk when first checked.')

    const created = await postForm('/api/community/uploads', form, visitorA.sessionToken)
    expect(created.response.status).toBe(201)

    const { fileUrl, id } = created.payload.data.upload

    const healthy = await getJson('/api/admin/content-health', adminToken)
    expect(healthy.response.status).toBe(200)

    const listed = healthy.payload.data.health.communityUploads.find((item) => item.id === id)
    expect(listed, 'a stored upload was not checked at all').toBeTruthy()
    expect(listed.issues).toEqual([])
    expect(listed.file.exists).toBe(true)

    // Delete the file the row points at. This is the divergence that used to
    // be invisible: the download link keeps rendering, and 404s when clicked.
    await unlink(path.join(repoRoot, 'public', fileUrl.replace(/^\//, '')))

    const broken = await getJson('/api/admin/content-health', adminToken)
    const after = broken.payload.data.health.communityUploads.find((item) => item.id === id)
    const missing = after.issues.find((issue) => issue.code === 'upload-missing-file')

    expect(missing, 'a row whose file is gone was not reported').toBeTruthy()
    // Pending, not approved: a moderator is about to decide on it, but no
    // visitor can reach it yet, so this is not critical.
    expect(missing.severity).toBe('warning')
  })
})

// Open item 4, closed: the dashboard now gets the content-health counts, but
// only from a cache, and never by waiting for one to be built.
//
// This group MUST be the first thing in the API suites to call
// /api/admin/overview -- it asserts on a cache that is cold exactly once per
// server process, and an earlier caller would warm it and make the first
// assertion here vacuous. Nothing else in tests/api touches that route today.
test.describe('the dashboard never waits on the content-health sweep', () => {
  test('the first overview omits the counts and a later one carries them', async () => {
    const cold = await getJson('/api/admin/overview?days=7', adminToken)

    expect(cold.response.status).toBe(200)
    expect(cold.payload.data.overview.metrics, 'the overview itself did not answer').toBeTruthy()
    // The load-bearing assertion. If the counts were computed in the request
    // path they would be here on the very first call -- their absence is the
    // proof that this response did not open a single file. The console draws
    // no badge and is none the worse for it.
    expect(
      cold.payload.data.overview.contentHealth,
      'either the overview waited for a filesystem sweep instead of answering ' +
        'cold, or something called /api/admin/overview before this group and ' +
        'warmed the cache -- see the note above about ordering',
    ).toBeUndefined()

    // ...and the read it did not wait for was still started. Polling rather
    // than sleeping a fixed time: how long the sweep takes depends on how much
    // of dist/ exists on the machine running this.
    let warm = null
    for (let attempt = 0; attempt < 50 && !warm; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const next = await getJson('/api/admin/overview?days=7', adminToken)
      warm = next.payload.data.overview.contentHealth || null
    }

    expect(warm, 'the cache never populated in the background').toBeTruthy()
    expect(typeof warm.counts.critical).toBe('number')
    expect(typeof warm.counts.warning).toBe('number')
    expect(typeof warm.counts.note).toBe('number')
    expect(Date.parse(warm.checkedAt)).not.toBeNaN()

    // Counts only. The findings stay on the detail endpoint, and the two agree
    // because they come from the same sweep.
    expect(Object.keys(warm).sort()).toEqual(['checkedAt', 'counts'])
    const report = await getJson('/api/admin/content-health', adminToken)
    expect(Object.keys(report.payload.data.health.counts).sort()).toEqual(
      Object.keys(warm.counts).sort(),
    )
  })
})

// Like identity: see the signed-cookie group below, which supersedes an
// earlier version of this test. That version asserted the same property
// against an IP+user-agent fingerprint; the fingerprint had to be replaced
// because this deployment cannot see client addresses at all, so a test that
// sent no cookie could no longer express "the same caller".

// These two groups are the compensating controls for a limitation that cannot
// be fixed at the infrastructure layer on this deployment: port 443 is shared
// with another service through an nginx stream (SNI) splitter, so every HTTPS
// visitor reaches the app as 127.0.0.1 and no per-IP control can work.
// See docs/OPERATIONS_CLIENT_IP.md.
test.describe('anonymous identity survives without a usable client address', () => {
  test('the server issues a signed cookie and honours it across requests', async () => {
    const list = await getJson('/api/projects')
    const slug = list.payload.data.projects[1]?.slug || list.payload.data.projects[0].slug

    const first = await fetch(`${baseURL}/api/projects/${slug}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'ignored-by-the-server' }),
    })
    const firstPayload = await first.json()
    const setCookie = first.headers.get('set-cookie') || ''

    expect(first.status).toBe(200)
    expect(setCookie, 'a fresh caller must be issued an identity').toContain('mrright-vid=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const cookie = setCookie.split(';')[0]

    // Same signed cookie, different client-supplied visitorId: the second call
    // must toggle the SAME like off rather than create a second one.
    const second = await fetch(`${baseURL}/api/projects/${slug}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ visitorId: 'a-completely-different-id' }),
    })
    const secondPayload = await second.json()
    expect(secondPayload.data.liked).toBe(!firstPayload.data.liked)

    // A cookie the server never signed is rejected and replaced.
    const forged = await fetch(`${baseURL}/api/projects/${slug}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'mrright-vid=forged-id.forged-signature',
      },
      body: JSON.stringify({ visitorId: 'x' }),
    })
    expect(forged.status).toBe(200)
    expect(forged.headers.get('set-cookie') || '', 'forged cookie must be replaced').toContain(
      'mrright-vid=',
    )
  })

  test('the client-supplied visitorId no longer controls identity', async () => {
    const list = await getJson('/api/projects')
    const slug = list.payload.data.projects[0].slug

    // One caller, one cookie, three different client-supplied ids. Before the
    // fix each id minted an independent like row, so a like count could be
    // inflated indefinitely from a single browser.
    const jar = await fetch(`${baseURL}/api/projects/${slug}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'id-one' }),
    })
    const cookie = (jar.headers.get('set-cookie') || '').split(';')[0]
    const initial = (await jar.json()).data.liked

    const states = [initial]
    for (const visitorId of ['id-two', 'id-three']) {
      const next = await fetch(`${baseURL}/api/projects/${slug}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ visitorId }),
      })
      states.push((await next.json()).data.liked)
    }

    // Strict alternation proves every call hit the same identity.
    expect(states).toEqual([initial, !initial, initial])
  })
})

test.describe('project comment moderation', () => {
  const commentSlug = 'fire-extinguisher-next-gen'

  const publicComments = async () => {
    const { payload } = await getJson(`/api/projects/${commentSlug}/interactions`)
    return payload.data.comments
  }

  test('an anonymous comment is queued, not published', async () => {
    const message = `Anonymous pending comment ${randomBytes(4).toString('hex')}`
    const created = await sendJson('POST', `/api/projects/${commentSlug}/comments`, {
      author: 'Anonymous Visitor',
      message,
    })

    expect(created.response.status).toBe(201)
    expect(created.payload.data.comment.status).toBe('pending')

    const visible = await publicComments()
    expect(visible.some((comment) => comment.message === message)).toBe(false)

    // The admin queue is where it should be.
    const queue = await getJson('/api/admin/comments?status=pending', adminToken)
    expect(queue.payload.data.comments.some((comment) => comment.message === message)).toBe(true)
  })

  test('a verified signed-in visitor publishes immediately', async () => {
    const message = `Verified visitor comment ${randomBytes(4).toString('hex')}`
    const created = await sendJson(
      'POST',
      `/api/projects/${commentSlug}/comments`,
      { message },
      visitorA.sessionToken,
    )

    expect(created.response.status).toBe(201)
    expect(created.payload.data.comment.status).toBe('published')

    const visible = await publicComments()
    expect(visible.some((comment) => comment.message === message)).toBe(true)
  })

  test('link-stuffed and duplicated comments are filed as spam, never shown', async () => {
    const spam = await sendJson('POST', `/api/projects/${commentSlug}/comments`, {
      author: 'Spam Bot',
      message: 'buy here http://a.example http://b.example http://c.example',
    })
    expect(spam.response.status).toBe(201)
    expect(spam.payload.data.comment.status).toBe('spam')

    const repeated = `Repeated message ${randomBytes(4).toString('hex')}`
    const firstPost = await sendJson(
      'POST',
      `/api/projects/${commentSlug}/comments`,
      { message: repeated },
      visitorA.sessionToken,
    )
    expect(firstPost.payload.data.comment.status).toBe('published')

    const duplicate = await sendJson(
      'POST',
      `/api/projects/${commentSlug}/comments`,
      { message: repeated },
      visitorA.sessionToken,
    )
    expect(duplicate.payload.data.comment.status).toBe('spam')

    const visible = await publicComments()
    expect(visible.filter((comment) => comment.message === repeated)).toHaveLength(1)
  })

  test('an admin can publish a queued comment', async () => {
    const message = `Queued then approved ${randomBytes(4).toString('hex')}`
    const created = await sendJson('POST', `/api/projects/${commentSlug}/comments`, {
      author: 'Anonymous Visitor',
      message,
    })
    const id = created.payload.data.comment.id

    const approved = await sendJson(
      'PATCH',
      `/api/admin/comments/${id}`,
      { status: 'published' },
      adminToken,
    )
    expect(approved.response.status).toBe(200)
    expect(approved.payload.data.comment.status).toBe('published')

    const visible = await publicComments()
    expect(visible.some((comment) => comment.message === message)).toBe(true)
  })

  test('moderation rejects an unknown status and an unknown comment', async () => {
    const badStatus = await sendJson(
      'PATCH',
      '/api/admin/comments/any-id',
      { status: 'approved-ish' },
      adminToken,
    )
    expect(badStatus.response.status).toBe(400)
    expect(badStatus.payload.error.code).toBe('VALIDATION_ERROR')

    const missing = await sendJson(
      'PATCH',
      '/api/admin/comments/not-a-real-comment',
      { status: 'published' },
      adminToken,
    )
    expect(missing.response.status).toBe(404)
    expect(missing.payload.error.code).toBe('COMMENT_NOT_FOUND')
  })
})

test.describe('operational endpoints', () => {
  test('robots.txt points at the sitemap and excludes private areas', async () => {
    const response = await fetch(`${baseURL}/robots.txt`)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Sitemap:')
    expect(body).toContain('Disallow: /admin')
    expect(body).toContain('Disallow: /account')
  })

  test('sitemap.xml lists the public entry points', async () => {
    const response = await fetch(`${baseURL}/sitemap.xml`)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('xml')
    expect(body).toContain('<urlset')
    expect(body).toContain('/community</loc>')
    // Public profiles must never be enumerated here.
    expect(body).not.toContain('/u/')
  })

  test('CSP reports are accepted and answered with 204', async () => {
    const response = await fetch(`${baseURL}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'blocked-uri': 'https://example.com/evil.js',
          'effective-directive': 'script-src',
        },
      }),
    })

    expect(response.status).toBe(204)
  })

  test('admin diagnostics report the resolved client IP for trust-proxy checks', async () => {
    const { payload, response } = await getJson('/api/admin/diagnostics', adminToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['diagnostics'] })
    expect(payload.data.diagnostics.resolvedIp).toEqual(expect.any(String))
    expect(payload.data.diagnostics.trustProxyHops).toEqual(expect.any(Number))
  })
})

// The half of server/seo.js that needs real rows: a post's head comes from the
// post, and a profile's head is allowed to exist only while the profile is
// public. The DB-free cases (homepage, community index, noindex on the private
// areas, the sitemap shape) live in contract.spec.js.
// A post's own picture, end to end: the thing this round exists for is that a
// link shared into Twitter or WeChat stops showing the same fire extinguisher
// for every post on the site.
test.describe('community post cover images', () => {
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const uploadCover = async (name = 'cover.png') => {
    const form = new FormData()
    form.append('file', new Blob([onePixelPng], { type: 'image/png' }), name)
    return postForm('/api/community/post-images', form, visitorA.sessionToken)
  }

  test('storing a cover returns a path, and no upload row is created', async () => {
    const before = await getJson('/api/community/uploads')
    const { payload, response } = await uploadCover()

    expect(response.status).toBe(201)
    // sendData mirrors the data keys at the top level for the legacy clients,
    // so imageUrl is expected there too.
    expectContractShape(payload, { legacyKeys: ['imageUrl'] })
    expect(payload.data.imageUrl).toMatch(/^\/uploads\/images\/.+\.png$/)

    // The whole reason this is not /community/uploads: a cover must not land in
    // the resource library.
    const after = await getJson('/api/community/uploads')
    expect(after.payload.data.uploads.length).toBe(before.payload.data.uploads.length)
  })

  test('a post carries its cover through to the html a scraper sees', async () => {
    const { payload: uploaded } = await uploadCover()
    const imageUrl = uploaded.data.imageUrl

    const created = await sendJson(
      'POST',
      '/api/community/posts',
      { imageUrl, message: 'With a picture of its own.', title: 'Cover image post' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    expect(created.payload.data.post.imageUrl).toBe(imageUrl)

    const html = await (await fetch(`${baseURL}/community/${created.payload.data.post.id}`)).text()
    expect(html).toContain(`<meta property="og:image" content="https://mrright.blog${imageUrl}" />`)
    expect(html).not.toContain('fire-extinguisher.png')

    const graph = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
    )['@graph']
    expect(graph.find((node) => node['@type'] === 'DiscussionForumPosting').image).toBe(
      `https://mrright.blog${imageUrl}`,
    )
  })

  test('a post with no cover still gets the site image', async () => {
    const created = await sendJson(
      'POST',
      '/api/community/posts',
      { message: 'No picture here.', title: 'Plain post' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    expect(created.payload.data.post.imageUrl).toBe('')

    const html = await (await fetch(`${baseURL}/community/${created.payload.data.post.id}`)).text()
    expect(html).toContain('fire-extinguisher.png')
  })

  // og:image is fetched and cached by every link-preview scraper there is, so
  // the field is not somewhere a caller gets to put an arbitrary URL.
  test('an imageUrl the server did not issue is refused', async () => {
    for (const imageUrl of [
      'https://evil.example/tracker.png',
      '//evil.example/tracker.png',
      '/uploads/models/something.glb',
      '/uploads/images/../../../etc/passwd',
      '/uploads/images/does-not-exist.png',
    ]) {
      const created = await sendJson(
        'POST',
        '/api/community/posts',
        { imageUrl, message: 'Trying it on.', title: 'Bad cover' },
        visitorA.sessionToken,
      )

      expect(created.response.status, imageUrl).toBe(400)
      expect(created.payload.error.code, imageUrl).toBe('VALIDATION_ERROR')
    }
  })

  // Two different gates, and the test says which is which. The shared multer
  // filter turns away anything outside the allowed extensions; an .obj is
  // allowed there (it is a legitimate community upload) and has to be turned
  // away by this endpoint instead, because a cover image has to be an image.
  test('a cover must actually be an image', async () => {
    const glb = new FormData()
    glb.append('file', new Blob(['GLB?'], { type: 'model/gltf-binary' }), 'model.glb')
    const rejectedByFilter = await postForm(
      '/api/community/post-images',
      glb,
      visitorA.sessionToken,
    )
    expect(rejectedByFilter.response.status).toBe(400)
    expect(rejectedByFilter.payload.error.code).toBe('INVALID_FILE_TYPE')

    const obj = new FormData()
    obj.append('file', new Blob(['v 0 0 0\n'], { type: 'text/plain' }), 'mesh.obj')
    const rejectedHere = await postForm('/api/community/post-images', obj, visitorA.sessionToken)

    expect(rejectedHere.response.status).toBe(400)
    expectContractShape(rejectedHere.payload)
    expect(rejectedHere.payload.error.code).toBe('VALIDATION_ERROR')
  })

  test('storing a cover needs a signed-in visitor', async () => {
    const form = new FormData()
    form.append('file', new Blob([onePixelPng], { type: 'image/png' }), 'cover.png')

    const { response } = await postForm('/api/community/post-images', form)
    expect(response.status).toBe(401)
  })
})

test.describe('per-route HTML head, from real rows', () => {
  const distIndex = path.join(repoRoot, 'dist', 'index.html')
  const seoHandle = 'contract-visitor-a'

  test.skip(!existsSync(distIndex), 'dist/index.html is missing; run npm run build first')

  const getHtml = async (requestPath) => {
    const response = await fetch(`${baseURL}${requestPath}`)
    return { body: await response.text(), response }
  }

  const setProfileVisibility = async (profilePublic) => {
    const updated = await sendJson(
      'PUT',
      '/api/account/profile',
      {
        activityPublic: true,
        bio: 'Environment artist, mostly props.',
        contactsPublic: false,
        displayName: 'Contract Test Visitor A',
        handle: seoHandle,
        profilePublic,
      },
      visitorA.sessionToken,
    )
    expect(updated.response.status).toBe(200)
  }

  // A project of this suite's own, so hiding it cannot disturb the catalogue
  // the other tests read. Created public, flipped hidden and back inside the
  // one test that needs it, and removed afterwards.
  const seoProjectSlug = 'contract-seo-project'
  const seoProjectPayload = {
    image: '/assets/projects/fire-extinguisher.png',
    slug: seoProjectSlug,
    summary: 'Base column summary.',
    summaryEn: 'A contract-test asset with an English summary of its own.',
    title: '合同测试资源',
    titleEn: 'Contract Test Asset',
    year: '2026',
  }
  let adminSessionToken

  const setProjectVisibility = async (isPublic) => {
    const updated = await sendJson(
      'PATCH',
      `/api/admin/projects/${seoProjectSlug}`,
      { ...seoProjectPayload, isPublic },
      adminSessionToken,
    )
    expect(updated.response.status).toBe(200)
  }

  test.beforeAll(async () => {
    await setProfileVisibility(true)

    const issued = await sendJson('POST', '/api/admin/session', {}, adminToken)
    expect(issued.response.status).toBe(201)
    adminSessionToken = issued.payload.data.session.token

    const created = await sendJson(
      'POST',
      '/api/admin/projects',
      seoProjectPayload,
      adminSessionToken,
    )
    expect(created.response.status).toBe(201)
  })

  test.afterAll(async () => {
    if (!adminSessionToken) return
    await sendJson('DELETE', `/api/admin/projects/${seoProjectSlug}`, {}, adminSessionToken)
    await sendJson('DELETE', '/api/admin/session', {}, adminSessionToken)
  })

  test('a project page carries its own title, summary and render', async () => {
    const { body, response } = await getHtml(`/projects/${seoProjectSlug}`)

    expect(response.status).toBe(200)
    expect(body).toContain('<title>Contract Test Asset | mrright.blog</title>')
    expect(body).toContain('A contract-test asset with an English summary of its own.')
    expect(body).toContain(
      '<meta property="og:image" ' +
        'content="https://mrright.blog/assets/projects/fire-extinguisher.png" />',
    )
    expect(body).toContain(
      `<link rel="canonical" href="https://mrright.blog/projects/${seoProjectSlug}" />`,
    )
    expect(body).not.toContain('name="robots"')
  })

  test('a project page is crawlable without javascript', async () => {
    const { body } = await getHtml(`/projects/${seoProjectSlug}`)
    const noscript = body.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0] || ''

    expect(noscript).toContain('<h1>Contract Test Asset</h1>')
    expect(noscript).toContain('A contract-test asset with an English summary of its own.')
  })

  test('a project slug nobody owns answers 404 rather than a soft 404', async () => {
    const { body, response } = await getHtml('/projects/no-such-project-slug')

    expect(response.status).toBe(404)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
    expect(body).not.toContain('rel="canonical"')
  })

  // The mirror of the private-profile case: a project the admin unpublished
  // must stop being served to scrapers, not merely disappear from the grid.
  test('a project switched to hidden stops advertising itself', async () => {
    await setProjectVisibility(false)

    try {
      const { body, response } = await getHtml(`/projects/${seoProjectSlug}`)

      expect(response.status).toBe(404)
      expect(body).toContain('<meta name="robots" content="noindex, follow" />')
      expect(body).not.toContain('Contract Test Asset')
      expect(body).not.toContain('A contract-test asset with an English summary of its own.')
    } finally {
      await setProjectVisibility(true)
    }
  })

  test('/projects is not a second url for the homepage', async () => {
    const { body, response } = await getHtml('/projects')

    expect(response.status).toBe(200)
    expect(body).toContain('<link rel="canonical" href="https://mrright.blog/" />')
    expect(body).toContain('<title>mrright.blog | 3D Portfolio</title>')
  })

  test('a post page carries the post title, body and author', async () => {
    const { body, response } = await getHtml(`/community/${seededPostId}`)

    expect(response.status).toBe(200)
    expect(body).toContain('<title>Contract test post | mrright.blog Community</title>')
    expect(body).toContain('DB-backed contract seed post.')
    expect(body).toContain('<meta property="og:type" content="article" />')
    expect(body).toContain(
      `<link rel="canonical" href="https://mrright.blog/community/${seededPostId}" />`,
    )
    expect(body).toContain('<meta property="article:author" content="Contract Test Visitor A" />')
    expect(body).not.toContain('name="robots"')
  })

  test('a post page is crawlable without javascript', async () => {
    const { body } = await getHtml(`/community/${seededPostId}`)
    const noscript = body.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0] || ''

    expect(noscript).toContain('<h1>Contract test post</h1>')
    expect(noscript).toContain('DB-backed contract seed post.')
  })

  test('a tab under a post canonicalises to the post itself', async () => {
    const { body } = await getHtml(`/community/${seededPostId}/comments`)

    expect(body).toContain(
      `<link rel="canonical" href="https://mrright.blog/community/${seededPostId}" />`,
    )
  })

  test('a post that does not exist answers 404 rather than a soft 404', async () => {
    const { body, response } = await getHtml('/community/1700000000000-nope00')

    expect(response.status).toBe(404)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
    expect(body).not.toContain('rel="canonical"')
  })

  test('a public profile gets its own title, description and canonical', async () => {
    const { body, response } = await getHtml(`/u/${seoHandle}`)

    expect(response.status).toBe(200)
    expect(body).toContain(`<title>Contract Test Visitor A (@${seoHandle}) | mrright.blog</title>`)
    expect(body).toContain('Environment artist, mostly props.')
    expect(body).toContain('<meta property="og:type" content="profile" />')
    expect(body).toContain(`<link rel="canonical" href="https://mrright.blog/u/${seoHandle}" />`)
  })

  test('the profile head survives a handle typed with different case or an @', async () => {
    const { body } = await getHtml(`/u/@${seoHandle.toUpperCase()}`)

    expect(body).toContain(`<link rel="canonical" href="https://mrright.blog/u/${seoHandle}" />`)
  })

  test('a handle nobody owns answers 404 and stays out of the index', async () => {
    const { body, response } = await getHtml('/u/not-exist-test-handle')

    expect(response.status).toBe(404)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
  })

  // Turning the profile off has to take the head off the page with it,
  // otherwise the display name and bio keep being served to every scraper that
  // asks for the URL.
  test('a profile switched to private stops advertising itself', async () => {
    await setProfileVisibility(false)

    try {
      const { body, response } = await getHtml(`/u/${seoHandle}`)

      expect(response.status).toBe(200)
      expect(body).toContain('<meta name="robots" content="noindex, follow" />')
      expect(body).not.toContain('Contract Test Visitor A')
      expect(body).not.toContain('Environment artist, mostly props.')
      expect(body).not.toContain('rel="canonical"')
    } finally {
      await setProfileVisibility(true)
    }
  })

  const graphOf = (body) => {
    const script = body.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1]
    return script ? JSON.parse(script)['@graph'] : null
  }

  test('a post page claims to be a forum posting by its real author', async () => {
    const { body, response } = await getHtml(`/community/${seededPostId}`)
    const posting = graphOf(body).find((node) => node['@type'] === 'DiscussionForumPosting')

    expect(posting).toMatchObject({
      author: { '@type': 'Person', name: 'Contract Test Visitor A' },
      headline: 'Contract test post',
      url: `https://mrright.blog/community/${seededPostId}`,
    })
    expect(posting.datePublished).toEqual(expect.any(String))
    expect(response.status).toBe(200)
  })

  test('a public profile claims to be a profile page about a person', async () => {
    const page = graphOf((await getHtml(`/u/${seoHandle}`)).body).find(
      (node) => node['@type'] === 'ProfilePage',
    )

    expect(page.mainEntity).toMatchObject({
      '@type': 'Person',
      alternateName: `@${seoHandle}`,
      description: 'Environment artist, mostly props.',
      name: 'Contract Test Visitor A',
    })
  })

  // The head and the graph have to go together. A profile switched off that
  // kept its structured data would still be handing a crawler the display name
  // and bio in the most machine-readable form on the page.
  test('a profile switched to private takes its structured data with it', async () => {
    await setProfileVisibility(false)

    try {
      const { body } = await getHtml(`/u/${seoHandle}`)

      expect(body).not.toContain('ld+json')
    } finally {
      await setProfileVisibility(true)
    }
  })

  test('a hidden project takes its structured data with it too', async () => {
    await setProjectVisibility(false)

    try {
      const { body } = await getHtml(`/projects/${seoProjectSlug}`)

      expect(body).not.toContain('ld+json')
    } finally {
      await setProjectVisibility(true)
    }
  })

  test('the sitemap lists the seeded post with a last-modified date', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()

    expect(body).toContain(`<loc>https://mrright.blog/community/${seededPostId}</loc>`)
    expect(body).toContain('<lastmod>')
    // The project listing goes through real SQL here, not the bundled fallback
    // store the DB-free suite exercises.
    expect(body).toContain('<loc>https://mrright.blog/projects/fire-extinguisher-next-gen</loc>')
    // Still no user enumeration, even though profiles now have real heads.
    expect(body).not.toContain('/u/')
  })
})

// A work belongs to whoever made it, and works.creator_id is ON DELETE
// RESTRICT because a work with no owner is not something a marketplace can
// price, sell or pay out on. Both delete paths therefore have to refuse
// clearly rather than letting Postgres raise a foreign-key error into a 500 --
// and, more importantly, rather than taking someone's published work with the
// account. These tests own their fixture row and remove it again, so the rest
// of the suite still sees the visitors it seeded.
test.describe('an account that owns works cannot simply be deleted', () => {
  const workId = 'work-delete-guard-fixture'

  const withWork = async (ownerId, run) => {
    const { Pool } = (await import('pg')).default
    const pool = new Pool({ connectionString: databaseUrl })
    try {
      await pool.query(
        `INSERT INTO works (id, creator_id, slug, title, status)
         VALUES ($1, $2, 'delete-guard-fixture', 'Delete guard fixture', 'published')`,
        [workId, ownerId],
      )
      await run()
    } finally {
      await pool.query('DELETE FROM works WHERE id = $1', [workId])
      await pool.end()
    }
  }

  test('the admin console is told why, not handed a 500', async () => {
    await withWork(visitorB.id, async () => {
      const { payload, response } = await sendJson(
        'DELETE',
        `/api/admin/visitors/${visitorB.id}`,
        {},
        adminToken,
      )

      expect(response.status).toBe(409)
      expectContractShape(payload)
      expect(payload.error.code).toBe('ACCOUNT_HAS_WORKS')
      expect(payload.error.message).toContain('1 work(s)')

      // The account is still there: the guard refused, it did not half-delete.
      const after = await getJson(`/api/admin/visitors/${visitorB.id}`, adminToken)
      expect(after.response.status).toBe(200)
    })
  })

  test('self-service deletion refuses too, and the account survives', async () => {
    await withWork(visitorA.id, async () => {
      const { payload, response } = await sendJson(
        'DELETE',
        '/api/account',
        { confirm: 'DELETE', currentPassword: visitorPassword },
        visitorA.sessionToken,
      )

      expect(response.status).toBe(409)
      expect(payload.error.code).toBe('ACCOUNT_HAS_WORKS')

      const after = await getJson('/api/account/profile', visitorA.sessionToken)
      expect(after.response.status).toBe(200)
    })
  })

  test('with the work gone, deletion is allowed again', async () => {
    // The counter-proof: without this the two tests above would also pass if
    // the endpoints simply refused every deletion.
    const { payload, response } = await sendJson(
      'DELETE',
      `/api/admin/visitors/${visitorB.id}`,
      {},
      adminToken,
    )

    expect(response.status).toBe(200)
    expect(payload.error).toBeNull()

    const after = await getJson(`/api/admin/visitors/${visitorB.id}`, adminToken)
    expect(after.response.status).toBe(404)
  })
})

// The publishing lifecycle, end to end: draft -> review -> published, plus the
// rules that stop it being a free-for-all. These run against real SQL because
// almost everything worth checking here IS the SQL -- the status filter that
// keeps drafts private lives in the store's WHERE clause, not in a handler.
test.describe('works: the publishing lifecycle', () => {
  let workId
  let handle

  test('a work needs a handle, because the handle is half of its URL', async () => {
    // A brand-new account, because visitorA picked up a handle in the profile
    // tests above. Testing this against an account that already has one would
    // have quietly asserted nothing.
    const email = `contract-nohandle-${randomBytes(4).toString('hex')}@example.com`
    const registered = await registerVisitor('No Handle Yet', email)
    const verified = await sendJson('POST', '/api/auth/verify-email', {
      code: registered.devCode,
      email,
    })
    expect(verified.response.status).toBe(200)

    const { payload, response } = await sendJson(
      'POST',
      '/api/account/works',
      { title: 'Nowhere to put this' },
      verified.payload.data.session.token,
    )

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toContain('handle')
  })

  test('choosing a handle makes publishing possible', async () => {
    handle = `contract-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const { response } = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Contract Creator', handle },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(200)
  })

  test('a draft is created, and its slug comes from the title', async () => {
    const { payload, response } = await sendJson(
      'POST',
      '/api/account/works',
      {
        assetCategory: 'hand-painted-prop',
        priceCents: 1200,
        summary: 'Something to sell.',
        tags: ['prop', 'stylised'],
        title: 'A Contract Test Work',
        titleZh: '契约测试作品',
      },
      visitorA.sessionToken,
    )

    expect(response.status).toBe(201)
    expectContractShape(payload, { legacyKeys: ['work'] })
    expect(payload.data.work.slug).toBe('a-contract-test-work')
    expect(payload.data.work.status).toBe('draft')
    expect(payload.data.work.priceCents).toBe(1200)
    expect(payload.data.work.titleZh).toBe('契约测试作品')
    expect(payload.data.work.tags).toEqual(['prop', 'stylised'])
    expect(payload.data.work.url).toBe(`/w/${handle}/a-contract-test-work`)
    workId = payload.data.work.id
  })

  test('a draft is invisible in the public catalogue', async () => {
    const { payload } = await getJson(`/api/works?creator=${handle}`)
    expect(payload.data.works).toEqual([])
  })

  test('a draft is invisible to a stranger at its own address', async () => {
    const { response } = await getJson(`/api/works/${handle}/a-contract-test-work`)
    expect(response.status).toBe(404)
  })

  test('...but its owner can preview it there', async () => {
    const { payload, response } = await getJson(
      `/api/works/${handle}/a-contract-test-work`,
      visitorA.sessionToken,
    )
    expect(response.status).toBe(200)
    expect(payload.data.work.status).toBe('draft')
  })

  test('the same slug cannot be used twice by one creator', async () => {
    const { payload, response } = await sendJson(
      'POST',
      '/api/account/works',
      { slug: 'a-contract-test-work', title: 'Clashing' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('WORK_SLUG_TAKEN')
  })

  test('a price has to be whole cents, not a float', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}`,
      { priceCents: 9.99 },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  test('an image path the server does not serve is refused', async () => {
    const { response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}`,
      { image: 'https://example.com/steal-my-og-image.png' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(400)
  })

  test('a patch changes only what it names', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}`,
      { summary: 'Edited summary.' },
      visitorA.sessionToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.work.summary).toBe('Edited summary.')
    // The fields the patch said nothing about are still there. The project
    // endpoint next door replaces the whole payload and has cleared columns
    // that way; this is the test that stops works inheriting that.
    expect(payload.data.work.title).toBe('A Contract Test Work')
    expect(payload.data.work.titleZh).toBe('契约测试作品')
    expect(payload.data.work.priceCents).toBe(1200)
    expect(payload.data.work.tags).toEqual(['prop', 'stylised'])
  })

  test('nobody else can edit it', async () => {
    const { response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}`,
      { title: 'Mine now' },
      adminToken,
    )
    // The admin token is not a visitor session, so this is an ordinary 401 --
    // the point is that a bearer token that is not the owner's gets nothing.
    expect([401, 404]).toContain(response.status)
  })

  test('submitting for review needs something to review', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'review' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(400)
    expect(payload.error.message).toContain('preview image')
  })

  test('a creator cannot publish their own work', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'published' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    // Still a draft: the refusal did not half-apply.
    const after = await getJson(`/api/works/${handle}/a-contract-test-work`, visitorA.sessionToken)
    expect(after.payload.data.work.status).toBe('draft')
  })

  test('with a preview, it can be submitted', async () => {
    const patched = await sendJson(
      'PATCH',
      `/api/account/works/${workId}`,
      { image: '/assets/projects/fire-extinguisher.png' },
      visitorA.sessionToken,
    )
    expect(patched.response.status).toBe(200)

    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'review' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(200)
    expect(payload.data.work.status).toBe('review')
  })

  test('the moderation queue shows it', async () => {
    const { payload, response } = await getJson('/api/admin/works?status=review', adminToken)

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['works'] })
    expectRealPagination(payload.pagination)
    expect(payload.data.works.map((work) => work.id)).toContain(workId)
  })

  test('an admin publishes it, and it appears in the catalogue', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/admin/works/${workId}/status`,
      { status: 'published' },
      adminToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.work.status).toBe('published')
    expect(payload.data.work.publishedAt).not.toBeNull()

    const listed = await getJson(`/api/works?creator=${handle}`)
    expect(listed.payload.data.works.map((work) => work.id)).toContain(workId)

    const detail = await getJson(`/api/works/${handle}/a-contract-test-work`)
    expect(detail.response.status).toBe(200)
    expect(detail.payload.data.work.title).toBe('A Contract Test Work')
  })

  test('search finds it by title, in any of its languages', async () => {
    const english = await getJson('/api/works?query=Contract%20Test')
    expect(english.payload.data.works.map((work) => work.id)).toContain(workId)

    const chinese = await getJson(`/api/works?query=${encodeURIComponent('契约测试')}`)
    expect(chinese.payload.data.works.map((work) => work.id)).toContain(workId)
  })

  test('a published work cannot be deleted or sent back to draft', async () => {
    const deleted = await sendJson(
      'DELETE',
      `/api/account/works/${workId}`,
      {},
      visitorA.sessionToken,
    )
    expect(deleted.response.status).toBe(400)

    const drafted = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'draft' },
      visitorA.sessionToken,
    )
    expect(drafted.response.status).toBe(400)
  })

  test('hiding it is the supported way to take it down', async () => {
    const { payload, response } = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'hidden' },
      visitorA.sessionToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.work.status).toBe('hidden')
    // publishedAt survives: it is the publication date, not the date of the
    // most recent status change.
    expect(payload.data.work.publishedAt).not.toBeNull()

    const listed = await getJson(`/api/works?creator=${handle}`)
    expect(listed.payload.data.works.map((work) => work.id)).not.toContain(workId)
  })

  test('the unfiltered catalogue answers with a real pagination envelope', async () => {
    // This disposable database has no migrated rows in it, so the assertion is
    // deliberately about the envelope rather than the contents: an endpoint
    // that 500s or returns {} on an empty catalogue is the failure worth
    // catching here.
    const { payload, response } = await getJson('/api/works')
    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['works'] })
    expectRealPagination(payload.pagination)
  })

  test('the owner sees their own work whatever its status', async () => {
    const { payload, response } = await getJson('/api/account/works', visitorA.sessionToken)

    expect(response.status).toBe(200)
    const mine = payload.data.works.find((work) => work.id === workId)
    expect(mine?.status).toBe('hidden')
  })
})

// A work is a bundle. These cover the second door onto the same disk, which is
// the part worth being careful about: the storage budget was written when
// community_uploads was the only way to store bytes, and an upload route that
// did not report into it would be an unmetered way around the quota.
test.describe('works: assets', () => {
  let workId
  let handle
  let assetId

  // A real 1x1 PNG. The signature check reads the first bytes, so a Blob of
  // text named .png is a different test (it has one, above) -- this one has to
  // actually be a PNG or it proves nothing about the happy path.
  const onePixelPng = () =>
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )

  const uploadAsset = async (kind, { bytes = onePixelPng(), name = 'preview.png', type = 'image/png' } = {}) => {
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', new Blob([bytes], { type }), name)
    return postForm(`/api/account/works/${workId}/assets`, form, visitorA.sessionToken)
  }

  test.beforeAll(async () => {
    handle = `assets-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Assets Creator', handle },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)

    const created = await sendJson(
      'POST',
      '/api/account/works',
      { title: 'Bundle Under Test' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    workId = created.payload.data.work.id
  })

  test('a preview becomes the cover, because doing it twice is doing it twice', async () => {
    const { payload, response } = await uploadAsset('preview')

    expect(response.status).toBe(201)
    expectContractShape(payload, { legacyKeys: ['asset', 'work'] })
    expect(payload.data.asset.kind).toBe('preview')
    expect(payload.data.asset.protected).toBe(false)
    expect(payload.data.work.image).toBe(payload.data.asset.fileUrl)
    assetId = payload.data.asset.id
  })

  test('an unknown kind is refused and the file is not kept', async () => {
    const { payload, response } = await uploadAsset('whatever')

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toContain('kind must be one of')
  })

  test('kind and extension have to agree', async () => {
    const { payload, response } = await uploadAsset('model')

    expect(response.status).toBe(400)
    expect(payload.error.message).toContain('model cannot be an image')
  })

  test('bytes that do not match the extension are still rejected here', async () => {
    const { payload, response } = await uploadAsset('preview', {
      bytes: Buffer.from('<?php echo 1; ?>'),
      name: 'lying.png',
    })

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('INVALID_FILE_TYPE')
  })

  test("nobody can add a file to somebody else's work", async () => {
    const email = `assets-stranger-${randomBytes(4).toString('hex')}@example.com`
    const registered = await registerVisitor('Assets Stranger', email)
    const verified = await sendJson('POST', '/api/auth/verify-email', {
      code: registered.devCode,
      email,
    })
    expect(verified.response.status).toBe(200)

    const form = new FormData()
    form.append('kind', 'preview')
    form.append('file', new Blob([onePixelPng()], { type: 'image/png' }), 'preview.png')
    const { response } = await postForm(
      `/api/account/works/${workId}/assets`,
      form,
      verified.payload.data.session.token,
    )

    expect(response.status).toBe(404)
  })

  test('a source asset keeps its URL out of a public response', async () => {
    const uploaded = await uploadAsset('source', {
      // A real ZIP header, so the signature check passes: what is under test
      // here is who may see the path, not whether the bytes are a zip.
      bytes: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]),
      name: 'source.zip',
      type: 'application/zip',
    })
    expect(uploaded.response.status).toBe(201)
    expect(uploaded.payload.data.asset.protected).toBe(true)
    // The owner's own response does carry it -- they uploaded it.
    expect(uploaded.payload.data.asset.fileUrl).toContain('/uploads/')

    // Publish it so a stranger can see the work at all, then check what they get.
    const published = await sendJson(
      'PATCH',
      `/api/admin/works/${workId}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(published.response.status).toBe(200)

    const slug = published.payload.data.work.slug
    const stranger = await getJson(`/api/works/${handle}/${slug}`)
    expect(stranger.response.status).toBe(200)

    const source = stranger.payload.data.work.assets.find((asset) => asset.kind === 'source')
    expect(source).toBeTruthy()
    expect(source.protected).toBe(true)
    // The whole point: the path is withheld, not merely undocumented.
    expect(source.fileUrl).toBeNull()

    // ...while the preview, which is meant to be seen, still has its URL.
    const preview = stranger.payload.data.work.assets.find((asset) => asset.kind === 'preview')
    expect(preview.fileUrl).toContain('/uploads/images/')

    // And the owner still sees everything about their own work.
    const owner = await getJson(`/api/works/${handle}/${slug}`, visitorA.sessionToken)
    const ownerSource = owner.payload.data.work.assets.find((asset) => asset.kind === 'source')
    expect(ownerSource.fileUrl).toContain('/uploads/')
  })

  test('removing the cover clears the slot rather than leaving a dangling path', async () => {
    const { payload, response } = await sendJson(
      'DELETE',
      `/api/account/works/${workId}/assets/${assetId}`,
      {},
      visitorA.sessionToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.work.image).toBe('')
    expect(payload.data.work.assets.some((asset) => asset.id === assetId)).toBe(false)
  })

  test('an asset id nobody owns answers 404', async () => {
    const { response } = await sendJson(
      'DELETE',
      `/api/account/works/${workId}/assets/does-not-exist`,
      {},
      visitorA.sessionToken,
    )
    expect(response.status).toBe(404)
  })
})

// The quota is the reason works uploads had to be wired into it rather than
// beside it. Without worksStore.getUploadUsage in enforceUploadQuota, the
// count comes only from community_uploads -- a handful for the whole suite --
// and this loop would run to its ceiling without ever being told no.
//
// Last in the file on purpose: it deliberately exhausts the account's budget.
test.describe('works: assets count against the storage budget', () => {
  test('a creator cannot store unlimited files by routing around community uploads', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )

    // Spread across several works: a single work caps at WORK_ASSET_LIMIT
    // files, which is a different rule with a different error, and hitting it
    // would end this loop before the budget ever had a say.
    const newWork = async (index) => {
      const created = await sendJson(
        'POST',
        '/api/account/works',
        { title: `Quota Under Test ${index}` },
        visitorA.sessionToken,
      )
      expect(created.response.status).toBe(201)
      return created.payload.data.work.id
    }

    let refused = null
    let workId = await newWork(0)

    for (let attempt = 0; attempt < 60 && !refused; attempt += 1) {
      if (attempt > 0 && attempt % 15 === 0) workId = await newWork(attempt)

      const form = new FormData()
      form.append('kind', 'texture')
      form.append('file', new Blob([png], { type: 'image/png' }), `texture-${attempt}.png`)
      const result = await postForm(`/api/account/works/${workId}/assets`, form, visitorA.sessionToken)
      if (result.response.status === 429) refused = result
      else expect(result.response.status, `upload ${attempt}`).toBe(201)
    }

    expect(refused, 'the budget was never enforced').not.toBeNull()
    expect(refused.payload.error.code).toBe('UPLOAD_QUOTA_EXCEEDED')
  })
})

// ADR_PLATFORM_PIVOT §5's first requirement: the server keeps rendering the
// head. A crawler or a link-preview scraper has to get a complete answer about
// a work without executing a line of WebGL, and a draft must not leak into
// either the head or the sitemap.
test.describe('works: the head a crawler sees', () => {
  let handle
  let slug

  // Local to this block: the one in the per-route head suite above is scoped
  // to that describe, and this one returns the status because half of what is
  // under test here is whether a draft answers 404.
  const getHtml = async (requestPath) => {
    const response = await fetch(`${baseURL}${requestPath}`)
    return { body: await response.text(), status: response.status }
  }

  test.beforeAll(async () => {
    handle = `seo-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'SEO Creator', handle },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)

    const created = await sendJson(
      'POST',
      '/api/account/works',
      {
        image: '/assets/projects/fire-extinguisher.png',
        summaryEn: 'A crawler should be able to read this without any javascript.',
        title: 'Head Under Test',
      },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    slug = created.payload.data.work.slug
  })

  test('a draft answers 404 and advertises nothing', async () => {
    const { body, status } = await getHtml(`/w/${handle}/${slug}`)

    expect(status).toBe(404)
    expect(body).not.toContain('Head Under Test')
    expect(body).toContain('noindex')
  })

  test('a draft is not in the sitemap', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()
    expect(body).not.toContain(`/w/${handle}/${slug}`)
  })

  test('once published, the head carries the work', async () => {
    const workId = (await getJson('/api/account/works', visitorA.sessionToken)).payload.data.works.find(
      (work) => work.slug === slug,
    ).id
    const published = await sendJson(
      'PATCH',
      `/api/admin/works/${workId}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(published.response.status).toBe(200)

    const { body, status } = await getHtml(`/w/${handle}/${slug}`)

    expect(status).toBe(200)
    expect(body).toContain('<title>Head Under Test | mrright.blog</title>')
    expect(body).toContain(`https://mrright.blog/w/${handle}/${slug}`)
    expect(body).toContain('A crawler should be able to read this without any javascript.')
    expect(body).not.toContain('noindex')
    // Its own picture on the share card, not the site default.
    expect(body).toContain('/assets/projects/fire-extinguisher.png')
  })

  test('it is crawlable without javascript', async () => {
    const { body } = await getHtml(`/w/${handle}/${slug}`)
    const noscript = body.slice(body.indexOf('<noscript'), body.indexOf('</noscript>'))

    expect(noscript).toContain('Head Under Test')
  })

  test('it claims to be a creative work in its structured data', async () => {
    const { body } = await getHtml(`/w/${handle}/${slug}`)

    expect(body).toContain('ld+json')
    expect(body).toContain('CreativeWork')
    expect(body).toContain('Head Under Test')
  })

  test('and now it IS in the sitemap', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()

    expect(body).toContain(`<loc>https://mrright.blog/w/${handle}/${slug}</loc>`)
    expect(body).toContain('<loc>https://mrright.blog/explore</loc>')
  })

  test('the browse page has a head of its own, not a copy of the homepage', async () => {
    const { body, status } = await getHtml('/explore')

    expect(status).toBe(200)
    expect(body).toContain('<title>Explore works | mrright.blog</title>')
    expect(body).toContain('https://mrright.blog/explore')
    expect(body).not.toContain('noindex')
  })

  test('a filtered browse URL canonicalises to the unfiltered one', async () => {
    // ?query=sword is the same page, narrowed. Two URLs for one page is how a
    // catalogue splits its own ranking between them.
    const { body } = await getHtml('/explore?query=sword&category=prop')

    expect(body).toContain('rel="canonical" href="https://mrright.blog/explore"')
  })

  test('a work URL nobody owns answers 404 rather than a soft 404', async () => {
    const missing = await getHtml(`/w/${handle}/nothing-here`)
    expect(missing.status).toBe(404)

    const noSuchCreator = await getHtml(`/w/nobody-at-all/${slug}`)
    expect(noSuchCreator.status).toBe(404)
  })

  test('hiding it takes the head and the sitemap entry with it', async () => {
    const workId = (await getJson('/api/account/works', visitorA.sessionToken)).payload.data.works.find(
      (work) => work.slug === slug,
    ).id
    const hidden = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'hidden' },
      visitorA.sessionToken,
    )
    expect(hidden.response.status).toBe(200)

    const { body, status } = await getHtml(`/w/${handle}/${slug}`)
    expect(status).toBe(404)
    expect(body).not.toContain('Head Under Test')
  })
})

// Publishing a work is a deliberate public act; hiding your profile is a
// separate choice about a different object. So a work by a creator with a
// private profile stays listed -- but the response has to say the profile will
// not answer, or every card linking to it is a link to a 404.
test.describe('works by a creator whose profile is private', () => {
  let handle
  let slug

  test.beforeAll(async () => {
    handle = `private-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Private Creator', handle },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)

    const created = await sendJson(
      'POST',
      '/api/account/works',
      { image: '/assets/projects/fire-extinguisher.png', title: 'Published By A Private Creator' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    slug = created.payload.data.work.slug

    const published = await sendJson(
      'PATCH',
      `/api/admin/works/${created.payload.data.work.id}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(published.response.status).toBe(200)
  })

  test('while the profile is public, the creator is linkable', async () => {
    const { payload } = await getJson(`/api/works?creator=${handle}`)
    const work = payload.data.works.find((item) => item.slug === slug)

    expect(work).toBeTruthy()
    expect(work.creator.profilePublic).toBe(true)
  })

  test('making the profile private leaves the work listed but not the link', async () => {
    const hidden = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Private Creator', handle, profilePublic: false },
      visitorA.sessionToken,
    )
    expect(hidden.response.status).toBe(200)

    const listed = await getJson(`/api/works?creator=${handle}`)
    const work = listed.payload.data.works.find((item) => item.slug === slug)

    // Still listed: they published it.
    expect(work).toBeTruthy()
    // But the client is told not to link to a page that will 404.
    expect(work.creator.profilePublic).toBe(false)

    // ...and that is not a guess. A private profile is not a 404 -- only an
    // admin-disabled one is -- it answers 200 with noindex and the client
    // renders "this profile is private". Which is still a dead end to send
    // someone to from a card, hence profilePublic.
    const profilePage = await fetch(`${baseURL}/u/${handle}`)
    expect(profilePage.status).toBe(200)
    const profileHtml = await profilePage.text()
    expect(profileHtml).toContain('noindex')
    expect(profileHtml).not.toContain('Private Creator')

    // The work itself is untouched and still reachable at its own address.
    const detail = await getJson(`/api/works/${handle}/${slug}`)
    expect(detail.response.status).toBe(200)
    expect(detail.payload.data.work.creator.profilePublic).toBe(false)
  })

  test('making it public again restores the link', async () => {
    const shown = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Private Creator', handle, profilePublic: true },
      visitorA.sessionToken,
    )
    expect(shown.response.status).toBe(200)

    const { payload } = await getJson(`/api/works?creator=${handle}`)
    expect(payload.data.works.find((item) => item.slug === slug).creator.profilePublic).toBe(true)
  })
})

// Comments on a work: threaded one level, sortable, likeable, pinnable by the
// owner. The rules worth pinning are the ones about who may do what to whose
// words -- an author deletes their own, a creator hides someone else's, and
// nobody is told which comment ids exist on works they have nothing to do with.
test.describe('works: the discussion', () => {
  let handle
  let slug
  let stranger
  let topLevelId
  let strangerCommentId

  test.beforeAll(async () => {
    handle = `talk-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Talkative Creator', handle },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)

    const created = await sendJson(
      'POST',
      '/api/account/works',
      { image: '/assets/projects/fire-extinguisher.png', title: 'Something To Discuss' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    slug = created.payload.data.work.slug

    const published = await sendJson(
      'PATCH',
      `/api/admin/works/${created.payload.data.work.id}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(published.response.status).toBe(200)

    const email = `talk-stranger-${randomBytes(4).toString('hex')}@example.com`
    const registered = await registerVisitor('Passing Stranger', email)
    const verified = await sendJson('POST', '/api/auth/verify-email', {
      code: registered.devCode,
      email,
    })
    expect(verified.response.status).toBe(200)
    stranger = { id: registered.id, token: verified.payload.data.session.token }
  })

  test('commenting needs an account', async () => {
    const { response } = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/comments`,
      { message: 'Anonymously, please.' },
      null,
    )
    expect(response.status).toBe(401)
  })

  test('a signed-in visitor can comment, and it publishes immediately', async () => {
    const { payload, response } = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/comments`,
      { message: 'The silhouette reads really well.' },
      stranger.token,
    )

    expect(response.status).toBe(201)
    expectContractShape(payload, { legacyKeys: ['comment'] })
    expect(payload.data.comment.status).toBe('published')
    expect(payload.data.comment.user.displayName).toBe('Passing Stranger')
    expect(payload.data.comment.parentId).toBeNull()
    strangerCommentId = payload.data.comment.id
    topLevelId = strangerCommentId
  })

  test('an empty comment is refused', async () => {
    const { response } = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/comments`,
      { message: '   ' },
      stranger.token,
    )
    expect(response.status).toBe(400)
  })

  test('replies thread one level, and a reply to a reply flattens onto it', async () => {
    const reply = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/comments`,
      { message: 'Thanks!', parentId: topLevelId },
      visitorA.sessionToken,
    )
    expect(reply.response.status).toBe(201)
    expect(reply.payload.data.comment.parentId).toBe(topLevelId)

    // Replying to the reply must not create a third level: it belongs in the
    // same thread, which is what "one level" actually means.
    const nested = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/comments`,
      { message: 'Agreed.', parentId: reply.payload.data.comment.id },
      stranger.token,
    )
    expect(nested.response.status).toBe(201)
    expect(nested.payload.data.comment.parentId).toBe(topLevelId)
  })

  test('a reply cannot be attached to a comment on a different work', async () => {
    const other = await sendJson(
      'POST',
      '/api/account/works',
      { image: '/assets/projects/fire-extinguisher.png', title: 'A Different Work Entirely' },
      visitorA.sessionToken,
    )
    expect(other.response.status).toBe(201)
    const otherPublished = await sendJson(
      'PATCH',
      `/api/admin/works/${other.payload.data.work.id}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(otherPublished.response.status).toBe(200)

    const { response } = await sendJson(
      'POST',
      `/api/works/${handle}/${otherPublished.payload.data.work.slug}/comments`,
      { message: 'Wrong thread.', parentId: topLevelId },
      stranger.token,
    )
    expect(response.status).toBe(404)
  })

  test('likes are per account and toggle', async () => {
    const liked = await sendJson(
      'POST',
      `/api/work-comments/${topLevelId}/like`,
      {},
      visitorA.sessionToken,
    )
    expect(liked.response.status).toBe(200)
    expect(liked.payload.data).toMatchObject({ likeCount: 1, liked: true })

    const again = await sendJson(
      'POST',
      `/api/work-comments/${topLevelId}/like`,
      {},
      visitorA.sessionToken,
    )
    expect(again.payload.data).toMatchObject({ likeCount: 0, liked: false })
  })

  test('the listing tells each viewer whether THEY liked it', async () => {
    await sendJson('POST', `/api/work-comments/${topLevelId}/like`, {}, visitorA.sessionToken)

    const asLiker = await getJson(
      `/api/works/${handle}/${slug}/comments`,
      visitorA.sessionToken,
    )
    expect(asLiker.payload.data.comments.find((c) => c.id === topLevelId).liked).toBe(true)

    const anonymous = await getJson(`/api/works/${handle}/${slug}/comments`)
    const sameComment = anonymous.payload.data.comments.find((c) => c.id === topLevelId)
    expect(sameComment.liked).toBe(false)
    expect(sameComment.likeCount).toBe(1)
  })

  test('the creator can pin one comment, and pinning a second unpins the first', async () => {
    const pinned = await sendJson(
      'PATCH',
      `/api/work-comments/${topLevelId}/pin`,
      { pinned: true },
      visitorA.sessionToken,
    )
    expect(pinned.response.status).toBe(200)

    const listed = await getJson(`/api/works/${handle}/${slug}/comments?sort=newest`)
    // Pinned first whatever the sort -- a pin the sort buries is not a pin.
    expect(listed.payload.data.comments[0].id).toBe(topLevelId)
    expect(listed.payload.data.comments[0].pinned).toBe(true)

    const other = listed.payload.data.comments.find((c) => c.id !== topLevelId)
    await sendJson(
      'PATCH',
      `/api/work-comments/${other.id}/pin`,
      { pinned: true },
      visitorA.sessionToken,
    )

    const after = await getJson(`/api/works/${handle}/${slug}/comments?sort=newest`)
    expect(after.payload.data.comments.filter((c) => c.pinned).map((c) => c.id)).toEqual([other.id])
  })

  test('a stranger cannot pin or moderate on somebody else\'s work', async () => {
    const pin = await sendJson(
      'PATCH',
      `/api/work-comments/${topLevelId}/pin`,
      { pinned: true },
      stranger.token,
    )
    expect(pin.response.status).toBe(404)

    const status = await sendJson(
      'PATCH',
      `/api/work-comments/${topLevelId}/status`,
      { status: 'hidden' },
      stranger.token,
    )
    // The stranger authored this one, so they are allowed to reach it -- but
    // moderating is the work creator's power, not the author's.
    expect(status.response.status).toBe(404)
  })

  test('the creator hides rather than deletes somebody else\'s comment', async () => {
    const { payload, response } = await sendJson(
      'DELETE',
      `/api/work-comments/${strangerCommentId}`,
      {},
      visitorA.sessionToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.hidden).toBe(true)

    // Gone for the public...
    const anonymous = await getJson(`/api/works/${handle}/${slug}/comments`)
    expect(anonymous.payload.data.comments.some((c) => c.id === strangerCommentId)).toBe(false)

    // ...but visible to the creator, marked hidden, so undoing it is possible.
    const asCreator = await getJson(
      `/api/works/${handle}/${slug}/comments`,
      visitorA.sessionToken,
    )
    const hidden = asCreator.payload.data.comments.find((c) => c.id === strangerCommentId)
    expect(hidden?.status).toBe('hidden')

    const restored = await sendJson(
      'PATCH',
      `/api/work-comments/${strangerCommentId}/status`,
      { status: 'published' },
      visitorA.sessionToken,
    )
    expect(restored.response.status).toBe(200)
    const back = await getJson(`/api/works/${handle}/${slug}/comments`)
    expect(back.payload.data.comments.some((c) => c.id === strangerCommentId)).toBe(true)
  })

  test('an author deletes their own for real', async () => {
    const { response } = await sendJson(
      'DELETE',
      `/api/work-comments/${strangerCommentId}`,
      {},
      stranger.token,
    )
    expect(response.status).toBe(200)

    const asCreator = await getJson(
      `/api/works/${handle}/${slug}/comments`,
      visitorA.sessionToken,
    )
    // Not merely hidden: gone, even from the view that shows hidden ones.
    expect(asCreator.payload.data.comments.some((c) => c.id === strangerCommentId)).toBe(false)
  })

  test('a draft work accepts no comments', async () => {
    const draft = await sendJson(
      'POST',
      '/api/account/works',
      { title: 'Not Published Yet' },
      visitorA.sessionToken,
    )
    expect(draft.response.status).toBe(201)

    const { response } = await sendJson(
      'POST',
      `/api/works/${handle}/${draft.payload.data.work.slug}/comments`,
      { message: 'Talking to myself.' },
      visitorA.sessionToken,
    )
    expect(response.status).toBe(400)
  })

  test('comments on a work nobody owns answer 404', async () => {
    const { response } = await getJson(`/api/works/${handle}/no-such-work/comments`)
    expect(response.status).toBe(404)
  })
})

// The redirect. A 301 is permanent and browsers cache it for a long time, so
// the rules about WHEN it fires matter more than the redirect itself: it must
// only ever point at a published work, and it must leave a project with no
// work alone rather than sending anyone to a 404.
test.describe('the redirect from the old project urls', () => {
  let handle
  let workId
  let slug

  const rawGet = (path) => fetch(`${baseURL}${path}`, { redirect: 'manual' })

  test.beforeAll(async () => {
    handle = `moved-${randomBytes(4).toString('hex')}`.slice(0, 30)
    const profile = await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Moved Creator', handle },
      visitorA.sessionToken,
    )
    expect(profile.response.status).toBe(200)
  })

  test('a project with no work is served, not redirected', async () => {
    const response = await rawGet('/projects/fire-extinguisher-next-gen')
    expect(response.status).toBe(200)
  })

  test('a work in draft does not attract the redirect either', async () => {
    // Created with the source slug that migrate-works.mjs would have set.
    const { Pool } = (await import('pg')).default
    const pool = new Pool({ connectionString: databaseUrl })
    try {
      const created = await sendJson(
        'POST',
        '/api/account/works',
        { image: '/assets/projects/fire-extinguisher.png', title: 'Moved Work' },
        visitorA.sessionToken,
      )
      expect(created.response.status).toBe(201)
      workId = created.payload.data.work.id
      slug = created.payload.data.work.slug

      await pool.query(`UPDATE works SET source_slug = 'fire-extinguisher-next-gen' WHERE id = $1`, [
        workId,
      ])

      // Still a draft: sending a crawler here permanently would be sending it
      // to a 404.
      const response = await rawGet('/projects/fire-extinguisher-next-gen')
      expect(response.status).toBe(200)
    } finally {
      await pool.end()
    }
  })

  test('publishing it turns the old url into a 301', async () => {
    const published = await sendJson(
      'PATCH',
      `/api/admin/works/${workId}/status`,
      { status: 'published' },
      adminToken,
    )
    expect(published.response.status).toBe(200)

    const response = await rawGet('/projects/fire-extinguisher-next-gen')

    // 301, not 302: the whole point is that an index moves across.
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(`/w/${handle}/${slug}`)
  })

  test('and the destination actually answers', async () => {
    // The test that stops this being a redirect into a hole.
    const response = await fetch(`${baseURL}/w/${handle}/${slug}`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Moved Work')
  })

  test('the sitemap advertises the new url and drops the old one', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()

    expect(body).toContain(`<loc>https://mrright.blog/w/${handle}/${slug}</loc>`)
    // A sitemap listing a URL that 301s tells a crawler two things about one
    // page and asks it to do the work twice.
    expect(body).not.toContain('<loc>https://mrright.blog/projects/fire-extinguisher-next-gen</loc>')
  })

  test('the homepage links to the destination, not through the redirect', async () => {
    const { payload } = await getJson('/api/projects')
    const project = payload.data.projects.find((item) => item.slug === 'fire-extinguisher-next-gen')

    expect(project.workUrl).toBe(`/w/${handle}/${slug}`)

    // A project that has not moved carries an empty string, so the client
    // falls back to the old URL rather than to `undefined`.
    const unmoved = payload.data.projects.find((item) => item.slug !== 'fire-extinguisher-next-gen')
    expect(unmoved.workUrl).toBe('')
  })

  test('hiding the work puts the old url back rather than breaking it', async () => {
    const hidden = await sendJson(
      'PATCH',
      `/api/account/works/${workId}/status`,
      { status: 'hidden' },
      visitorA.sessionToken,
    )
    expect(hidden.response.status).toBe(200)

    // This is what makes the change reversible: nothing about the 301 is
    // stored, so removing the reason removes the redirect.
    const response = await rawGet('/projects/fire-extinguisher-next-gen')
    expect(response.status).toBe(200)
  })
})

// Likes on a work, which /projects/:slug had and the work page did not -- the
// gap that made the redirect a downgrade until now.
test.describe('works: likes', () => {
  let handle
  let slug

  test.beforeAll(async () => {
    handle = `liked-${randomBytes(4).toString('hex')}`.slice(0, 30)
    await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Liked Creator', handle },
      visitorA.sessionToken,
    )
    const created = await sendJson(
      'POST',
      '/api/account/works',
      { image: '/assets/projects/fire-extinguisher.png', title: 'Something Likeable' },
      visitorA.sessionToken,
    )
    expect(created.response.status).toBe(201)
    slug = created.payload.data.work.slug
    await sendJson(
      'PATCH',
      `/api/admin/works/${created.payload.data.work.id}/status`,
      { status: 'published' },
      adminToken,
    )
  })

  test('an anonymous visitor can like, and it sticks to their cookie', async () => {
    const first = await fetch(`${baseURL}/api/works/${handle}/${slug}/like`, { method: 'POST' })
    expect(first.status).toBe(200)
    expect((await first.json()).data).toMatchObject({ likeCount: 1, liked: true })

    // The identity is a signed cookie the server issued, so carrying it back
    // is what makes the like the same person's.
    const cookie = first.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toBeTruthy()

    const read = await fetch(`${baseURL}/api/works/${handle}/${slug}/likes`, {
      headers: { cookie },
    })
    expect((await read.json()).data).toMatchObject({ likeCount: 1, liked: true })

    const off = await fetch(`${baseURL}/api/works/${handle}/${slug}/like`, {
      headers: { cookie },
      method: 'POST',
    })
    expect((await off.json()).data).toMatchObject({ likeCount: 0, liked: false })
  })

  test('reading the count does not hand a cookie to every crawler', async () => {
    const response = await fetch(`${baseURL}/api/works/${handle}/${slug}/likes`)

    expect(response.status).toBe(200)
    // A GET that issues an identity would give one to every crawler walking
    // the catalogue, for an answer that is the same either way.
    expect(response.headers.get('set-cookie')).toBeNull()
    expect((await response.json()).data).toMatchObject({ liked: false })
  })

  test('a signed-in visitor is the same person across devices', async () => {
    const liked = await sendJson(
      'POST',
      `/api/works/${handle}/${slug}/like`,
      {},
      visitorA.sessionToken,
    )
    expect(liked.payload.data).toMatchObject({ likeCount: 1, liked: true })

    // No cookie carried: the account is the identity.
    const read = await getJson(`/api/works/${handle}/${slug}/likes`, visitorA.sessionToken)
    expect(read.payload.data).toMatchObject({ likeCount: 1, liked: true })
  })
})

// Per-creator themes. The rules worth pinning are the refusals: a preset the
// client cannot draw, and an accent that would make the creator's own page
// unreadable. A theme system that accepts anything is a defacement feature.
test.describe('themes', () => {
  test('the options come from the server, so a picker cannot offer what it would refuse', async () => {
    const { payload, response } = await getJson('/api/theme-options')

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['defaults', 'fonts', 'surfaces'] })
    expect(payload.data.surfaces.length).toBeGreaterThan(1)
    expect(payload.data.fonts.length).toBeGreaterThan(1)
    // The defaults have to be something the same API would accept.
    const saved = await sendJson(
      'PUT',
      '/api/account/theme',
      { theme: payload.data.defaults },
      visitorA.sessionToken,
    )
    expect(saved.response.status).toBe(200)
  })

  test('a theme round-trips, resolved into tokens', async () => {
    const { payload, response } = await sendJson(
      'PUT',
      '/api/account/theme',
      { theme: { accent: '#ff9966', font: 'serif', surface: 'ink' } },
      visitorA.sessionToken,
    )

    expect(response.status).toBe(200)
    expect(payload.data.theme).toEqual({ accent: '#ff9966', font: 'serif', surface: 'ink' })
    // Tokens, not knobs: the client must never have to know what 'ink' means.
    expect(payload.data.themeTokens['--theme-accent']).toBe('#ff9966')
    expect(payload.data.themeTokens['--theme-surface']).toMatch(/^#[0-9a-f]{6}$/)
    expect(payload.data.themeTokens['--theme-font']).toContain('serif')

    const read = await getJson('/api/account/theme', visitorA.sessionToken)
    expect(read.payload.data.theme).toEqual(payload.data.theme)
  })

  test('an unreadable accent is refused, with the numbers', async () => {
    const { payload, response } = await sendJson(
      'PUT',
      '/api/account/theme',
      { theme: { accent: '#0c0c12', surface: 'ink' } },
      visitorA.sessionToken,
    )

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toMatch(/contrast \d+\.\d+:1/)

    // ...and the refusal did not half-apply.
    const read = await getJson('/api/account/theme', visitorA.sessionToken)
    expect(read.payload.data.theme.accent).toBe('#ff9966')
  })

  test('a preset the client cannot draw is refused', async () => {
    for (const theme of [{ surface: 'neon' }, { font: 'comic' }, { accent: 'red' }]) {
      const { response } = await sendJson('PUT', '/api/account/theme', { theme }, visitorA.sessionToken)
      expect(response.status, JSON.stringify(theme)).toBe(400)
    }
  })

  test('setting a theme needs an account', async () => {
    const { response } = await sendJson('PUT', '/api/account/theme', { theme: {} }, null)
    expect(response.status).toBe(401)
  })

  test('the theme reaches the pages that render it', async () => {
    // The point of the whole feature: a visitor looking at somebody's work or
    // profile gets their colours without asking for them separately.
    const handle = `themed-${randomBytes(4).toString('hex')}`.slice(0, 30)
    await sendJson(
      'PUT',
      '/api/account/profile',
      { displayName: 'Themed Creator', handle },
      visitorA.sessionToken,
    )
    const created = await sendJson(
      'POST',
      '/api/account/works',
      { image: '/assets/projects/fire-extinguisher.png', title: 'A Themed Work' },
      visitorA.sessionToken,
    )
    await sendJson(
      'PATCH',
      `/api/admin/works/${created.payload.data.work.id}/status`,
      { status: 'published' },
      adminToken,
    )

    const work = await getJson(`/api/works/${handle}/${created.payload.data.work.slug}`)
    expect(work.payload.data.work.creator.themeTokens['--theme-accent']).toBe('#ff9966')

    const profile = await getJson(`/api/users/${handle}`)
    expect(profile.payload.data.profile.themeTokens['--theme-accent']).toBe('#ff9966')
  })

  test('a stored value nobody could draw falls back rather than reaching a style property', async () => {
    // Belt and braces: the column is jsonb and a hand-edit in psql is not an
    // impossible event. What comes back has to be renderable regardless.
    const { Pool } = (await import('pg')).default
    const pool = new Pool({ connectionString: databaseUrl })
    try {
      await pool.query(`UPDATE visitor_users SET theme = $2 WHERE id = $1`, [
        visitorA.id,
        JSON.stringify({ accent: 'url(javascript:alert(1))', font: 'x', surface: 'y' }),
      ])

      const read = await getJson('/api/account/theme', visitorA.sessionToken)
      expect(read.payload.data.themeTokens['--theme-accent']).toMatch(/^#[0-9a-f]{6}$/)
      expect(read.payload.data.theme.surface).toBe('midnight')
    } finally {
      await pool.end()
    }
  })
})
