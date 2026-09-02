import { expect, test } from '@playwright/test'

// The admin console, driven entirely off fixtures.
//
// Round nineteen found the way to test this page without a database: intercept
// `**/api/admin/**`, answer with a payload shaped like the real one, and let
// the whole console render against it. No seeded rows, no role password, no
// live session -- and because the fixture is fixed, a layout that only breaks
// on six members and four open queues breaks here too.
//
// What it asserts: every section renders in all three languages with no
// console error and no horizontal overflow at 440, 768 and 1440; the flat map
// is a working substitute for the WebGL one; reduced motion leaves nothing
// stuck mid-fade; and the language switch applies live, persists, and does not
// touch the public site's own language setting.

const days = 30
const today = new Date()
const iso = (offsetDays) =>
  new Date(today.getTime() - offsetDays * 86400000).toISOString()

const series = Array.from({ length: days }, (_, index) => {
  const day = new Date(today.getTime() - (days - 1 - index) * 86400000)
  const wave = Math.round(4 + Math.sin(index / 3) * 3 + (index % 5))

  return {
    comments: Math.max(0, wave - 1),
    community: Math.max(0, wave - 3),
    day: day.toISOString().slice(0, 10),
    downloads: Math.max(0, wave - 2),
    likes: wave + 2,
    members: index % 4 === 0 ? 1 : 0,
    messages: index % 7 === 0 ? 1 : 0,
  }
})

const metric = (current, prior, total) => ({ current, prior, total })

const overview = {
  activity: [
    { actor: 'Rin Sato', context: 'stylised-tavern', createdAt: iso(0.02), detail: 'The wood grain reads beautifully at this resolution.', id: 'comment-1', kind: 'comment', status: 'pending' },
    { actor: 'Marco Yu', context: 'next-gen-prop', createdAt: iso(0.3), detail: 'Sci-fi crate pack', id: 'upload-1', kind: 'upload', status: 'pending' },
    { actor: 'Hana Ito', context: 'member', createdAt: iso(1.1), detail: 'awaiting verification', id: 'member-1', kind: 'member', status: 'joined' },
    { actor: 'Liu Wei', context: 'desert-outpost', createdAt: iso(2.4), detail: 'Studying the material breakdown for a class.', id: 'request-1', kind: 'request', status: 'pending' },
    { actor: 'Ana Costa', context: 'contact', createdAt: iso(3.2), detail: 'Freelance enquiry for an environment set.', id: 'message-1', kind: 'message', status: 'received' },
    { actor: 'Kenji Mori', context: 'workflow', createdAt: iso(4.5), detail: 'Baking normals from a high-poly sculpt', id: 'post-1', kind: 'post', status: 'published' },
  ],
  catalogue: {
    activeAdminSessions: 2,
    activeMembers: 34,
    adminAccounts: 3,
    adminsWithoutTotp: 1,
    approvedBytes: 734003200,
    customProjects: 7,
    hiddenProjects: 2,
    lastAdminAction: iso(0.4),
    publicProfiles: 28,
    uploadBytes: 1181116006,
    verifiedMembers: 41,
  },
  metrics: {
    comments: metric(64, 51, 412),
    communityComments: metric(23, 30, 188),
    communityPosts: metric(12, 9, 76),
    communityUploads: metric(9, 14, 63),
    downloads: metric(38, 44, 291),
    likes: metric(126, 98, 903),
    members: metric(17, 12, 58),
    messages: metric(6, 6, 47),
  },
  queues: {
    disabledProfiles: 1,
    oldestComment: iso(4),
    oldestMessage: iso(2),
    oldestRequest: iso(9),
    oldestUpload: iso(6),
    pendingComments: 3,
    pendingRequests: 2,
    pendingUploads: 4,
    recentMessages: 5,
    spamComments: 1,
    unverifiedMembers: 6,
  },
  range: { days },
  series,
  system: {
    cspReports: 2,
    databaseLatencyMs: 41,
    emailConfigured: true,
    heapUsedBytes: 68157440,
    nodeVersion: 'v22.22.3',
    rssBytes: 173015040,
    startedAt: iso(1.5),
    uptimeSeconds: 129600,
  },
  topProjects: [
    { comments: 24, downloads: 31, likes: 88, slug: 'stylised-tavern', total: 143 },
    { comments: 18, downloads: 22, likes: 61, slug: 'desert-outpost', total: 101 },
    { comments: 9, downloads: 14, likes: 40, slug: 'ceramic-set', total: 63 },
  ],
}

