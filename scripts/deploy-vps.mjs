import { createReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

import {
  ADMIN_SESSION_CHECK,
  BACKUP_AND_EXTRACT,
  PRUNE_FUNCTION,
  WAIT_FOR_HEALTH,
} from './lib/deploy-backup-script.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('ssh2')
const execFileAsync = promisify(execFile)

const host = process.env.VPS_HOST
const port = Number(process.env.VPS_PORT || 22)
const username = process.env.VPS_USER || 'root'
const password = process.env.VPS_PASSWORD
const remoteDir = process.env.VPS_REMOTE_DIR || '/opt/mrright-portfolio'
const serviceName = process.env.VPS_SERVICE || 'mrright-portfolio'
const domain = process.env.VPS_DOMAIN || 'mrright.blog'
const envFile = process.env.VPS_ENV_FILE || `/etc/${serviceName}.env`
// Where the unit listens, as seen from the VPS itself. nginx proxies to it.
const appOrigin = process.env.VPS_APP_ORIGIN || 'http://127.0.0.1:4173'
const archivePath = path.resolve('.deploy-tools', 'portfolio.tar.gz')
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

if (!host || !password) {
  throw new Error('VPS_HOST and VPS_PASSWORD are required.')
}

await mkdir(path.dirname(archivePath), { recursive: true })
await rm(archivePath, { force: true })
await execFileAsync('tar', [
  '-czf',
  archivePath,
  'dist',
  'server',
  'scripts',
  'package.json',
  'package-lock.json',
])
await stat(archivePath)

const run = (connection, command) =>
  new Promise((resolve, reject) => {
    connection.exec(command, (error, stream) => {
      if (error) {
        reject(error)
        return
      }

      let stdout = ''
      let stderr = ''
      stream.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      stream.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      stream.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }
        reject(new Error(`Command failed (${code}): ${command}\n${stderr || stdout}`))
      })
    })
  })

const upload = (connection, localPath, remotePath) =>
  new Promise((resolve, reject) => {
    connection.sftp((error, sftp) => {
      if (error) {
        reject(error)
        return
      }

      const readStream = createReadStream(localPath)
      const writeStream = sftp.createWriteStream(remotePath)
      writeStream.on('close', resolve)
      writeStream.on('error', reject)
      readStream.on('error', reject)
      readStream.pipe(writeStream)
    })
  })

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const connection = new Client()

await new Promise((resolve, reject) => {
  connection
    .on('ready', resolve)
    .on('keyboard-interactive', (_name, _instructions, _language, _prompts, finish) => {
      finish([password])
    })
    .on('error', reject)
    .connect({
      host,
      port,
      username,
      password,
      tryKeyboard: true,
      readyTimeout: 20000,
    })
})

