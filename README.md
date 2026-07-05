# mrright.blog 3D Portfolio

A full-stack personal portfolio for Right, built with React, Vite, Tailwind CSS,
React Three Fiber, and a small Node/Express API.

## Features

- 3D hero scene with a responsive astronaut model and parallax background
- API-powered profile, projects, experience, and skills content
- Project, experience, about, contact, and footer sections
- Contact form endpoint that writes messages to `data/messages.jsonl`
- Production server that serves the Vite `dist` build and `/api/*`
- VPS deployment helper for systemd-based Linux servers

## Local Development

Requires Node.js 22.12+ and npm 10.5+.

```bash
npm install
npm run dev:full
```

The frontend runs on `http://localhost:5173`; Vite proxies `/api` to the
Express server on `http://localhost:4173`.

## Production Build

Build with Node.js 22.12+ and npm 10.5+.

```bash
npm run build
npm run start
```

The production server listens on `PORT` or `4173`.

## VPS Deploy

Build locally, upload a release archive, and let the VPS run only production
dependencies. The server must use Node.js 22.12+.

The deployment must never recreate or overwrite `/etc/mrright-portfolio.env`.
Before every release, back up that file and verify the required keys exist:

```text
DATABASE_URL
ADMIN_TOKEN
```

Optional mail keys may be added manually when email delivery is needed:

```text
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
SMTP_STARTTLS
```

Do not commit, paste into docs, or log real passwords, tokens, or database URLs.

### Option A: Build locally, upload manually

Use this as the normal production path. Build the release archive on your local
machine, upload it over SSH/SFTP, install production dependencies on the VPS,
then restart the systemd service.

On your local machine:

```bash
npm install
npm run release:vps
```

Upload `.deploy-tools/mrright-portfolio-release.tar.gz` to this VPS path:

```text
/tmp/mrright-portfolio-release.tar.gz
```

Then run this on the VPS in FinalShell:

```bash
cat > /tmp/apply-mrright-release.sh <<'EOF_SCRIPT'
set -euo pipefail

APP_DIR=/opt/mrright-portfolio
SERVICE=mrright-portfolio
ARCHIVE=/tmp/mrright-portfolio-release.tar.gz
ENV_FILE=/etc/mrright-portfolio.env

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it manually before deploying." >&2
  echo "Required keys: DATABASE_URL ADMIN_TOKEN" >&2
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

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/dist" "$APP_DIR/server" "$APP_DIR/scripts"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"

npm ci --omit=dev

systemctl restart "$SERVICE"
sleep 3

curl -fsS http://127.0.0.1:4173/api/health
printf '\n'
TOKEN="$(awk -F= '$1 == "ADMIN_TOKEN" { print substr($0, index($0, $2)) }' "$ENV_FILE")"
curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4173/api/admin/summary >/dev/null
echo "Admin summary check passed."
curl -fsS -o /dev/null -w 'home_status=%{http_code}\n' 'http://127.0.0.1:4173/'
curl -fsS -o /dev/null -w 'login_status=%{http_code}\n' 'http://127.0.0.1:4173/login?mode=login'
curl -fsS -o /dev/null -w 'account_status=%{http_code}\n' 'http://127.0.0.1:4173/account'
systemctl --no-pager --full status "$SERVICE"
EOF_SCRIPT

bash /tmp/apply-mrright-release.sh
```

### Option B: Automated upload helper

`npm run deploy:vps` can upload and apply a release, but it is intentionally
conservative:

- It fails if `/etc/mrright-portfolio.env` is missing.
- It fails if `DATABASE_URL` or `ADMIN_TOKEN` is missing or empty.
- It backs up `/etc/mrright-portfolio.env` before deployment.
- It does not write or rewrite secret env values.
- It checks both `/api/health` and `/api/admin/summary` after restart.

Only pass deployment credentials through your local shell session. Never commit
them to the repository.

```bash
VPS_HOST=147.79.20.232 \
VPS_PORT=22 \
VPS_USER=root \
VPS_REMOTE_DIR=/opt/mrright-portfolio \
VPS_SERVICE=mrright-portfolio \
VPS_DOMAIN=mrright.blog \
VPS_ENV_FILE=/etc/mrright-portfolio.env \
npm run deploy:vps
```

### Option C: Update an existing Git checkout on the VPS

Use this only when the VPS has enough memory to run `npm run build` itself and
already contains a Git checkout at `/opt/mrright-portfolio`. Replace `BRANCH`
with the branch you want to deploy. Because frontend assets are generated into
`dist`, always rebuild on the VPS after pulling code changes; restarting the
service alone is not enough for React/Vite changes.

```bash
cat > /tmp/update-mrright-portfolio.sh <<'EOF_SCRIPT'
set -euo pipefail

APP_DIR=/opt/mrright-portfolio
BRANCH=work
SERVICE=mrright-portfolio
ENV_FILE=/etc/mrright-portfolio.env

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it manually before deploying." >&2
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

ENV_BACKUP="$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"
cp -a "$ENV_FILE" "$ENV_BACKUP"
chmod 600 "$ENV_FILE" "$ENV_BACKUP"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npm run build
npm prune --omit=dev

systemctl restart "$SERVICE"
sleep 3

curl -fsS http://127.0.0.1:4173/api/health
printf '\n'
TOKEN="$(awk -F= '$1 == "ADMIN_TOKEN" { print substr($0, index($0, $2)) }' "$ENV_FILE")"
curl -fsS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4173/api/admin/summary >/dev/null
echo "Admin summary check passed."
curl -fsS -o /dev/null -w 'login_status=%{http_code}\n' 'http://127.0.0.1:4173/login?mode=login'
curl -fsS -o /dev/null -w 'register_status=%{http_code}\n' 'http://127.0.0.1:4173/login?mode=register'
curl -fsS -o /dev/null -w 'account_status=%{http_code}\n' 'http://127.0.0.1:4173/account'
systemctl --no-pager --full status "$SERVICE"
EOF_SCRIPT

bash /tmp/update-mrright-portfolio.sh
```

If the service fails after the restart, inspect logs with:

```bash
journalctl -u mrright-portfolio -n 120 --no-pager
```

## Cloudflare DNS

For `mrright.blog`, point:

- `mrright.blog` A record to the VPS IPv4 address
- `www.mrright.blog` CNAME to `mrright.blog`

After the VPS service is running behind port 80/443, keep Cloudflare proxy
enabled for the root and `www` records.
