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
  })

  test('GET /api/projects/:slug not found returns coded envelope error', async () => {
    const { payload, response } = await getJson('/api/projects/not-a-real-project')

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('PROJECT_NOT_FOUND')
  })

  test('GET /api/users/:handle returns envelope for missing local profile', async () => {
    const { payload, response } = await getJson('/api/users/not-exist-test-handle')

    expect(response.status).toBe(404)
    expectContractShape(payload)
    expect(payload.error.code).toBe('RESOURCE_FORBIDDEN')
  })
})