const projects = [
  { assetCategory: 'hand-painted-scene', format: 'Hand-painted scene', image: '/assets/projects/a.jpg', isPublic: true, modelSize: 'Under 10 MB', modelUrl: '', slug: 'stylised-tavern', stack: ['3ds Max', 'Hand-Painted', 'GLB'], summary: 'A hand-painted tavern interior built for a stylised realtime scene.', summaryJa: '手描きの酒場', title: 'Stylised Tavern', titleJa: '手描きの酒場', workflow: 'Blocked out, painted, exported.', workflowJa: 'ワークフロー', year: '2026' },
  { assetCategory: 'next-gen-scene', format: 'Environment scene', image: '/assets/projects/b.jpg', isPublic: false, modelSize: '10-50 MB', modelUrl: '/models/x.glb', slug: 'desert-outpost', stack: ['PBR', 'Optimization'], summary: 'A compact desert outpost focused on lighting and composition.', title: 'Desert Outpost', year: '2025' },
  { assetCategory: 'next-gen-prop', format: 'Realtime 3D asset', image: '/assets/projects/c.jpg', isPublic: true, modelSize: 'Under 10 MB', modelUrl: '/models/y.glb', slug: 'ceramic-set', stack: ['FBX', 'PBR'], summary: 'A ceramic prop set with shared trim materials.', title: 'Ceramic Set', year: '2026' },
]

const visitor = (index, overrides = {}) => ({
  accessLevel: ['guest', 'member', 'approved'][index % 3],
  avatarUrl: '',
  bio: 'Realtime character artist and long-time community member.',
  contactsPublic: index % 2 === 0,
  createdAt: iso(30 + index),
  displayName: ['Rin Sato', 'Marco Yu', 'Hana Ito', 'Liu Wei', 'Ana Costa', 'Kenji Mori'][index],
  email: `member${index}@example.com`,
  emailVerified: index % 3 !== 0,
  handle: index % 2 === 0 ? `member-${index}` : '',
  id: `visitor-${index}`,
  lastLoginAt: index % 4 === 0 ? null : iso(index),
  profileAdminDisabled: index === 4,
  profilePublic: index % 2 === 0,
  stats: { commentCount: 3 + index, downloadRequestCount: index, likeCount: 5, postCount: index % 3, uploadCount: index % 2 },
  updatedAt: iso(index),
  ...overrides,
})

const visitors = Array.from({ length: 6 }, (_, index) => visitor(index))

const comments = Array.from({ length: 5 }, (_, index) => ({
  author: ['Rin Sato', 'Marco Yu', 'Hana Ito', 'Liu Wei', 'Ana Costa'][index],
  createdAt: iso(index),
  id: `comment-${index}`,
  message: 'The silhouette reads well even at the smallest preview size — nice restraint on the trim sheet.',
  projectSlug: 'stylised-tavern',
  status: ['pending', 'published', 'spam', 'published', 'pending'][index],
  user: index % 2 === 0 ? { accessLevel: 'member', displayName: 'Rin Sato', email: 'rin@example.com' } : null,
}))

