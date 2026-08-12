import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// The same shell deploy-vps.mjs sends. This script prints instructions for an
// operator to run by hand, and until now it carried its own copy of those steps
// -- which had already drifted: still a full-copy backup, no pruning, `sleep 3`
// instead of waiting for the service, and the static admin token. Sharing the
// fragments is what stops the two from diverging again.
import {
  ADMIN_SESSION_CHECK,
  BACKUP_AND_EXTRACT,
  PRUNE_FUNCTION,
  WAIT_FOR_HEALTH,
} from './lib/deploy-backup-script.mjs'

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
REMOTE_DIR=/opt/mrright-portfolio
SERVICE_NAME=mrright-portfolio
ARCHIVE=/tmp/mrright-portfolio-release.tar.gz
ENV_FILE=/etc/mrright-portfolio.env
BACKUP_RETAIN=3
APP_ORIGIN=http://127.0.0.1:4173
HEALTH_URL="$APP_ORIGIN/api/health"

${PRUNE_FUNCTION}

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

${BACKUP_AND_EXTRACT}
cd "$REMOTE_DIR"
npm ci --omit=dev
systemctl restart "$SERVICE_NAME"

${WAIT_FOR_HEALTH}

${ADMIN_SESSION_CHECK}

prune_app_backups
df -h "$REMOTE_DIR" | tail -n 1
systemctl --no-pager --full status "$SERVICE_NAME"
`)
