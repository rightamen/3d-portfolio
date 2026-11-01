import { expect, test } from '@playwright/test'

const creator = { handle: 'artist', displayName: 'An Artist', bio: 'Stories in three dimensions.', profilePublic: true, activityPublic: true, themeTokens: { '--theme-accent': '#c3b7ee' }, stats: { likeCount: 9, uploadCount: 2, postCount: 3, commentCount: 4 } }
const work = (index, category = 'next-gen-prop') => ({ id: 'work-' + index, title: 'Artwork ' + index, slug: 'work-' + index, url: '/w/artist/work-' + index, assetCategory: category, priceCents: 0, thumbnail: '/assets/projects/fire-extinguisher.png', creator })
const respond = (route, data, pagination = {}, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, pagination, error: null }) })
const setup = async (page, { profile = creator, activityFails = false, worksHandler, profileHandler, language = 'en' } = {}) => {
  const requests = []
  await page.addInitScript(language => localStorage.setItem('mrright-language', language), language)
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname
    requests.push(url.pathname + url.search)
    if (path === '/api/profile') return respond(route, { profile: {}, ownerHandle: 'artist' })
    if (path === '/api/users/artist') return profileHandler ? profileHandler(route) : respond(route, { profile })
    if (path === '/api/works') return worksHandler ? worksHandler(route) : respond(route, { works: [work(1), work(2, 'hand-painted-scene')] }, { total: 2, hasNext: false })
    if (path.startsWith('/api/users/artist/')) return respond(route, { posts: [], comments: [], resources: [] }, {}, activityFails ? 503 : 200)
    throw new Error('Unexpected API request: ' + path)
  })
  return requests
}

test('creator gallery follows the pointer, keeps a bounded pool, and preserves view across tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const requests = await setup(page)
  await page.goto('/u/artist')
  const viewport = page.locator('.creator-gallery .infinite-viewport')
  await expect(viewport).toBeVisible()
  await expect(page.locator('.infinite-work').first()).toHaveCSS('width', '258px')
  const count = await page.locator('.infinite-work').count()
  await viewport.scrollIntoViewIfNeeded()
  const box = await viewport.boundingBox()
  const before = await viewport.getAttribute('data-pan-x')
  await page.mouse.move(box.x + box.width * .85, box.y + 160)
  await expect.poll(() => viewport.getAttribute('data-pan-x')).not.toBe(before)
  await page.mouse.move(0, 0)
  expect(await page.locator('.infinite-work').count()).toBe(count)
  await page.locator('.creator-gallery').getByRole('button', { name: /Grid/ }).click()
  await expect(page.locator('.creator-gallery .work-tile')).toHaveCount(2)
  await page.locator('.public-profile-tabs').getByRole('button', { name: 'About', exact: true }).click()
  await expect(page.locator('.creator-gallery')).toBeHidden()
  await page.locator('.public-profile-tabs').getByRole('button', { name: 'Works', exact: true }).click()
  await expect(page.locator('.creator-gallery .work-tile')).toHaveCount(2)
  expect(requests.filter(url => url.startsWith('/api/works?'))).toHaveLength(1)
  await expect(page.locator('.infinite-crosshair')).toHaveCount(0)
})

test('creator filters use the full server catalogue; pagination retries retain loaded works and expose every work', async ({ page }) => {
  let failSecondPage = true
  const requests = await setup(page, { worksHandler: route => {
    const query = new URL(route.request().url()).searchParams
    expect(query.get('creator')).toBe('artist')
    if (query.get('category')) return respond(route, { works: [work(99, 'hand-painted-scene')] }, { total: 1, hasNext: false })
    if (query.get('page') === '2') {
      if (failSecondPage) { failSecondPage = false; return respond(route, null, {}, 503) }
      return respond(route, { works: Array.from({ length: 24 }, (_, i) => work(i + 25)) }, { total: 48, hasNext: false })
    }
    return respond(route, { works: Array.from({ length: 24 }, (_, i) => work(i + 1)) }, { total: 48, hasNext: true })
  } })
  await page.goto('/u/artist')
  await expect(page.locator('.profile-hero-summary')).toContainText('48')
  await page.getByRole('button', { name: 'Load more works', exact: true }).click()
  await expect(page.locator('.creator-gallery-pagination').getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.locator('.infinite-viewport')).toBeVisible()
  await page.locator('.creator-gallery-pagination').getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.creator-gallery-pagination')).toContainText('48 of 48 works loaded')
  expect(new Set(await page.locator('.infinite-work h3').allTextContents()).size).toBe(48)
  await page.locator('.creator-gallery-filters').getByRole('button', { name: 'Painted Scenes', exact: true }).click()
  await expect(page.locator('.creator-gallery-pagination')).toContainText('1 of 1 works loaded')
  expect(new Set(await page.locator('.infinite-work h3').allTextContents())).toEqual(new Set(['Artwork 99']))
  expect(requests.filter(url => url.includes('category=hand-painted-scene'))).toHaveLength(1)
  await expect(page.locator('.profile-hero-summary')).toContainText('48')
})

