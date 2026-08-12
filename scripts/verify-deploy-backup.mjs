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

import {
  ADMIN_SESSION_CHECK,
  BACKUP_AND_EXTRACT,
  PRUNE_FUNCTION,
  WAIT_FOR_HEALTH,
} from './lib/deploy-backup-script.mjs'

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

// --- 6. the health check waits for a service that is still starting ----------
// This is the 2026-08-12 deploy failure, reproduced: systemctl returns once the
// unit is started, but node needs about two seconds more to reach listen(), and
// a bare curl in that window aborts the whole deploy on a healthy release.
//
// curl is stubbed rather than pointed at a real socket. What needs proving is
// the loop's contract -- keep trying, report how many attempts it took, give up
// non-zero at the cap -- and a stub states the service's behaviour directly
// instead of leaving it to a race against a real listener's startup.
const stubBin = path.join(sandbox, 'bin')
mkdirSync(stubBin, { recursive: true })
const counterFile = path.join(sandbox, 'curl-calls')

// Fails until it has been called `succeedOnCall` times, like a unit that is up
// but not yet listening. 0 means it never succeeds.
const installCurlStub = (succeedOnCall) => {
  writeFileSync(counterFile, '0')
  writeFileSync(
    path.join(stubBin, 'curl'),
    [
      '#!/bin/bash',
      `n=$(( $(cat ${JSON.stringify(counterFile)}) + 1 ))`,
      `echo "$n" > ${JSON.stringify(counterFile)}`,
      `if [ ${succeedOnCall} -gt 0 ] && [ "$n" -ge ${succeedOnCall} ]; then exit 0; fi`,
      'exit 7', // curl's "failed to connect"
    ].join('\n'),
    { mode: 0o755 },
  )
}

const waitScript = (attempts) =>
  [
    'set -euo pipefail',
    'HEALTH_URL="http://127.0.0.1:4173/api/health"',
    'SERVICE_NAME=not-a-real-unit',
    `HEALTH_ATTEMPTS=${attempts}`,
    WAIT_FOR_HEALTH,
  ].join('\n')

const stubbedPath = { PATH: `${stubBin}:${process.env.PATH}` }

installCurlStub(3)
try {
  const waitOutput = bash(waitScript(30), sandbox, stubbedPath)
  check(
    waitOutput.includes('Health check passed after 3 attempt(s)'),
    `wait loop did not retry to the third attempt: ${waitOutput.trim()}`,
  )
  check(
    Number(readFileSync(counterFile, 'utf8').trim()) === 3,
    'wait loop kept calling curl after it had already succeeded',
  )
} catch (error) {
  fail(`wait loop gave up on a service that needed three attempts: ${error.message}`)
}

// A service that never answers must still fail the deploy rather than hang or
// pass silently, and must stop at the cap instead of retrying forever.
installCurlStub(0)
let deadServiceFailed = false
try {
  bash(waitScript(4), sandbox, stubbedPath)
} catch {
  deadServiceFailed = true
}
check(deadServiceFailed, 'wait loop passed even though the service never answered')
check(
  Number(readFileSync(counterFile, 'utf8').trim()) === 4,
  `wait loop did not stop at HEALTH_ATTEMPTS=4 (curl was called ${readFileSync(counterFile, 'utf8').trim()} times)`,
)

// --- 7. the admin check uses a session, and always gives it back -------------
// This is what gates ADMIN_ALLOW_STATIC_TOKEN=false: the deploy was the last
// thing calling the admin API with the static token. What has to hold is that
// the static token only ever buys a session, the API call uses that session,
// and the session does not outlive the deploy -- including when the deploy
// fails, which is exactly when a leaked 12-hour session would go unnoticed.
const envFixture = path.join(sandbox, 'service.env')
writeFileSync(envFixture, 'DATABASE_URL=postgres://x\nADMIN_TOKEN=static-token-value\n')
const curlLog = path.join(sandbox, 'curl-log')

