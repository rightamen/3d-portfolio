import { expect, test } from '@playwright/test'

const work = {
  id: 'review-work', slug: 'review-work', url: '/w/reviewer/review-work',
  title: 'Review model', summary: 'A local browser fixture.', status: 'published',
  priceCents: 9900, currency: 'usd', assetCategory: 'prop',
  image: '/assets/projects/fire-extinguisher.png', assets: [],
  contentVersion: 1, curation: { score: 94, recommended: true }, ratings: { count: 0, average: 0, recommendations: 0 },
  creator: { id: 'creator', handle: 'reviewer', displayName: 'Reviewer', profilePublic: true, acceptsPayment: true },
}
const order = {
  id: 'review-order', workId: work.id, buyerId: 'buyer', status: 'pending',
  amountCents: 2500, currency: 'cny', buyerNote: '',
}
const methods = [{ label: 'Saved method', instructions: 'Private original payment instructions' }]
const storageKey = 'mrright-order:reviewer/review-work'
const respond = (route, data, status = 200) => route.fulfill({
  status, contentType: 'application/json',
  body: JSON.stringify({ data, pagination: {}, error: null }),
})

const setup = async (page, { signedIn = false, remembered = false, handlers = {} } = {}) => {
  const requests = []
  await page.addInitScript(({ signedIn, remembered, storageKey }) => {
    localStorage.setItem('mrright-language', 'en')
    if (signedIn) localStorage.setItem('mrright-visitor-token', 'review-session')
    if (remembered) localStorage.setItem(storageKey, 'review-order')
  }, { signedIn, remembered, storageKey })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (handlers[path]) return handlers[path](route)
    if (path === '/api/profile') return respond(route, { ownerHandle: 'reviewer', profile: { domain: 'mrright.blog' } })
    if (path === '/api/works') return respond(route, { works: [work] })
    if (path === '/api/auth/me') return respond(route, { user: { id: 'buyer', displayName: 'Buyer' } })
    if (path === '/api/auth/logout') return respond(route, { ok: true })
    if (path === '/api/account/profile') return respond(route, { profile: { id: 'buyer', displayName: 'Buyer', handle: 'buyer' } })
    if (path === '/api/account/community') return respond(route, { posts: [], uploads: [] })
    if (path === '/api/account/downloads') return respond(route, { requests: [], downloads: [] })
    if (path === '/api/account/notifications/unread') return respond(route, { unread: 1 })
    if (path === '/api/account/notifications') return respond(route, { unread: 0, items: [{ id: 'private-notice', title: 'Private buyer notice', kind: 'order:paid', createdAt: new Date().toISOString() }] })
    if (path === '/api/account/orders/review-order') return respond(route, { order, paymentMethods: methods, events: [] })
    if (path === '/api/works/reviewer/review-work') return respond(route, { work })
    if (path.endsWith('/rating')) return respond(route, { ratings: work.ratings, mine: null, contentVersion: 1 })
    if (path.endsWith('/favorite')) return respond(route, { saved: false })
    if (path.endsWith('/likes')) return respond(route, { liked: false, likeCount: 0 })
    if (path.endsWith('/comments')) return respond(route, { comments: [] })
    if (path === '/api/community/posts') return respond(route, { posts: [] })
    if (path === '/api/projects') return respond(route, { projects: [{ ...work, title: 'Misleading legacy work' }] })
    if (path === '/api/experience') return respond(route, { experience: [] })
    throw new Error(`Unexpected API request: ${path}`)
  })
  return requests
}

test('home renders works without waiting for the profile and drops three obsolete requests', async ({ page }) => {
  let finishProfile
  const gate = new Promise((resolve) => { finishProfile = resolve })
  const requests = await setup(page, { handlers: {
    '/api/profile': async (route) => { await gate; return respond(route, { ownerHandle: 'reviewer', profile: {} }) },
  } })
  try {
    await page.goto('/')
    await expect(page.locator('#projects .infinite-work h3').first()).toHaveText('Review model')
    expect(requests.filter((path) => path === '/api/profile')).toHaveLength(1)
    expect(requests).not.toContain('/api/projects')
    expect(requests).not.toContain('/api/experience')
  } finally { finishProfile() }
})

