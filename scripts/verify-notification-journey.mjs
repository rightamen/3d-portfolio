#!/usr/bin/env node
// The notification chain, walked end to end in a real browser by two real
// accounts, against the real server and the real built frontend.
//
// Why this and not the store test: verify-notifications.mjs proves the queries.
// It cannot prove that placing an order actually calls notify, that the bell
// polls the right endpoint, that the badge appears, or that opening it clears
// the count. Every one of those can be broken while every query still passes.
//
// ⚠️ And why TWO accounts driven separately: round 46's stranger-journey walk
// was supposed to catch the missing seller notification and did not, because it
// was done by one operator holding both sides -- who therefore always already
// knew. A creator learning something only counts if the buyer is somebody else.
//
// Nothing here touches production. A throwaway PostgreSQL cluster is initdb'ed
// in a temp directory, the server is started against it on a spare port, and
// the whole cluster is destroyed at the end. It never reads DATABASE_URL.
//
//   npm run build          # the server serves dist/
//   node scripts/verify-notification-journey.mjs
//   node scripts/verify-notification-journey.mjs --headed
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import process from 'node:process'

import { chromium } from 'playwright'

import { startDisposablePostgres } from './lib/disposable-postgres.mjs'

const log = (message) => console.log(`[journey] ${message}`)

let failures = 0
const check = (name, condition, detail = '') => {
  if (condition) log(`ok    ${name}`)
  else {
    failures += 1
    log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

if (!existsSync('dist/index.html')) {
  console.error('[journey] dist/index.html is missing. Run npm run build first.')
  process.exit(1)
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

// A throwaway admin token, so the one work in this run can be moved from review
// to published the way a real work is, rather than by editing the row.
const adminToken = `journey-admin-${Math.random().toString(36).slice(2)}`

const cluster = await startDisposablePostgres({ databaseName: 'mrright_journey_test', log })
const port = await freePort()
const base = `http://127.0.0.1:${port}`

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ADMIN_TOKEN: adminToken,
    DATABASE_URL: cluster.databaseUrl,
    // No SMTP on a throwaway cluster; this test-only flag returns the
    // verification code in the register response.
    EXPOSE_DEV_VERIFICATION_CODE: 'true',
    NODE_ENV: 'test',
    PORT: String(port),
    REGISTER_LIMIT_PER_HOUR: '40',
    VISITOR_ID_SECRET: 'journey-test-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const serverLog = []
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)))
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)))

const shutdown = () => {
  server.kill('SIGTERM')
  cluster.teardown()
}

// ── A tiny API client, for the setup only. Everything being TESTED happens in
//    the browser; this exists so the run does not spend its time driving a
//    registration form that is not what is under test.
const api = async (method, path, body, token) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  return { payload: payload.data || payload, status: response.status }
}

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

let browser = null

