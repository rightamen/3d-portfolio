import { createReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

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
const archivePath = path.resolve('.deploy-tools', 'portfolio.tar.gz')

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
      'if [ -e "$REMOTE_DIR" ]; then',
      '  APP_BACKUP="$REMOTE_DIR.backup-$(date +%Y%m%d-%H%M%S)"',
      '  cp -a "$REMOTE_DIR" "$APP_BACKUP"',
      '  echo "Backed up app to $APP_BACKUP"',
      'fi',
      'mkdir -p "$REMOTE_DIR"',
      'rm -rf "$REMOTE_DIR/dist" "$REMOTE_DIR/server" "$REMOTE_DIR/scripts"',
      'tar -xzf "$ARCHIVE" -C "$REMOTE_DIR"',
      'if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then apt-get update && apt-get install -y nodejs npm; fi',
      'if ! command -v nginx >/dev/null 2>&1; then apt-get update && apt-get install -y nginx; fi',
      'cd "$REMOTE_DIR" && npm ci --omit=dev',
      'SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"',
      'if [ -f "$SERVICE_FILE" ]; then cp -a "$SERVICE_FILE" "$SERVICE_FILE.backup-$(date +%Y%m%d-%H%M%S)"; fi',
      'cat > "$SERVICE_FILE" <<SERVICE',
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
      'NGINX_FILE="/etc/nginx/sites-available/$SERVICE_NAME"',
      'if [ -f "$NGINX_FILE" ]; then cp -a "$NGINX_FILE" "$NGINX_FILE.backup-$(date +%Y%m%d-%H%M%S)"; fi',
      'cat > "$NGINX_FILE" <<NGINX',
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
      'ln -sf "$NGINX_FILE" "/etc/nginx/sites-enabled/$SERVICE_NAME"',
      'nginx -t',
      'systemctl daemon-reload',
      'systemctl enable "$SERVICE_NAME"',
      'systemctl restart "$SERVICE_NAME"',
      'systemctl enable nginx',
      'systemctl restart nginx',
      'curl -fsS http://127.0.0.1:4173/api/health',
      'TOKEN="$(awk -F= \'$1 == "ADMIN_TOKEN" { print substr($0, index($0, $2)) }\' "$ENV_FILE")"',
      'curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4173/api/admin/summary >/dev/null',
      'echo "Admin summary check passed."',
      'systemctl --no-pager --full status "$SERVICE_NAME"',
    ].join('\n'),
  )
  const health = await run(connection, 'curl -fsS http://127.0.0.1:4173/api/health')
  console.log(health.stdout.trim())
} finally {
  connection.end()
}
