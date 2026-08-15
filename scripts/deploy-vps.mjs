import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { buildRemoteScript, shellQuote } from './lib/deploy-remote-script.mjs'
import { archiveItems, assertNoUploadsInBuild } from './lib/release-contents.mjs'
import { createTransport } from './lib/ssh-transport.mjs'

const execFileAsync = promisify(execFile)

const host = process.env.VPS_HOST || '147.79.20.232'
const port = Number(process.env.VPS_PORT || 22)
const username = process.env.VPS_USER || 'root'
const password = process.env.VPS_PASSWORD
// key | password. Defaults to key when no password is present, which is the
// case on the workstation this is normally run from. See lib/ssh-transport.mjs.
const auth = process.env.VPS_AUTH
const identityFile = process.env.VPS_SSH_KEY
const remoteDir = process.env.VPS_REMOTE_DIR || '/opt/mrright-portfolio'
const serviceName = process.env.VPS_SERVICE || 'mrright-portfolio'
const domain = process.env.VPS_DOMAIN || 'mrright.blog'
const envFile = process.env.VPS_ENV_FILE || `/etc/${serviceName}.env`
// Where the unit listens, as seen from the VPS itself. nginx proxies to it.
const appOrigin = process.env.VPS_APP_ORIGIN || 'http://127.0.0.1:4173'
const archivePath = path.resolve('.deploy-tools', 'portfolio.tar.gz')
// Prints the exact script that would run on the VPS and exits without
// connecting or packaging anything. The remote half is the part that is hard to
// inspect once a deploy is under way, so it is worth being able to read it
// first; scripts/verify-deploy-script.mjs syntax-checks the same output.
const dryRun = process.env.VPS_DRY_RUN === 'true'
// The generated nginx config below is HTTP-only (listen 80; TLS is terminated
// upstream). Overwriting an existing config would therefore discard whatever a
// certbot run — or any manual hardening — added to it, and the site would lose
// HTTPS until someone restored the backup by hand. Same reasoning for the
// systemd unit: an operator may have added Environment=, hardening directives,
// or a different ExecStart. Both files are now written only when absent, unless
// the caller explicitly opts in to a rewrite for this one deploy.
const rewriteNginx = process.env.VPS_REWRITE_NGINX === 'true'
const rewriteService = process.env.VPS_REWRITE_SERVICE === 'true'
// Every deploy used to leave behind a full copy of $REMOTE_DIR. Most of that
// copy is public/uploads (252M of the 351M as of 2026-08-11), which is byte for
// byte identical across deploys, so fifteen rollback points cost fifteen copies
// of the same uploads and filled the disk to 78%. The backup is now built with
// hardlinks, which makes an unchanged file cost one directory entry instead of
// its size, and old backups past VPS_BACKUP_RETAIN are pruned once the deploy
// has proven healthy. Set VPS_BACKUP_RETAIN=0 to keep every backup forever
// (the pre-2026-08-12 behaviour, minus the duplicated bytes).
const backupRetainRaw = process.env.VPS_BACKUP_RETAIN
const backupRetain = backupRetainRaw === undefined ? 3 : Number(backupRetainRaw)

if (!Number.isInteger(backupRetain) || backupRetain < 0) {
  throw new Error('VPS_BACKUP_RETAIN must be a non-negative integer (0 disables pruning).')
}

const remoteArchivePath = `/tmp/${serviceName}.tar.gz`
const remoteScriptPath = `/tmp/${serviceName}-deploy.sh`
const remoteScript = buildRemoteScript({
  remoteDir,
  envFile,
  serviceName,
  domain,
  archivePath: remoteArchivePath,
  backupRetain,
  appOrigin,
  rewriteNginx,
  rewriteService,
})

if (dryRun) {
  console.log(`# VPS_DRY_RUN: script that would run on ${username}@${host}:${port}`)
  console.log(remoteScript)
  process.exit(0)
}

await assertNoUploadsInBuild(process.cwd())
await mkdir(path.dirname(archivePath), { recursive: true })
await rm(archivePath, { force: true })
await execFileAsync('tar', ['-czf', archivePath, ...archiveItems])
const archive = await stat(archivePath)
console.log(`Packaged ${archivePath} (${(archive.size / 1024 / 1024).toFixed(2)} MB)`)

const localScriptPath = path.resolve('.deploy-tools', `${serviceName}-deploy.sh`)
await writeFile(localScriptPath, `${remoteScript}\n`, { mode: 0o700 })

const transport = await createTransport({ auth, host, port, username, password, identityFile })
console.log(`Connected: ${transport.describe()}`)

try {
  await transport.run(`mkdir -p ${shellQuote(remoteDir)}`)
  await transport.upload(archivePath, remoteArchivePath)
  console.log(`Uploaded release to ${remoteArchivePath}`)
  // The script is uploaded and then executed from a file, rather than piped
  // into `bash -s`, for two reasons: a piped script occupies the remote stdin,
  // so any command inside it that reads stdin swallows the rest of the script;
  // and a file leaves something to look at on the server when a deploy fails
  // halfway. </dev/null for the same reason -- nothing in here should be
  // waiting on input.
  await transport.upload(localScriptPath, remoteScriptPath)
  // Streamed: npm ci and the health poll take long enough that a silent deploy
  // is indistinguishable from a hung one.
  await transport.run(`bash ${shellQuote(remoteScriptPath)} < /dev/null`, { stream: true })
  const health = await transport.run(
    `curl -fsS -m 15 --noproxy "*" ${shellQuote(`${appOrigin}/api/health`)}`,
  )
  console.log(health.stdout.trim())
} finally {
  transport.end()
}