test('a loading catalogue does not claim the category is empty', async ({ page }) => {
  let finishWorks
  const gate = new Promise((resolve) => { finishWorks = resolve })
  await setup(page, { handlers: {
    '/api/works': async (route) => { await gate; return respond(route, { works: [work] }) },
  } })
  try {
    await page.goto('/')
    await expect(page.locator('#projects [role="status"]')).toBeVisible()
    await expect(page.locator('#projects .asset-empty-state')).toHaveCount(0)
  } finally { finishWorks() }
  await expect(page.locator('#projects .infinite-viewport')).toBeVisible()
})

test('a failed catalogue shows an error instead of unrelated legacy works', async ({ page }) => {
  await setup(page, { handlers: { '/api/works': (route) => respond(route, null, 503) } })
  await page.goto('/')
  await expect(page.locator('#projects .text-coral')).toBeVisible()
  await expect(page.locator('#projects .work-tile')).toHaveCount(0)
  await expect(page.locator('#projects .asset-empty-state')).toHaveCount(0)
})

test('an empty marketplace remains empty', async ({ page }) => {
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works: [] }) } })
  await page.goto('/')
  await expect(page.locator('#projects .asset-empty-state')).toBeVisible()
  await expect(page.locator('#projects .work-tile')).toHaveCount(0)
})

test('the payment panel uses the order amount and currency after a price change', async ({ page }) => {
  await setup(page, { signedIn: true, remembered: true })
  await page.goto(work.url)
  await expect(page.locator('.work-price')).toHaveText('99.00 USD')
  await expect(page.locator('.work-purchase-amount')).toContainText('25.00 CNY')
})

for (const status of ['cancelled', 'refunded']) {
  test(`a remembered ${status} order never asks for another payment`, async ({ page }) => {
    await setup(page, { signedIn: true, remembered: true, handlers: {
      '/api/account/orders/review-order': (route) => respond(route, { order: { ...order, status }, paymentMethods: methods }),
    } })
    await page.goto(work.url)
    await expect(page.locator('.work-purchase button.primary-action')).toContainText('99.00 USD')
    await expect(page.locator('.work-purchase-amount')).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
  })
}

test('a transient order failure preserves the order and offers retry', async ({ page }) => {
  let attempts = 0
  await setup(page, { signedIn: true, remembered: true, handlers: {
    '/api/account/orders/review-order': (route) => ++attempts === 1
      ? respond(route, null, 503)
      : respond(route, { order, paymentMethods: methods }),
  } })
  await page.goto(work.url)
  await expect(page.locator('.work-purchase')).toContainText('Your existing order could not be loaded')
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(order.id)
  await expect(page.locator('.work-purchase button.primary-action')).toHaveCount(0)
  await page.locator('.work-purchase').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.work-purchase-amount')).toContainText('25.00 CNY')
})

test('changing account clears the private order and the open notification panel', async ({ page }) => {
  let finishNewWork
  const gate = new Promise((resolve) => { finishNewWork = resolve })
  await setup(page, { signedIn: true, remembered: true, handlers: {
    '/api/works/reviewer/review-work': async (route) => {
      if (route.request().headers().authorization === 'Bearer second-session') await gate
      return respond(route, { work })
    },
    '/api/account/orders/review-order': (route) => route.request().headers().authorization === 'Bearer second-session'
      ? respond(route, null, 404) : respond(route, { order, paymentMethods: methods }),
  } })
  try {
    await page.goto(work.url)
    await expect(page.locator('.work-purchase-amount')).toBeVisible()
    await page.locator('.work-purchase button.primary-action').click()
    await expect(page.getByText('Private original payment instructions')).toBeVisible()
    await page.locator('.topbar-bell').click()
    await expect(page.getByText('Private buyer notice')).toBeVisible()
    await page.evaluate(() => {
      localStorage.setItem('mrright-visitor-token', 'second-session')
      window.dispatchEvent(new StorageEvent('storage', { key: 'mrright-visitor-token' }))
    })
    await expect(page.getByText('Private original payment instructions')).toHaveCount(0)
    await expect(page.getByText('Private buyer notice')).toHaveCount(0)
  } finally { finishNewWork() }
})