const payloads = {
  '/api/admin/comments': { comments },
  '/api/admin/community-comments': {
    comments: [
      { author: 'Marco Yu', createdAt: iso(1), id: 'cc-1', likeCount: 4, message: 'Great breakdown, thanks for sharing the graph.', parentId: null, postId: 'post-1', postTitle: 'Baking normals', user: { accessLevel: 'member', displayName: 'Marco Yu', email: 'marco@example.com' } },
    ],
  },
  '/api/admin/community-posts': {
    posts: [
      { createdAt: iso(4), id: 'post-1', message: 'A short write-up on cage settings and ray distance.', title: 'Baking normals from a high-poly sculpt', topic: 'workflow', user: { accessLevel: 'approved', displayName: 'Kenji Mori', email: 'kenji@example.com' } },
    ],
  },
  '/api/admin/community-uploads': {
    uploads: [
      { assetCategory: 'next-gen-prop', createdAt: iso(6), description: 'Twelve crates with a shared trim sheet.', fileName: 'crates.zip', fileSize: 48234496, fileType: 'zip', fileUrl: '/uploads/files/crates.zip', id: 'up-1', status: 'pending', title: 'Sci-fi crate pack', updatedAt: iso(5), user: { accessLevel: 'member', displayName: 'Marco Yu', email: 'marco@example.com' } },
      { assetCategory: 'hand-painted-character', createdAt: iso(12), description: 'Hand-painted mage with 2K textures.', fileName: 'mage.glb', fileSize: 8123456, fileType: 'glb', fileUrl: '/uploads/files/mage.glb', id: 'up-2', status: 'approved', title: 'Hand-painted mage', updatedAt: iso(11), user: null },
    ],
  },
  '/api/admin/contact-messages': {
    messages: [
      { createdAt: iso(3), email: 'ana@example.com', id: 'msg-1', message: 'Hello — are you available for a freelance environment set this quarter?', name: 'Ana Costa' },
    ],
  },
  '/api/admin/download-requests': {
    requests: [
      { createdAt: iso(9), email: 'liu@example.com', id: 'req-1', name: 'Liu Wei', projectTitle: 'Desert Outpost', purpose: 'Studying the material breakdown for a class.', status: 'pending', user: null, visitorAccessLevel: 'member' },
      { createdAt: iso(14), email: 'hana@example.com', id: 'req-2', name: 'Hana Ito', projectTitle: 'Stylised Tavern', purpose: 'Reference for a portfolio piece.', status: 'approved', user: { accessLevel: 'approved', displayName: 'Hana Ito', email: 'hana@example.com' }, visitorAccessLevel: 'approved' },
    ],
  },
  '/api/admin/likes': {
    likes: Array.from({ length: 4 }, (_, index) => ({
      createdAt: iso(index),
      projectSlug: ['stylised-tavern', 'desert-outpost', 'ceramic-set', 'stylised-tavern'][index],
      user: index % 2 === 0 ? { accessLevel: 'member', displayName: 'Rin Sato', email: 'rin@example.com' } : null,
      visitorId: `visitor-${index}`,
    })),
  },
  '/api/admin/projects': { projects },
  '/api/admin/summary': {
    summary: { comments: 412, community_comments: 188, community_posts: 76, community_uploads: 63, contact_messages: 47, download_requests: 291, likes: 903, visitors: 58 },
  },
  '/api/admin/me': { admin: { recoveryCodesLeft: 8, username: 'mrright' } },
  '/api/admin/sessions': {
    sessions: [
      { createdAt: iso(0.05), expiresAt: new Date(Date.now() + 6 * 3600000).toISOString(), ip: '203.0.113.24', userAgent: 'Mozilla/5.0 (Macintosh)', username: 'mrright' },
      { createdAt: iso(0.4), expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(), ip: '198.51.100.9', userAgent: '', username: '' },
    ],
  },
  '/api/admin/actions': {
    actions: [
      { action: 'visitor.profile_disabled', actorUsername: 'mrright', createdAt: iso(0.6), id: 'act-1', reason: 'Banner image breached the content rules.', targetEmail: 'member4@example.com' },
      { action: 'comment.marked_spam', actorUsername: '', createdAt: iso(1.4), id: 'act-2', reason: '', targetUserId: 'visitor-2' },
    ],
  },
  '/api/admin/diagnostics': {
    diagnostics: { forwardedFor: '203.0.113.24, 10.0.0.3', forwardedProto: 'https', protocol: 'http', resolvedIp: '203.0.113.24', trustProxyHops: 2 },
  },
  // The codes here are the ones server/contentHealth.js actually emits, and the
  // interpolated ones carry `values`. They used to be invented names, which
  // meant the trilingual screenshots below rendered the English fallback and
  // proved nothing about the finding dictionary.
  '/api/admin/content-health': {
    health: {
      checkedAt: iso(0.01),
      communityUploads: [
        { file: { bytes: 48234496, exists: true, kind: 'zip' }, fileType: 'zip', id: 'up-1', issues: [], status: 'pending', title: 'Sci-fi crate pack', url: '/uploads/files/crates.zip' },
        { file: { exists: false }, fileType: 'glb', id: 'up-2', issues: [{ code: 'upload-missing-file', hint: 'Nothing resolves at /uploads/files/mage.glb. The row outlived its file.', message: 'The approved resource has a download link that 404s.', severity: 'critical', values: { url: '/uploads/files/mage.glb' } }], status: 'approved', title: 'Hand-painted mage', url: '/uploads/files/mage.glb' },
      ],
      counts: { critical: 1, note: 2, warning: 1 },
      projects: [
        { glb: null, image: { bytes: 284672, exists: true, kind: 'jpeg', root: 'dist', url: '/assets/projects/a.jpg' }, isPublic: true, issues: [{ code: 'model-absent', hint: 'Optional. Projects without a model simply show the still image.', message: 'The project has no 3D preview attached.', severity: 'note' }], model: null, slug: 'stylised-tavern', title: 'Stylised Tavern', translations: { complete: true, missing: {} } },
        { glb: { extensionsRequired: ['KHR_draco_mesh_compression'], images: 4, materials: 3, meshes: 6, version: '2.0' }, image: { bytes: 194560, exists: true, kind: 'jpeg', root: 'dist', url: '/assets/projects/b.jpg' }, isPublic: false, issues: [{ code: 'model-missing-file', hint: 'Nothing resolves at /models/x.glb. Re-upload the model or fix the path.', message: 'The 3D model 404s, so the preview never opens.', severity: 'critical', values: { url: '/models/x.glb' } }], model: { exists: false, url: '/models/x.glb' }, slug: 'desert-outpost', title: 'Desert Outpost', translations: { complete: false, missing: { Ja: ['title', 'summary'] } } },
      ],
      siteAssets: [
        { bytes: 1048576, expected: 'exr', found: 'exr', issue: null, label: 'Studio environment', url: '/assets/environments/studio.exr' },
        { bytes: 0, expected: 'wasm', found: 'missing', issue: { code: 'draco', message: 'The Draco decoder is not in dist/.', severity: 'warning' }, label: 'Draco decoder', url: '/draco/draco_decoder.wasm' },
      ],
    },
  },
}

