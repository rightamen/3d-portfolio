// Provisions a throwaway PostgreSQL cluster in a temp directory and destroys
// it afterwards. Extracted from scripts/run-api-db-tests.mjs when a second
// caller appeared (scripts/verify-schema-migration.mjs) -- copying a hundred
// lines of initdb handling would have meant two places for the safety checks
// to drift apart.
//
// Safety, unchanged from where this came from: the cluster is initdb'ed fresh
// on a free port with trust auth bound to loopback, the database name must
// look disposable, and nothing here ever reads the production DATABASE_URL or
// touches an existing system cluster.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

export const assertDisposableDatabaseUrl = (url) => {
  const databaseName = new URL(url).pathname.replace(/^\//, '')
  if (!/(test|e2e|local|dev)/i.test(databaseName)) {
    throw new Error(
      'Database name must contain test/e2e/local/dev to be treated as disposable.',
    )
  }
  if (/mrright_portfolio/i.test(databaseName)) {
    throw new Error('Refusing to treat the production database as disposable.')
  }
}

export const findPgBinDir = () => {
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

// initdb refuses to run as root; when the caller runs as root (e.g. WSL),
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
    throw new Error(`${label} failed (exit ${result.status}).`)
  }
  return result
}

/**
 * Starts a disposable cluster and returns { databaseUrl, teardown }.
 * The caller MUST call teardown(), including on failure.
 */
export const startDisposablePostgres = async ({ databaseName, log = () => {} }) => {
  const binDir = findPgBinDir()
  if (!binDir) {
    throw new Error(
      'PostgreSQL server binaries (initdb/pg_ctl) not found. Install PostgreSQL or set PG_TEST_BIN.',
    )
  }
  log(`Using PostgreSQL binaries from ${binDir}`)

  const clusterDir = mkdtempSync(path.join(os.tmpdir(), 'mrright-disposable-pg-'))
  const dataDir = path.join(clusterDir, 'data')
  const logFile = path.join(clusterDir, 'postgres.log')

  if (runAsRoot) {
    const chown = spawnSync('chown', ['-R', 'postgres:postgres', clusterDir])
    if (chown.status !== 0) {
      rmSync(clusterDir, { force: true, recursive: true })
      throw new Error('Could not chown the temp cluster directory to postgres.')
    }
  }

  let started = false
  const teardown = () => {
    if (started) {
      // Immediate shutdown is fine -- the cluster is deleted right after.
      runPg(binDir, 'pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop'], 'pg_ctl stop')
      started = false
    }
    rmSync(clusterDir, { force: true, recursive: true })
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
      ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', databaseName],
      'createdb',
    )

    const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`
    assertDisposableDatabaseUrl(databaseUrl)

    return { databaseUrl, teardown }
  } catch (error) {
    teardown()
    throw error
  }
}
