import { expect, test } from '@playwright/test'

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

test('admin visitor management renders filters and lazy visitor detail', async ({ page }, testInfo) => {
  test.skip(
    !String(testInfo.project.use.baseURL || '').includes('127.0.0.1'),
    'Run this review against the local build.',
  )
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
  await page.getByRole('button', { name: 'Visitors', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Visitor Management' })).toBeVisible()
  await expect(page.getByPlaceholder('Search name, handle, or email')).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(4)
  await expect(page.getByRole('combobox').nth(0)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(2)).toHaveValue('')
  await expect(page.getByRole('combobox').nth(3)).toHaveValue('createdAt')
  await expect(page.getByText('Page 1 of 1')).toBeVisible()

  await page.getByRole('button', { name: /Review Visitor/ }).click()
  await expect(page.getByText('Visitor Detail')).toBeVisible()
  await expect(page.getByText('@review-visitor', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Moderation Log' })).toBeVisible()

  await page.getByRole('button', { name: 'Comments' }).last().click()
  await expect(page.getByText('No records in this section.')).toBeVisible()

  await page.screenshot({
    fullPage: true,
    path: 'test-results/admin-visitors-review/admin-visitors.png',
  })

  expect(serverErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
