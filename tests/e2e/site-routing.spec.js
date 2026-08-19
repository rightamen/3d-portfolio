import { expect, test } from '@playwright/test'
import { experience, profile, projects, skills } from '../../server/content.js'

// The public site's routing, driven entirely off fixtures.
//
// Round twenty-one replaced the `window.location.pathname` prefix checks with
// react-router. The thing that actually changed is invisible in a screenshot:
// moving between pages no longer tears the document down. So the central
// assertion here is a sentinel written onto `window` after the first load --
// if it survives a navigation, the navigation was client-side; if it is gone,
// the browser did a full page load and the router did not take the click.
//
// Same trick as the admin console spec: intercept the API, answer with the
// real payload shape, and the whole site renders without a database. That also
// makes this file safe to point at production -- it never reaches the API.

const now = new Date('2026-08-19T09:00:00.000Z')
const iso = (offsetDays) => new Date(now.getTime() - offsetDays * 86400000).toISOString()

const author = {
  accessLevel: 'member',
  displayName: 'Rin Sato',
  handle: 'rin-sato',
  id: 'user-routing-1',
}

const posts = [
  {
    createdAt: iso(1),
    id: 'post-routing-1',
    message: 'Notes on getting clean normals off a high-poly sculpt.',
    title: 'Baking normals from a high-poly sculpt',
    topic: 'workflow',
    updatedAt: iso(1),
    user: author,
  },
  {
    createdAt: iso(4),
    id: 'post-routing-2',
    message: 'What everyone is working on this month.',
    title: 'Monthly thread',
    topic: 'general',
    updatedAt: iso(4),
    user: author,
  },
]

const publicProfile = {
  activityPublic: true,
  avatarUrl: '',
  bannerUrl: '',
  bio: 'Environment artist, mostly props.',
  contactsPublic: false,
  displayName: author.displayName,
  handle: author.handle,
  joinedAt: iso(200),
  location: 'Osaka',
  profilePublic: true,
  publicEmail: '',
  stats: { comments: 3, downloads: 1, posts: 2, resources: 0 },
  website: '',
}

const knownHandle = author.handle

const payloadFor = (pathname) => {
  if (pathname === '/api/profile') return { profile, skills }
  if (pathname === '/api/projects') return { projects }
  if (pathname === '/api/experience') return { experience }
  if (pathname === '/api/community/uploads') return { uploads: [] }
  if (pathname === '/api/community/posts') return { posts }

  const postMatch = pathname.match(/^\/api\/community\/posts\/([^/]+)$/)
  if (postMatch) {
    const post = posts.find((item) => item.id === postMatch[1])
    return post ? { post } : null
  }

  if (pathname.startsWith('/api/community/posts/')) return { comments: [] }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)(\/.*)?$/)
  if (userMatch) {
    if (decodeURIComponent(userMatch[1]) !== knownHandle) return null
    if (userMatch[2] === '/resources') return { resources: [] }
    if (userMatch[2] === '/posts') return { posts }
    if (userMatch[2] === '/activity') return { comments: [], posts, resources: [] }
    return { profile: publicProfile }
  }

  return { ok: true }
}

const routeApi = async (page) => {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    const payload = payloadFor(pathname)

    if (!payload) {
      return route.fulfill({
        body: JSON.stringify({
          data: null,
          error: { code: 'RESOURCE_FORBIDDEN', message: 'Not found.' },
        }),
        contentType: 'application/json',
        status: 404,
      })
    }

    await route.fulfill({
      body: JSON.stringify({ data: payload, error: null }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

const sentinel = 'routerProbe'

// Written after the page is up rather than in an init script: an init script
// re-runs on every document load, which is precisely what this is trying to
// detect.
const markDocument = (page) =>
  page.evaluate((key) => {
    window[key] = true
  }, sentinel)

const documentSurvived = (page) => page.evaluate((key) => Boolean(window[key]), sentinel)

const openSite = async (page, path = '/') => {
  await routeApi(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-language', 'en')
  })
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

test('the navbar link into the community is a client-side navigation', async ({ page }) => {
  await openSite(page, '/')
  await expect(page.locator('#home')).toBeVisible()
  await markDocument(page)

  await page.locator('.nav-ul a[href="/community"]').first().click()

  await expect(page).toHaveURL(/\/community$/)
  await expect(page.locator('.community-page')).toBeVisible()
  expect(await documentSurvived(page)).toBe(true)
})

test('a post opens and the back link returns to the list, both without reloading', async ({
  page,
}) => {
  await openSite(page, '/community')
  await expect(page.locator('.community-post-link').first()).toBeVisible()
  await markDocument(page)

  await page.locator('.community-post-link').first().click()
  await expect(page).toHaveURL(new RegExp(`/community/${posts[0].id}$`))
  await expect(page.locator('.community-detail-title')).toHaveText(posts[0].title)
  expect(await documentSurvived(page)).toBe(true)

  await page.locator('.community-back-link').click()
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.locator('.community-post-link').first()).toBeVisible()
  expect(await documentSurvived(page)).toBe(true)
})

test('Back walks the history the router pushed', async ({ page }) => {
  await openSite(page, '/')
  await markDocument(page)

  await page.locator('.nav-ul a[href="/community"]').first().click()
  await expect(page).toHaveURL(/\/community$/)

  await page.locator('.community-post-link').first().click()
  await expect(page).toHaveURL(new RegExp(`/community/${posts[0].id}$`))

  await page.goBack()
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.locator('.community-post-link').first()).toBeVisible()

  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  expect(await documentSurvived(page)).toBe(true)
})

test('the sign-in page switches modes through the query string, in place', async ({ page }) => {
  await openSite(page, '/login?mode=login')
  await expect(page.locator('.auth-card')).toBeVisible()
  await markDocument(page)

  // Two buttons, login then register -- selected by position so the assertion
  // does not depend on the copy in whichever language is active.
  await page.locator('.auth-mode-switch button').nth(1).click()

  await expect(page).toHaveURL(/[?&]mode=register/)
  expect(await documentSurvived(page)).toBe(true)
})

test('a public profile renders from its path parameter', async ({ page }) => {
  await openSite(page, `/u/${knownHandle}`)

  await expect(page.getByText(publicProfile.displayName).first()).toBeVisible()
  await expect(page.locator('.public-profile-shell')).toBeVisible()
})

test('an unknown handle still reaches the not-found card', async ({ page }) => {
  await openSite(page, '/u/not-exist-test-handle')

  await expect(page.locator('.account-state-card')).toBeVisible()
  await markDocument(page)

  await page.locator('.account-state-card a[href="/"]').first().click()
  await expect(page.locator('#home')).toBeVisible()
  expect(await documentSurvived(page)).toBe(true)
})

test('the account page asks a signed-out visitor to sign in, and links there in place', async ({
  page,
}) => {
  await openSite(page, '/account')

  const card = page.locator('.account-state-card')
  await expect(card).toBeVisible()
  await markDocument(page)

  await card.locator('a[href="/login?mode=login"]').first().click()
  await expect(page).toHaveURL(/\/login\?mode=login$/)
  await expect(page.locator('.auth-card')).toBeVisible()
  expect(await documentSurvived(page)).toBe(true)
})

test('an unknown path still renders the homepage', async ({ page }) => {
  await openSite(page, '/no-such-page')

  await expect(page.locator('#home')).toBeVisible()
})