try {
  if (!(await waitForServer())) {
    console.error(serverLog.join(''))
    throw new Error('The server did not come up.')
  }
  log(`Server up on ${base}`)

  // ── Setup: two accounts, one priced work, published ──────────────────────

  const makeAccount = async (displayName, email, password) => {
    const registered = await api('POST', '/api/auth/register', { displayName, email, password })
    if (registered.status !== 201) throw new Error(`register failed: ${JSON.stringify(registered)}`)

    const verified = await api('POST', '/api/auth/verify-email', {
      code: registered.payload.verification.devCode,
      email,
    })
    if (verified.status !== 200) throw new Error(`verify failed: ${JSON.stringify(verified)}`)

    return { email, password, token: verified.payload.session.token }
  }

  const creatorPassword = 'JourneyCreator1!'
  const buyerPassword = 'JourneyBuyer1!'
  const creator = await makeAccount('Journey Creator', 'journey-creator@example.test', creatorPassword)
  const buyer = await makeAccount('Journey Buyer', 'journey-buyer@example.test', buyerPassword)
  log('Two accounts registered and verified.')

  await api('PUT', '/api/account/profile', { displayName: 'Journey Creator', handle: 'journeycreator' }, creator.token)

  // The creator must be payable or the order route refuses -- correctly, since
  // a buyer with nowhere to send money is not an order.
  await api(
    'PUT',
    '/api/account/payment-info',
    { methods: [{ instructions: 'Test only', label: 'Test method' }] },
    creator.token,
  )

  const created = await api('POST', '/api/account/works', { title: 'Journey Test Work' }, creator.token)
  const workId = created.payload.work.id
  const slug = created.payload.work.slug
  // PATCH, not PUT. The route is PATCH and PUT 404s, which is a probe bug that
  // looked exactly like a product bug: the work stayed free, the buy button
  // read "Download free", and no order was ever placed.
  const priced = await api(
    'PATCH',
    `/api/account/works/${workId}`,
    { priceCents: 1200, summary: 'A work for the journey test.' },
    creator.token,
  )
  check(
    'the work takes a price',
    priced.payload.work?.priceCents === 1200,
    `status ${priced.status}, priceCents ${priced.payload.work?.priceCents}`,
  )

  await api('PATCH', `/api/account/works/${workId}/status`, { status: 'review' }, creator.token)
  const published = await api('PATCH', `/api/admin/works/${workId}/status`, { status: 'published' }, adminToken)
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published)}`)

  // Read it back the way the page does, because the price the BUYER sees is
  // the only one that decides whether there is a buy button at all.
  const publicWork = await api('GET', `/api/works/journeycreator/${slug}`)
  check(
    'and still has it once published',
    publicWork.payload.work?.priceCents === 1200,
    `priceCents ${publicWork.payload.work?.priceCents}, acceptsPayment ${publicWork.payload.work?.creator?.acceptsPayment}`,
  )
  log(`Work published at /w/journeycreator/${slug}`)

  // ── The walk ─────────────────────────────────────────────────────────────

  browser = await chromium.launch({
    args: ['--no-sandbox'],
    headless: !process.argv.includes('--headed'),
  })

  // Two separate contexts, so the two people genuinely are two people: separate
  // cookies, separate localStorage, separate sessions.
  const signIn = async (account) => {
    const context = await browser.newContext({ viewport: { height: 900, width: 1280 } })
    const page = await context.newPage()
    await page.goto(`${base}/login?mode=login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').first().fill(account.email)
    await page.locator('input[type="password"]').first().fill(account.password)
    await page.locator('form button[type="submit"]').first().click()
    // Signed in is observable in the bar: the account avatar replaces Sign in.
    await page.waitForSelector('.topbar-avatar', { timeout: 20_000 })
    return { context, page }
  }

  const bellCount = async (page) => {
    const dot = page.locator('.topbar-bell-dot')
    return (await dot.count()) === 0 ? 0 : Number((await dot.first().innerText()).replace('+', ''))
  }

  const creatorSession = await signIn(creator)
  check('a creator with nothing waiting sees no badge', (await bellCount(creatorSession.page)) === 0)

  const buyerSession = await signIn(buyer)
  log('Both signed in, in separate browser contexts.')

  // The buyer orders, in the browser, by clicking the button a buyer clicks.
  await buyerSession.page.goto(`${base}/w/journeycreator/${slug}`, { waitUntil: 'domcontentloaded' })
  // Scoped to the purchase block. The first .primary-action on a work page is
  // not the buy button, which is exactly the kind of thing a probe gets wrong
  // and then reports as a product failure.
  await buyerSession.page.waitForSelector('.work-purchase button.primary-action', { timeout: 20_000 })
  const buyButton = buyerSession.page.locator('.work-purchase button.primary-action').first()
  const buyLabel = await buyButton.innerText()
  log(`Buy button reads: ${buyLabel.replace(/\n/g, ' ')}`)
  await buyButton.click()

  // The payment instructions appearing is how the buyer knows the order exists.
  await buyerSession.page
    .waitForFunction(() => Boolean(document.querySelector('.work-purchase-open')), null, {
      timeout: 20_000,
    })
    .catch(() => {})

  const orders = await api('GET', '/api/account/orders', null, buyer.token)
  check(
    'the order exists',
    (orders.payload.orders || []).length === 1,
    JSON.stringify(orders).slice(0, 200),
  )

  // ⚠️ The whole point. The creator was not told before this change existed.
  await creatorSession.page.reload({ waitUntil: 'domcontentloaded' })
  await creatorSession.page.waitForSelector('.topbar-bell', { timeout: 20_000 })
  await creatorSession.page
    .waitForFunction(() => Boolean(document.querySelector('.topbar-bell-dot')), null, { timeout: 20_000 })
    .catch(() => {})

  check('the creator is told, without going to look', (await bellCount(creatorSession.page)) === 1)

  await creatorSession.page.locator('.topbar-bell').click()
  await creatorSession.page.waitForSelector('.topbar-notify-panel', { timeout: 10_000 })
  // The panel opens before its list arrives. Reading innerText here without
  // waiting gets "Notifications / Loading" -- which passed once by luck and
  // then failed, which is worse than failing every time.
  await creatorSession.page.waitForSelector('.topbar-notify-panel [role="menuitem"]', {
    timeout: 10_000,
  })
  const panelText = await creatorSession.page.locator('.topbar-notify-panel').innerText()
  check('the notification names the work', panelText.includes('Journey Test Work'), panelText.slice(0, 80))
  // ⚠️ Not just "contains something": the kind label is the line that says what
  // happened, and it was silently blank because the dictionary key was built
  // without capitalising the first letter. The title still showed, so nothing
  // looked broken.
  check(
    'and says what happened',
    /ordered your work/i.test(panelText),
    JSON.stringify(panelText.slice(0, 120)),
  )

  // Opening it is seeing it.
  await creatorSession.page
    .waitForFunction(() => !document.querySelector('.topbar-bell-dot'), null, { timeout: 10_000 })
    .catch(() => {})
  check('opening the bell clears the badge', (await bellCount(creatorSession.page)) === 0)

  await creatorSession.page.reload({ waitUntil: 'domcontentloaded' })
  await creatorSession.page.waitForSelector('.topbar-bell', { timeout: 20_000 })
  check('and it stays cleared across a reload', (await bellCount(creatorSession.page)) === 0)

  // ── The other direction: the buyer waiting to hear the payment landed ─────

  const sales = await api('GET', '/api/account/sales', null, creator.token)
  const saleId = (sales.payload.orders || sales.payload.sales || [])[0]?.id
  check('the creator can see the sale', Boolean(saleId))

  if (saleId) {
    await api('PATCH', `/api/account/sales/${saleId}/status`, { status: 'paid' }, creator.token)

    await buyerSession.page.reload({ waitUntil: 'domcontentloaded' })
    await buyerSession.page.waitForSelector('.topbar-bell', { timeout: 20_000 })
    await buyerSession.page
      .waitForFunction(() => Boolean(document.querySelector('.topbar-bell-dot')), null, { timeout: 20_000 })
      .catch(() => {})
    check('the buyer is told their payment landed', (await bellCount(buyerSession.page)) === 1)
  }

  // ── A site announcement reaches somebody who was not involved at all ──────

  const announced = await api(
    'POST',
    '/api/admin/announcements',
    { body: 'Everyone should see this.', published: true, title: 'Journey Announcement' },
    adminToken,
  )
  check('the announcement was published', announced.status === 201)

  await creatorSession.page.reload({ waitUntil: 'domcontentloaded' })
  await creatorSession.page.waitForSelector('.topbar-bell', { timeout: 20_000 })
  await creatorSession.page
    .waitForFunction(() => Boolean(document.querySelector('.topbar-bell-dot')), null, { timeout: 20_000 })
    .catch(() => {})
  check('an announcement reaches a reader with a cleared bell', (await bellCount(creatorSession.page)) === 1)

  const shot = process.env.JOURNEY_SCREENSHOT || ''
  if (shot) {
    await creatorSession.page.screenshot({ path: shot })
    log(`Screenshot written to ${shot}`)
  }
} catch (error) {
  failures += 1
  log(`FAIL  the walk threw: ${error.message}`)
  if (serverLog.length > 0) console.error(serverLog.join('').slice(-3000))
} finally {
  if (browser) await browser.close()
  shutdown()
  log('Server stopped, disposable cluster destroyed.')
}

console.log('')
if (failures > 0) {
  log(`${failures} check(s) failed.`)
  process.exitCode = 1
} else {
  log('The notification chain works end to end, for two separate people.')
}
