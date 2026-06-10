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

```bash
npm install
npm run dev:full
```

The frontend runs on `http://localhost:5173`; Vite proxies `/api` to the
Express server on `http://localhost:4173`.

## Production Build

```bash
npm run build
npm run start
```

The production server listens on `PORT` or `4173`.

## VPS Deploy

There are two supported ways to update the VPS.

### Option A: Upload a locally built release

Use this when deploying from your local machine. The script builds the frontend,
uploads `dist`, `server`, and production package files to the VPS, installs
production dependencies, writes the systemd/nginx config, restarts the service,
and checks `/api/health`.

Set these environment variables before deployment:

```bash
VPS_HOST=147.79.20.232
VPS_PORT=22
VPS_USER=root
VPS_PASSWORD=your-root-password
```

Then run:

```bash
npm run deploy:vps
```

Optional variables:

```bash
VPS_REMOTE_DIR=/opt/mrright-portfolio
VPS_SERVICE=mrright-portfolio
VPS_DOMAIN=mrright.blog
```

### Option B: Build locally, upload manually with FinalShell

Use this when the VPS is too small to run `npm run build` reliably. Build the
release archive on your local machine, upload it with FinalShell, and only run
`npm ci --omit=dev` plus a service restart on the VPS.

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

mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/dist" "$APP_DIR/server" "$APP_DIR/scripts"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"

npm ci --omit=dev

systemctl restart "$SERVICE"
sleep 3

curl -fsS http://127.0.0.1:4173/api/health
printf '\n'
curl -fsS -o /dev/null -w 'home_status=%{http_code}\n' 'http://127.0.0.1:4173/'
curl -fsS -o /dev/null -w 'login_status=%{http_code}\n' 'http://127.0.0.1:4173/login?mode=login'
curl -fsS -o /dev/null -w 'account_status=%{http_code}\n' 'http://127.0.0.1:4173/account'
systemctl --no-pager --full status "$SERVICE"
EOF_SCRIPT

bash /tmp/apply-mrright-release.sh
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
