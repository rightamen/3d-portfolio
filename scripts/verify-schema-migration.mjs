#!/usr/bin/env node
// Proves that ensureSchema() actually migrates an EXISTING database, not just
// that it can build an empty one.
//
// tests/api/contract.db.spec.js already runs ensureSchema against a fresh
// cluster, so every CREATE TABLE is exercised. Production never takes that
// path: it has had a schema since day one, so what runs there is the ALTER
// TABLE half, against tables that already hold rows. Nothing tested that.
// This script does, by upgrading a database from an older revision's schema
// to the working tree's and then asserting the result.
//
//   node scripts/verify-schema-migration.mjs
//   node scripts/verify-schema-migration.mjs --from origin/main
//
// --from names the git ref whose schema.js is installed first (default HEAD,
// which is the right answer while the change is still uncommitted). If that
// revision's schema is identical to the working tree's, the script says so
// rather than reporting a green it did not earn.
//
// Read-only with respect to anything real: it initdb's a throwaway cluster in
// a temp directory, destroys it at the end, and never reads DATABASE_URL.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import pg from 'pg'

import { startDisposablePostgres } from './lib/disposable-postgres.mjs'

const TEST_DATABASE_NAME = 'mrright_schema_migration_test'
const SCHEMA_PATH = 'server/postgres/schema.js'

const log = (message) => console.log(`[schema] ${message}`)

const fromIndex = process.argv.indexOf('--from')
const baseRef = fromIndex === -1 ? 'HEAD' : process.argv[fromIndex + 1]
if (!baseRef) {
  console.error('[schema] --from needs a git ref.')
  process.exit(1)
}

// What the working tree's schema is expected to produce. Written out by hand
// rather than derived from the source, so a column deleted by accident fails
// here instead of quietly agreeing with itself.
const expected = {
  columns: {
    orders: [
      'amount_cents',
      'buyer_id',
      'created_at',
      'creator_id',
      'currency',
      'id',
      'platform_fee_cents',
      'purchased_at',
      'refunded_at',
      'status',
      'stripe_checkout_session_id',
      'stripe_payment_intent_id',
      'updated_at',
      'work_id',
    ],
    visitor_users: ['creator_enabled_at', 'payout_state', 'stripe_account_id', 'theme'],
    work_assets: ['checksum', 'file_name', 'file_size', 'file_type', 'file_url', 'kind', 'sort_order', 'work_id'],
    work_comments: ['message', 'parent_id', 'pinned_at', 'status', 'user_id', 'work_id'],
    works: [
      'asset_category',
      'creator_id',
      'currency',
      'license',
      'model_url',
      'price_cents',
      'published_at',
      'slug',
      'source',
      'source_slug',
      'status',
      'summary_ja',
      'tags',
      'title_zh',
      'year',
    ],
  },
  indexes: [
    'orders_payment_intent_unique_idx',
    'work_assets_work_idx',
    'work_comments_work_created_idx',
    'works_creator_slug_unique_idx',
    'works_status_published_idx',
  ],
  tables: [
    'orders',
    'payouts',
    'work_assets',
    'work_comment_likes',
    'work_comments',
    'work_likes',
    'works',
  ],
}

const gitShow = (ref, file) =>
  execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mrright-schema-check-'))
const failures = []
const check = (ok, message) => {
  if (ok) log(`ok    ${message}`)
  else {
    failures.push(message)
    console.error(`[schema] FAIL  ${message}`)
  }
}

let cluster = null
let client = null

