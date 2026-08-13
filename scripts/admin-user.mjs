#!/usr/bin/env node
// Manage named admin accounts from a shell on the VPS.
//
// The API can create admins, but only for a caller who is already one -- so the
// first account has to come from outside the API. That is this script. It is
// also the way back in when the second factor is the thing that broke: a lost
// phone with the recovery envelope also lost is not a reason to hand-write SQL
// against production at 2am.
//
// It talks to Postgres directly (DATABASE_URL, same variable the service uses)
// and imports the server's own hashing and TOTP code, so an account created
// here is byte-for-byte the same as one created through the API.
//
//   node scripts/admin-user.mjs list
//   node scripts/admin-user.mjs create <username> [--display-name "Real Name"]
//   node scripts/admin-user.mjs reset-password <username>
//   node scripts/admin-user.mjs reset-totp <username>
//   node scripts/admin-user.mjs recovery-codes <username>
//   node scripts/admin-user.mjs disable <username>
//   node scripts/admin-user.mjs enable <username>
//
// Passwords are read from the terminal with echo off, never from argv: a
// password in argv is visible in `ps` and lands in shell history.

import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import process from 'node:process'
import pg from 'pg'

import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
} from '../server/adminTotp.js'
import { hashPassword } from '../server/passwordHash.js'

const { Pool } = pg

const hashRecoveryCode = (code) =>
  createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')

const die = (message) => {
  console.error(message)
  process.exit(1)
}

// One readline over stdin for the whole run, consumed as an async iterator.
//
// `terminal` follows whether stdin actually is one. A terminal readline waiting
// on a pipe never yields, which is how the first version of this script hung
// when fed input non-interactively -- and being drivable from a pipe is what
// makes it testable at all.
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
})
let muteEcho = false
// readline echoes as it types; suppressing that is what keeps a password off
// the screen and out of a scrollback someone else may read later.
rl._writeToOutput = (chunk) => {
  if (!muteEcho) rl.output.write(chunk)
}
const lines = rl[Symbol.asyncIterator]()

const prompt = async (question, { silent = false } = {}) => {
  process.stdout.write(question)
  muteEcho = silent
  const { value } = await lines.next()
  muteEcho = false
  if (silent) process.stdout.write('\n')
  return String(value ?? '')
}

const readNewPassword = async () => {
  const first = await prompt('New password (not echoed): ', { silent: true })
  if (first.length < 12) die('Admin passwords must be at least 12 characters.')
  const second = await prompt('Repeat password: ', { silent: true })
  if (first !== second) die('Passwords did not match.')
  return first
}

// Printed once and never retrievable: these are the two things the database
// cannot give back (the secret is write-only in practice, the codes are hashed).
const printEnrolment = ({ otpauthUrl, recoveryCodes, totpSecret, username }) => {
  console.log('')
  console.log(`  Enrolment for ${username} — shown once, not recoverable:`)
  console.log('')
  console.log(`  TOTP secret : ${totpSecret}`)
  console.log(`  otpauth URL : ${otpauthUrl}`)
  console.log('')
  console.log('  Recovery codes (one use each, store them somewhere offline):')
  for (const code of recoveryCodes) console.log(`    ${code}`)
  console.log('')
  console.log('  Enrolment is confirmed by the first code that signs in successfully.')
  console.log('')
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) die('DATABASE_URL is required (the same one the service uses).')

const [command, usernameRaw, ...rest] = process.argv.slice(2)
// The API lowercases before validating and the column is written with lower(),
// so "Right" and "right" are one account. Normalising here too keeps the CLI
// from rejecting a name the API would have accepted.
const usernameArg = usernameRaw === undefined ? undefined : String(usernameRaw).trim().toLowerCase()
if (!command) die('Usage: node scripts/admin-user.mjs <list|create|reset-password|reset-totp|recovery-codes|disable|enable> [username]')

const displayNameFlag = rest.indexOf('--display-name')
const displayName = displayNameFlag === -1 ? null : rest[displayNameFlag + 1] || null

const pool = new Pool({ connectionString: databaseUrl })

const findUser = async (username) => {
  if (!username) die('A username is required for this command.')
  const result = await pool.query('SELECT * FROM admin_users WHERE username = lower($1)', [username])
  if (!result.rows[0]) die(`No admin user named "${username}".`)
  return result.rows[0]
}