// Answers the session exchange with a real-shaped envelope, and lets the caller
// decide whether the summary call succeeds.
const installAdminCurlStub = ({ summaryFails = false, sessionGarbage = false } = {}) => {
  writeFileSync(curlLog, '')
  writeFileSync(
    path.join(stubBin, 'curl'),
    [
      '#!/bin/bash',
      'method=GET; url=""; auth=""',
      'while [ $# -gt 0 ]; do',
      '  case "$1" in',
      '    -X) method="$2"; shift 2 ;;',
      '    -H) case "$2" in "Authorization: Bearer "*) auth="${2#Authorization: Bearer }" ;; esac; shift 2 ;;',
      '    http*) url="$1"; shift ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      `echo "$method $url auth=$auth" >> ${JSON.stringify(curlLog)}`,
      'case "$method $url" in',
      '  "POST "*/api/admin/session)',
      sessionGarbage
        ? '    echo "<html>gateway timeout</html>"; exit 0 ;;'
        : '    echo \'{"data":{"session":{"expiresAt":"2026-08-12T17:00:00.000Z","token":"session-token-value"}},"pagination":{},"error":null}\'; exit 0 ;;',
      '  "GET "*/api/admin/summary)',
      summaryFails ? '    exit 22 ;;' : '    echo \'{"data":{}}\'; exit 0 ;;',
      '  "DELETE "*/api/admin/session) exit 0 ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  )
}

const adminScript = [
  'set -euo pipefail',
  `ENV_FILE=${JSON.stringify(envFixture)}`,
  'APP_ORIGIN="http://127.0.0.1:4173"',
  ADMIN_SESSION_CHECK,
].join('\n')

const curlCalls = () =>
  readFileSync(curlLog, 'utf8').trim().split('\n').filter(Boolean)

installAdminCurlStub()
try {
  const output = bash(adminScript, sandbox, stubbedPath)
  const calls = curlCalls()
  check(
    output.includes('Admin summary check passed'),
    `admin check did not report success: ${output.trim()}`,
  )
  check(
    calls.some((c) => c.startsWith('POST') && c.endsWith('auth=static-token-value')),
    'the static token was not exchanged for a session',
  )
  check(
    calls.some((c) => c.includes('/api/admin/summary') && c.endsWith('auth=session-token-value')),
    `the summary call did not use the session token: ${calls.join(' | ')}`,
  )
  check(
    !calls.some((c) => c.includes('/api/admin/summary') && c.includes('static-token-value')),
    'the summary call still carries the static admin token',
  )
  check(
    calls.some((c) => c.startsWith('DELETE') && c.endsWith('auth=session-token-value')),
    'the deploy session was never revoked',
  )
} catch (error) {
  fail(`admin session check failed on the happy path: ${error.message}`)
}

// A failing summary must fail the deploy and still revoke.
installAdminCurlStub({ summaryFails: true })
let adminCheckFailed = false
try {
  bash(adminScript, sandbox, stubbedPath)
} catch {
  adminCheckFailed = true
}
check(adminCheckFailed, 'a failing admin summary did not fail the deploy')
check(
  curlCalls().some((c) => c.startsWith('DELETE')),
  'the deploy session was left behind when the summary check failed',
)

// A session exchange that returns something other than the envelope must stop
// the deploy rather than carry an empty Authorization header forward.
installAdminCurlStub({ sessionGarbage: true })
let exchangeFailed = false
try {
  bash(adminScript, sandbox, stubbedPath)
} catch {
  exchangeFailed = true
}
check(exchangeFailed, 'a garbage session response did not stop the deploy')
check(
  !curlCalls().some((c) => c.includes('/api/admin/summary')),
  'the summary was called even though no session was obtained',
)

rmSync(sandbox, { recursive: true, force: true })

if (failures.length > 0) {
  console.error(`[deploy-backup] Verification failed with ${failures.length} issue(s):`)
  failures.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

console.log('[deploy-backup] hardlinked backup + retention verification passed')
console.log('[deploy-backup] checked: uploads shared, data/ copied, rollback point intact after extract')
console.log('[deploy-backup] checked: prune keeps newest N, ignores hand-named dirs, honours retain=0')
console.log('[deploy-backup] checked: health check waits out a slow start, still fails on a dead service')
console.log('[deploy-backup] checked: admin check exchanges a session, never reuses the static token, always revokes')