test('mobile catalogue and payment panel fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { signedIn: true, remembered: true })
  for (const url of ['/', work.url]) {
    await page.goto(url)
    await expect(page.locator(url === '/' ? '#projects .infinite-viewport' : '.work-purchase-amount')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('a session survives a service outage and can be retried without logging in again', async ({ page }) => {
  let attempts = 0
  await setup(page, { signedIn: true, handlers: {
    '/api/auth/me': (route) => ++attempts === 1
      ? respond(route, null, 503)
      : respond(route, { user: { id: 'buyer', displayName: 'Buyer' } }),
  } })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Unable to Check Your Session' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('review-session')
  await expect(page.getByRole('heading', { name: 'Sign In Required' })).toHaveCount(0)
  await page.locator('.account-state-card').getByRole('button', { name: 'Retry session check' }).click()
  await expect(page.locator('.topbar-avatar')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Unable to Check Your Session' })).toHaveCount(0)
  expect(attempts).toBe(2)
})

test('all category choices remain available after filtering and an empty result', async ({ page }) => {
  await setup(page, { handlers: {
    '/api/works': (route) => {
      const category = new URL(route.request().url()).searchParams.get('category')
      return respond(route, { works: category === 'next-gen-character' ? [] : [{ ...work, assetCategory: 'next-gen-prop' }] })
    },
  } })
  await page.goto('/explore?category=next-gen-prop&page=4')
  const categories = page.locator('.explore-filters select')
  await expect(categories.locator('option')).toHaveCount(7)
  await expect(categories.locator('option[value="next-gen-prop"]')).toHaveText('Props')
  await categories.selectOption('next-gen-character')
  await expect(page.locator('.asset-empty-state')).toBeVisible()
  await expect(categories.locator('option')).toHaveCount(7)
  expect(new URL(page.url()).searchParams.has('page')).toBe(false)
  await categories.selectOption('next-gen-prop')
  await expect(page.locator('.work-tile')).toHaveCount(1)
})

test('a failed connection recovers automatically when the browser comes online', async ({ page }) => {
  let attempts = 0
  await setup(page, { signedIn: true, handlers: {
    '/api/auth/me': (route) => ++attempts === 1 ? route.abort('connectionfailed')
      : respond(route, { user: { id: 'buyer', displayName: 'Buyer' } }),
  } })
  await page.goto('/')
  await expect(page.locator('.topbar-actions').getByRole('button', { name: 'Retry session check' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('review-session')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.topbar-avatar')).toBeVisible()
  expect(attempts).toBe(2)
})

test('a malformed successful session response preserves the credential', async ({ page }) => {
  await setup(page, { signedIn: true, handlers: { '/api/auth/me': (route) => respond(route, {}) } })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Unable to Check Your Session' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('review-session')
})

for (const invalid of ['unauthorized', 'expired']) {
  test(`a confirmed ${invalid} session is cleared and asks for sign-in`, async ({ page }) => {
    await setup(page, { signedIn: true, handlers: {
      '/api/auth/me': (route) => respond(route, { user: null }, invalid === 'unauthorized' ? 401 : 200),
    } })
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Sign In Required' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBeNull()
    await expect(page.getByRole('button', { name: 'Retry session check' })).toHaveCount(0)
  })
}

test('a late invalid response for the old account cannot erase the new session', async ({ page }) => {
  let finishOld
  const gate = new Promise((resolve) => { finishOld = resolve })
  const requests = await setup(page, { signedIn: true, handlers: {
    '/api/auth/me': async (route) => {
      if (route.request().headers().authorization === 'Bearer review-session') {
        await gate
        return respond(route, { user: null }, 401)
      }
      return respond(route, { user: { id: 'second', displayName: 'Second account' } })
    },
  } })
  try {
    await page.goto('/')
    await expect.poll(() => requests.includes('/api/auth/me')).toBe(true)
    await page.evaluate(() => {
      localStorage.setItem('mrright-visitor-token', 'second-session')
      window.dispatchEvent(new StorageEvent('storage', { key: 'mrright-visitor-token' }))
    })
    await expect(page.locator('.topbar-avatar')).toBeVisible()
    const oldResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/me') && response.status() === 401)
    finishOld()
    await oldResponse
    await page.locator('.topbar-avatar').click()
    await expect(page.locator('.topbar-menu-head')).toContainText('Second account')
    expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('second-session')
    // localStorage.clear() sends a null-key storage event to other tabs.
    await page.evaluate(() => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    await expect(page.locator('.topbar-avatar')).toHaveCount(0)
    await expect(page.locator('.topbar-signin')).toHaveText('Sign in')
  } finally { finishOld() }
})

test('login saves a new session and explicit logout clears it', async ({ page }) => {
  const requests = await setup(page, { handlers: {
    '/api/auth/login': (route) => respond(route, {
      session: { token: 'new-session' }, user: { id: 'buyer', displayName: 'Buyer' },
    }),
  } })
  await page.goto('/login?mode=login')
  await page.locator('.account-form input[type="email"]').fill('buyer@example.test')
  await page.locator('.account-form input[type="password"]').fill('Test-only-password1!')
  await page.locator('.account-form button[type="submit"]').click()
  await expect(page.locator('.topbar-avatar')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('new-session')
  await page.locator('.topbar-avatar').click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign In Required' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBeNull()
  await expect.poll(() => requests.includes('/api/auth/logout')).toBe(true)
})

test('category names change language without refetching the catalogue', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/explore')
  await expect(page.locator('.work-tile')).toHaveCount(1)
  const option = page.locator('.explore-filters option[value="next-gen-prop"]')
  await expect(option).toHaveText('Props')
  const before = requests.filter((path) => path === '/api/works').length
  await page.locator('.topbar-actions .language-switch').getByRole('button', { name: '中', exact: true }).click()
  await expect(option).toHaveText('道具')
  await page.locator('.topbar-actions .language-switch').getByRole('button', { name: '日', exact: true }).click()
  await expect(option).toHaveText('小物')
  expect(requests.filter((path) => path === '/api/works')).toHaveLength(before)
})

test('invalid page parameters request page one rather than NaN or a fractional offset', async ({ page }) => {
  const requestedPages = []
  await setup(page, { handlers: {
    '/api/works': (route) => {
      requestedPages.push(new URL(route.request().url()).searchParams.get('page'))
      return respond(route, { works: [work] })
    },
  } })
  for (const value of ['nope', 'Infinity', '2.5', '-3', '9007199254740992']) {
    await page.goto(`/explore?page=${value}`)
    await expect(page.locator('.work-tile')).toHaveCount(1)
    expect(requestedPages.at(-1)).toBe('1')
  }
})

test('an unknown shared category stays visible and can be cleared', async ({ page }) => {
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works: [] }) } })
  await page.goto('/explore?category=older-category')
  const select = page.locator('.explore-filters select')
  await expect(select).toHaveValue('older-category')
  await expect(select.locator('option[value="older-category"]')).toHaveText('older-category')
  await select.selectOption('')
  expect(new URL(page.url()).searchParams.has('category')).toBe(false)
  await expect(select.locator('option')).toHaveCount(7)
})

test('session recovery remains usable in Japanese on a narrow phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { signedIn: true, handlers: { '/api/auth/me': (route) => respond(route, null, 503) } })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Unable to Check Your Session' })).toBeVisible()
  await page.locator('.topbar-toggle').click()
  await page.locator('.topbar-mobile .language-switch').getByRole('button', { name: '日', exact: true }).click()
  await page.locator('.topbar-toggle').click()
  await expect(page.getByRole('heading', { name: 'ログイン状態を確認できません' })).toBeVisible()
  await expect(page.locator('.account-state-card').getByRole('button', { name: 'ログイン状態を再確認' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('session-recovery-mobile.png'), fullPage: true })
})


