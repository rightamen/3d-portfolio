// Checks the remote deploy script without deploying anything.
//
// The remote half of a deploy is the part with no undo: by the time bash reports
// a syntax error, the env file has been backed up, the release has been
// extracted and the service is about to be restarted. `bash -n` costs
// milliseconds here and has to be run against the *generated* script, because
// what is generated is not what is written -- fragments are concatenated and
// environment values are interpolated.
//
// It also pins the two properties that matter for the transports added on
// 2026-08-13:
//   - key auth and password auth send byte-identical scripts;
//   - values coming from the environment are quoted, so a path containing a
//     quote or a semicolon cannot become a command.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildRemoteScript } from './lib/deploy-remote-script.mjs'
import { createTransport } from './lib/ssh-transport.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const sandbox = mkdtempSync(path.join(os.tmpdir(), 'deploy-script-'))

const baseOptions = {
  remoteDir: '/opt/mrright-portfolio',
  envFile: '/etc/mrright-portfolio.env',
  serviceName: 'mrright-portfolio',
  domain: 'mrright.blog',
  archivePath: '/tmp/mrright-portfolio.tar.gz',
  backupRetain: 3,
  appOrigin: 'http://127.0.0.1:4173',
}

// 1. Syntax. Both rewrite switches change which branches exist in the emitted
// heredocs, so all four combinations are worth a parse.
for (const rewriteNginx of [false, true]) {
  for (const rewriteService of [false, true]) {
    const script = buildRemoteScript({ ...baseOptions, rewriteNginx, rewriteService })
    const file = path.join(sandbox, `deploy-${rewriteNginx}-${rewriteService}.sh`)
    writeFileSync(file, script)
    try {
      execFileSync('bash', ['-n', file], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      check(false, `bash -n failed (nginx=${rewriteNginx} service=${rewriteService}): ${error.stderr}`)
    }
  }
}

// 2. Quoting. A remote dir with a space, a single quote and a shell
// metacharacter must survive as data. The assignments are the only part that
// can be evaluated safely off-server, so they are evaluated on their own and
// the values read back.
const hostile = {
  ...baseOptions,
  remoteDir: `/opt/we ird'dir; touch ${path.join(sandbox, 'pwned')}`,
  serviceName: `svc'$(touch ${path.join(sandbox, 'pwned-svc')})`,
}
const assignments = buildRemoteScript(hostile)
  .split('\n')
  .filter((line) => /^(REMOTE_DIR|ENV_FILE|SERVICE_NAME|DOMAIN|ARCHIVE|BACKUP_RETAIN|APP_ORIGIN)=/.test(line))
check(assignments.length === 7, `expected 7 variable assignments, got ${assignments.length}`)

const readBack = execFileSync(
  'bash',
  ['-c', [...assignments, 'printf "%s\\n" "$REMOTE_DIR" "$SERVICE_NAME"'].join('\n')],
  { encoding: 'utf8' },
)
const [readRemoteDir, readServiceName] = readBack.split('\n')
check(readRemoteDir === hostile.remoteDir, `REMOTE_DIR did not round-trip: ${readRemoteDir}`)
check(readServiceName === hostile.serviceName, `SERVICE_NAME did not round-trip: ${readServiceName}`)
for (const marker of ['pwned', 'pwned-svc']) {
  try {
    execFileSync('test', ['-e', path.join(sandbox, marker)])
    check(false, `injection succeeded: ${marker} was created`)
  } catch {
    // absent, as expected
  }
}

// 3. No secret is carried in the script text: the admin token is read from
// $ENV_FILE on the server. The script is printed by VPS_DRY_RUN and on failure,
// so this is the assertion that keeps it printable.
const script = buildRemoteScript(baseOptions)
check(
  script.includes('awk -F= \'$1 == "ADMIN_TOKEN"'),
  'the admin check no longer reads ADMIN_TOKEN from $ENV_FILE',
)
check(
  !/ADMIN_TOKEN=\S/.test(script) && !/DATABASE_URL=\S/.test(script),
  'the script assigns a value to ADMIN_TOKEN or DATABASE_URL; it must only read them remotely',
)

// 4. The two transports must deploy the same thing. Running the real entry point
// with VPS_DRY_RUN proves it end to end, including the option plumbing, without
// touching the network.
const dryRun = (env) =>
  execFileSync('node', ['scripts/deploy-vps.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, VPS_DRY_RUN: 'true', VPS_PASSWORD: '', ...env },
  })

const keyRun = dryRun({ VPS_AUTH: 'key' })
const passwordRun = dryRun({ VPS_AUTH: 'password', VPS_PASSWORD: 'not-used-in-dry-run' })
const stripHeader = (output) => output.split('\n').slice(1).join('\n')
check(
  stripHeader(keyRun) === stripHeader(passwordRun),
  'key and password auth would send different remote scripts',
)
check(!passwordRun.includes('not-used-in-dry-run'), 'the dry run printed the VPS_PASSWORD value')

// 5. Transport selection, without connecting. createKeyTransport is lazy (it
// spawns ssh per command), so this reaches no network.
const keyTransport = await createTransport({ host: 'example.invalid' })
check(keyTransport.kind === 'key', 'no password should select key auth')
const explicitKey = await createTransport({ auth: 'key', host: 'example.invalid', password: 'x' })
check(explicitKey.kind === 'key', 'VPS_AUTH=key must win over a present password')
try {
  await createTransport({ auth: 'password', host: 'example.invalid' })
  check(false, 'VPS_AUTH=password without VPS_PASSWORD should fail')
} catch (error) {
  check(
    error.message.includes('VPS_PASSWORD'),
    `unexpected error for password auth without a password: ${error.message}`,
  )
}
try {
  await createTransport({ auth: 'telepathy', host: 'example.invalid' })
  check(false, 'an unknown VPS_AUTH should fail')
} catch (error) {
  check(error.message.includes('telepathy'), `unexpected error for unknown auth: ${error.message}`)
}

rmSync(sandbox, { recursive: true, force: true })

if (failures.length > 0) {
  console.error('deploy script verification failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('deploy script verification passed (syntax, quoting, no secrets, transport parity).')
