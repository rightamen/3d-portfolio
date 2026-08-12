// Runs the deploy-time backup shell fragments under a real bash, against a
// scratch directory shaped like /opt/mrright-portfolio.
//
// The point is not to re-check the shell syntax. It is that this logic both
// hardlinks and deletes, and its correctness rests on filesystem behaviour that
// reading cannot settle: whether a hardlinked backup survives the release being
// extracted over it, and whether the pruner can ever be talked into removing
// something a human named. Both are cheap to answer with a temp directory and
// expensive to answer in production.
//
// It imports the same strings deploy-vps.mjs sends, so this cannot drift into
// testing a copy of the logic instead of the logic.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { BACKUP_AND_EXTRACT, PRUNE_FUNCTION } from './lib/deploy-backup-script.mjs'

const failures = []
const fail = (message) => failures.push(message)
const check = (condition, message) => {
  if (!condition) fail(message)
}

const bash = (script, cwd, env) =>
  execFileSync('bash', ['-c', script], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  })

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'deploy-backup-'))
const remoteDir = path.join(sandbox, 'app')

// Shapes the scratch directory like the real one: a large-ish uploads file that
// must not be duplicated, a data/ dir that must not be hardlinked, and the
// release files that get replaced on every deploy.
const seed = () => {
  rmSync(remoteDir, { recursive: true, force: true })
  mkdirSync(path.join(remoteDir, 'public/uploads'), { recursive: true })
  mkdirSync(path.join(remoteDir, 'data'), { recursive: true })
  mkdirSync(path.join(remoteDir, 'dist'), { recursive: true })
  writeFileSync(path.join(remoteDir, 'public/uploads/model.glb'), 'x'.repeat(2 * 1024 * 1024))
  writeFileSync(path.join(remoteDir, 'data/messages.jsonl'), '{"id":"old"}\n')
  writeFileSync(path.join(remoteDir, 'dist/index.html'), 'old release')
  writeFileSync(path.join(remoteDir, 'package.json'), '{"version":"old"}')
}

// A release tarball containing dist/ and package.json, like package-vps-release
// produces. package.json matters most: it is the one file the deploy overwrites
// without removing it first.
const buildArchive = () => {
  const staging = path.join(sandbox, 'release')
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(path.join(staging, 'dist'), { recursive: true })
  writeFileSync(path.join(staging, 'dist/index.html'), 'new release')
  writeFileSync(path.join(staging, 'package.json'), '{"version":"new"}')
  const archive = path.join(sandbox, 'release.tar.gz')
  bash(`tar -czf ${JSON.stringify(archive)} dist package.json`, staging)
  return archive
}

const preamble = (retain, archive) =>
  [
    'set -euo pipefail',
    `REMOTE_DIR=${JSON.stringify(remoteDir)}`,
    `ARCHIVE=${JSON.stringify(archive)}`,
    `BACKUP_RETAIN=${retain}`,
  ].join('\n')

const backupDirs = () =>
  readdirSync(sandbox)
    .filter((entry) => entry.startsWith('app.backup-'))
    .sort()

const archive = buildArchive()

// --- 1. a deploy: backup, then extract the new release over the live dir ------
seed()
const liveUpload = path.join(remoteDir, 'public/uploads/model.glb')
const uploadInodeBefore = statSync(liveUpload).ino

bash([preamble(3, archive), BACKUP_AND_EXTRACT].join('\n'), sandbox)

const [firstBackup] = backupDirs()
check(firstBackup !== undefined, 'no backup directory was created')

if (firstBackup) {
  const backupPath = path.join(sandbox, firstBackup)

  // Uploads: shared inode, so N backups cost one copy of the bytes.
  const backupUpload = path.join(backupPath, 'public/uploads/model.glb')
  check(existsSync(backupUpload), 'uploads missing from the backup')
  if (existsSync(backupUpload)) {
    check(
      statSync(backupUpload).ino === uploadInodeBefore,
      'uploads were copied instead of hardlinked, so every backup still costs a full copy',
    )
  }

  // data/: must NOT share an inode, or an append would rewrite every backup.
  const backupData = path.join(backupPath, 'data/messages.jsonl')
  check(existsSync(backupData), 'data/ missing from the backup')
  if (existsSync(backupData)) {
    check(
      statSync(backupData).ino !== statSync(path.join(remoteDir, 'data/messages.jsonl')).ino,
      'data/ was hardlinked; appending to it would corrupt every existing backup',
    )
  }

  // The whole point of a rollback point: it must still hold the OLD release
  // after the new one was extracted over the live directory.
  check(
    readFileSync(path.join(backupPath, 'dist/index.html'), 'utf8') === 'old release',
    'backup dist/ was overwritten by the new release',
  )
  check(
    readFileSync(path.join(backupPath, 'package.json'), 'utf8') === '{"version":"old"}',
    'backup package.json was overwritten through its hardlink (tar needs --unlink-first)',
  )
  check(
    readFileSync(path.join(remoteDir, 'package.json'), 'utf8') === '{"version":"new"}',
    'live package.json was not updated by the deploy',
  )

  // Appending to the live jsonl (the no-DATABASE_URL fallback path) must leave
  // the backup's copy alone.
  writeFileSync(path.join(remoteDir, 'data/messages.jsonl'), '{"id":"old"}\n{"id":"new"}\n')
  check(
    readFileSync(backupData, 'utf8') === '{"id":"old"}\n',
    'appending to live data/ changed the backup copy',
  )

  // Disk cost. du only collapses hardlinks it sees within a single invocation,
  // so measuring the backup on its own reports the full 2MB whether or not the
  // bytes are shared. Counting the live dir first and the backup second makes
  // the second total the backup's *incremental* cost, which is the number that
  // actually decides whether backups fill the disk.
  const duIncremental = Number(
    bash(
      `du -s -k ${JSON.stringify(remoteDir)} ${JSON.stringify(backupPath)} | tail -n 1 | cut -f1`,
      sandbox,
    ).trim(),
  )
  const duLive = Number(bash(`du -s -k ${JSON.stringify(remoteDir)} | cut -f1`, sandbox).trim())
  check(
    duIncremental < duLive / 2,
    `backup added ${duIncremental}KB on top of a ${duLive}KB live dir; uploads are not being shared`,
  )
}