const routeAdmin = async (page) => {
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let payload = payloads[path]

    if (!payload && path === '/api/admin/overview') payload = { overview }
    if (!payload && path === '/api/admin/visitors') {
      payload = {
        pagination: { hasNext: true, hasPrevious: false, limit: 20, page: 1, pages: 2, total: 12 },
        visitors,
      }
    }
    if (!payload && /^\/api\/admin\/visitors\/[^/]+$/.test(path)) {
      payload = { recentActions: [], visitor: visitors[0] }
    }
    if (!payload && path.startsWith('/api/admin/visitors/')) {
      payload = {
        items: [
          { createdAt: iso(2), id: 'item-1', message: 'A comment left on a project page.', title: 'Stylised Tavern' },
        ],
        pagination: { hasNext: false, hasPrevious: false, limit: 20, page: 1, pages: 1, total: 1 },
      }
    }
    if (!payload) payload = { ok: true }

    await route.fulfill({
      body: JSON.stringify({ data: payload, error: null }),
      contentType: 'application/json',
      status: 200,
    })
  })
}

const languages = ['zh', 'en', 'ja']
const widths = [
  { height: 900, name: '440', width: 440 },
  { height: 900, name: '768', width: 768 },
  { height: 950, name: '1440', width: 1440 },
]

