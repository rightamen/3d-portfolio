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
})