try {
  const quotedRemoteDir = shellQuote(remoteDir)
  const quotedEnvFile = shellQuote(envFile)
  const quotedServiceName = shellQuote(serviceName)
  const quotedDomain = shellQuote(domain)
  const remoteArchivePath = `/tmp/${serviceName}.tar.gz`
  const quotedRemoteArchivePath = shellQuote(remoteArchivePath)

  await run(connection, `mkdir -p ${quotedRemoteDir}`)
  await upload(connection, archivePath, remoteArchivePath)
  await run(
    connection,
    [
      'set -euo pipefail',
      `REMOTE_DIR=${quotedRemoteDir}`,
      `ENV_FILE=${quotedEnvFile}`,
      `SERVICE_NAME=${quotedServiceName}`,
      `DOMAIN=${quotedDomain}`,
      `ARCHIVE=${quotedRemoteArchivePath}`,
      `BACKUP_RETAIN=${backupRetain}`,
      `APP_ORIGIN=${shellQuote(appOrigin)}`,
      'HEALTH_URL="$APP_ORIGIN/api/health"',
      PRUNE_FUNCTION,
      'if [ ! -f "$ENV_FILE" ]; then',
      '  echo "Missing $ENV_FILE. Create it manually before deploying." >&2',
      '  echo "Required keys: DATABASE_URL ADMIN_TOKEN" >&2',
      '  echo "Optional mail keys: SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_STARTTLS" >&2',
      '  exit 1',
      'fi',
      'missing_required=""',
      'for key in DATABASE_URL ADMIN_TOKEN; do',
      '  if ! awk -F= -v key="$key" \'$1 == key && length($0) > length(key) + 1 { found = 1 } END { exit found ? 0 : 1 }\' "$ENV_FILE"; then',
      '    missing_required="$missing_required $key"',
      '  fi',
      'done',
      'if [ -n "$missing_required" ]; then',
      '  echo "Missing required env key(s):$missing_required" >&2',
      '  echo "Edit $ENV_FILE manually; deployment will not rewrite it." >&2',
      '  exit 1',
      'fi',
      'missing_optional=""',
      'for key in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_STARTTLS; do',
      '  if ! awk -F= -v key="$key" \'$1 == key { found = 1 } END { exit found ? 0 : 1 }\' "$ENV_FILE"; then',
      '    missing_optional="$missing_optional $key"',
      '  fi',
      'done',
      'if [ -n "$missing_optional" ]; then',
      '  echo "Optional SMTP env key(s) not present:$missing_optional"',
      '  echo "Email verification will use manual mode until mail settings are added."',
      'fi',
      'ENV_BACKUP="$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"',
      'cp -a "$ENV_FILE" "$ENV_BACKUP"',
      'chmod 600 "$ENV_FILE" "$ENV_BACKUP"',
      'echo "Backed up env to $ENV_BACKUP"',
      BACKUP_AND_EXTRACT,
      'if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then apt-get update && apt-get install -y nodejs npm; fi',
      'if ! command -v nginx >/dev/null 2>&1; then apt-get update && apt-get install -y nginx; fi',
      'cd "$REMOTE_DIR" && npm ci --omit=dev',
      'SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"',
      `REWRITE_SERVICE=${rewriteService ? 'true' : 'false'}`,
      'if [ -f "$SERVICE_FILE" ] && [ "$REWRITE_SERVICE" != "true" ]; then',
      '  echo "Keeping existing $SERVICE_FILE (set VPS_REWRITE_SERVICE=true to regenerate)."',
      'else',
      '  if [ -f "$SERVICE_FILE" ]; then',
      '    cp -a "$SERVICE_FILE" "$SERVICE_FILE.backup-$(date +%Y%m%d-%H%M%S)"',
      '    echo "Rewriting $SERVICE_FILE (backup taken)."',
      '  fi',
      '  cat > "$SERVICE_FILE" <<SERVICE',
      '[Unit]',
      'Description=mrright.blog portfolio',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory=$REMOTE_DIR',
      'EnvironmentFile=$ENV_FILE',
      'ExecStart=/usr/bin/npm run start',
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SERVICE',
      'fi',
      'NGINX_FILE="/etc/nginx/sites-available/$SERVICE_NAME"',
      `REWRITE_NGINX=${rewriteNginx ? 'true' : 'false'}`,
      'if [ -f "$NGINX_FILE" ] && [ "$REWRITE_NGINX" != "true" ]; then',
      '  echo "Keeping existing $NGINX_FILE (set VPS_REWRITE_NGINX=true to regenerate)."',
      '  echo "Note: the generated template is HTTP-only; an existing TLS config is preserved."',
      'else',
      '  if [ -f "$NGINX_FILE" ]; then',
      '    cp -a "$NGINX_FILE" "$NGINX_FILE.backup-$(date +%Y%m%d-%H%M%S)"',
      '    echo "Rewriting $NGINX_FILE (backup taken). TLS settings in the old file are NOT carried over."',
      '  fi',
      '  cat > "$NGINX_FILE" <<NGINX',
      'server {',
      '    listen 80;',
      '    server_name $DOMAIN www.$DOMAIN;',
      '',
      '    client_max_body_size 130m;',
      '',
      '    location / {',
      '        proxy_pass http://127.0.0.1:4173;',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Host \\$host;',
      '        proxy_set_header X-Real-IP \\$remote_addr;',
      '        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;',
      '        proxy_set_header X-Forwarded-Proto \\$scheme;',
      '    }',
      '}',
      'NGINX',
      'fi',
      'ln -sf "$NGINX_FILE" "/etc/nginx/sites-enabled/$SERVICE_NAME"',
      'nginx -t',
      'systemctl daemon-reload',
      'systemctl enable "$SERVICE_NAME"',
      'systemctl restart "$SERVICE_NAME"',
      'systemctl enable nginx',
      // reload keeps existing connections; fall back to restart if the running
      // config cannot be reloaded in place.
      'systemctl reload nginx || systemctl restart nginx',
      WAIT_FOR_HEALTH,
      ADMIN_SESSION_CHECK,
      // Only now that the new release is serving traffic. Env backups are
      // deliberately left alone: they are ~1KB each so they are not what fills
      // the disk, and they are the only way back if $ENV_FILE is ever damaged.
      'prune_app_backups',
      'df -h "$REMOTE_DIR" | tail -n 1',
      'systemctl --no-pager --full status "$SERVICE_NAME"',
    ].join('\n'),
  )
  const health = await run(connection, `curl -fsS ${shellQuote(`${appOrigin}/api/health`)}`)
  console.log(health.stdout.trim())
} finally {
  connection.end()
}
