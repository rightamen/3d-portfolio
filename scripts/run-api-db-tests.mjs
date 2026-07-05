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
// Safety: the database name must contain test/e2e/local/dev and must not
// contain "mrright_portfolio". The script never reads or reuses the
// production DATABASE_URL and never touches an existing system cluster.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const TEST_DATABASE_NAME = 'mrright_api_contract_test'

const log = (message) => console.log(`[test:api:db] ${message}`)
const fail = (message) => {
  console.error(`[test:api:db] ${message}`)
  process.exit(1)
}

const assertDisposableDatabaseUrl = (url) => {
  const databaseName = new URL(url).pathname.replace(/^\//, '')
  if (!/(test|e2e|local|dev)/i.test(databaseName)) {
    fail('API_TEST_DATABASE_URL must point to a database whose name contains test/e2e/local/dev.')
  }
  if (/mrright_portfolio/i.test(databaseName)) {
    fail('API_TEST_DATABASE_URL must never point to the production database.')
  }
}

const findPgBinDir = () => {
  if (process.env.PG_TEST_BIN) return process.env.PG_TEST_BIN

  // Debian/Ubuntu layout: server binaries live outside PATH.
  const aptRoot = '/usr/lib/postgresql'
  if (existsSync(aptRoot)) {
    const versions = readdirSync(aptRoot)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
    for (const version of versions) {
      const bin = path.join(aptRoot, String(version), 'bin')
      if (existsSync(path.join(bin, 'initdb'))) return bin
    }
  }

  const which = spawnSync('which', ['initdb'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim()) return path.dirname(which.stdout.trim())

  return null
}

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

// initdb refuses to run as root; when the script runs as root (e.g. WSL),
// pg commands are executed as the postgres system user instead.
const runAsRoot = typeof process.getuid === 'function' && process.getuid() === 0

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const runPg = (binDir, command, args, label) => {
  const result = runAsRoot
    ? spawnSync(
        'su',
        [
          '-s',
          '/bin/sh',
          'postgres',
          '-c',
          [path.join(binDir, command), ...args].map(shellQuote).join(' '),
        ],
        { encoding: 'utf8' },
      )
    : spawnSync(path.join(binDir, command), args, { encoding: 'utf8' })

  if (result.status !== 0) {
    console.error(result.stdout || '')
    console.error(result.stderr || '')
    fail(`${label} failed (exit ${result.status}).`)
  }
  return result
}

const runPlaywright = (databaseUrl) =>
  new Promise((resolve) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'test', '--config=playwright.api.db.config.js'],
      {
        cwd: process.cwd(),
        env: { ...process.env, API_TEST_DATABASE_URL: databaseUrl },
        stdio: 'inherit',
      },
    )
    child.once('exit', (code) => resolve(code ?? 1))
  })

const main = async () => {
  // Mode 1: externally provided disposable database (CI service container).
  if (process.env.API_TEST_DATABASE_URL) {
    assertDisposableDatabaseUrl(process.env.API_TEST_DATABASE_URL)
    log('Using externally provided API_TEST_DATABASE_URL (no local cluster provisioned).')
    process.exit(await runPlaywright(process.env.API_TEST_DATABASE_URL))
  }

  // Mode 2: provision a throwaway cluster.
  const binDir = findPgBinDir()
  if (!binDir) {
    fail(
      'PostgreSQL server binaries (initdb/pg_ctl) not found. Install PostgreSQL, set PG_TEST_BIN, or provide API_TEST_DATABASE_URL.',
    )
  }
  log(`Using PostgreSQL binaries from ${binDir}`)

  const clusterDir = mkdtempSync(path.join(os.tmpdir(), 'mrright-api-contract-pg-'))
  const dataDir = path.join(clusterDir, 'data')
  const logFile = path.join(clusterDir, 'postgres.log')

  if (runAsRoot) {
    const chown = spawnSync('chown', ['-R', 'postgres:postgres', clusterDir])
    if (chown.status !== 0) fail('Could not chown the temp cluster directory to postgres.')
  }

  let started = false
  const teardown = () => {
    if (started) {
      // Immediate shutdown is fine — the cluster is deleted right after.
      runPg(binDir, 'pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop'], 'pg_ctl stop')
      started = false
    }
    rmSync(clusterDir, { recursive: true, force: true })
    log('Disposable cluster destroyed.')
  }

  try {
    log('Initializing disposable cluster (initdb)...')
    runPg(binDir, 'initdb', ['-D', dataDir, '-A', 'trust', '-U', 'postgres', '--no-sync'], 'initdb')

    const port = await getFreePort()
    log(`Starting PostgreSQL on 127.0.0.1:${port}...`)
    runPg(
      binDir,
      'pg_ctl',
      [
        '-D',
        dataDir,
        '-l',
        logFile,
        '-w',
        '-o',
        `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='${clusterDir}' -c fsync=off`,
        'start',
      ],
      'pg_ctl start',
    )
    started = true

    runPg(
      binDir,
      'createdb',
      ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', TEST_DATABASE_NAME],
      'createdb',
    )

    const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${TEST_DATABASE_NAME}`
    assertDisposableDatabaseUrl(databaseUrl)

    log('Running DB-backed contract suite...')
    const exitCode = await runPlaywright(databaseUrl)
    teardown()
    process.exit(exitCode)
  } catch (error) {
    console.error(error)
    teardown()
    process.exit(1)
  }
}

await main()