try {
  const baseSource = gitShow(baseRef, SCHEMA_PATH)
  // The working tree, deliberately -- not the index. The whole point is to run
  // this on a change that has not been committed yet.
  const workingSource = readFileSync(path.resolve(SCHEMA_PATH), 'utf8')

  const identical = baseSource === workingSource

  const basePath = path.join(tempDir, 'schema-base.mjs')
  writeFileSync(basePath, baseSource)

  cluster = await startDisposablePostgres({ databaseName: TEST_DATABASE_NAME, log })

  const { Pool } = pg
  const pool = new Pool({ connectionString: cluster.databaseUrl })
  client = pool

  log(`Installing the schema as of ${baseRef}...`)
  const { ensureSchema: ensureBase } = await import(pathToFileURL(basePath).href)
  await ensureBase(pool)

  // Rows in the tables being altered, because "ALTER TABLE ... ADD COLUMN NOT
  // NULL DEFAULT" behaves differently on an empty table than on a populated
  // one, and production is populated.
  await pool.query(
    `INSERT INTO visitor_users (id, email, display_name, password_hash)
     VALUES ('u-schema-check', 'schema-check@example.test', 'Schema Check', 'x')`,
  )
  log('Seeded a visitor_users row so the ALTERs run against real data.')

  log('Upgrading to the working tree schema...')
  const { ensureSchema } = await import(
    pathToFileURL(path.resolve(SCHEMA_PATH)).href + `?t=${Date.now()}`
  )
  await ensureSchema(pool)

  log('Running it a second time (it must be idempotent)...')
  await ensureSchema(pool)

  const tables = new Set(
    (
      await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      )
    ).rows.map((row) => row.table_name),
  )
  for (const table of expected.tables) check(tables.has(table), `table ${table} exists`)

  const columnRows = (
    await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    )
  ).rows
  const columns = new Map()
  for (const row of columnRows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set())
    columns.get(row.table_name).add(row.column_name)
  }
  for (const [table, names] of Object.entries(expected.columns)) {
    const missing = names.filter((name) => !columns.get(table)?.has(name))
    check(missing.length === 0, `${table} has its new columns${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`)
  }

  const indexes = new Set(
    (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map(
      (row) => row.indexname,
    ),
  )
  for (const index of expected.indexes) check(indexes.has(index), `index ${index} exists`)

  // The existing row must have picked up the NOT NULL default rather than
  // blocking the ALTER or landing NULL.
  const seeded = (
    await pool.query(`SELECT payout_state, theme FROM visitor_users WHERE id = 'u-schema-check'`)
  ).rows[0]
  check(seeded?.payout_state === 'none', `an existing account defaulted to payout_state 'none'`)
  check(seeded?.theme === null, 'an existing account has no theme yet, rather than a bad default')

  // The money constraints are the ones worth proving, because getting them
  // wrong is only discovered after a transaction.
  const rejects = async (label, sql, params) => {
    try {
      await pool.query(sql, params)
      check(false, label)
    } catch {
      check(true, label)
    }
  }

  await pool.query(
    `INSERT INTO works (id, creator_id, slug, title) VALUES ('w-1', 'u-schema-check', 'a', 'A')`,
  )
  await rejects(
    'a negative price is refused',
    `UPDATE works SET price_cents = -1 WHERE id = 'w-1'`,
  )
  await rejects(
    'an unknown status is refused',
    `UPDATE works SET status = 'whatever' WHERE id = 'w-1'`,
  )
  await rejects(
    'two works cannot share a slug under one creator',
    `INSERT INTO works (id, creator_id, slug, title) VALUES ('w-2', 'u-schema-check', 'A', 'A again')`,
  )
  await rejects(
    'deleting an account that owns works is refused, not cascaded',
    `DELETE FROM visitor_users WHERE id = 'u-schema-check'`,
  )

  await pool.query(
    `INSERT INTO orders (id, work_id, creator_id, amount_cents, currency, stripe_payment_intent_id)
     VALUES ('o-1', 'w-1', 'u-schema-check', 500, 'usd', 'pi_test')`,
  )
  await rejects(
    'the same payment intent cannot be recorded twice',
    `INSERT INTO orders (id, work_id, creator_id, amount_cents, currency, stripe_payment_intent_id)
     VALUES ('o-2', 'w-1', 'u-schema-check', 500, 'usd', 'pi_test')`,
  )
  await pool.query(
    `INSERT INTO orders (id, work_id, creator_id, amount_cents, currency)
     VALUES ('o-3', 'w-1', 'u-schema-check', 500, 'usd')`,
  )
  await pool.query(
    `INSERT INTO orders (id, work_id, creator_id, amount_cents, currency)
     VALUES ('o-4', 'w-1', 'u-schema-check', 500, 'usd')`,
  )
  check(true, 'two orders with no payment intent yet can coexist (partial unique index)')

  if (identical) {
    console.warn(
      `\n[schema] NOTE: ${SCHEMA_PATH} is identical at ${baseRef} and in the working tree, so no\n` +
        '[schema]       upgrade was exercised -- only idempotency and the assertions above.\n' +
        '[schema]       Pass --from <older ref> to test a real upgrade.',
    )
  }
} catch (error) {
  console.error(error)
  failures.push(error.message)
} finally {
  if (client) await client.end().catch(() => {})
  if (cluster) cluster.teardown()
  rmSync(tempDir, { force: true, recursive: true })
}

if (failures.length) {
  console.error(`\n[schema] ${failures.length} check(s) failed.`)
  process.exit(1)
}

console.log('\n[schema] Schema migrates an existing database cleanly and is idempotent.')