const sectionKeys = ['overview', 'projects', 'content-health', 'community', 'comments', 'downloads', 'messages', 'visitors', 'likes', 'security', 'system']

for (const language of languages) {
  test(`admin console renders in ${language}`, async ({ page }, testInfo) => {
    const consoleErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

    await page.addInitScript((lang) => {
      window.localStorage.setItem('mrright-admin-token', 'local-review-token')
      window.localStorage.setItem('mrright-admin-language', lang)
    }, language)

    await routeAdmin(page)

    for (const size of widths) {
      await page.setViewportSize({ height: size.height, width: size.width })
      await page.goto('/admin', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.admin-console')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.admin-galaxy')).toBeVisible()
      await page.waitForTimeout(1800)

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        webgl: (() => {
          const canvas = document.createElement('canvas')
          return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
        })(),
      }))
      testInfo.annotations.push({ description: JSON.stringify(overflow), type: `${language}-${size.name}` })
      expect(overflow.scrollWidth, `horizontal overflow at ${size.width}px`).toBeLessThanOrEqual(overflow.clientWidth + 1)


      if (size.width === 1440) {
        const navItems = page.locator('.admin-nav-item')
        const count = await navItems.count()

        // Every section, one after another: the point is that each one mounts
        // and renders without throwing, in this language.
        for (let index = 0; index < count; index += 1) {
          await navItems.nth(index).click()
          await expect(page.locator('.admin-view')).toBeVisible()
          await page.waitForTimeout(300)
        }

        expect(count, 'every section is in the nav').toBe(sectionKeys.length)

        await navItems.nth(0).click()
        await page.waitForTimeout(400)
      }

      if (size.width === 440) {
        await page.locator('.admin-nav-toggle').click()
        await page.waitForTimeout(400)
        await page.locator('.admin-nav-item').nth(7).click()
        await page.waitForTimeout(700)

        const memberRow = page.locator('.visitor-row').first()
        if (await memberRow.count()) {
          await memberRow.click()
          await page.waitForTimeout(700)
          const narrow = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }))
          expect(narrow.scrollWidth, 'member detail overflow at 440px').toBeLessThanOrEqual(narrow.clientWidth + 1)
        }
      }
    }

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
  })
}

