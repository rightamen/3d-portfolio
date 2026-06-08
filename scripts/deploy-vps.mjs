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
  await run(connection, `mkdir -p ${remoteDir}`)
  await upload(connection, archivePath, `/tmp/${serviceName}.tar.gz`)
  await run(
    connection,
    [
      `rm -rf ${remoteDir}/dist ${remoteDir}/server`,
      `mkdir -p ${remoteDir}`,
      `tar -xzf /tmp/${serviceName}.tar.gz -C ${remoteDir}`,
      'if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then apt-get update && apt-get install -y nodejs npm; fi',
      'if ! command -v nginx >/dev/null 2>&1; then apt-get update && apt-get install -y nginx; fi',
      `cd ${remoteDir} && npm ci --omit=dev`,
      `cat > /etc/systemd/system/${serviceName}.service <<'SERVICE'`,
      '[Unit]',
      'Description=mrright.blog portfolio',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      `WorkingDirectory=${remoteDir}`,
      'Environment=NODE_ENV=production',
      'Environment=PORT=4173',
      'ExecStart=/usr/bin/npm run start',
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SERVICE',
      `cat > /etc/nginx/sites-available/${serviceName} <<'NGINX'`,
      'server {',
      '    listen 80;',
      `    server_name ${domain} www.${domain};`,
      '',
      '    client_max_body_size 130m;',
      '',
      '    location / {',
      '        proxy_pass http://127.0.0.1:4173;',
      '        proxy_http_version 1.1;',
      '        proxy_set_header Host $host;',
      '        proxy_set_header X-Real-IP $remote_addr;',
      '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '        proxy_set_header X-Forwarded-Proto $scheme;',
      '    }',
      '}',
      'NGINX',
      `ln -sf /etc/nginx/sites-available/${serviceName} /etc/nginx/sites-enabled/${serviceName}`,
      'nginx -t',
      'systemctl daemon-reload',
      `systemctl enable ${serviceName}`,
      `systemctl restart ${serviceName}`,
      'systemctl enable nginx',
      'systemctl restart nginx',
      `systemctl --no-pager --full status ${serviceName}`,
    ].join('\n'),
  )
  const health = await run(connection, 'curl -fsS http://127.0.0.1:4173/api/health')
  console.log(health.stdout.trim())
} finally {
  connection.end()
}
