import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const archivePath = path.resolve('.deploy-tools', 'mrright-portfolio-release.tar.gz')
const archiveItems = ['dist', 'server', 'scripts', 'package.json', 'package-lock.json']

await mkdir(path.dirname(archivePath), { recursive: true })
await rm(archivePath, { force: true })
await execFileAsync('tar', ['-czf', archivePath, ...archiveItems])

const archive = await stat(archivePath)
const sizeMb = (archive.size / 1024 / 1024).toFixed(2)

console.log(`Created ${archivePath} (${sizeMb} MB)`)
console.log('Upload this file to /tmp/mrright-portfolio-release.tar.gz on the VPS, then run:')
console.log(`
set -euo pipefail
APP_DIR=/opt/mrright-portfolio
SERVICE=mrright-portfolio
ARCHIVE=/tmp/mrright-portfolio-release.tar.gz

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/dist" "$APP_DIR/server" "$APP_DIR/scripts"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
npm ci --omit=dev
systemctl restart "$SERVICE"
sleep 3
curl -fsS http://127.0.0.1:4173/api/health
printf '\\n'
systemctl --no-pager --full status "$SERVICE"
`)
