import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { assertDisposableDatabaseUrl } from '../../scripts/lib/disposable-postgres.mjs'

const databaseUrl = process.env.API_TEST_DATABASE_URL
const base = 'http://127.0.0.1:4231'
const route = '/api/account/documents'
const sample = Buffer.from('%PDF-1.7\nprivate sample\n%%EOF\n')
let pool, server, fixture, owner, visitor

test.skip(!databaseUrl, 'Requires disposable PostgreSQL')

const createUser = async () => {
  const id = randomUUID()
  const token = randomBytes(24).toString('hex')
  await pool.query(
    `INSERT INTO visitor_users (id, email, display_name, password_hash, handle, email_verified_at)
     VALUES ($1, $2, 'Document test account', 'test-only', $3, now())`,
    [id, id + '@example.test', 'documents-' + id.slice(0, 8)],
  )
  await pool.query(
    `INSERT INTO visitor_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [createHash('sha256').update(token).digest('hex'), id],
  )
  return { id, token }
}

const call = (suffix = '', token = owner.token, options = {}) =>
  fetch(base + route + suffix, {
    ...options,
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })

const upload = (kind, fileName, bytes = sample, token = owner.token) => {
  const body = new FormData()
  body.append('file', new Blob([bytes], { type: 'application/pdf' }), fileName)
  return call('/' + kind, token, { method: 'POST', body })
}

const storedFiles = () => readdir(path.join(
  fixture,
  'data',
  'account-documents',
  createHash('sha256').update(owner.id).digest('hex'),
))

test.beforeAll(async () => {
  assertDisposableDatabaseUrl(databaseUrl)
  pool = new pg.Pool({ connectionString: databaseUrl })
  fixture = await mkdtemp(path.join(tmpdir(), 'account-documents-test-'))
  await cp('server', path.join(fixture, 'server'), { recursive: true })
  await cp('package.json', path.join(fixture, 'package.json'))
  for (const folder of ['node_modules', 'dist']) {
    await symlink(path.resolve(folder), path.join(fixture, folder), 'junction')
  }
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: fixture,
    env: { ...process.env, DATABASE_URL: databaseUrl, ADMIN_TOKEN: '', NODE_ENV: 'test', PORT: '4231' },
    stdio: 'ignore',
  })
  await expect.poll(() => fetch(base + '/api/health').then(r => r.status).catch(() => 0), {
    timeout: 30_000,
  }).toBe(200)
  owner = await createUser()
  visitor = await createUser()
})

test.afterAll(async () => {
  if (server?.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGTERM')
    await stopped
  }
  await pool?.end()
  if (fixture) await rm(fixture, { recursive: true, force: true })
})

test('private PDF slots reject anonymous access, replace atomically, and download the original bytes', async () => {
  expect((await call('', '')).status).toBe(401)
  expect((await upload('resume', 'anonymous.pdf', sample, '')).status).toBe(401)
  expect((await upload('unknown', 'invalid.pdf')).status).toBe(400)

  const resume = await upload('resume', '中文简历.pdf')
  const portfolio = await upload('portfolio', '作品集.pdf')
  expect(resume.status).toBe(201)
  expect(portfolio.status).toBe(201)
  expect((await resume.json()).document).toMatchObject({ fileName: '中文简历.pdf', byteSize: sample.length })
  expect((await (await call('', visitor.token)).json()).documents).toEqual([])
  expect((await call('/resume/download', visitor.token)).status).toBe(404)
  expect((await call('/resume/download', '')).status).toBe(401)

  const [resumeStorage] = await storedFiles()
  // Unknown file paths can serve the SPA shell, but never the private PDF.
  const publicResponse = await fetch(base + '/uploads/' + resumeStorage)
  expect(publicResponse.headers.get('content-type')).not.toContain('application/pdf')
  expect(Buffer.from(await publicResponse.arrayBuffer())).not.toEqual(sample)
  expect((await upload('resume', 'bad.txt')).status).toBe(400)
  expect((await upload('resume', 'fake.pdf', Buffer.from('no pdf'))).status).toBe(400)
  expect((await upload('resume', 'large.pdf', Buffer.alloc(50 * 1024 * 1024 + 1))).status).toBe(413)

  const original = await call('/resume/download')
  expect(original.headers.get('cache-control')).toBe('private, no-store')
  expect(original.headers.get('content-disposition')).toContain('attachment')
  expect(original.headers.get('content-disposition')).toContain(encodeURIComponent('中文简历.pdf'))
  expect(Buffer.from(await original.arrayBuffer())).toEqual(sample)

  const updates = ['revision-1.pdf', 'revision-2.pdf'].map((name) => upload('resume', name))
  for (const response of await Promise.all(updates)) expect(response.status).toBe(201)
  expect(await storedFiles()).toHaveLength(2)
  const list = (await (await call()).json()).documents
  expect(list.map((item) => item.kind)).toEqual(['portfolio', 'resume'])
  expect(list.find((item) => item.kind === 'resume').fileName).toMatch(/^revision-[12]\.pdf$/)

  expect((await call('/resume', visitor.token, { method: 'DELETE' })).status).toBe(200)
  expect((await call('/resume', owner.token, { method: 'DELETE' })).status).toBe(200)
  expect(await storedFiles()).toHaveLength(1)
  expect((await call('/resume/download')).status).toBe(404)
  expect((await call('/portfolio/download')).status).toBe(200)
})

test('account sidebar opens the upload panel and the mobile download matches the selected PDF', async ({ playwright }, info) => {
  test.skip(!existsSync('dist/index.html') || !existsSync(playwright.chromium.executablePath()), 'Requires the web build and Chromium')
  const user = await createUser()
  const browser = await playwright.chromium.launch({ channel: 'chromium' })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 }, acceptDownloads: true })
    await page.addInitScript((token) => {
      localStorage.setItem('mrright-visitor-token', token)
      localStorage.setItem('mrright-language', 'zh')
    }, user.token)
    await page.goto(base + '/account/documents')
    const resume = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '简历', exact: true }) })
    const portfolio = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '作品集', exact: true }) })
    await expect(resume.getByText('尚未上传')).toBeVisible()
    await expect(portfolio.getByText('尚未上传')).toBeVisible()
    await resume.getByLabel('选择简历 PDF').setInputFiles({ name: '简历.pdf', mimeType: 'application/pdf', buffer: sample })
    await resume.getByRole('button', { name: '上传', exact: true }).click()
    await expect(resume.getByText('上传成功。')).toBeVisible()
    await page.reload()
    await expect(resume.getByText('简历.pdf')).toBeVisible()
    const downloaded = page.waitForEvent('download')
    await resume.getByRole('button', { name: '下载', exact: true }).click()
    expect(await readFile(await (await downloaded).path())).toEqual(sample)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('account-documents-mobile.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect(page.getByRole('navigation').getByRole('button', { name: '简历与作品集' })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: info.outputPath('account-documents-desktop.png'), fullPage: true })
  } finally {
    await browser.close()
  }
})