test('flat map and reduced motion', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
    window.localStorage.setItem('mrright-admin-language', 'zh')
    window.localStorage.setItem('mrright-admin-galaxy-mode', 'flat')
  })
  await routeAdmin(page)

  await page.setViewportSize({ height: 950, width: 1440 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.admin-galaxy-flat')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)

  // Reduced motion must not leave a staggered entrance mid-flight: every
  // animated element has to be fully opaque once the page has settled.
  const faded = await page.evaluate(() =>
    [...document.querySelectorAll('.admin-animate-in')].filter(
      (node) => Number(getComputedStyle(node).opacity) < 1,
    ).length,
  )
  expect(faded, 'elements left transparent under reduced motion').toBe(0)


  await page.locator('.admin-galaxy-dot').nth(1).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.admin-section-header h2')).toBeVisible()

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

// Open item 6c: objects inside a canvas are not in the focus order, so in 3D
// mode the operations map used to be unreachable by keyboard entirely. The
// assertion is that a keyboard user can reach a node and activate it -- not how
// the layer looks.
// Open item 6b: findings whose sentences have a path or a size baked into them
// stayed English while the console around them was translated. They are a
// template plus values now, so the Chinese console has to render Chinese *with*
// the path still in it.
test('a finding with a value in it reads in Chinese', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
    window.localStorage.setItem('mrright-admin-language', 'zh')
  })
  await routeAdmin(page)

  await page.setViewportSize({ height: 950, width: 1440 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-nav-item', { hasText: '内容体检' }).first().click()

  const finding = page
    .locator('.admin-findings li', { hasText: '/models/x.glb' })
    .first()
  await expect(finding).toBeVisible({ timeout: 15000 })

  // Chinese sentence, and the value the server sent still inside it.
  await expect(finding).toContainText('重新上传模型')
  await expect(finding).toContainText('/models/x.glb')
  // No leftover placeholder, and no English fallback.
  await expect(finding).not.toContainText('{url}')
  await expect(finding).not.toContainText('Nothing resolves at')
})

test('the 3D map is reachable by keyboard', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
    window.localStorage.setItem('mrright-admin-language', 'zh')
    // 3D, explicitly: the flat map already has real buttons, and it is the 3D
    // mode that had the gap.
    window.localStorage.setItem('mrright-admin-galaxy-mode', '3d')
  })
  await routeAdmin(page)

  await page.setViewportSize({ height: 950, width: 1440 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.admin-galaxy')).toBeVisible({ timeout: 15000 })

  const focusLayer = page.locator('.admin-galaxy-focus-layer button')
  await expect(focusLayer.first()).toBeAttached({ timeout: 15000 })

  // Focused, not clicked: a click would pass even if the element were outside
  // the focus order, which is the exact bug.
  await focusLayer.first().focus()
  await expect(focusLayer.first()).toBeFocused()

  // And it comes back on screen while focused, so a sighted keyboard user is
  // not navigating something invisible.
  const box = await focusLayer.first().boundingBox()
  expect(box, 'the focused node has no box').not.toBeNull()
  expect(box.x, 'the focused node is still off-screen').toBeGreaterThan(0)

  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await expect(page.locator('.admin-section-header h2')).toBeVisible()

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

test('language switch applies live and persists', async ({ page }) => {
  // Only the token here: addInitScript re-runs on every navigation, so
  // seeding the language too would overwrite the choice under test on reload.
  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-admin-token', 'local-review-token')
  })
  await routeAdmin(page)
  await page.setViewportSize({ height: 950, width: 1280 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })

  // No stored choice: the console follows the browser, which is en-US here.
  const title = page.locator('.admin-title')
  await expect(title).toHaveText('Dashboard')

  await page.locator('.admin-lang-item', { hasText: '中' }).click()
  await expect(title).toHaveText('仪表盘')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

  await page.locator('.admin-lang-item', { hasText: '日' }).click()
  await expect(title).toHaveText('ダッシュボード')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
  await expect(page.locator('.admin-galaxy-head h2')).toHaveText('運用コンステレーション')

  // Survives a reload, and does not touch the public site's own setting.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.admin-title')).toHaveText('ダッシュボード')
  const stored = await page.evaluate(() => ({
    admin: window.localStorage.getItem('mrright-admin-language'),
    site: window.localStorage.getItem('mrright-language'),
  }))
  expect(stored.admin).toBe('ja')
  expect(stored.site).toBe(null)
})

// The sign-in screen carries the switcher too -- separate test because the
// token seed above is re-applied on every navigation in that one.
test('sign-in screen switches language', async ({ page }) => {
  await routeAdmin(page)
  await page.setViewportSize({ height: 900, width: 1280 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('.admin-login h1')).toHaveText('mrright.blog control')
  await page.locator('.admin-lang-item', { hasText: '中' }).click()
  await expect(page.locator('.admin-login h1')).toHaveText('mrright.blog 控制台')

  await page.locator('.admin-lang-item', { hasText: '日' }).click()
  await expect(page.locator('.admin-login h1')).toHaveText('mrright.blog コントロール')
  await page.setViewportSize({ height: 900, width: 440 })
  await page.waitForTimeout(300)
})
