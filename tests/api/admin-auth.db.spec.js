import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

import { totpCodeForStep, totpStepAt } from '../../server/adminTotp.js'

// Named admin accounts: password + TOTP, and the attribution that exists
// because of them (docs/OPERATIONS_ADMIN_AUTH.md step 3).
//
// These assertions are about the properties that are expensive to be wrong
// about and impossible to check by reading: that a six-digit code cannot be
// replayed, that disabling an account takes effect on its live sessions rather
// than at expiry, that a recovery code is spent when it is used, and that the
// audit trail records who acted rather than only what happened.
//
// Each scenario gets its own admin account. That is not tidiness: the server
// remembers the last TOTP step per account, so two sign-ins for one account
// inside the same 30 seconds would collide with the replay defence -- which is
// exactly what it is supposed to do.
const databaseUrl = process.env.API_TEST_DATABASE_URL || ''

test.skip(!databaseUrl, 'API_TEST_DATABASE_URL is not set; run npm run test:api:db')

const assertDisposableDatabaseUrl = (url) => {
  const databaseName = new URL(url).pathname.replace(/^\//, '')

  if (!/(test|e2e|local|dev)/i.test(databaseName)) {
    throw new Error(
      'API_TEST_DATABASE_URL must point to a database whose name contains test/e2e/local/dev.',
    )
  }
  if (/mrright_portfolio/i.test(databaseName)) {
    throw new Error('API_TEST_DATABASE_URL must never point to the production database.')
  }
}

const port = 4196
const baseURL = `http://127.0.0.1:${port}`
const adminToken = randomBytes(24).toString('hex')
const adminPassword = `Adm!n-${randomBytes(9).toString('hex')}`
const adminLockAfter = 3

let serverProcess
let staticSession

const sendJson = async (method, path, body, token) => {
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  return { payload: await response.json(), response }
}

const waitForHealth = async () => {
  const deadline = Date.now() + 30_000
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw lastError || new Error('Timed out waiting for local API server.')
}

// Creates an account through the API and returns everything needed to sign in
// as it, including the enrolment secret the API hands over exactly once.
const createAdmin = async (username) => {
  const { payload, response } = await sendJson(
    'POST',
    '/api/admin/users',
    { displayName: `Test ${username}`, password: adminPassword, username },
    staticSession,
  )
  expect(response.status, `create admin ${username}`).toBe(201)

  return {
    id: payload.data.user.id,
    recoveryCodes: payload.data.enrolment.recoveryCodes,
    totpSecret: payload.data.enrolment.totpSecret,
    username,
  }
}

// stepOffset lets a test ask for the next window when it has already spent the
// current one; the server accepts one step either side for clock skew.
const codeFor = (admin, stepOffset = 0) =>
  totpCodeForStep(admin.totpSecret, totpStepAt(Date.now()) + stepOffset)

test.beforeAll(async () => {
  assertDisposableDatabaseUrl(databaseUrl)

  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      ADMIN_TOKEN: adminToken,
      NODE_ENV: 'test',
      // Lowered so the lockout test does not have to issue the production
      // number of attempts; raised so the per-IP limiter does not fire first.
      ADMIN_LOGIN_LOCK_AFTER: String(adminLockAfter),
      ADMIN_LOGIN_LIMIT_PER_WINDOW: '500',
      LOGIN_LIMIT_PER_WINDOW: '200',
      REGISTER_LIMIT_PER_HOUR: '40',
      VISITOR_ID_SECRET: 'admin-auth-test-visitor-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForHealth()

  // Bootstrap the way production does: the static token buys a session, and
  // the session creates the first named account. Nothing else in this file
  // uses the static token.
  const session = await sendJson('POST', '/api/admin/session', undefined, adminToken)
  expect(session.response.status).toBe(201)
  staticSession = session.payload.data.session.token
})

test.afterAll(async () => {
  serverProcess?.kill('SIGTERM')
})

test('a static-token session is reported as having no person behind it', async () => {
  const { payload, response } = await sendJson('GET', '/api/admin/me', undefined, staticSession)

  expect(response.status).toBe(200)
  expect(payload.data.admin.kind).toBe('session')
  expect(payload.data.admin.id).toBeNull()
  expect(payload.data.admin.username).toBeNull()
})

test('sign-in requires the second factor, and rejects a wrong password without saying which', async () => {
  const admin = await createAdmin('factor-required')

  const noCode = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    username: admin.username,
  })
  expect(noCode.response.status).toBe(401)
  expect(noCode.payload.error.code).toBe('ADMIN_TOTP_REQUIRED')

  const wrongPassword = await sendJson('POST', '/api/admin/login', {
    password: `${adminPassword}-wrong`,
    totp: codeFor(admin),
    username: admin.username,
  })
  expect(wrongPassword.response.status).toBe(401)
  // Same code and message as an unknown username: the response must not
  // separate "no such account" from "wrong password".
  expect(wrongPassword.payload.error.code).toBe('VALIDATION_ERROR')

  const unknownUser = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin),
    username: 'no-such-admin',
  })
  expect(unknownUser.response.status).toBe(401)
  expect(unknownUser.payload.error.code).toBe(wrongPassword.payload.error.code)
  expect(unknownUser.payload.error.message).toBe(wrongPassword.payload.error.message)
})

