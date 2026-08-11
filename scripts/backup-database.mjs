#!/usr/bin/env node
// PostgreSQL backup with integrity verification and opt-in retention.
//
// Why this exists: the deploy script backs up /opt/mrright-portfolio (code and
// uploads) but nothing ever dumped the database. A disk failure on the VPS
// would take every visitor account, community post, and download approval with
// it. This is the single largest availability risk in the project.
//
// Safety properties, in order of importance:
//   1. The connection string is never printed. Only host/database name are
//      logged, so the output is safe to keep in journalctl or CI logs.
//   2. Pruning is OPT-IN. With BACKUP_RETENTION_COUNT unset (the default) this
//      script never deletes anything. An operator has to consciously choose a
//      retention window, and even then the newest backup is never a candidate.
//   3. A dump is only considered good after `pg_restore --list` parses it. A
//      truncated dump that "succeeded" because the disk filled mid-write is
//      caught here rather than during a real recovery.
//
// Usage:
//   DATABASE_URL=... node scripts/backup-database.mjs
//   DATABASE_URL=... BACKUP_DIR=/var/backups/mrright node scripts/backup-database.mjs
//
// Environment:
//   DATABASE_URL             required, standard libpq URI
//   BACKUP_DIR               default /var/backups/mrright-portfolio
//   BACKUP_RETENTION_COUNT   default 0 (never prune). Set to e.g. 14 to keep
//                            the 14 newest verified dumps.
//   BACKUP_PGDUMP            default "pg_dump" (path override)
//   BACKUP_PGRESTORE         default "pg_restore" (path override)

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const backupDir = process.env.BACKUP_DIR || '/var/backups/mrright-portfolio'
const pgDumpBinary = process.env.BACKUP_PGDUMP || 'pg_dump'
const pgRestoreBinary = process.env.BACKUP_PGRESTORE || 'pg_restore'
const retentionCount = Number.parseInt(process.env.BACKUP_RETENTION_COUNT || '0', 10) || 0
const dumpFilePattern = /^mrright-portfolio-\d{8}-\d{6}\.dump$/

const fail = (message) => {
  console.error(`[backup] ${message}`)
  process.exit(1)
}

// Parses just enough of the URI to label the log line. Returns placeholders
// rather than throwing so a malformed value fails later at pg_dump with its
// own diagnostics instead of leaking the string through an exception message.
const describeTarget = (databaseUrl) => {
  try {
    const url = new URL(databaseUrl)
    return {
      database: url.pathname.replace(/^\//, '') || '<default>',
      host: url.hostname || '<local>',
    }
  } catch {
    return { database: '<unparsed>', host: '<unparsed>' }
  }
}

const timestamp = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

const run = (command, args, { env } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.once('error', (error) =>
      reject(
        new Error(
          error.code === 'ENOENT'
            ? `${command} not found on PATH. Install postgresql-client or set BACKUP_PGDUMP / BACKUP_PGRESTORE.`
            : error.message,
        ),
      ),
    )

    child.once('close', (code) => {
      if (code === 0) return resolve({ stderr, stdout })
      // stderr from pg_dump can echo the host and database but never the
      // password (libpq redacts it), so it is safe to surface.
      reject(new Error(`${command} exited with code ${code}: ${stderr.trim() || '<no output>'}`))
    })
  })

const sha256File = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(hash.digest('hex')))
  })

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Prune only when the operator opted in, and only files this script produced.
// The newest `retentionCount` verified dumps always survive; a dump whose
// checksum sidecar is missing is treated as unverified and left alone rather
// than deleted, so a half-finished run never causes data loss.
const pruneOldBackups = async () => {
  if (retentionCount <= 0) {
    console.log('[backup] retention disabled (BACKUP_RETENTION_COUNT unset) — keeping every dump')
    return
  }

  const entries = await readdir(backupDir)
  const dumps = entries.filter((entry) => dumpFilePattern.test(entry)).sort().reverse()

  if (dumps.length <= retentionCount) {
    console.log(`[backup] ${dumps.length} dump(s) retained, limit ${retentionCount} — nothing to prune`)
    return
  }

  const stale = dumps.slice(retentionCount)
  for (const name of stale) {
    const dumpPath = path.join(backupDir, name)
    const checksumPath = `${dumpPath}.sha256`

    try {
      await stat(checksumPath)
    } catch {
      console.warn(`[backup] skipping prune of ${name}: no checksum sidecar, treating as unverified`)
      continue
    }

    await unlink(dumpPath)
    await unlink(checksumPath)
    console.log(`[backup] pruned ${name}`)
  }
}

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) fail('DATABASE_URL is not set.')

  const target = describeTarget(databaseUrl)
  console.log(`[backup] dumping database "${target.database}" on host "${target.host}"`)

  await mkdir(backupDir, { recursive: true })

  const dumpName = `mrright-portfolio-${timestamp()}.dump`
  const dumpPath = path.join(backupDir, dumpName)

  // --format=custom so pg_restore can do selective/parallel restores, and so
  // `pg_restore --list` below can validate the archive structure.
  // --no-owner/--no-privileges keep the dump restorable into a database owned
  // by a different role, which is what a recovery on a fresh VPS looks like.
  await run(pgDumpBinary, [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    dumpPath,
    databaseUrl,
  ])

  const { size } = await stat(dumpPath)
  if (size === 0) fail('pg_dump produced an empty file.')

  // Structural verification: a truncated or corrupt archive fails to list.
  const listing = await run(pgRestoreBinary, ['--list', dumpPath])
  const tableEntries = listing.stdout
    .split('\n')
    .filter((line) => /TABLE DATA/.test(line)).length

  if (tableEntries === 0) {
    fail('Dump verified as readable but contains no table data — refusing to report success.')
  }

  const checksum = await sha256File(dumpPath)
  await writeFile(`${dumpPath}.sha256`, `${checksum}  ${dumpName}\n`, 'utf8')

  console.log(`[backup] wrote ${dumpName} (${formatBytes(size)}, ${tableEntries} table data entries)`)
  console.log(`[backup] sha256 ${checksum}`)

  await pruneOldBackups()

  // Off-site copy is deliberately not implemented here: it needs credentials
  // this process should not hold. Run it from the systemd unit as a separate
  // ExecStartPost (see docs/OPERATIONS_BACKUP.md) so a failure to ship the
  // backup off-box is visible as its own unit failure.
  if (!process.env.BACKUP_OFFSITE_ACKNOWLEDGED) {
    console.warn(
      '[backup] reminder: this dump is still on the same host as the database. ' +
        'Configure off-site copying (see docs/OPERATIONS_BACKUP.md) and set ' +
        'BACKUP_OFFSITE_ACKNOWLEDGED=1 to silence this warning.',
    )
  }
}

main().catch((error) => fail(error.message))