test('spatial gallery switches real selections by keyboard and buttons', async ({ page }) => {
  const second = { ...work, id: 'second-work', title: 'Second artwork', url: '/w/reviewer/second' }
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works: [work, second] }) } })
  await page.goto('/')
  const gallery = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Review model')
  await gallery.focus()
  await page.keyboard.press('ArrowRight')
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Second artwork')
  await expect(gallery.getByRole('link', { name: 'Explore work' })).toHaveAttribute('href', second.url)
  await gallery.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Review model')
  await gallery.getByRole('button', { name: 'Second artwork', exact: true }).click()
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Second artwork')
  await gallery.getByRole('button', { name: 'Image', exact: true }).click()
  await expect(gallery.locator('.spatial-poster')).toBeVisible()
  await expect(gallery.locator('canvas')).toHaveCount(0)
})

test('discovery can switch between grid and spatial browsing without another catalogue fetch', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/explore')
  await expect(page.locator('.work-tile')).toHaveCount(1)
  const before = requests.filter((path) => path === '/api/works').length
  await page.locator('.spatial-browse-toggle').getByRole('button', { name: '3D gallery', exact: true }).click()
  await expect(page.locator('.spatial-selection h2')).toHaveText('Review model')
  await expect(page.locator('.work-tile')).toHaveCount(0)
  await page.locator('.spatial-browse-toggle').getByRole('button', { name: 'Grid view', exact: true }).click()
  await expect(page.locator('.work-tile')).toHaveCount(1)
  expect(requests.filter((path) => path === '/api/works')).toHaveLength(before)
})

