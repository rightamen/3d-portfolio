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
ENV_FILE=/etc/mrright-portfolio.env

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it manually before deploying." >&2
  echo "Required keys: DATABASE_URL ADMIN_TOKEN" >&2
  echo "Optional mail keys: SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_STARTTLS" >&2
  exit 1
fi

missing_required=""
for key in DATABASE_URL ADMIN_TOKEN; do
  if ! awk -F= -v key="$key" '$1 == key && length($0) > length(key) + 1 { found = 1 } END { exit found ? 0 : 1 }' "$ENV_FILE"; then
    missing_required="$missing_required $key"
  fi
done

if [ -n "$missing_required" ]; then
  echo "Missing required env key(s):$missing_required" >&2
  echo "Edit $ENV_FILE manually; deployment will not rewrite it." >&2
  exit 1
fi

missing_optional=""
for key in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_STARTTLS; do
  if ! awk -F= -v key="$key" '$1 == key { found = 1 } END { exit found ? 0 : 1 }' "$ENV_FILE"; then
    missing_optional="$missing_optional $key"
  fi
done

if [ -n "$missing_optional" ]; then
  echo "Optional SMTP env key(s) not present:$missing_optional"
  echo "Email verification will use manual mode until mail settings are added."
fi

ENV_BACKUP="$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp -a "$ENV_FILE" "$ENV_BACKUP"
chmod 600 "$ENV_FILE" "$ENV_BACKUP"
echo "Backed up env to $ENV_BACKUP"

if [ -e "$APP_DIR" ]; then
  APP_BACKUP="$APP_DIR.backup-$(date +%Y%m%d-%H%M%S)"
  cp -a "$APP_DIR" "$APP_BACKUP"
  echo "Backed up app to $APP_BACKUP"
fi

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/dist" "$APP_DIR/server" "$APP_DIR/scripts"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"
npm ci --omit=dev
systemctl restart "$SERVICE"
sleep 3
curl -fsS http://127.0.0.1:4173/api/health
printf '\\n'
TOKEN="$(awk -F= '$1 == "ADMIN_TOKEN" { print substr($0, index($0, $2)) }' "$ENV_FILE")"
curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4173/api/admin/summary >/dev/null
echo "Admin summary check passed."
systemctl --no-pager --full status "$SERVICE"
`)
