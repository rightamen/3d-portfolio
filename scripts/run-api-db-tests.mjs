#!/usr/bin/env node
// Runs the DB-backed API contract suite (tests/api/contract.db.spec.js)
// against a DISPOSABLE PostgreSQL, per docs/API_V1_FREEZE_PLAN.md §17.
//
// Two modes:
//   1. API_TEST_DATABASE_URL already set (e.g. CI service container): the URL
//      is safety-checked and used as-is; nothing is provisioned or dropped.
//   2. Otherwise: a throwaway cluster is initdb'ed inside a temp directory on
//      a free port (trust auth, loopback only), a test database is created,
//      the suite runs, and the WHOLE cluster directory is destroyed.
//
// The provisioning itself lives in scripts/lib/disposable-postgres.mjs, shared
// with scripts/verify-schema-migration.mjs.
//
// Safety: the database name must contain test/e2e/local/dev and must not
// contain "mrright_portfolio". The script never reads or reuses the
// production DATABASE_URL and never touches an existing system cluster.
import { spawn } from 'node:child_process'
import process from 'node:process'

import { assertDisposableDatabaseUrl, startDisposablePostgres } from './lib/disposable-postgres.mjs'

const TEST_DATABASE_NAME = 'mrright_api_contract_test'

const log = (message) => console.log(`[test:api:db] ${message}`)
const fail = (message) => {
  console.error(`[test:api:db] ${message}`)
  process.exit(1)
}

const runPlaywright = (databaseUrl) =>
  new Promise((resolve) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'test', '--config=playwright.api.db.config.js'],
      {
        cwd: process.cwd(),
        // The disposable database has no SMTP service. This test-only flag
        // exposes the one-time verification code in register responses so the
        // suite can exercise register -> verify -> password login without
        // weakening the production default.
        env: {
          ...process.env,
          API_TEST_DATABASE_URL: databaseUrl,
          EXPOSE_DEV_VERIFICATION_CODE: 'true',
        },
        stdio: 'inherit',
      },
    )
    child.once('exit', (code) => resolve(code ?? 1))
  })

const main = async () => {
  // Mode 1: externally provided disposable database (CI service container).
  if (process.env.API_TEST_DATABASE_URL) {
    try {
      assertDisposableDatabaseUrl(process.env.API_TEST_DATABASE_URL)
    } catch (error) {
      fail(`API_TEST_DATABASE_URL rejected: ${error.message}`)
    }
    log('Using externally provided API_TEST_DATABASE_URL (no local cluster provisioned).')
    process.exit(await runPlaywright(process.env.API_TEST_DATABASE_URL))
  }

  // Mode 2: provision a throwaway cluster.
  let cluster = null
  try {
    cluster = await startDisposablePostgres({ databaseName: TEST_DATABASE_NAME, log })
  } catch (error) {
    fail(error.message)
  }

  try {
    log('Running DB-backed contract suite...')
    const exitCode = await runPlaywright(cluster.databaseUrl)
    cluster.teardown()
    process.exit(exitCode)
  } catch (error) {
    console.error(error)
    cluster.teardown()
    process.exit(1)
  }
}

await main()
