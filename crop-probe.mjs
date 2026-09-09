import { chromium } from 'playwright'

// The crop dialog, driven for real: pick a file, drag it, zoom it, confirm, and
// look at the bytes that were actually going to be uploaded.
//
// The session is stubbed in the browser -- no production credentials -- and the
// upload request is intercepted rather than sent, so nothing is written
// anywhere. What is asserted is the multipart body the page produced.
const BASE = 'http://localhost:4321'
const out = '/tmp/claude-0/-root-Code-3d-portfolio/53b67252-858c-46a5-a9f1-87a89db14732/scratchpad'

const json = (route, data) =>
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data, ok: true, error: null, pagination: {} }),
  })

const user = {
  accessLevel: 'member',
  avatarUrl: '',
  displayName: 'Probe Creator',
  email: 'probe@example.test',
  emailVerified: true,
  handle: 'probe',
  id: 'probe-1',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })

for (const width of [1440, 440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const uploads = []

  // Catch-all first, specific stubs after -- Playwright matches the most
  // recently registered route.
  await page.route('**/api/**', (route) => json(route, {}))
  await page.route('**/api/account/profile', (route) => json(route, { profile: user }))
  await page.route('**/api/auth/me', (route) => json(route, { user }))
  await page.route('**/api/account/avatar', async (route) => {
    const body = route.request().postDataBuffer()
    uploads.push({ bytes: body?.length || 0, text: body?.subarray(0, 400).toString('latin1') || '' })
    return json(route, { avatarUrl: '/uploads/avatars/probe.webp', profile: user })
  })

  await page.addInitScript(() => {
    window.localStorage.setItem('mrright-visitor-token', 'probe-token')
    window.localStorage.setItem('mrright-language', 'en')
  })

  await page.goto(`${BASE}/account/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="file"][accept*="image"]', { timeout: 20000 })

  // A tall portrait picture, the case the old flow got wrong: uploaded whole
  // and cropped by object-fit, a 600x1600 photo became an avatar of a chin.
  const source = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 1600
      const ctx = canvas.getContext('2d')
      const gradient = ctx.createLinearGradient(0, 0, 0, 1600)
      gradient.addColorStop(0, '#ff3b30')
      gradient.addColorStop(0.5, '#34c759')
      gradient.addColorStop(1, '#0a84ff')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 600, 1600)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const buffer = await blob.arrayBuffer()
      return [...new Uint8Array(buffer)]
    }),
  )

  await page.setInputFiles('input[type="file"][accept*="image"]', {
    buffer: source,
    mimeType: 'image/png',
    name: 'tall.png',
  })

  await page.waitForSelector('.crop-frame img', { timeout: 10000 })

  const framed = await page.evaluate(() => {
    const frame = document.querySelector('.crop-frame')
    const img = frame.querySelector('img')
    const f = frame.getBoundingClientRect()
    const i = img.getBoundingClientRect()
    return {
      frame: { h: Math.round(f.height), w: Math.round(f.width) },
      // The picture must cover the frame on both axes at rest, or the avatar
      // ships with empty corners.
      coversX: i.left <= f.left + 0.5 && i.right >= f.right - 0.5,
      coversY: i.top <= f.top + 0.5 && i.bottom >= f.bottom - 0.5,
      square: Math.abs(f.width - f.height) < 1,
      dialogFits: document.querySelector('.crop-dialog').getBoundingClientRect().width <= window.innerWidth,
      overflow: document.body.scrollWidth - document.documentElement.clientWidth,
    }
  })

  // Drag it upward, so the crop reads the lower part of the picture, then zoom.
  const frame = await page.locator('.crop-frame').boundingBox()
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2)
  await page.mouse.down()
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2 - 220, { steps: 12 })
  await page.mouse.up()

  const afterDrag = await page.evaluate(() => {
    const f = document.querySelector('.crop-frame').getBoundingClientRect()
    const i = document.querySelector('.crop-frame img').getBoundingClientRect()
    return {
      // Still covering after the drag -- the clamp held.
      coversY: i.top <= f.top + 0.5 && i.bottom >= f.bottom - 0.5,
      movedUp: Math.round(i.top - f.top),
    }
  })

  await page.locator('.crop-zoom input').fill('2')
  await page.screenshot({ path: `${out}/crop-${width}.png` })

  await page.locator('.crop-actions .primary-action').click()
  await page.waitForFunction(() => !document.querySelector('.crop-dialog'), null, { timeout: 10000 })
  await page.waitForTimeout(500)

  console.log(`\n=== ${width}px ===`)
  console.log('framed   ', JSON.stringify(framed))
  console.log('afterDrag', JSON.stringify(afterDrag))
  console.log('source png bytes', source.length)
  console.log(
    'uploaded ',
    JSON.stringify(
      uploads.map((u) => ({
        bytes: u.bytes,
        isWebp: u.text.includes('crop.webp') && u.text.includes('image/webp'),
      })),
    ),
  )
  await page.close()
}

await browser.close()