test('a device without WebGL still browses works and opens their pages', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /^webgl/.test(type) ? null : original.call(this, type, ...args)
    }
  })
  await setup(page)
  await page.goto('/')
  const gallery = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(gallery.locator('.spatial-poster')).toBeVisible()
  await expect(gallery.getByRole('button', { name: '3D', exact: true })).toBeDisabled()
  await gallery.getByRole('link', { name: 'Explore work' }).click()
  await expect(page.locator('.work-info h1')).toHaveText('Review model')
})


test('one failed artwork texture does not remove the spatial gallery', async ({ page }) => {
  const bad = { ...work, image: '/missing-review-texture.png', thumbnail: '' }
  const good = { ...work, id: 'healthy-work', title: 'Healthy artwork' }
  await page.route('**/missing-review-texture.png', (route) => route.fulfill({ status: 404, body: '' }))
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works: [bad, good] }) } })
  const failed = page.waitForResponse((response) => response.url().endsWith('/missing-review-texture.png') && response.status() === 404)
  await page.goto('/')
  await failed
  const gallery = page.getByRole('region', { name: 'Work worth a closer look' })
  await gallery.getByRole('button', { name: 'Healthy artwork', exact: true }).click()
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Healthy artwork')
  await expect(gallery.locator('canvas')).toBeVisible()
})


test('immersive view contains focus and Escape restores the trigger', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  const enter = page.getByRole('button', { name: 'Immerse', exact: true })
  await enter.click()
  const dialog = page.getByRole('dialog', { name: 'Work worth a closer look' })
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await expect(dialog.getByRole('button', { name: 'Exit immersive view', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(enter).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('opening a work from immersive view releases the page scroll lock', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Immerse', exact: true }).click()
  await page.getByRole('dialog', { name: 'Work worth a closer look' }).getByRole('link', { name: 'Explore work' }).click()
  await expect(page.locator('.work-info h1')).toHaveText('Review model')
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})


test('lighting changes preserve selection, canvas and mode on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const second = { ...work, id: 'second-work', title: 'Second artwork' }
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works: [work, second] }) } })
  await page.goto('/')
  await page.getByRole('button', { name: 'Second artwork', exact: true }).click()
  const canvas = page.locator('.spatial-canvas canvas')
  await expect(canvas).toBeVisible()
  await canvas.evaluate((node) => { node.dataset.originalCanvas = 'yes' })
  await page.getByRole('button', { name: 'Amber', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Amber', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-original-canvas', 'yes')
  await expect(page.locator('.spatial-selection h2')).toHaveText('Second artwork')
  await page.getByRole('button', { name: 'Image', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Gallery lighting' })).toHaveCount(0)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Amber', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('keyboard selection reveals its thumbnail without scrolling the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const works = Array.from({ length: 12 }, (_, index) => ({ ...work, id: 'work-' + index, title: 'Artwork ' + (index + 1) }))
  await setup(page, { handlers: { '/api/works': (route) => respond(route, { works }) } })
  await page.goto('/')
  const gallery = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Artwork 1')
  await gallery.evaluate((node) => node.focus({ preventScroll: true }))
  const first = gallery.locator('.spatial-dots button').first()
  expect(await first.evaluate((item) => item.getBoundingClientRect().left >= item.parentElement.getBoundingClientRect().left)).toBe(true)
  const scrollY = await page.evaluate(() => window.scrollY)
  await page.keyboard.press('ArrowLeft')
  await expect(gallery.locator('.spatial-selection h2')).toHaveText('Artwork 12')
  const active = gallery.locator('.spatial-dots button[aria-pressed=true]')
  await expect.poll(() => active.evaluate((item) => {
    const strip = item.parentElement.getBoundingClientRect()
    const rect = item.getBoundingClientRect()
    return rect.left >= strip.left && rect.right <= strip.right
  })).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
})


test('infinite wall follows the pointer and stops on leave without growing its tile pool', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const requests = await setup(page)
  await page.goto('/')
  const wall = page.getByRole('region', { name: 'Infinite artwork wall' })
  await wall.scrollIntoViewIfNeeded()
  const box = await wall.boundingBox()
  const count = await wall.locator('.infinite-work').count()
  const before = await wall.getAttribute('data-pan-x')
  await page.mouse.move(box.x + box.width * .88, box.y + box.height * .6)
  await expect.poll(() => wall.getAttribute('data-pan-x')).not.toBe(before)
  // The tile under the right-hand pointer moves toward the center, not farther away.
  const tile = wall.locator('.infinite-work').filter({ hasText: 'Review model' }).first()
  const x = (await tile.boundingBox()).x
  await expect.poll(async () => (await tile.boundingBox()).x).toBeLessThan(x - 5)
  await page.mouse.move(box.x - 8, box.y + 5)
  await expect.poll(async () => {
    const value = await wall.getAttribute('data-pan-x')
    await page.waitForTimeout(150)
    return Math.abs(Number(await wall.getAttribute('data-pan-x')) - Number(value))
  }).toBeLessThan(.2)
  expect(await wall.locator('.infinite-work').count()).toBe(count)
  expect(requests.filter(path => path === '/api/works')).toHaveLength(2)
})

test('infinite wall supports reduced motion, keys, grid fallback and category filtering', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const requests = await setup(page)
  await page.goto('/')
  const projects = page.locator('#projects')
  const wall = projects.getByRole('region', { name: 'Infinite artwork wall' })
  await wall.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await expect(projects.getByRole('button', { name: 'Follow pointer', exact: true })).toBeVisible()
  const box = await wall.boundingBox()
  const still = await wall.getAttribute('data-pan-x')
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .5)
  await page.waitForTimeout(200)
  expect(await wall.getAttribute('data-pan-x')).toBe(still)
  await wall.focus()
  await page.keyboard.press('ArrowRight')
  await expect(wall).not.toHaveAttribute('data-pan-x', still)
  await projects.getByRole('button', { name: 'Reset view', exact: true }).click()
  await expect(wall).toHaveAttribute('data-pan-x', '0.0')
  await projects.getByRole('button', { name: 'Grid view', exact: true }).click()
  await expect(projects.locator('.work-tile')).toHaveCount(1)
  await projects.getByRole('button', { name: 'Infinite view', exact: true }).click()
  await expect(projects.locator('.infinite-viewport')).toBeVisible()
  await projects.locator('.asset-filter-panel button').filter({ hasText: 'Character' }).first().click()
  await expect(projects.locator('.asset-empty-state')).toBeVisible()
  await expect(projects.locator('.infinite-viewport')).toHaveCount(0)
  expect(requests.filter(path => path === '/api/works')).toHaveLength(2)
})

