import { expect, test } from '@playwright/test'
import { DEFAULT_THEME, getThemeCatalogue, THEME_PRESETS, themeToTokens } from '../../server/themes.js'

const creator = { id: 'artist', handle: 'artist', displayName: 'Palette Artist', profilePublic: true, activityPublic: false, siteOwner: true, about: 'Artist introduction', experience: [{ period: '2026', title: 'Readable timeline title', body: 'Timeline description' }] }
const work = { id: 'piece', slug: 'piece', title: 'A palette study', url: '/w/artist/piece', status: 'published', image: '/assets/projects/fire-extinguisher.png', thumbnail: '/assets/projects/fire-extinguisher.png', assetCategory: 'next-gen-prop', priceCents: 0, assets: [], creator }
const respond = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, pagination: {}, error: null }) })
const setup = async (page, { signedIn = true, language = 'en', failSave = false, failLoad = false } = {}) => {
  const state = { theme: { ...DEFAULT_THEME }, writes: 0, reads: 0, failSave, failLoad }
  await page.addInitScript(({ signedIn, language }) => {
    localStorage.setItem('mrright-language', language)
    if (signedIn) localStorage.setItem('mrright-visitor-token', 'palette-session')
  }, { signedIn, language })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/profile') return respond(route, { profile: { socials: [{ label: 'Contact link', href: 'https://example.test' }] }, ownerHandle: 'artist' })
    if (path === '/api/auth/me') return respond(route, { user: { ...creator, emailVerified: true } })
    if (path === '/api/account/profile') return respond(route, { profile: creator })
    if (path === '/api/account/community') return respond(route, { uploads: [], posts: [] })
    if (path === '/api/account/downloads') return respond(route, { requests: [], downloads: [] })
    if (path === '/api/account/comments') return respond(route, { comments: [], likeCount: 0 })
    if (path === '/api/account/notifications/unread') return respond(route, { unread: 0 })
    if (path === '/api/theme-options') return respond(route, getThemeCatalogue())
    if (path === '/api/account/theme') {
      if (route.request().method() === 'PUT') {
        state.writes++
        if (state.failSave) return respond(route, null, 503)
        state.theme = route.request().postDataJSON().theme
      } else {
        state.reads++
        if (state.failLoad) return respond(route, null, 503)
      }
      return respond(route, { theme: state.theme, themeTokens: themeToTokens(state.theme) })
    }
    if (path === '/api/users/artist') return respond(route, { profile: { ...creator, themeTokens: themeToTokens(state.theme) }, notices: [{ id: 'notice', body: 'Readable creator notice', createdAt: '2026-11-01' }] })
    if (path === '/api/works') return respond(route, { works: [work] })
    if (path === '/api/works/artist/piece') return respond(route, { work: { ...work, creator: { ...creator, themeTokens: themeToTokens(state.theme) } } })
    if (path.endsWith('/likes')) return respond(route, { liked: false, likeCount: 0 })
    if (path.endsWith('/comments')) return respond(route, { comments: [{ id: 'sample', author: 'Another artist', message: 'Readable comment body', pinned: true, status: 'published', likeCount: 0, createdAt: '2026-11-01' }] })
    if(path.endsWith('/relationship'))return respond(route,{self:true,following:false,friendship:null,followers:0,followingCount:0})
    if (path.endsWith('/favorite')) return respond(route, { saved: false })
    if (path.endsWith('/rating')) return respond(route, { ratings: { count: 0, average: 0, recommendations: 0 }, mine: null, contentVersion: 1 })
    throw new Error('Unexpected request: ' + path)
  })
  return state
}

test('all ten public theme trials recolour the real gallery without writes and restore the creator palette', async ({ page }) => {
  const state = await setup(page, { signedIn: false })
  await page.goto('/u/artist')
  await expect(page.locator('.infinite-viewport')).toBeVisible()
  await expect(page.locator('.infinite-work').first()).toHaveCSS('width', '258px')
  const galleryCount = await page.locator('.infinite-work').count()
  await page.locator('.creator-theme-browser summary').click()
  for (const preset of THEME_PRESETS) {
    await page.locator('.creator-theme-choices').getByRole('button', { name: preset.labels.en, exact: true }).click()
    await expect.poll(() => page.locator('.creator-studio').evaluate(node => node.style.getPropertyValue('--theme-surface'))).toBe(themeToTokens(preset.theme)['--theme-surface'])
    await expect(page.locator('.infinite-viewport')).toHaveCSS('background-color', await page.locator('.infinite-viewport').evaluate(node => {
      const probe = document.createElement('span');probe.style.color = getComputedStyle(node).getPropertyValue('--theme-stage');document.body.append(probe);const color = getComputedStyle(probe).color;probe.remove();return color
    }))
    expect(await page.locator('.infinite-work').count()).toBe(galleryCount)
  }
  await expect(page.locator('.creator-theme-preview-note')).toContainText('Only this view changes')
  expect(state.writes).toBe(0)
  await page.getByRole('button', { name: 'Restore creator theme', exact: true }).click()
  expect(await page.locator('.creator-studio').evaluate(node => node.style.getPropertyValue('--theme-surface'))).toBe('#0d1117')
})