test('a valid code signs in, works on admin routes, and cannot be replayed', async () => {
  const admin = await createAdmin('replay-check')
  const code = codeFor(admin)

  const login = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: code,
    username: admin.username,
  })
  expect(login.response.status).toBe(201)
  const sessionToken = login.payload.data.session.token
  expect(sessionToken).toEqual(expect.any(String))

  const summary = await sendJson('GET', '/api/admin/summary', undefined, sessionToken)
  expect(summary.response.status).toBe(200)

  const me = await sendJson('GET', '/api/admin/me', undefined, sessionToken)
  expect(me.payload.data.admin.username).toBe(admin.username)
  expect(me.payload.data.admin.id).toBe(admin.id)

  // The same six digits, inside their own 30-second life, must not work again.
  const replay = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: code,
    username: admin.username,
  })
  expect(replay.response.status).toBe(401)

  // The next window still signs in, so the replay defence has not bricked the
  // account.
  const next = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin, 1),
    username: admin.username,
  })
  expect(next.response.status).toBe(201)
})

test('a recovery code signs in once and is then spent', async () => {
  const admin = await createAdmin('recovery-check')
  const [firstCode] = admin.recoveryCodes

  const login = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    recoveryCode: firstCode,
    username: admin.username,
  })
  expect(login.response.status).toBe(201)
  expect(login.payload.data.admin.recoveryCodesLeft).toBe(admin.recoveryCodes.length - 1)

  const reuse = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    recoveryCode: firstCode,
    username: admin.username,
  })
  expect(reuse.response.status).toBe(401)

  // A different code from the same envelope still works: only the used one is
  // gone.
  const second = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    recoveryCode: admin.recoveryCodes[1],
    username: admin.username,
  })
  expect(second.response.status).toBe(201)
})

test('repeated failures lock the account, and the lock outlives a correct password', async () => {
  const admin = await createAdmin('lockout-check')

  for (let attempt = 0; attempt < adminLockAfter; attempt += 1) {
    const wrong = await sendJson('POST', '/api/admin/login', {
      password: 'not-the-password',
      totp: codeFor(admin),
      username: admin.username,
    })
    expect(wrong.response.status).toBe(401)
  }

  const correct = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin),
    username: admin.username,
  })
  expect(correct.response.status).toBe(423)
  expect(correct.payload.error.code).toBe('ACCOUNT_LOCKED')
})

