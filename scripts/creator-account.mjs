#!/usr/bin/env node
// Manage creator accounts from a shell on the VPS.
//
// A creator is a visitor_users row with creator_enabled_at set and a handle --
// see docs/adr/ADR_PLATFORM_PIVOT.md §3. Ordinary accounts arrive through
// registration and email verification, which is right for everyone except the
// first one: the site owner has no visitor_users row at all, and the four
// existing works have to belong to somebody before they can be migrated.
//
// Shaped on scripts/admin-user.mjs, deliberately: same DATABASE_URL, same
// hashPassword, same echo-off prompt. An account created here is byte-for-byte
// one the API would have produced, plus the creator columns.
//
//   node scripts/creator-account.mjs list
//   node scripts/creator-account.mjs create <handle> <email> [--display-name "Name"]
//   node scripts/creator-account.mjs enable <handle-or-email>
//   node scripts/creator-account.mjs disable <handle-or-email>
//
// Passwords are read from the terminal with echo off, never from argv: a
// password in argv is visible in `ps` and lands in shell history. Nothing here
// ever prints a password or a hash.

import { createInterface } from 'node:readline'
import process from 'node:process'
import pg from 'pg'

import { hashPassword } from '../server/passwordHash.js'

const { Pool } = pg

const die = (message) => {
  console.error(message)
  process.exit(1)
}

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// One readline over stdin for the whole run, consumed as an async iterator.
// `terminal` follows whether stdin actually is one -- a terminal readline
// waiting on a pipe never yields, and being drivable from a pipe is what makes
// this testable at all.
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
})
let muteEcho = false
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
  return String(value ?? '').trim()
}

// Copied from handlePattern in server/index.js, character for character: a
// handle minted here must be one the API would also have accepted, or the
// account is unreachable through the endpoints that validate it.
const HANDLE_PATTERN = /^[a-z0-9_-]{3,30}$/

const normalizeHandle = (value) => String(value ?? '').trim().replace(/^@/, '').toLowerCase()

const findAccount = async (pool, identifier) => {
  const value = String(identifier ?? '').trim()
  const result = await pool.query(
    `SELECT id, email, display_name, handle, creator_enabled_at, email_verified_at
     FROM visitor_users
     WHERE lower(handle) = lower($1) OR lower(email) = lower($2)`,
    [normalizeHandle(value), value],
  )
  return result.rows[0] || null
}

const commands = {
  create: async (pool, args) => {
    const handle = normalizeHandle(args[0])
    const email = String(args[1] ?? '').trim().toLowerCase()

    if (!HANDLE_PATTERN.test(handle)) {
      die('Handle must be 3-30 characters: lowercase letters, digits, - and _.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die('A valid email is required.')

    const displayNameIndex = args.indexOf('--display-name')
    const displayName =
      displayNameIndex === -1 ? handle : String(args[displayNameIndex + 1] ?? handle).trim()

    if (await findAccount(pool, email)) die(`An account already exists for ${email}.`)
    if (await findAccount(pool, handle)) die(`The handle @${handle} is taken.`)

    const password = await prompt('New password: ', { silent: true })
    if (password.length < 12) die('Use at least 12 characters.')
    const again = await prompt('Repeat password: ', { silent: true })
    if (password !== again) die('The two passwords do not match.')

    const id = createId()
    // email_verified_at is set here rather than mailing a code to a mailbox
    // the operator is standing in front of anyway. It is the one thing this
    // script does that registration would not, and it is why the script has to
    // be run on the VPS by someone who already has root.
    await pool.query(
      `INSERT INTO visitor_users
         (id, email, display_name, password_hash, access_level, handle,
          email_verified_at, creator_enabled_at, password_changed_at)
       VALUES ($1, lower($2), $3, $4, 'member', $5, now(), now(), now())`,
      [id, email, displayName, await hashPassword(password), handle],
    )

    console.log(`Created creator @${handle} (${email}).`)
    console.log('The password was not printed and is not recoverable -- reset it if it was lost.')
  },

  disable: async (pool, args) => {
    const account = await findAccount(pool, args[0])
    if (!account) die(`No account matches ${args[0]}.`)

    await pool.query(
      'UPDATE visitor_users SET creator_enabled_at = null, updated_at = now() WHERE id = $1',
      [account.id],
    )
    console.log(`@${account.handle} is no longer a creator. The account and its works are intact.`)
  },

  enable: async (pool, args) => {
    const account = await findAccount(pool, args[0])
    if (!account) die(`No account matches ${args[0]}.`)

    const handle = normalizeHandle(args[1] ?? account.handle)
    if (!HANDLE_PATTERN.test(handle)) {
      die('This account has no usable handle. Pass one: enable <email> <handle>')
    }

    const clash = await pool.query(
      'SELECT id FROM visitor_users WHERE lower(handle) = $1 AND id <> $2',
      [handle, account.id],
    )
    if (clash.rows[0]) die(`The handle @${handle} is taken.`)

    await pool.query(
      `UPDATE visitor_users
       SET handle = $2, creator_enabled_at = COALESCE(creator_enabled_at, now()), updated_at = now()
       WHERE id = $1`,
      [account.id, handle],
    )
    console.log(`@${handle} (${account.email}) is now a creator.`)
  },

  list: async (pool) => {
    const result = await pool.query(
      `SELECT handle, email, display_name, creator_enabled_at,
              (SELECT count(*)::int FROM works WHERE works.creator_id = visitor_users.id) AS works
       FROM visitor_users
       WHERE creator_enabled_at IS NOT NULL
       ORDER BY creator_enabled_at`,
    )

    if (!result.rows.length) {
      console.log('No creators yet.')
      return
    }

    for (const row of result.rows) {
      console.log(
        `@${row.handle}\t${row.email}\t${row.display_name}\t${row.works} work(s)\tsince ${row.creator_enabled_at.toISOString().slice(0, 10)}`,
      )
    }
  },
}

const [command, ...args] = process.argv.slice(2)

if (!command || !commands[command]) {
  console.error('Usage: node scripts/creator-account.mjs <list|create|enable|disable> [...]')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) die('DATABASE_URL is not set.')

const pool = new Pool({ connectionString: databaseUrl })

try {
  await commands[command](pool, args)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}