test('presets preview immediately, save explicitly, persist after reload, and theme public profile and details', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/account/settings')
  await expect(page.locator('.theme-preset')).toHaveCount(10)
  await page.getByRole('button', { name: /Paper Gallery/ }).click()
  await expect(page.locator('.theme-scene-preview')).toHaveCSS('background-color', 'rgb(241, 238, 230)')
  expect(state.writes).toBe(0)
  await page.locator('.theme-editor').screenshot({ path: '.deploy-tools/theme-ui/editor-desktop.png' })
  await expect(page.locator('.theme-draft-state')).toContainText('Not saved')
  await page.getByRole('button', { name: 'Save theme', exact: true }).click()
  await expect(page.locator('.theme-editor-actions')).toContainText('Theme saved.')
  expect(state.writes).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: /Paper Gallery/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeDisabled()
  await page.goto('/u/artist')
  await expect(page.locator('.infinite-viewport')).toHaveCSS('background-color', 'rgb(245, 243, 238)')
  await expect(page.locator('.public-profile-hero')).toHaveCSS('background-color', 'rgb(249, 247, 244)')
  for (const selector of ['.timeline-item h4', '.creator-notices p', '.contact-link']) await expect(page.locator(selector).first()).toHaveCSS('color', 'rgb(37, 38, 49)')
  await page.goto(work.url)
  await expect(page.locator('.work-info h1')).toHaveCSS('color', 'rgb(37, 38, 49)')
  await expect(page.locator('.work-purchase')).toHaveCSS('background-color', 'rgb(249, 247, 244)')
  for (const selector of ['.work-comments-count', '.work-comment-head small', '.work-comment-badge', '.work-comment-actions']) await expect(page.locator(selector).first()).toHaveCSS('color', 'rgb(98, 98, 114)')
  await page.screenshot({ path: '.deploy-tools/theme-ui/detail-paper.png', fullPage: true })
})

test('discard and reset are local drafts, invalid combinations cannot be saved, and failed saves retain the draft', async ({ page }) => {
  const state = await setup(page, { failSave: true })
  await page.goto('/account/settings')
  await page.getByRole('button', { name: /Dusk Rose/ }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.locator('.theme-preset[aria-pressed=true]')).toContainText('Deep Ocean')
  await page.getByRole('button', { name: /Paper Gallery/ }).click()
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click()
  expect(state.writes).toBe(0)
  await page.locator('.theme-customize summary').click()
  await page.locator('.theme-editor-grid select').first().selectOption('paper')
  await expect(page.locator('.theme-validation')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: /Dusk Rose/ }).click()
  await page.getByRole('button', { name: 'Save theme', exact: true }).click()
  await expect.poll(() => state.writes).toBe(1)
  await expect(page.getByRole('button', { name: 'Save theme', exact: true })).toBeEnabled()
  await expect(page.locator('.theme-preset[aria-pressed=true]')).toContainText('Dusk Rose')
  await expect(page.locator('.theme-draft-state')).toContainText('Not saved')
  state.failSave = false
  await page.getByRole('button', { name: 'Save theme', exact: true }).click()
  await expect(page.locator('.theme-editor-actions')).toContainText('Theme saved.')
})

test('theme loading can retry without losing the visitor session', async ({ page }) => {
  const state = await setup(page, { failLoad: true })
  await page.goto('/account/settings')
  await expect(page.locator('.theme-load-error')).toBeVisible()
  state.failLoad = false
  await page.locator('.theme-load-error').getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.theme-preset')).toHaveCount(10)
  expect(state.reads).toBe(2)
  expect(await page.evaluate(() => localStorage.getItem('mrright-visitor-token'))).toBe('palette-session')
})

for (const language of ['zh', 'en', 'ja']) test('theme editor and light gallery fit a phone in ' + language, async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { language })
  await page.goto('/account/settings')
  await expect(page.locator('.theme-preset')).toHaveCount(10)
  await page.locator('.theme-preset').last().click()
  await expect(page.locator('.theme-scene-preview')).toHaveCSS('background-color', 'rgb(243, 244, 248)')
  await page.locator('.theme-editor').screenshot({ path: '.deploy-tools/theme-ui/editor-mobile-' + language + '.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.goto('/u/artist')
  await page.locator('.creator-theme-browser summary').click()
  await page.locator('.creator-theme-choices button').last().click()
  await expect(page.locator('.infinite-viewport')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})


test('switching language keeps an unsaved theme without reloading it', async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/account/settings')
  await page.getByRole('button', { name: /Amber Atelier/ }).click()
  await page.locator('.topbar-actions .language-switch').getByRole('button', { name: '日', exact: true }).click()
  await expect(page.locator('.theme-preset[aria-pressed=true]')).toContainText('琥珀')
  await expect(page.locator('.theme-draft-state')).toContainText('未保存')
  expect(state.reads).toBe(1)
  expect(state.writes).toBe(0)
})

test('a save response from an old session cannot replace the next session theme', async ({ page }) => {
  let release, started = false
  const gate = new Promise(resolve => { release = resolve })
  await setup(page)
  await page.route('**/api/account/theme', async route => {
    if (route.request().method() !== 'PUT') return route.fallback()
    started = true
    const theme = route.request().postDataJSON().theme
    await gate
    return respond(route, { theme, themeTokens: themeToTokens(theme) })
  })
  try {
    await page.goto('/account/settings')
    await page.getByRole('button', { name: /Paper Gallery/ }).click()
    await page.getByRole('button', { name: 'Save theme', exact: true }).click()
    await expect.poll(() => started).toBe(true)
    await page.evaluate(() => {
      localStorage.setItem('mrright-visitor-token', 'next-session')
      window.dispatchEvent(new StorageEvent('storage', { key: 'mrright-visitor-token' }))
    })
    await expect(page.locator('.theme-preset[aria-pressed=true]')).toContainText('Deep Ocean')
    const response = page.waitForResponse(res => res.url().endsWith('/api/account/theme') && res.request().method() === 'PUT')
    release()
    await response
    await expect(page.locator('.theme-preset[aria-pressed=true]')).toContainText('Deep Ocean')
    await expect(page.locator('.theme-scene-preview')).toHaveCSS('background-color', 'rgb(13, 17, 23)')
  } finally { release() }
})
