// The remote half of a deploy: the shell script that runs on the VPS.
//
// This used to be built inline inside deploy-vps.mjs, which was fine while there
// was exactly one way to reach the VPS. There are now two transports (ssh2 with
// a password, and the openssh client with a key), and the one thing that must
// not differ between them is *what gets executed on the server*. Building the
// script here, once, is what makes "the key path does the same thing as the
// password path" a property of the code rather than a promise in a document.
//
// It also makes the script checkable without a server: scripts/verify-deploy-
// script.mjs runs `bash -n` over the output of this builder, so a syntax error
// is caught before a deploy is halfway through restarting the service.
//
// The backup/health/admin fragments still live in ./deploy-backup-script.mjs --
// they are the part that is exercised against a real filesystem by
// scripts/verify-deploy-backup.mjs, and they stay importable for that reason.

import {
  ADMIN_SESSION_CHECK,
  BACKUP_AND_EXTRACT,
  PRUNE_FUNCTION,
  WAIT_FOR_HEALTH,
} from './deploy-backup-script.mjs'

export const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

/**
 * Builds the script sent to the VPS. Every value that comes from the
 * environment is single-quoted, so a path with a space or a quote in it cannot
 * change the shape of the script.
 *
 * Nothing secret is interpolated: the admin token is read from $ENV_FILE on the
 * server, never carried in the script text. That is deliberate -- the script is
 * printed verbatim by VPS_DRY_RUN=true and by the failure paths.
 */
export const buildRemoteScript = ({
  remoteDir,
  envFile,
  serviceName,
  domain,
  archivePath,
  backupRetain,
  appOrigin,
  rewriteNginx = false,
  rewriteService = false,
}) =>
  [
    'set -euo pipefail',
    `REMOTE_DIR=${shellQuote(remoteDir)}`,
    `ENV_FILE=${shellQuote(envFile)}`,
    `SERVICE_NAME=${shellQuote(serviceName)}`,
    `DOMAIN=${shellQuote(domain)}`,
    `ARCHIVE=${shellQuote(archivePath)}`,
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
  ].join('\n')