test('dragging the infinite wall never opens a work and Enter opens its center work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/')
  const wall = page.getByRole('region', { name: 'Infinite artwork wall' })
  await wall.scrollIntoViewIfNeeded()
  const box = await wall.boundingBox()
  const start = await wall.getAttribute('data-pan-x')
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .3, { steps: 8 })
  await page.mouse.up()
  await expect(wall).not.toHaveAttribute('data-pan-x', start)
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await wall.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.work-info h1')).toHaveText('Review model')
})


test('wall lighting responds to the pointer and a live reduced-motion change stops effects', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page)
  await page.goto('/')
  const projects = page.locator('#projects')
  const wall = projects.getByRole('region', { name: 'Infinite artwork wall' })
  await wall.scrollIntoViewIfNeeded()
  await projects.getByRole('button', { name: 'Pause following', exact: true }).click()
  const hit = await wall.evaluate((stage) => {
    const bounds = stage.getBoundingClientRect()
    return [...stage.querySelectorAll('.infinite-work-image')].map(node => node.getBoundingClientRect())
      .filter(rect => rect.left > bounds.left && rect.right < bounds.right && rect.top > bounds.top && rect.bottom < bounds.bottom)
      .map(rect => ({ x: rect.left + rect.width * .7, y: rect.top + rect.height * .3 }))[0]
  })
  expect(hit).toBeTruthy()
  await page.mouse.move(hit.x, hit.y)
  await expect(wall).toHaveAttribute('data-pointer', 'true')
  await expect(wall.locator('.infinite-work[data-lit=true]')).toHaveCount(1)
  await expect.poll(() => wall.locator('.infinite-pointer-light').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1)
  await projects.getByRole('button', { name: 'Follow pointer', exact: true }).click()
  await expect(projects.getByRole('button', { name: 'Pause following', exact: true })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(wall).toHaveAttribute('data-effects', 'reduced')
  await expect(wall.locator('.infinite-work[data-lit=true]')).toHaveCount(0)
  await expect(projects.getByRole('button', { name: 'Follow pointer', exact: true })).toBeVisible()
  expect(await wall.locator('.infinite-pointer-light').evaluate(node => getComputedStyle(node).display)).toBe('none')
  expect(await wall.locator('.infinite-work-image').first().evaluate(node => getComputedStyle(node).transform)).toBe('none')
})