// --- 1b. the rollback point survives a tar that overwrites in place ----------
// The assertions above hold on GNU tar 1.35 with or without --unlink-first,
// because its default is already to replace rather than truncate. That makes
// them useless as a guard on the flag. TAR_OPTIONS=--overwrite flips tar to the
// in-place truncate that some other tars do by default, which is the condition
// --unlink-first actually exists to survive: without it, extracting package.json
// writes through the shared inode and rewrites the backup's copy.
seed()
// The backup name is only second-resolution, so the run above can still own a
// directory of the same name; clearing first keeps this case reading its own
// backup rather than the previous one.
for (const dir of backupDirs()) rmSync(path.join(sandbox, dir), { recursive: true, force: true })
bash([preamble(3, archive), BACKUP_AND_EXTRACT].join('\n'), sandbox, { TAR_OPTIONS: '--overwrite' })

const overwriteBackups = backupDirs()
check(
  overwriteBackups.length === 1,
  `expected exactly one backup under TAR_OPTIONS=--overwrite, got ${overwriteBackups.length}`,
)
if (overwriteBackups.length === 1) {
  check(
    readFileSync(path.join(sandbox, overwriteBackups[0], 'package.json'), 'utf8') === '{"version":"old"}',
    'backup package.json was overwritten through its hardlink; the extract needs --unlink-first',
  )
}

// --- 2. pruning keeps the newest N and deletes the oldest --------------------
rmSync(remoteDir, { recursive: true, force: true })
for (const dir of backupDirs()) rmSync(path.join(sandbox, dir), { recursive: true, force: true })
mkdirSync(remoteDir, { recursive: true })

const stamps = ['20260101-000000', '20260102-000000', '20260103-000000', '20260104-000000', '20260105-000000']
const makeStamped = () => {
  for (const stamp of stamps) mkdirSync(path.join(sandbox, `app.backup-${stamp}`), { recursive: true })
}
makeStamped()
// Names the pruner must never touch, including one that is close but not the
// exact timestamp shape.
mkdirSync(path.join(sandbox, 'app.backup-before-migration'), { recursive: true })
mkdirSync(path.join(sandbox, 'app.backup-2026-01-01'), { recursive: true })

bash([preamble(3, archive), PRUNE_FUNCTION, 'prune_app_backups'].join('\n'), sandbox)

check(
  JSON.stringify(backupDirs()) ===
    JSON.stringify(
      [
        'app.backup-20260103-000000',
        'app.backup-20260104-000000',
        'app.backup-20260105-000000',
        'app.backup-2026-01-01',
        'app.backup-before-migration',
      ].sort(),
    ),
  `prune kept the wrong set: ${backupDirs().join(', ')}`,
)
check(
  existsSync(path.join(sandbox, 'app.backup-before-migration')),
  'prune deleted a hand-named backup directory',
)
check(
  existsSync(path.join(sandbox, 'app.backup-2026-01-01')),
  'prune deleted a directory that does not match the timestamp format it writes',
)

// --- 3. retain=0 disables pruning entirely -----------------------------------
for (const dir of backupDirs()) rmSync(path.join(sandbox, dir), { recursive: true, force: true })
makeStamped()
const zeroOutput = bash([preamble(0, archive), PRUNE_FUNCTION, 'prune_app_backups'].join('\n'), sandbox)
check(backupDirs().length === stamps.length, 'retain=0 still deleted backups')
check(zeroOutput.includes('pruning disabled'), 'retain=0 did not report that pruning is disabled')

// --- 4. fewer backups than the retain count is a no-op -----------------------
for (const dir of backupDirs()) rmSync(path.join(sandbox, dir), { recursive: true, force: true })
mkdirSync(path.join(sandbox, 'app.backup-20260101-000000'), { recursive: true })
bash([preamble(3, archive), PRUNE_FUNCTION, 'prune_app_backups'].join('\n'), sandbox)
check(backupDirs().length === 1, 'prune removed a backup while under the retain count')

// --- 5. no backups at all must not error under set -euo pipefail -------------
for (const dir of backupDirs()) rmSync(path.join(sandbox, dir), { recursive: true, force: true })
try {
  bash([preamble(3, archive), PRUNE_FUNCTION, 'prune_app_backups'].join('\n'), sandbox)
} catch (error) {
  fail(`prune failed when there were no backups to consider: ${error.message}`)
}

rmSync(sandbox, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`[deploy-backup] Verification failed with ${failures.length} issue(s):`)
  failures.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[deploy-backup] hardlinked backup + retention verification passed')
console.log('[deploy-backup] checked: uploads shared, data/ copied, rollback point intact after extract')
console.log('[deploy-backup] checked: prune keeps newest N, ignores hand-named dirs, honours retain=0')