try {
  switch (command) {
    case 'list': {
      const result = await pool.query(
        `
          SELECT username, display_name, totp_confirmed_at, disabled_at, locked_until,
                 last_login_at, jsonb_array_length(recovery_code_hashes) AS codes_left
          FROM admin_users
          ORDER BY created_at
        `,
      )
      if (!result.rows.length) {
        console.log('No admin accounts yet. Create one with: admin-user.mjs create <username>')
        break
      }
      for (const row of result.rows) {
        const flags = [
          row.disabled_at ? 'DISABLED' : 'enabled',
          row.totp_confirmed_at ? 'totp:confirmed' : 'totp:pending',
          row.locked_until && new Date(row.locked_until) > new Date() ? 'LOCKED' : null,
          `codes:${row.codes_left}`,
        ].filter(Boolean)
        console.log(
          `${row.username.padEnd(20)} ${flags.join(' ')}  last login: ${
            row.last_login_at ? row.last_login_at.toISOString() : 'never'
          }`,
        )
      }
      break
    }

    case 'create': {
      if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(String(usernameArg || ''))) {
        die('Username must be 3-80 characters: lowercase letters, digits, dot, dash or underscore.')
      }
      const existing = await pool.query('SELECT 1 FROM admin_users WHERE username = lower($1)', [
        usernameArg,
      ])
      if (existing.rows[0]) die(`Admin user "${usernameArg}" already exists.`)

      const password = await readNewPassword()
      const totpSecret = generateTotpSecret()
      const recoveryCodes = generateRecoveryCodes()

      await pool.query(
        `
          INSERT INTO admin_users (id, username, display_name, password_hash, totp_secret, recovery_code_hashes)
          VALUES ($1, lower($2), $3, $4, $5, $6::jsonb)
        `,
        [
          `${Date.now()}-${randomBytes(4).toString('hex')}`,
          usernameArg,
          displayName,
          await hashPassword(password),
          totpSecret,
          JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
        ],
      )

      printEnrolment({
        otpauthUrl: buildOtpAuthUrl({ account: usernameArg, secret: totpSecret }),
        recoveryCodes,
        totpSecret,
        username: usernameArg,
      })
      break
    }

    case 'reset-password': {
      const user = await findUser(usernameArg)
      const password = await readNewPassword()
      await pool.query(
        `
          UPDATE admin_users
          SET password_hash = $2, failed_login_count = 0, locked_until = null, updated_at = now()
          WHERE id = $1
        `,
        [user.id, await hashPassword(password)],
      )
      console.log(`Password reset for ${user.username}. Existing sessions were left alone.`)
      break
    }

    case 'reset-totp': {
      const user = await findUser(usernameArg)
      const totpSecret = generateTotpSecret()
      const recoveryCodes = generateRecoveryCodes()
      await pool.query(
        `
          UPDATE admin_users
          SET totp_secret = $2,
              totp_confirmed_at = null,
              totp_last_step = 0,
              recovery_code_hashes = $3::jsonb,
              updated_at = now()
          WHERE id = $1
        `,
        [user.id, totpSecret, JSON.stringify(recoveryCodes.map(hashRecoveryCode))],
      )
      // Old sessions are dropped here, unlike a password reset: re-enrolling
      // the second factor is what you do when you think it was compromised.
      await pool.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [user.id])
      printEnrolment({
        otpauthUrl: buildOtpAuthUrl({ account: user.username, secret: totpSecret }),
        recoveryCodes,
        totpSecret,
        username: user.username,
      })
      break
    }

    case 'recovery-codes': {
      const user = await findUser(usernameArg)
      const recoveryCodes = generateRecoveryCodes()
      await pool.query(
        'UPDATE admin_users SET recovery_code_hashes = $2::jsonb, updated_at = now() WHERE id = $1',
        [user.id, JSON.stringify(recoveryCodes.map(hashRecoveryCode))],
      )
      console.log(`New recovery codes for ${user.username} (the previous set no longer works):`)
      for (const code of recoveryCodes) console.log(`  ${code}`)
      break
    }

    case 'disable':
    case 'enable': {
      const user = await findUser(usernameArg)
      const disabled = command === 'disable'
      await pool.query(
        `
          UPDATE admin_users
          SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE null END,
              updated_at = now()
          WHERE id = $1
        `,
        [user.id, disabled],
      )
      if (disabled) {
        await pool.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [user.id])
      }
      console.log(`${user.username} is now ${disabled ? 'disabled (sessions revoked)' : 'enabled'}.`)
      break
    }

    default:
      die(`Unknown command "${command}".`)
  }
} finally {
  rl.close()
  await pool.end()
}