test('profile and catalogue survive activity failure; private activity never requests private feeds', async ({ page }) => {
  await setup(page, { activityFails: true })
  await page.goto('/u/artist')
  await expect(page.getByRole('heading', { name: 'An Artist' })).toBeVisible()
  await expect(page.locator('.infinite-viewport')).toBeVisible()
  await expect(page.locator('.profile-activity-state')).toContainText('Activity is unavailable')
  await page.unroute('**/api/**')
  const requests = await setup(page, { profile: { ...creator, activityPublic: false } })
  await page.reload()
  await expect(page.locator('.infinite-viewport')).toBeVisible()
  await expect(page.locator('.public-profile-tabs button')).toHaveCount(3)
  expect(requests.some(url => url.startsWith('/api/users/artist/'))).toBe(false)
})

test('private profiles reveal no gallery, and temporary profile failures offer retry', async ({ page }) => {
  const requests = await setup(page, { profile: { ...creator, profilePublic: false } })
  await page.goto('/u/artist')
  await expect(page.locator('.public-profile-hero')).toHaveCount(0)
  await expect(page.locator('.creator-gallery')).toHaveCount(0)
  expect(requests.some(url => url.startsWith('/api/works'))).toBe(false)
  await page.unroute('**/api/**')
  let attempts = 0
  await setup(page, { profileHandler: route => ++attempts === 1 ? respond(route, null, {}, 503) : respond(route, { profile: creator }) })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Profile temporarily unavailable' })).toBeVisible()
  await page.locator('.account-state-card').getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.infinite-viewport')).toBeVisible()
})

for (const language of ['zh', 'en', 'ja']) {
  test('mobile creator studio fits, supports keyboard and keeps ' + language + ' filters readable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await setup(page, { language, profile: { ...creator, displayName: 'An Artist With A Long Display Name', bio: 'A long bio that should wrap naturally, including https://example.test/averylongunbrokentextwithoutspaces' } })
    await page.goto('/u/artist')
    const viewport = page.locator('.infinite-viewport')
    await expect(viewport).toBeVisible()
    await expect(viewport).toHaveAttribute('data-effects', 'reduced')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await viewport.focus()
    const before = await viewport.getAttribute('data-pan-x')
    await viewport.press('ArrowRight')
    await expect(viewport).not.toHaveAttribute('data-pan-x', before)
    await viewport.press('Home')
    await expect(viewport).toHaveAttribute('data-pan-x', '0.0')
    const description = await viewport.getAttribute('aria-describedby')
    expect(await page.locator('[id="' + description + '"]').textContent()).toBeTruthy()
    expect(errors).toEqual([])
  })
}