test('curated hero refuses ordinary, low-score and insufficient community works but the wall retains them', async ({ page }) => {
  const ordinary = { ...work, curation: null }
  const low = { ...ordinary, id: 'low', title: 'Below threshold', curation: { score: 89, recommended: true } }
  const insufficient = { ...ordinary, id: 'few', title: 'Too few votes', ratings: { average: 5, count: 9, recommendations: 9 } }
  await setup(page, { handlers: { '/api/works': route => respond(route, { works: [ordinary, low, insufficient] }) } })
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(hero.getByText('A place reserved for exceptional work', { exact: true })).toBeVisible()
  await expect(hero.locator('.spatial-selection')).toHaveCount(0)
  await expect(page.locator('#projects .infinite-work h3').filter({ hasText: 'Below threshold' }).first()).toBeAttached()
})

test('both community and curator recommendations qualify and are labeled separately', async ({ page }) => {
  const community = { ...work, id: 'community', title: 'Community choice', curation: null, ratings: { average: 4.7, count: 12, recommendations: 10 } }
  const curator = { ...work, id: 'curator', title: 'Curator choice' }
  const hidden = { ...work, id: 'hidden', status: 'hidden', title: 'Hidden choice' }
  await setup(page, { handlers: { '/api/works': route => respond(route, { works: [community, curator, hidden] }) } })
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(hero.locator('.spatial-selection h2')).toHaveText('Community choice')
  await expect(hero.getByText('Community recommended', { exact: true })).toBeVisible()
  await hero.getByRole('button', { name: 'Curator choice', exact: true }).click()
  await expect(hero.getByText('Curator recommended', { exact: true })).toBeVisible()
  await expect(hero.getByRole('button', { name: 'Hidden choice', exact: true })).toHaveCount(0)
})

test('curation reads independently of the newest twelve works and never falls back on failure', async ({ page }) => {
  let curatedRequests = 0
  await setup(page, { handlers: { '/api/works': route => {
    if (new URL(route.request().url()).searchParams.get('exhibition') === 'true') {
      curatedRequests++
      return respond(route, null, 503)
    }
    return respond(route, { works: [work] })
  } } })
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Work worth a closer look' })
  await expect(hero.locator('.spatial-empty')).toBeVisible()
  await expect(hero.locator('.spatial-selection')).toHaveCount(0)
  await expect(page.locator('#projects .infinite-viewport')).toBeVisible()
  expect(curatedRequests).toBe(1)
})


test('the rating form cannot endorse a newer version than the work visible on the page', async ({ page }) => {
  await setup(page, { signedIn: true, handlers: {
    '/api/auth/me': route => respond(route, { user: { id: 'buyer', displayName: 'Buyer', emailVerified: true } }),
    '/api/works/reviewer/review-work/rating': route => respond(route, { ratings: work.ratings, mine: null, contentVersion: 2 }),
  } })
  await page.goto(work.url)
  const section = page.getByRole('region', { name: 'Ratings and exhibition recommendations', exact: true })
  await expect(section.getByText('This work changed. Refresh to rate the current version.', { exact: true })).toBeVisible()
  await expect(section.getByRole('radio', { name: '5 stars', exact: true })).toBeDisabled()
})


const motionPost = { id: 'motion-post', title: 'A community study', message: 'A creative conversation.', topic: 'showcase', createdAt: '2026-11-01', user: { displayName: 'Creator' } }
const motionCommunityHandlers = {
  '/api/community/uploads': route => respond(route, { uploads: [] }),
  '/api/community/posts': route => respond(route, { posts: [motionPost] }),
  '/api/community/posts/motion-post': route => respond(route, { post: motionPost }),
}