test('disabling an account revokes its live sessions immediately', async () => {
  const admin = await createAdmin('disable-check')

  const login = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin),
    username: admin.username,
  })
  expect(login.response.status).toBe(201)
  const sessionToken = login.payload.data.session.token
  expect((await sendJson('GET', '/api/admin/summary', undefined, sessionToken)).response.status).toBe(200)

  const disabled = await sendJson(
    'PATCH',
    `/api/admin/users/${admin.id}`,
    { disabled: true },
    staticSession,
  )
  expect(disabled.response.status).toBe(200)

  // Not "at expiry" -- now.
  const afterDisable = await sendJson('GET', '/api/admin/summary', undefined, sessionToken)
  expect(afterDisable.response.status).toBe(401)

  const loginAgain = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin, 1),
    username: admin.username,
  })
  expect(loginAgain.response.status).toBe(401)
})

test('an admin cannot disable the account they are signed in as', async () => {
  const admin = await createAdmin('self-disable-check')
  const login = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin),
    username: admin.username,
  })
  expect(login.response.status).toBe(201)

  const attempt = await sendJson(
    'PATCH',
    `/api/admin/users/${admin.id}`,
    { disabled: true },
    login.payload.data.session.token,
  )
  expect(attempt.response.status).toBe(400)

  // Still working, i.e. the guard did not half-apply the change.
  const summary = await sendJson(
    'GET',
    '/api/admin/summary',
    undefined,
    login.payload.data.session.token,
  )
  expect(summary.response.status).toBe(200)
})

test('admin actions are attributed to the account that performed them', async () => {
  const admin = await createAdmin('attribution-check')
  const login = await sendJson('POST', '/api/admin/login', {
    password: adminPassword,
    totp: codeFor(admin),
    username: admin.username,
  })
  expect(login.response.status).toBe(201)
  const sessionToken = login.payload.data.session.token

  const email = `admin-auth-target-${randomBytes(4).toString('hex')}@example.com`
  const registered = await sendJson('POST', '/api/auth/register', {
    displayName: 'Attribution Target',
    email,
    password: `pw-${randomBytes(9).toString('hex')}`,
  })
  expect(registered.response.status).toBe(201)

  const moderated = await sendJson(
    'PATCH',
    `/api/admin/visitors/${registered.payload.data.user.id}/profile-visibility`,
    { disabled: true, reason: 'attribution test' },
    sessionToken,
  )
  expect(moderated.response.status).toBe(200)

  const actions = await sendJson('GET', '/api/admin/actions?limit=5', undefined, sessionToken)
  expect(actions.response.status).toBe(200)
  const recorded = actions.payload.data.actions.find(
    (action) => action.targetUserId === registered.payload.data.user.id,
  )
  expect(recorded).toBeTruthy()
  expect(recorded.actorUsername).toBe(admin.username)

  // The same action taken on the shared token records no actor rather than
  // borrowing someone's name.
  const viaStatic = await sendJson(
    'PATCH',
    `/api/admin/visitors/${registered.payload.data.user.id}/profile-visibility`,
    { disabled: false, reason: 'attribution test (static)' },
    staticSession,
  )
  expect(viaStatic.response.status).toBe(200)

  const afterStatic = await sendJson('GET', '/api/admin/actions?limit=5', undefined, sessionToken)
  const staticAction = afterStatic.payload.data.actions.find(
    (action) => action.reason === 'attribution test (static)',
  )
  expect(staticAction).toBeTruthy()
  expect(staticAction.actorUsername).toBeNull()
})

test('no admin listing or session listing ever carries a secret', async () => {
  const users = await sendJson('GET', '/api/admin/users', undefined, staticSession)
  expect(users.response.status).toBe(200)
  const serialisedUsers = JSON.stringify(users.payload)
  for (const forbidden of ['passwordHash', 'password_hash', 'totpSecret', 'totp_secret', 'recoveryCodeHashes']) {
    expect(serialisedUsers).not.toContain(forbidden)
  }

  const sessions = await sendJson('GET', '/api/admin/sessions', undefined, staticSession)
  expect(sessions.response.status).toBe(200)
  // Sessions are listed by owner, and the unattributable ones say so.
  expect(sessions.payload.data.sessions.some((session) => session.username === null)).toBe(true)
  expect(JSON.stringify(sessions.payload)).not.toContain('token_hash')
})