test('creator navigation clears old identity and ignores late activity responses', async ({ page }) => {
  let finishOld
  const gate = new Promise(resolve => { finishOld = resolve })
  await setup(page)
  await page.route('**/api/users/artist/posts', async route => { await gate; return respond(route, { posts: [{ id: 'old-post', title: 'Old creator post' }] }) })
  await page.route('**/api/users/second', route => respond(route, { profile: { ...creator, handle: 'second', displayName: 'Second Creator', activityPublic: false, themeTokens: { '--theme-accent': '#ffcc88' } } }))
  await page.route('**/api/works?creator=second*', route => respond(route, { works: [] }, { total: 0, hasNext: false }))
  try {
    await page.goto('/u/artist')
    await expect(page.locator('.infinite-viewport')).toBeVisible()
    await page.evaluate(() => { history.pushState(null, '', '/u/second'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await expect(page.getByRole('heading', { name: 'Second Creator' })).toBeVisible()
    await expect(page.locator('.creator-gallery .asset-empty-state')).toBeVisible()
    finishOld()
    await expect(page.locator('.infinite-viewport')).toHaveCount(0)
    await expect(page.getByText('Old creator post')).toHaveCount(0)
    expect(await page.locator('.creator-studio').evaluate(node => node.style.getPropertyValue('--theme-accent'))).toBe('#ffcc88')
  } finally { finishOld() }
})


const scrollProfile = { ...creator, siteOwner: true, about: 'A studio introduction with room for stories.', skills: ['Blender', 'Maya'], experience: Array.from({ length: 4 }, (_, i) => ({ period: '202' + i, title: 'Creative chapter ' + i, body: 'A chapter in the creator’s practice.' })) }

test('profile scroll moves the banner, pins navigation below the header and returns focus to the top', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const requests = await setup(page, { profile: scrollProfile })
  await page.goto('/u/artist')
  const root = page.locator('.creator-studio'), banner = page.locator('.public-profile-banner')
  await expect(root).toHaveAttribute('data-scroll-motion', 'full')
  await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
  await expect.poll(() => banner.evaluate(node => parseFloat(node.style.getPropertyValue('--profile-parallax')))).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo({ top: 750, behavior: 'instant' }))
  await expect(root).toHaveAttribute('data-nav-stuck', 'true')
  await expect.poll(() => root.evaluate(node => Number(node.style.getPropertyValue('--profile-progress')))).toBeGreaterThan(0)
  const header = await page.locator('.topbar').boundingBox(), nav = await page.locator('.public-profile-tabs').boundingBox()
  expect(Math.abs(nav.y - (header.y + header.height))).toBeLessThan(2)
  await page.getByRole('button', { name: 'Back to profile top', exact: true }).click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2)
  await expect(page.locator('.public-profile-title h1')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Back to profile top', exact: true })).toBeHidden()
  expect(requests.filter(url => url.startsWith('/api/works?'))).toHaveLength(1)
})

test('scroll entrances run once and keyboard focus never lands on a fading form', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page, { profile: scrollProfile })
  await page.goto('/u/artist')
  const chapter = page.locator('.timeline-item').last()
  await expect(chapter).toHaveAttribute('data-scroll-reveal', 'waiting')
  await chapter.scrollIntoViewIfNeeded()
  await expect(chapter).toHaveAttribute('data-scroll-reveal', 'entered')
  await expect.poll(() => chapter.evaluate(node => node.getAnimations().filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0)
  await expect.poll(() => chapter.evaluate(node => node.getAnimations().length)).toBe(0)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await chapter.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await chapter.evaluate(node => node.getAnimations().length)).toBe(0)
  await page.locator('.contact-form input').first().focus()
  await expect(page.locator('.contact-panel')).toHaveCSS('opacity', '1')
  await expect(page.locator('.contact-panel')).toHaveCSS('transform', 'none')
})

test('live reduced-motion disables scroll animation; touch browsing keeps the banner still', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await setup(page, { profile: scrollProfile })
  await page.goto('/u/artist')
  await expect(page.locator('.creator-studio')).toHaveAttribute('data-scroll-motion', 'full')
  await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
  await expect.poll(() => page.locator('.public-profile-banner').evaluate(node => parseFloat(node.style.getPropertyValue('--profile-parallax')))).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.creator-studio')).toHaveAttribute('data-scroll-motion', 'reduced')
  await expect.poll(() => page.locator('.public-profile-banner').evaluate(node => node.style.getPropertyValue('--profile-parallax'))).toBe('0.00px')
  await page.locator('.timeline-item').last().scrollIntoViewIfNeeded()
  expect(await page.locator('.timeline-item').last().evaluate(node => node.getAnimations().length)).toBe(0)
  await page.getByRole('button', { name: 'Back to profile top', exact: true }).click()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' })
  try {
    const phone = await context.newPage()
    await setup(phone, { profile: scrollProfile })
    await phone.goto('/u/artist')
    await expect(phone.locator('.infinite-viewport')).toBeVisible()
    await phone.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
    await expect.poll(() => phone.locator('.public-profile-banner').evaluate(node => node.style.getPropertyValue('--profile-parallax'))).toBe('0.00px')
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close() }
})