test('module effects observe late homepage sections without animating the wall or fetching extra data', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  let release
  const gate = new Promise(resolve => { release = resolve })
  const requests = await setup(page, { handlers: { '/api/works': async route => { await gate; return respond(route, { works: [work] }) } } })
  try {
    await page.goto('/')
    await expect(page.locator('.module-motion-surface')).toHaveAttribute('data-module-motion', 'full')
    await expect(page.locator('.atelier-heading h1')).toHaveAttribute('data-module-reveal', 'entered')
    release()
    await expect(page.locator('.infinite-viewport')).toBeVisible()
    expect(await page.locator('.infinite-viewport').evaluate(node => node.closest('[data-module-reveal]') === null)).toBe(true)
    expect(await page.locator('.curated-exhibition').evaluate(node => !node.hasAttribute('data-module-reveal'))).toBe(true)
    await page.locator('#community .section-heading').scrollIntoViewIfNeeded()
    await expect(page.locator('#community .section-heading')).toHaveAttribute('data-module-reveal', 'entered')
    expect(requests.filter(path => path === '/api/works')).toHaveLength(2)
  } finally { release() }
})

test('card lighting follows the pointer and route changes clean it up across discovery, work and community', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page, { handlers: motionCommunityHandlers })
  await page.goto('/explore')
  const card = page.locator('.work-tile-media').first()
  await expect(card).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  await page.mouse.move(box.x + 35, box.y + 35)
  await expect(card).toHaveAttribute('data-module-lit', 'true')
  const first = await card.evaluate(node => node.style.getPropertyValue('--module-light-x'))
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .6)
  await expect.poll(() => card.evaluate(node => node.style.getPropertyValue('--module-light-x'))).not.toBe(first)
  await card.click()
  await expect(page).toHaveURL(new RegExp(work.url + '$'))
  await expect(page.locator('.module-motion-surface')).toHaveAttribute('data-module-kind', 'work')
  await expect(page.locator('.work-info h1')).toHaveAttribute('data-module-reveal', 'entered')
  expect(await page.locator('.work-purchase').evaluate(node => node.closest('[data-module-reveal]') === null)).toBe(true)
  await page.locator('.topbar-links a[href="/community"]').click()
  await expect(page.locator('.community-post-card')).toHaveAttribute('data-module-reveal', 'entered')
  await page.locator('.community-post-card').first().click()
  await expect(page.locator('.community-detail-title')).toHaveAttribute('data-module-reveal', 'entered')
  await expect(page.locator('[data-module-lit=true]')).toHaveCount(0)
})

test('live reduced motion stops module effects and late filtered cards remain fully readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page)
  await page.goto('/explore')
  const card = page.locator('.work-tile-media').first()
  await card.hover()
  await expect(card).toHaveAttribute('data-module-lit', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.module-motion-surface')).toHaveAttribute('data-module-motion', 'reduced')
  await expect(page.locator('[data-module-lit=true]')).toHaveCount(0)
  await page.locator('.explore-filters select').selectOption('next-gen-prop')
  await expect(page.locator('.work-tile')).toHaveAttribute('data-module-reveal', 'entered')
  await expect(page.locator('.work-tile')).toHaveCSS('opacity', '1')
  expect(await page.locator('.work-tile').evaluate(node => node.getAnimations().length)).toBe(0)
  await card.focus()
  await expect(page.locator('.work-tile')).toHaveCSS('transform', 'none')
})

test('account and login introductions animate without moving editable form controls', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page, { signedIn: true })
  await page.goto('/account')
  await expect(page.locator('.module-motion-surface')).toHaveAttribute('data-module-kind', 'account')
  await page.locator('.account-center-card').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.account-center-card').first()).toHaveAttribute('data-module-reveal', 'entered')
  const context = await browser.newContext({ reducedMotion: 'no-preference' })
  try {
    const login = await context.newPage()
    await setup(login)
    await login.goto('/login?mode=login')
    await expect(login.locator('.module-motion-surface')).toHaveAttribute('data-module-kind', 'auth')
    await login.locator('.account-form input[type=email]').focus()
    expect(await login.locator('.account-form input[type=email]').evaluate(node => node.closest('[data-module-reveal]') === null)).toBe(true)
  } finally { await context.close() }
})

test('touch catalogue and community keep module effects readable without mouse lighting or overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  try {
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await setup(page, { handlers: motionCommunityHandlers })
    for (const path of ['/explore', '/community', '/login?mode=login']) {
      await page.goto(path)
      await expect(page.locator('.module-motion-surface')).toHaveAttribute('data-module-motion', 'full')
      if (path === '/explore') await expect(page.locator('.work-tile')).toHaveAttribute('data-module-reveal', 'entered')
      if (path === '/community') await page.locator('.community-post-card').first().scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.locator('[data-module-lit=true]')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  } finally { await context.close() }
})
