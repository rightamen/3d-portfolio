import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'

const port = 4193
const baseURL = `http://127.0.0.1:${port}`

let serverProcess

const waitForHealth = async () => {
  const deadline = Date.now() + 20_000
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

test.beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForHealth()
})

test.afterAll(async () => {
  if (!serverProcess) return
  serverProcess.kill('SIGTERM')
  await new Promise((resolve) => serverProcess.once('exit', resolve))
})

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

const getJson = async (path) => {
  const response = await fetch(`${baseURL}${path}`)
  const payload = await response.json()
  return { payload, response }
}

const postJson = async (path, body) => {
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const payload = await response.json()
  return { payload, response }
}

test.describe('api contract envelope', () => {
  test('GET /api/health returns envelope with legacy compatibility', async () => {
    const { payload, response } = await getJson('/api/health')

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['ok', 'service'] })
    expect(payload.data.ok).toBe(true)
    expect(payload.ok).toBe(true)
  })

  test('GET /api/profile returns envelope with legacy compatibility', async () => {
    const { payload, response } = await getJson('/api/profile')

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['profile', 'skills'] })
    expect(payload.data.profile).toBeTruthy()
    expect(payload.profile).toBeTruthy()
  })

  test('GET /api/auth/me returns envelope with legacy compatibility', async () => {
    const { payload, response } = await getJson('/api/auth/me')

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['user'] })
    expect(payload.data.user).toBeNull()
    expect(payload.user).toBeNull()
  })

  test('GET /api/projects and /api/projects/:slug return envelopes', async () => {
    const list = await getJson('/api/projects')

    expect(list.response.status).toBe(200)
    expectContractShape(list.payload, { legacyKeys: ['projects'] })
    expect(Array.isArray(list.payload.data.projects)).toBe(true)
    expect(Array.isArray(list.payload.projects)).toBe(true)

    const slug = list.payload.projects[0]?.slug
    expect(slug).toBeTruthy()

    const detail = await getJson(`/api/projects/${slug}`)
    expect(detail.response.status).toBe(200)
    expectContractShape(detail.payload, { legacyKeys: ['project'] })
    expect(detail.payload.data.project.slug).toBe(slug)
    expect(detail.payload.project.slug).toBe(slug)

    const interactions = await getJson(`/api/projects/${slug}/interactions`)
    expect(interactions.response.status).toBe(200)
    expectContractShape(interactions.payload, { legacyKeys: ['comments', 'likeCount'] })
    expect(Array.isArray(interactions.payload.data.comments)).toBe(true)
    expect(typeof interactions.payload.data.likeCount).toBe('number')
  })

  test('GET /api/projects/:slug not found returns coded envelope error', async () => {
    const { payload, response } = await getJson('/api/projects/not-a-real-project')

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('PROJECT_NOT_FOUND')

    const interactions = await getJson('/api/projects/not-a-real-project/interactions')
    expect(interactions.response.status).toBe(404)
    expectContractShape(interactions.payload)
    expect(interactions.payload.error.code).toBe('PROJECT_NOT_FOUND')
  })

  test('GET /api/experience returns envelope with legacy compatibility', async () => {
    const { payload, response } = await getJson('/api/experience')

    expect(response.status).toBe(200)
    expectContractShape(payload, { legacyKeys: ['experience'] })
    expect(Array.isArray(payload.data.experience)).toBe(true)
    expect(Array.isArray(payload.experience)).toBe(true)
  })

  test('GET /api/community public read endpoints return envelopes when local stores are absent', async () => {
    const uploads = await getJson('/api/community/uploads')
    expect(uploads.response.status).toBe(200)
    expectContractShape(uploads.payload, { legacyKeys: ['uploads'] })
    expect(uploads.payload.uploads).toEqual([])

    const posts = await getJson('/api/community/posts')
    expect(posts.response.status).toBe(200)
    expectContractShape(posts.payload, { legacyKeys: ['posts'] })
    expect(posts.payload.posts).toEqual([])

    const post = await getJson('/api/community/posts/not-a-real-post')
    expect(post.response.status).toBe(404)
    expectContractShape(post.payload)
    expect(post.payload.error.code).toBe('COMMUNITY_POST_NOT_FOUND')

    const comments = await getJson('/api/community/posts/not-a-real-post/comments')
    expect(comments.response.status).toBe(200)
    expectContractShape(comments.payload, { legacyKeys: ['comments'] })
    expect(comments.payload.comments).toEqual([])
  })

  test('GET /api/account read endpoints return coded envelopes when local auth store is absent', async () => {
    for (const endpoint of ['profile', 'community', 'downloads', 'comments']) {
      const { payload, response } = await getJson(`/api/account/${endpoint}`)

      expect(response.status, endpoint).toBe(503)
      expectContractShape(payload)
      expect(payload.error.code, endpoint).toBe('SERVICE_UNAVAILABLE')
    }
  })

  test('GET /api/users/:handle returns envelope for missing local profile', async () => {
    const { payload, response } = await getJson('/api/users/not-exist-test-handle')

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('RESOURCE_FORBIDDEN')
  })

  test('GET /api/users/:handle activity endpoints return envelopes when local stores are absent', async () => {
    const resources = await getJson('/api/users/not-exist-test-handle/resources')
    expect(resources.response.status).toBe(200)
    expectContractShape(resources.payload, { legacyKeys: ['resources'] })
    expect(resources.payload.resources).toEqual([])

    const posts = await getJson('/api/users/not-exist-test-handle/posts')
    expect(posts.response.status).toBe(200)
    expectContractShape(posts.payload, { legacyKeys: ['posts'] })
    expect(posts.payload.posts).toEqual([])

    const activity = await getJson('/api/users/not-exist-test-handle/activity')
    expect(activity.response.status).toBe(200)
    expectContractShape(activity.payload, { legacyKeys: ['comments', 'posts', 'resources'] })
    expect(activity.payload.comments).toEqual([])
    expect(activity.payload.posts).toEqual([])
    expect(activity.payload.resources).toEqual([])
  })

  // --- Write / auth endpoint envelopes ---
  //
  // The API test server runs without DATABASE_URL, so authStore/communityStore
  // are absent. Every auth and community write endpoint is gated by
  // requireAuthStore, which short-circuits to a SERVICE_UNAVAILABLE envelope
  // before the per-request auth check runs. That means the unauthenticated
  // AUTH_REQUIRED path is not reachable here — the store gate wins first — so we
  // assert the coded 503 envelope these endpoints actually return in this
  // configuration. The file-backed project/contact write endpoints have no such
  // gate and exercise the real success + validation envelopes below.

  test('POST /api/auth/{register,login} return coded envelopes when local auth store is absent', async () => {
    for (const endpoint of ['register', 'login']) {
      const { payload, response } = await postJson(`/api/auth/${endpoint}`, {})

      expect(response.status, endpoint).toBe(503)
      expectContractShape(payload)
      expect(payload.error.code, endpoint).toBe('SERVICE_UNAVAILABLE')
    }
  })

  test('POST community write endpoints return coded envelopes when local stores are absent', async () => {
    const post = await postJson('/api/community/posts', { title: 't', message: 'm' })
    expect(post.response.status).toBe(503)
    expectContractShape(post.payload)
    expect(post.payload.error.code).toBe('SERVICE_UNAVAILABLE')

    const comment = await postJson('/api/community/posts/any-id/comments', { message: 'm' })
    expect(comment.response.status).toBe(503)
    expectContractShape(comment.payload)
    expect(comment.payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  test('POST /api/projects/:slug/comments returns success and failure envelopes', async () => {
    const list = await getJson('/api/projects')
    const slug = list.payload.data.projects[0].slug

    const created = await postJson(`/api/projects/${slug}/comments`, {
      author: 'Contract Test',
      message: 'contract envelope probe',
    })
    expect(created.response.status).toBe(201)
    expectContractShape(created.payload, { legacyKeys: ['comment'] })
    expect(created.payload.data.comment).toBeTruthy()
    expect(created.payload.comment).toBeTruthy()
    expect(created.payload.data.comment.id).toBe(created.payload.comment.id)

    const invalid = await postJson(`/api/projects/${slug}/comments`, { author: '' })
    expect(invalid.response.status).toBe(400)
    expectContractShape(invalid.payload)
    expect(invalid.payload.error.code).toBe('VALIDATION_ERROR')

    const missing = await postJson('/api/projects/not-a-real-project/comments', {
      author: 'a',
      message: 'm',
    })
    expect(missing.response.status).toBe(404)
    expectContractShape(missing.payload)
    expect(missing.payload.error.code).toBe('PROJECT_NOT_FOUND')
  })

  test('POST /api/projects/:slug/like returns coded failure envelopes', async () => {
    const list = await getJson('/api/projects')
    const slug = list.payload.data.projects[0].slug

    const noVisitor = await postJson(`/api/projects/${slug}/like`, {})
    expect(noVisitor.response.status).toBe(400)
    expectContractShape(noVisitor.payload)
    expect(noVisitor.payload.error.code).toBe('VALIDATION_ERROR')

    const missing = await postJson('/api/projects/not-a-real-project/like', { visitorId: 'v1' })
    expect(missing.response.status).toBe(404)
    expectContractShape(missing.payload)
    expect(missing.payload.error.code).toBe('PROJECT_NOT_FOUND')
  })

  test('POST /api/contact returns success and failure envelopes with legacy mirror', async () => {
    const created = await postJson('/api/contact', {
      name: 'Contract Test',
      email: 'contract@example.com',
      message: 'contract envelope probe',
    })
    expect(created.response.status).toBe(201)
    expectContractShape(created.payload, { legacyKeys: ['ok'] })
    expect(created.payload.data.ok).toBe(true)
    expect(created.payload.ok).toBe(true)

    const invalid = await postJson('/api/contact', {})
    expect(invalid.response.status).toBe(400)
    expectContractShape(invalid.payload)
    expect(invalid.payload.error.code).toBe('VALIDATION_ERROR')
  })
})
