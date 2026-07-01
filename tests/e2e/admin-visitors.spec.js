import { expect, test } from '@playwright/test'
import pg from 'pg'

const { Pool } = pg

const adminToken = process.env.E2E_ADMIN_TOKEN
const writeAdminToken = process.env.E2E_LOCAL_ADMIN_TOKEN || adminToken
const runWriteTests = process.env.E2E_ADMIN_VISITOR_WRITE === '1'
const testDatabaseUrl = process.env.E2E_TEST_DATABASE_URL
const isLocalBaseURL = (baseURL = '') => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseURL)
const jsonHeaders = { 'Content-Type': 'application/json' }
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` })
const detailTabNames = ['Overview', 'Comments', 'Posts', 'Resources', 'Downloads', 'Moderation Log']

const isSafeTestDatabaseUrl = (databaseUrl = '') => {
  try {
    const parsed = new URL(databaseUrl)
    const databaseName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) || '')
    return /(?:test|e2e|local|dev)/i.test(databaseName) && databaseName !== 'mrright_portfolio'
  } catch {
    return false
  }
}

const createTestDatabasePool = () =>
  new Pool({
    connectionString: testDatabaseUrl,
    max: 1,
  })

const visitor = {
  accessLevel: 'member',
  avatarUrl: '',
  bio: 'Realtime character artist and community member.',
  contactsPublic: false,
  createdAt: '2026-06-01T08:00:00.000Z',
  displayName: 'Review Visitor',
  email: 'review@example.com',
  emailVerified: true,
  handle: 'review-visitor',
  id: 'visitor-review-1',
  lastLoginAt: '2026-06-20T08:00:00.000Z',
  profileAdminDisabled: false,
  profilePublic: true,
  stats: {
    commentCount: 2,
    downloadRequestCount: 1,
    likeCount: 3,
    postCount: 1,
    uploadCount: 1,
  },
  updatedAt: '2026-06-20T08:00:00.000Z',
}

const emptyCollection = (key) => ({ [key]: [] })

const expectNoSensitiveFields = (value) => {
  const stack = [value]
  const sensitiveKeyPattern =
    /password|passwordHash|password_hash|verification|verificationCodeHash|verification_code_hash|session|sessionToken|session_token|token/i

  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    for (const [key, item] of Object.entries(current)) {
      expect(key, `Sensitive response field leaked: ${key}`).not.toMatch(sensitiveKeyPattern)
      if (item && typeof item === 'object') stack.push(item)
    }
  }
}

const expectNotServerError = (response, label) => {
  expect(response.status(), label).toBeLessThan(500)
}

const getVisitorModerationState = async (pool, visitorId) => {
  const result = await pool.query(
    `
      SELECT
        avatar_url,
        banner_url,
        bio,
        public_email,
        contact_links,
        contacts_public,
        profile_admin_disabled
      FROM visitor_users
      WHERE id = $1
    `,
    [visitorId],
  )

  return result.rows[0] || null
}

const getVisitorAdminActions = async (pool, visitorId) => {
  const result = await pool.query(
    `
      SELECT action, fields
      FROM admin_user_actions
      WHERE visitor_user_id = $1
      ORDER BY created_at DESC
    `,
    [visitorId],
  )

  return result.rows
}

test.describe('admin visitors API read-only access', () => {
  test('rejects visitor list requests without an admin token', async ({ request }) => {
    const response = await request.get('/api/admin/visitors')

    expect(response.status()).toBe(401)
    expectNotServerError(response, 'GET /api/admin/visitors without token')
  })

  test('rejects filtered visitor list requests without server errors when unauthenticated', async ({
    request,
  }) => {
    const cases = [
      '/api/admin/visitors?page=1',
      '/api/admin/visitors?limit=30',
      '/api/admin/visitors?query=test',
      '/api/admin/visitors?sort=createdAt',
      '/api/admin/visitors?page=1&limit=30&query=test&sort=updatedAt',
    ]

    for (const endpoint of cases) {
      const response = await request.get(endpoint)

      expect(response.status(), endpoint).toBe(401)
      expectNotServerError(response, endpoint)
    }
  })

  test('accepts safe visitor list filters with an admin token', async ({ request }) => {
    test.skip(!adminToken, 'Set E2E_ADMIN_TOKEN to run admin visitors read-only API tests.')

    const cases = [
      '/api/admin/visitors',
      '/api/admin/visitors?page=1&limit=30',
      '/api/admin/visitors?query=test',
      '/api/admin/visitors?verified=true&profileStatus=public&accessLevel=member&sort=createdAt',
      '/api/admin/visitors?verified=false&profileStatus=private&accessLevel=approved&sort=updatedAt',
      '/api/admin/visitors?profileStatus=disabled&sort=lastLoginAt',
      '/api/admin/visitors?sort=displayName',
    ]

    for (const endpoint of cases) {
      const response = await request.get(endpoint, {
        headers: authHeaders(adminToken),
      })

      expect(response.status(), endpoint).toBe(200)
      const payload = await response.json()
      expect(Array.isArray(payload.visitors), endpoint).toBe(true)
      expect(payload.pagination, endpoint).toEqual(
        expect.objectContaining({
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
        }),
      )
      expectNoSensitiveFields(payload)
    }
  })

  test('does not expose sensitive fields in visitor detail responses', async ({ request }) => {
    test.skip(!adminToken, 'Set E2E_ADMIN_TOKEN to run admin visitors read-only API tests.')

    const listResponse = await request.get('/api/admin/visitors?page=1&limit=1', {
      headers: authHeaders(adminToken),
    })
    expect(listResponse.status()).toBe(200)
    const listPayload = await listResponse.json()
    const firstVisitor = listPayload.visitors?.[0]

    test.skip(!firstVisitor?.id, 'No visitor exists for visitor detail read-only API coverage.')

    const detailResponse = await request.get(`/api/admin/visitors/${firstVisitor.id}`, {
      headers: authHeaders(adminToken),
    })

    expect(detailResponse.status()).toBe(200)
    const detailPayload = await detailResponse.json()
    expect(detailPayload.visitor).toEqual(expect.objectContaining({ id: firstVisitor.id }))
    expectNoSensitiveFields(detailPayload)
  })
})

test('admin visitor management renders filters and lazy visitor detail', async ({ page }) => {
  const serverErrors = []
  const consoleErrors = []

  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
  })

  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let payload

    if (path === '/api/admin/summary') {
      payload = {
        summary: {
          comments: 2,
          community_comments: 0,
          community_posts: 1,
          community_uploads: 1,
          contact_messages: 0,
          download_requests: 1,
          likes: 3,
          visitors: 1,
        },
      }
    } else if (path === '/api/admin/visitors') {
      payload = {
        pagination: {
          hasNext: false,
          hasPrevious: false,
          limit: 20,
          page: 1,
          pages: 1,
          total: 1,
        },
        visitors: [visitor],
      }
    } else if (path === `/api/admin/visitors/${visitor.id}`) {
      payload = { recentActions: [], visitor }
    } else if (path.startsWith(`/api/admin/visitors/${visitor.id}/`)) {
      payload = {
        items: [],
        pagination: {
          hasNext: false,
          hasPrevious: false,
          limit: 20,
          page: 1,
          pages: 1,
          total: 0,
        },
      }
    } else if (path === '/api/admin/comments') {
      payload = emptyCollection('comments')
    } else if (path === '/api/admin/likes') {
      payload = emptyCollection('likes')
    } else if (path === '/api/admin/contact-messages') {
      payload = emptyCollection('messages')
    } else if (path === '/api/admin/download-requests') {
      payload = emptyCollection('requests')
    } else if (path === '/api/admin/projects') {
      payload = emptyCollection('projects')
    } else if (path === '/api/admin/community-uploads') {
      payload = emptyCollection('uploads')
    } else if (path === '/api/admin/community-posts') {
      payload = emptyCollection('posts')
    } else if (path === '/api/admin/community-comments') {
      payload = emptyCollection('comments')
    } else {
      payload = { ok: true }
    }

    await route.fulfill({
      body: JSON.stringify(payload),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveTitle(/mrright\.blog/i)
  await page.getByRole('button', { name: 'Visitors', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Visitor Management' })).toBeVisible()
  await expect(page.getByPlaceholder('Search name, handle, or email')).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(4)
  await expect(page.getByRole('combobox').nth(0)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(2)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(3)).toHaveValue('createdAt')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Previous' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Review Visitor/ })).toBeVisible()

  await page.getByRole('button', { name: /Review Visitor/ }).click()
  await expect(page.getByText('Visitor Detail')).toBeVisible()
  await expect(page.getByText('@review-visitor', { exact: true })).toBeVisible()
  const detailTabs = page.locator('.visitor-detail-tabs')

  for (const tabName of detailTabNames) {
    await expect(detailTabs.getByRole('button', { name: tabName, exact: true })).toBeVisible()
  }

  for (const tabName of detailTabNames) {
    await detailTabs.getByRole('button', { name: tabName, exact: true }).click()
    await expect(page.getByText('Visitor Detail')).toBeVisible()
    await expect(page.locator('body')).not.toBeEmpty()
  }

  expect(serverErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('admin visitor management renders an empty visitor state without blanking', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
  })

  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let payload

    if (path === '/api/admin/summary') {
      payload = {
        summary: {
          comments: 0,
          community_comments: 0,
          community_posts: 0,
          community_uploads: 0,
          contact_messages: 0,
          download_requests: 0,
          likes: 0,
          visitors: 0,
        },
      }
    } else if (path === '/api/admin/visitors') {
      payload = {
        pagination: {
          hasNext: false,
          hasPrevious: false,
          limit: 20,
          page: 1,
          pages: 1,
          total: 0,
        },
        visitors: [],
      }
    } else if (path === '/api/admin/comments') {
      payload = emptyCollection('comments')
    } else if (path === '/api/admin/likes') {
      payload = emptyCollection('likes')
    } else if (path === '/api/admin/contact-messages') {
      payload = emptyCollection('messages')
    } else if (path === '/api/admin/download-requests') {
      payload = emptyCollection('requests')
    } else if (path === '/api/admin/projects') {
      payload = emptyCollection('projects')
    } else if (path === '/api/admin/community-uploads') {
      payload = emptyCollection('uploads')
    } else if (path === '/api/admin/community-posts') {
      payload = emptyCollection('posts')
    } else if (path === '/api/admin/community-comments') {
      payload = emptyCollection('comments')
    } else {
      payload = { ok: true }
    }

    await route.fulfill({
      body: JSON.stringify(payload),
      contentType: 'application/json',
      status: 200,
    })
  })

  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Visitors', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Visitor Management' })).toBeVisible()
  await expect(page.getByText('No visitors match these filters.')).toBeVisible()
  await expect(page.locator('body')).not.toBeEmpty()
})

test.describe('admin visitors local write workflow', () => {
  test('can disable, moderate, audit, and restore a dedicated local visitor', async ({
    request,
  }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL || '')
    test.skip(!runWriteTests, 'Set E2E_ADMIN_VISITOR_WRITE=1 to run local admin visitor write coverage.')
    test.skip(!isLocalBaseURL(baseURL), 'Admin visitor write coverage only runs against localhost or 127.0.0.1.')
    test.skip(!writeAdminToken, 'Set E2E_LOCAL_ADMIN_TOKEN or E2E_ADMIN_TOKEN for local admin visitor write coverage.')
    test.skip(!testDatabaseUrl, 'Set E2E_TEST_DATABASE_URL to run local admin visitor database write coverage.')
    test.skip(
      !isSafeTestDatabaseUrl(testDatabaseUrl),
      'E2E_TEST_DATABASE_URL must point to a clearly named test, e2e, local, or dev database.',
    )

    const unique = Date.now()
    const handle = `e2e-admin-visitor-${unique}`
    const email = `${handle}@example.test`
    const password = `E2eVisitor-${unique}`
    const reason = 'e2e admin visitor moderation'
    const seededAvatarUrl = '/uploads/avatars/e2e-admin-visitor-avatar.png'
    const seededBannerUrl = '/uploads/banners/e2e-admin-visitor-banner.png'
    const db = createTestDatabasePool()
    let visitorId

    try {
      const registerResponse = await request.post('/api/auth/register', {
        data: {
          displayName: 'E2E Admin Visitor',
          email,
          password,
        },
        headers: jsonHeaders,
      })
      expect(registerResponse.status()).toBe(201)
      const registerPayload = await registerResponse.json()
      const verificationCode = registerPayload.verification?.devCode
      visitorId = registerPayload.user?.id

      test.skip(
        !verificationCode || !visitorId,
        'Local visitor write coverage requires a non-production server that returns a dev verification code.',
      )

      const verifyResponse = await request.post('/api/auth/verify-email', {
        data: { code: verificationCode, email },
        headers: jsonHeaders,
      })
      expect(verifyResponse.status()).toBe(200)
      const verifyPayload = await verifyResponse.json()
      const visitorToken = verifyPayload.session?.token
      expect(visitorToken).toBeTruthy()

      const profileResponse = await request.put('/api/account/profile', {
        data: {
          activityPublic: true,
          bio: 'E2E bio before moderation.',
          contactLinks: {
            website: {
              label: 'Website',
              public: true,
              url: 'https://example.test/e2e',
            },
          },
          contactsPublic: true,
          displayName: 'E2E Admin Visitor',
          handle,
          location: '',
          profilePublic: true,
          publicEmail: email,
          website: 'https://example.test',
        },
        headers: {
          ...authHeaders(visitorToken),
          ...jsonHeaders,
        },
      })
      expect(profileResponse.status()).toBe(200)

      const seedResult = await db.query(
        `
          UPDATE visitor_users
          SET avatar_url = $2,
              banner_url = $3,
              updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [visitorId, seededAvatarUrl, seededBannerUrl],
      )
      test.skip(
        !seedResult.rows[0]?.id,
        'The configured E2E_TEST_DATABASE_URL does not contain the local test visitor.',
      )

      await expect.poll(async () => getVisitorModerationState(db, visitorId)).toEqual(
        expect.objectContaining({
          avatar_url: seededAvatarUrl,
          banner_url: seededBannerUrl,
          bio: 'E2E bio before moderation.',
          contacts_public: true,
          profile_admin_disabled: false,
          public_email: email,
        }),
      )

      const disableResponse = await request.patch(`/api/admin/visitors/${visitorId}/profile-visibility`, {
        data: { disabled: true, reason },
        headers: {
          ...authHeaders(writeAdminToken),
          ...jsonHeaders,
        },
      })
      expect(disableResponse.status()).toBe(200)

      const disabledPublicResponse = await request.get(`/api/users/${handle}`)
      expect(disabledPublicResponse.status()).toBe(403)
      expect(await disabledPublicResponse.json()).toEqual(
        expect.objectContaining({ code: 'PROFILE_ADMIN_DISABLED' }),
      )
      const disabledPublicPageResponse = await request.get(`/u/${handle}`)
      expectNotServerError(disabledPublicPageResponse, `/u/${handle} after admin disable`)

      await expect.poll(async () => getVisitorModerationState(db, visitorId)).toEqual(
        expect.objectContaining({
          profile_admin_disabled: true,
        }),
      )

      const userRestoreAttempt = await request.put('/api/account/profile', {
        data: {
          activityPublic: true,
          bio: 'User tried to restore public profile.',
          contactLinks: {
            website: {
              label: 'Website',
              public: true,
              url: 'https://example.test/restored',
            },
          },
          contactsPublic: true,
          displayName: 'E2E Admin Visitor',
          handle,
          location: '',
          profilePublic: true,
          publicEmail: email,
          website: 'https://example.test',
        },
        headers: {
          ...authHeaders(visitorToken),
          ...jsonHeaders,
        },
      })
      expect(userRestoreAttempt.status()).toBe(200)

      const stillDisabledResponse = await request.get(`/api/users/${handle}`)
      expect(stillDisabledResponse.status()).toBe(403)
      expect(await stillDisabledResponse.json()).toEqual(
        expect.objectContaining({ code: 'PROFILE_ADMIN_DISABLED' }),
      )

      const moderationResponse = await request.patch(`/api/admin/visitors/${visitorId}/profile-moderation`, {
        data: { clear: ['avatar', 'banner', 'bio', 'contacts'], reason },
        headers: {
          ...authHeaders(writeAdminToken),
          ...jsonHeaders,
        },
      })
      expect(moderationResponse.status()).toBe(200)
      const moderationPayload = await moderationResponse.json()
      expect(moderationPayload.visitor).toEqual(
        expect.objectContaining({
          avatarUrl: '',
          bannerUrl: '',
          bio: '',
          contactLinks: {},
          contactsPublic: false,
          publicEmail: '',
        }),
      )
      await expect.poll(async () => getVisitorModerationState(db, visitorId)).toEqual(
        expect.objectContaining({
          avatar_url: '',
          banner_url: '',
          bio: '',
          contact_links: {},
          contacts_public: false,
          profile_admin_disabled: true,
          public_email: '',
        }),
      )

      const actionsResponse = await request.get(`/api/admin/visitors/${visitorId}/actions`, {
        headers: authHeaders(writeAdminToken),
      })
      expect(actionsResponse.status()).toBe(200)
      const actionsPayload = await actionsResponse.json()
      const actions = actionsPayload.items?.map((item) => item.action) || []
      expect(actions).toEqual(expect.arrayContaining(['profile_disabled', 'profile_fields_cleared']))

      const databaseActions = await getVisitorAdminActions(db, visitorId)
      expect(databaseActions.map((item) => item.action)).toEqual(
        expect.arrayContaining(['profile_disabled', 'profile_fields_cleared']),
      )
      expect(databaseActions.find((item) => item.action === 'profile_fields_cleared')?.fields).toEqual(
        expect.arrayContaining(['avatar', 'banner', 'bio', 'contacts']),
      )

      const restoreResponse = await request.patch(`/api/admin/visitors/${visitorId}/profile-visibility`, {
        data: { disabled: false, reason },
        headers: {
          ...authHeaders(writeAdminToken),
          ...jsonHeaders,
        },
      })
      expect(restoreResponse.status()).toBe(200)

      const restoredPublicResponse = await request.get(`/api/users/${handle}`)
      expect(restoredPublicResponse.status()).toBe(200)
      const restoredPublicPageResponse = await request.get(`/u/${handle}`)
      expectNotServerError(restoredPublicPageResponse, `/u/${handle} after admin restore`)

      const restoredPublicPayload = await restoredPublicResponse.json()
      expect(restoredPublicPayload.profile).toEqual(
        expect.objectContaining({
          bio: '',
          contactsPublic: false,
          handle,
          profileAdminDisabled: false,
          profilePublic: true,
          publicEmail: '',
        }),
      )
      await expect.poll(async () => getVisitorModerationState(db, visitorId)).toEqual(
        expect.objectContaining({
          avatar_url: '',
          banner_url: '',
          bio: '',
          contacts_public: false,
          profile_admin_disabled: false,
          public_email: '',
        }),
      )
    } finally {
      if (visitorId && writeAdminToken) {
        await request.patch(`/api/admin/visitors/${visitorId}/profile-visibility`, {
          data: { disabled: false, reason: 'e2e cleanup restore public profile' },
          headers: {
            ...authHeaders(writeAdminToken),
            ...jsonHeaders,
          },
        }).catch(() => {})
      }
      await db.end().catch(() => {})
    }
  })
})
