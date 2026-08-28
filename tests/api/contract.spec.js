import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describeUploadError } from '../../server/responses.js'

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
      // Enables the test-only /api/__test__/throw route so the final
      // INTERNAL_ERROR envelope handler can be exercised deterministically.
      NODE_ENV: 'test',
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

  // --- Admin endpoint envelopes ---
  //
  // requireAdmin runs two checks in order: (1) the Authorization bearer token
  // must equal ADMIN_TOKEN, else 401 ADMIN_AUTH_REQUIRED; (2) adminStore must
  // exist, else 503 SERVICE_UNAVAILABLE. On the main test server ADMIN_TOKEN is
  // unset / never matched, so both no-token and wrong-token requests deterministically
  // hit check (1) and return the 401 envelope below. The valid-token path (which
  // reaches check 2's 503, and — with a real store — the 200 success responses and
  // their legacy top-level mirrors) is covered in the separate describe block that
  // boots a server WITH an ADMIN_TOKEN. True 200 admin success + legacy-field
  // assertions still require a DATABASE_URL-backed adminStore and must be covered
  // in a DB-enabled environment.

  const adminFetch = async (path, { method = 'GET', token } = {}) => {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const payload = await response.json()
    return { payload, response }
  }

  test('admin GET without authorization returns coded 401 envelope', async () => {
    const { payload, response } = await adminFetch('/api/admin/summary')

    expect(response.status).toBe(401)
    expectContractShape(payload)
    expect(payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  test('admin GET with wrong token returns coded 401 envelope', async () => {
    const { payload, response } = await adminFetch('/api/admin/visitors', {
      token: 'definitely-not-the-admin-token',
    })

    expect(response.status).toBe(401)
    expectContractShape(payload)
    expect(payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  test('admin write without authorization returns coded 401 envelope', async () => {
    const { payload, response } = await adminFetch('/api/admin/comments/any-id', {
      method: 'DELETE',
    })

    expect(response.status).toBe(401)
    expectContractShape(payload)
    expect(payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  test('multipart POST to an upload route returns a coded envelope, never a bare string error', async () => {
    const form = new FormData()
    form.append('file', new Blob(['stub-bytes'], { type: 'text/plain' }), 'stub.txt')

    const response = await fetch(`${baseURL}/api/community/uploads`, {
      method: 'POST',
      body: form,
    })
    const payload = await response.json()

    // Reachable upload error path in this store-less env: requireAuthStore
    // short-circuits before multer runs. The response must still be an
    // envelope, never the legacy `{ error: '<string>' }`.
    expect(response.status).toBe(503)
    expectContractShape(payload)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
    expect(typeof payload.error).not.toBe('string')
  })

  // --- Final API error handler (REQUEST_BODY_INVALID / INTERNAL_ERROR) ---
  //
  // These exercise the end-of-app /api/* error middleware: malformed JSON
  // bodies rejected by express.json, and uncaught route exceptions. Both must
  // return the JSON envelope — never Express's default HTML 500 — and must not
  // leak internals (stack traces, paths) into the response body.

  test('malformed JSON body on /api/* returns coded 400 REQUEST_BODY_INVALID envelope', async () => {
    const response = await fetch(`${baseURL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": "broken json",',
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expectContractShape(payload)
    expect(payload.data).toBeNull()
    expect(payload.pagination).toEqual(expect.any(Object))
    expect(typeof payload.error).not.toBe('string')
    expect(payload.error.code).toBe('REQUEST_BODY_INVALID')
    expect(payload.error.message).toEqual(expect.any(String))
    expect(payload.error.message.length).toBeGreaterThan(0)
  })

  test('uncaught API exception returns coded 500 INTERNAL_ERROR envelope without internals', async () => {
    // /api/__test__/throw exists only when the server runs with
    // NODE_ENV === 'test' (as this suite's server does) and throws
    // synchronously so the request reaches the final error middleware.
    const response = await fetch(`${baseURL}/api/__test__/throw`)
    const rawBody = await response.text()
    const payload = JSON.parse(rawBody)

    expect(response.status).toBe(500)
    expectContractShape(payload)
    expect(payload.data).toBeNull()
    expect(payload.pagination).toEqual(expect.any(Object))
    expect(typeof payload.error).not.toBe('string')
    expect(payload.error.code).toBe('INTERNAL_ERROR')
    expect(payload.error.message).toEqual(expect.any(String))

    // No leaked internals: stack frames, the original error text, or HTML.
    expect(rawBody).not.toContain('    at ')
    expect(rawBody).not.toContain('Deliberate uncaught contract-test error.')
    expect(rawBody).not.toContain('server/index.js')
    expect(rawBody).not.toContain('<html')
  })
})

// --- /api/v1 strict envelope (no legacy mirror) ---
//
// The /api/v1/* prefix is the frozen contract for the future C++ cross-platform
// App (API_V1_FREEZE_PLAN.md §3). Both prefixes share the same handlers via a
// URL-rewrite dual mount; the ONLY difference is the response mode:
//   - legacy /api/*   → envelope + top-level data mirror + code/message mirror
//   - strict /api/v1/* → envelope ONLY: top-level keys are exactly
//     data / pagination / error, nothing else, success or failure.
// The reverse-mirror assertions below pin BOTH sides of that contract so a
// future change can neither drop the legacy mirror (breaking the Web client)
// nor leak it into v1 (freezing migration debt into the native SDK).
test.describe('api v1 strict envelope (no legacy mirror)', () => {
  // Strict v1 responses may not carry ANY top-level key beyond the envelope.
  const expectStrictV1Shape = (payload) => {
    expect(Object.keys(payload).sort()).toEqual(['data', 'error', 'pagination'])
    expect(payload.pagination).toEqual(expect.any(Object))

    if (payload.error !== null) {
      expect(payload.data).toBeNull()
      expect(typeof payload.error).not.toBe('string')
      expect(payload.error).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      )
      expect(payload.error.code.length).toBeGreaterThan(0)
    }
  }

  // Fetches the same path via both prefixes and asserts the reverse-mirror
  // pair: legacy /api keeps the top-level mirror keys, strict /api/v1 must not
  // have them, and the data payloads stay identical (same handler, no drift).
  const expectReverseMirror = async (path, mirrorKeys) => {
    const legacy = await getJson(`/api${path}`)
    const v1 = await getJson(`/api/v1${path}`)

    expect(v1.response.status, `status parity for ${path}`).toBe(legacy.response.status)
    expect(v1.payload.data, `data parity for ${path}`).toEqual(legacy.payload.data)
    expectStrictV1Shape(v1.payload)

    for (const key of mirrorKeys) {
      expect(legacy.payload, `legacy /api${path} must keep mirror '${key}'`).toHaveProperty(key)
      expect(
        Object.prototype.hasOwnProperty.call(v1.payload, key),
        `strict /api/v1${path} must NOT mirror '${key}'`,
      ).toBe(false)
    }
  }

  test('GET /api/v1/health returns strict envelope while /api/health keeps mirror', async () => {
    await expectReverseMirror('/health', ['ok', 'service'])

    const { payload, response } = await getJson('/api/v1/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(Object.keys(payload).sort()).toEqual(['data', 'error', 'pagination'])
    expect(payload.data.ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(payload, 'ok')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(payload, 'service')).toBe(false)
  })

  test('GET /api/v1/projects has data.projects but no top-level projects mirror', async () => {
    await expectReverseMirror('/projects', ['projects'])

    const { payload } = await getJson('/api/v1/projects')
    expect(Array.isArray(payload.data.projects)).toBe(true)
    expect(payload.data.projects.length).toBeGreaterThan(0)
  })

  test('public read endpoints drop legacy mirrors on /api/v1', async () => {
    await expectReverseMirror('/profile', ['profile', 'skills'])
    await expectReverseMirror('/experience', ['experience'])
    await expectReverseMirror('/community/posts', ['posts'])
    await expectReverseMirror('/community/uploads', ['uploads'])
    await expectReverseMirror('/users/not-exist-test-handle/activity', [
      'comments',
      'posts',
      'resources',
    ])
  })

  test('v1 error responses carry only data/pagination/error (no code/message mirror)', async () => {
    // Legacy errors mirror code/message at the top level; strict v1 must not.
    await expectReverseMirror('/projects/not-a-real-project', ['code', 'message'])

    const { payload, response } = await getJson('/api/v1/projects/not-a-real-project')
    expect(response.status).toBe(404)
    expectStrictV1Shape(payload)
    expect(payload.error.code).toBe('PROJECT_NOT_FOUND')

    // Store-gated account endpoint: same 503 code, strict shape.
    const account = await getJson('/api/v1/account/profile')
    expect(account.response.status).toBe(503)
    expectStrictV1Shape(account.payload)
    expect(account.payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  test('v1 write endpoints return strict success and error envelopes', async () => {
    const created = await postJson('/api/v1/contact', {
      name: 'Contract Test',
      email: 'contract-v1@example.com',
      message: 'v1 strict envelope probe',
    })
    expect(created.response.status).toBe(201)
    expectStrictV1Shape(created.payload)
    expect(created.payload.data.ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(created.payload, 'ok')).toBe(false)

    const invalid = await postJson('/api/v1/contact', {})
    expect(invalid.response.status).toBe(400)
    expectStrictV1Shape(invalid.payload)
    expect(invalid.payload.error.code).toBe('VALIDATION_ERROR')
  })

  test('malformed JSON on /api/v1/* returns strict REQUEST_BODY_INVALID envelope', async () => {
    // Exercises middleware ordering: the v1 rewrite runs before express.json,
    // so even body-parse failures must come back in strict v1 shape.
    const response = await fetch(`${baseURL}/api/v1/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": "broken json",',
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expectStrictV1Shape(payload)
    expect(payload.error.code).toBe('REQUEST_BODY_INVALID')
  })

  test('admin routes answer on /api/v1 with strict envelopes (Web-only, not C++ contract)', async () => {
    // The dual mount covers /api/v1/admin/* mechanically, but admin stays a
    // Web-only surface authenticated by the static ADMIN_TOKEN — it is NOT
    // part of the v1 contract the C++ App may depend on (freeze plan §9).
    const { payload, response } = await getJson('/api/v1/admin/summary')

    expect(response.status).toBe(401)
    expectStrictV1Shape(payload)
    expect(payload.error.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  test('the v1 prefix only matches an exact /api/v1 path segment', async () => {
    // /api/v1x... must NOT be rewritten; it falls through past the API routes
    // (SPA fallback), proving the rewrite cannot mangle unrelated paths.
    const response = await fetch(`${baseURL}/api/v1x/health`)
    const contentType = response.headers.get('content-type') || ''
    expect(contentType).not.toContain('application/json')
  })
})

// Boots a second server WITH a known ADMIN_TOKEN but with DATABASE_URL forced
// empty, so a correctly-authenticated admin request passes requireAdmin's token
// check and then hits the missing-store branch. This exercises the valid-token
// path and asserts the SERVICE_UNAVAILABLE envelope. The 200 success responses
// (and their legacy top-level mirrors) still require a real adminStore and are
// deferred to a DATABASE_URL-backed environment.
test.describe('admin contract envelope (authenticated, store unavailable)', () => {
  const adminPort = 4194
  const adminBaseURL = `http://127.0.0.1:${adminPort}`
  const adminToken = 'contract-admin-token'
  let adminServerProcess

  test.beforeAll(async () => {
    adminServerProcess = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(adminPort),
        ADMIN_TOKEN: adminToken,
        DATABASE_URL: '',
        // Pinned to production so this server also verifies that the
        // test-only /api/__test__/throw route is NOT registered outside
        // NODE_ENV === 'test'.
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const deadline = Date.now() + 20_000
    let lastError
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${adminBaseURL}/api/health`)
        if (response.ok) return
      } catch (error) {
        lastError = error
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw lastError || new Error('Timed out waiting for admin API server.')
  })

  test.afterAll(async () => {
    if (!adminServerProcess) return
    adminServerProcess.kill('SIGTERM')
    await new Promise((resolve) => adminServerProcess.once('exit', resolve))
  })

  const adminAuthedFetch = async (path, { method = 'GET' } = {}) => {
    const response = await fetch(`${adminBaseURL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const payload = await response.json()
    return { payload, response }
  }

  test('valid admin token but missing store returns coded 503 envelope (GET)', async () => {
    const { payload, response } = await adminAuthedFetch('/api/admin/summary')

    expect(response.status).toBe(503)
    expectContractShape(payload)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  test('valid admin token but missing store returns coded 503 envelope (write)', async () => {
    const { payload, response } = await adminAuthedFetch('/api/admin/projects/any-slug', {
      method: 'DELETE',
    })

    expect(response.status).toBe(503)
    expectContractShape(payload)
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE')
  })

  test('test-only /api/__test__/throw route is not registered in production', async () => {
    // This server runs with NODE_ENV=production, so the route must not exist.
    // The request falls through to the SPA pipeline instead of throwing, so it
    // must NOT produce the INTERNAL_ERROR 500 the test-mode server produces.
    const response = await fetch(`${adminBaseURL}/api/__test__/throw`)
    const rawBody = await response.text()

    expect(response.status).not.toBe(500)
    expect(rawBody).not.toContain('INTERNAL_ERROR')
  })
})

// Directly exercises the shared multer/global upload error mapping used by the
// end-of-app error middleware. The live upload routes gate on the auth/admin
// stores before multer runs, so the FILE_* branches are unreachable without a
// configured DATABASE_URL; this covers the real classifier without a DB.
test.describe('describeUploadError mapping (shared upload error handler)', () => {
  const makeMulterError = (code, message) => {
    const error = new Error(message)
    error.name = 'MulterError'
    error.code = code
    return error
  }

  test('LIMIT_FILE_SIZE maps to FILE_TOO_LARGE with HTTP 413', () => {
    expect(describeUploadError(makeMulterError('LIMIT_FILE_SIZE', 'File too large'))).toEqual({
      code: 'FILE_TOO_LARGE',
      message: 'File too large',
      httpStatus: 413,
    })
  })

  test('other multer errors map to FILE_UPLOAD_ERROR with HTTP 400', () => {
    expect(describeUploadError(makeMulterError('LIMIT_UNEXPECTED_FILE', 'Unexpected field'))).toEqual({
      code: 'FILE_UPLOAD_ERROR',
      message: 'Unexpected field',
      httpStatus: 400,
    })
  })

  test('unsupported file type maps to INVALID_FILE_TYPE with HTTP 400', () => {
    expect(describeUploadError(new Error('Unsupported file type.'))).toEqual({
      code: 'INVALID_FILE_TYPE',
      message: 'Unsupported file type.',
      httpStatus: 400,
    })
  })

  test('a stable error.code of INVALID_FILE_TYPE classifies regardless of message (avatar/banner fileFilter)', () => {
    // Regression: avatar/banner fileFilter rejects with a different message
    // ("Only JPG, PNG, and WebP images are allowed.") than the community/admin
    // fileFilter ("Unsupported file type."). Message-only matching missed this
    // path and let it fall through to INTERNAL_ERROR. Both fileFilters now set
    // error.code = 'INVALID_FILE_TYPE', which this checks independent of message.
    const error = new Error('Only JPG, PNG, and WebP images are allowed.')
    error.code = 'INVALID_FILE_TYPE'
    expect(describeUploadError(error)).toEqual({
      code: 'INVALID_FILE_TYPE',
      message: 'Only JPG, PNG, and WebP images are allowed.',
      httpStatus: 400,
    })
  })

  test('unrelated errors are not classified as upload errors', () => {
    expect(describeUploadError(null)).toBeNull()
    expect(describeUploadError(new Error('Something unrelated blew up'))).toBeNull()
  })
})

// The HTML the server hands a crawler, as opposed to the JSON it hands the
// client. Every route used to get dist/index.html verbatim, so every route
// claimed to be the homepage; server/seo.js rewrites the head per path. These
// cases are the ones reachable without a database — the post and profile heads
// need real rows and live in contract.db.spec.js.
test.describe('per-route HTML head', () => {
  const distIndex = fileURLToPath(new URL('../../dist/index.html', import.meta.url))

  // The head is spliced into the built template, so there has to be one. CI
  // builds before this suite runs; a local run that skipped `npm run build`
  // reports that rather than failing on a 503.
  test.skip(!existsSync(distIndex), 'dist/index.html is missing; run npm run build first')

  const getHtml = async (path) => {
    const response = await fetch(`${baseURL}${path}`)
    return { body: await response.text(), response }
  }

  test('the homepage keeps the site defaults and points a canonical at itself', async () => {
    const { body, response } = await getHtml('/')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(body).toContain('<title>mrright.blog | 3D Portfolio</title>')
    expect(body).toContain('<link rel="canonical" href="https://mrright.blog/" />')
    expect(body).not.toContain('name="robots"')
  })

  test('the community index gets its own title, not the homepage one', async () => {
    const { body, response } = await getHtml('/community')

    expect(response.status).toBe(200)
    expect(body).toContain('<title>Community | mrright.blog</title>')
    expect(body).toContain('<link rel="canonical" href="https://mrright.blog/community" />')
  })

  // Projects come from the bundled content file, so this suite reaches them
  // even without a database. content.js fills `title`/`summary` in English and
  // adds only Zh/Ja translations, which is also the fallback path in seo.js.
  test('a project page carries its own title and render, not the homepage one', async () => {
    const { body, response } = await getHtml('/projects/fire-extinguisher-next-gen')

    expect(response.status).toBe(200)
    expect(body).toContain('<title>Next-Gen Fire Extinguisher | mrright.blog</title>')
    expect(body).toContain(
      '<link rel="canonical" ' +
        'href="https://mrright.blog/projects/fire-extinguisher-next-gen" />',
    )
    expect(body).toContain(
      '<meta property="og:image" ' +
        'content="https://mrright.blog/assets/projects/fire-extinguisher.png" />',
    )
    expect(body).not.toContain('name="robots"')
  })

  test('a project page is crawlable without javascript', async () => {
    const { body } = await getHtml('/projects/fire-extinguisher-next-gen')
    const noscript = body.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0] || ''

    expect(noscript).toContain('<h1>Next-Gen Fire Extinguisher</h1>')
    expect(noscript).toContain('<a href="/">')
  })

  test('a project slug nobody owns answers 404', async () => {
    const { body, response } = await getHtml('/projects/no-such-project-slug')

    expect(response.status).toBe(404)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
  })

  test('/projects points its canonical at the homepage it renders', async () => {
    const { body, response } = await getHtml('/projects')

    expect(response.status).toBe(200)
    expect(body).toContain('<title>mrright.blog | 3D Portfolio</title>')
    expect(body).toContain('<link rel="canonical" href="https://mrright.blog/" />')
  })

  // The client router has no route below a project detail, so neither does the
  // head: this path renders the plain homepage and must not claim to be the
  // project.
  test('a path below a project is not the project', async () => {
    const { body, response } = await getHtml('/projects/fire-extinguisher-next-gen/extra')

    expect(response.status).toBe(200)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
    expect(body).not.toContain('<title>Next-Gen Fire Extinguisher | mrright.blog</title>')
  })

  test('the sitemap lists every project under its own route', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()

    expect(body).toContain('<loc>https://mrright.blog/projects/fire-extinguisher-next-gen</loc>')
    expect(body).toContain('<loc>https://mrright.blog/projects/creature-accessories</loc>')
  })

  // JSON-LD, and the CSP question that kept it out of round twenty-three. A
  // script element whose type is not a JavaScript type is a data block: it is
  // never prepared for execution, so script-src never gets a say. Measured in
  // real Chromium (round twenty-five) rather than assumed.
  const graphOf = (body) => {
    const script = body.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1]
    return script ? JSON.parse(script) : null
  }

  test('the graph says what the homepage is and who publishes it', async () => {
    const graph = graphOf((await getHtml('/')).body)

    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph'].map((node) => node['@type'])).toEqual(['WebSite', 'Person'])
  })

  test('a project page describes the work and the trail to it', async () => {
    const graph = graphOf((await getHtml('/projects/fire-extinguisher-next-gen')).body)
    const types = graph['@graph'].map((node) => node['@type'])

    expect(types).toContain('CreativeWork')
    expect(types).toContain('BreadcrumbList')
    expect(graph['@graph'].find((node) => node['@type'] === 'CreativeWork')).toMatchObject({
      name: 'Next-Gen Fire Extinguisher',
      url: 'https://mrright.blog/projects/fire-extinguisher-next-gen',
    })
  })

  // The graph rides along on the policy the site already has. Nothing about the
  // CSP header changes per response -- no hash, no nonce, and above all no
  // 'unsafe-inline' bought to make room for it. If this assertion ever fails,
  // read the JSON-LD comment in server/seo.js before loosening anything.
  test('the policy is untouched: no per-page hash, no inline allowance', async () => {
    const { body, response } = await getHtml('/')
    const csp = response.headers.get('content-security-policy')

    const other = await getHtml('/community')

    expect(body).toContain('application/ld+json')
    // Two pages with two different graphs, one identical policy.
    expect(csp).toBe(other.response.headers.get('content-security-policy'))
    expect(csp).not.toContain('sha256-')
    expect(csp).not.toContain('nonce-')
    // 'self' is what loads the application bundle; it has to survive.
    expect(csp).toMatch(/script-src [^;]*'self'/)
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/)
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/)
    expect(csp).toContain('report-uri /api/csp-report')
  })

  test('a page that is not indexed gets no graph', async () => {
    for (const path of ['/account', '/admin', '/no-such-page']) {
      const { body } = await getHtml(path)

      expect(body, path).not.toContain('ld+json')
    }
  })

  // 971 KB of three.js used to be preloaded on every page, /account and /login
  // included, because vite's dynamic-import preload helper had been parked in
  // the `three-fiber` manual chunk -- which made the entry import it
  // statically. Nothing on a first paint needs the 3D engine; the hero and the
  // model viewer fetch it when they mount. If this fails, check manualChunks in
  // vite.config.js before assuming a component started importing three.
  test('no page preloads the 3D engine before anything needs it', async () => {
    for (const path of ['/', '/community', '/account']) {
      const { body } = await getHtml(path)
      const preloaded = [...body.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
        (match) => match[1],
      )

      expect(preloaded.length, path).toBeGreaterThan(0)
      expect(preloaded.filter((href) => href.includes('three-')), path).toEqual([])
    }
  })

  test('the built script tag survives the head rewrite', async () => {
    const { body } = await getHtml('/community')

    expect(body).toContain('<div id="root"></div>')
    expect(body).toMatch(/<script type="module"[^>]*src="\/assets\/index-[^"]+\.js"/)
  })

  test('exactly one title and one description survive the rewrite', async () => {
    const { body } = await getHtml('/')

    expect(body.match(/<title>/g)).toHaveLength(1)
    expect(body.match(/name="description"/g)).toHaveLength(1)
    expect(body.match(/property="og:title"/g)).toHaveLength(1)
  })

  test('per-visitor and privileged pages are told not to index', async () => {
    for (const path of ['/account', '/login?mode=login', '/admin']) {
      const { body, response } = await getHtml(path)

      expect(response.status, path).toBe(200)
      expect(body, path).toContain('<meta name="robots" content="noindex, follow" />')
      expect(body, path).not.toContain('rel="canonical"')
    }
  })

  // The client router renders the homepage for anything it does not recognise.
  // That is a soft 404, so it answers 200 and stays out of the index rather
  // than 404-ing a path this file may simply not know about yet.
  test('an unknown path renders but is not indexable', async () => {
    const { body, response } = await getHtml('/no-such-page')

    expect(response.status).toBe(200)
    expect(body).toContain('<meta name="robots" content="noindex, follow" />')
  })

  test('the HTML is served no-store so a rewritten head is never stale', async () => {
    const { response } = await getHtml('/community')

    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  test('hashed assets are still served straight from disk with a long cache', async () => {
    const index = await (await fetch(`${baseURL}/`)).text()
    const asset = index.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1]

    expect(asset).toBeTruthy()

    const response = await fetch(`${baseURL}${asset}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
  })

  test('robots.txt points at the sitemap and keeps crawlers out of the private areas', async () => {
    const response = await fetch(`${baseURL}/robots.txt`)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Sitemap: https://mrright.blog/sitemap.xml')
    expect(body).toContain('Disallow: /admin')
    expect(body).toContain('Disallow: /account')
    expect(body).toContain('Disallow: /login')
  })

  // They were listed as `/?project=<slug>`, which nothing reads: four sitemap
  // entries that all served the homepage.
  test('the sitemap no longer advertises query-string duplicates of the homepage', async () => {
    const body = await (await fetch(`${baseURL}/sitemap.xml`)).text()

    expect(body).toContain('<loc>https://mrright.blog/</loc>')
    expect(body).toContain('<loc>https://mrright.blog/community</loc>')
    expect(body).not.toContain('?project=')
    expect(body).not.toContain('/u/')
  })
})
