// Shell fragments for the deploy-time application backup.
//
// These live in their own module for one reason: they are the only part of the
// remote deploy script that both deletes things and depends on filesystem
// semantics (hardlink sharing, tar's overwrite mode) that cannot be reasoned
// about from reading alone. Keeping them importable lets
// tests/scripts/deploy-backup.spec.mjs run the exact same text under a real
// bash against a scratch directory, instead of testing a transcription of it
// that can silently drift from what deploy-vps.mjs actually sends.
//
// Both fragments expect these variables to already be set by the caller:
//   REMOTE_DIR      application directory, e.g. /opt/mrright-portfolio
//   ARCHIVE         release tarball to extract (BACKUP_AND_EXTRACT only)
//   BACKUP_RETAIN   how many timestamped app backups to keep; 0 disables pruning

// `systemctl restart` returns as soon as the unit is started, not when the
// server is accepting connections -- node takes about two seconds to get to
// listen(). The deploy used to curl immediately after the restart and abort the
// whole script on the connection refused that follows, which is exactly what
// happened on 2026-08-12: the release was fine, the service was healthy a second
// later, and the deploy still failed with the site reporting itself down.
//
// Polling closes that window without hiding a real failure: a service that never
// comes up still fails the deploy, and the journal tail goes to stderr so the
// operator sees why rather than just a curl exit code.
//
// Expects: HEALTH_URL, SERVICE_NAME.
export const WAIT_FOR_HEALTH = [
  'HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"',
  'attempt=1',
  'while true; do',
  // --noproxy because $HEALTH_URL is loopback: a proxy has no business in this
  // request, and an http_proxy in root's environment would otherwise turn the
  // health check into a confusing 502 against a service that is perfectly fine.
  '  if curl -fsS -m 5 --noproxy "*" "$HEALTH_URL" >/dev/null 2>&1; then',
  '    echo "Health check passed after $attempt attempt(s)."',
  '    break',
  '  fi',
  '  if [ "$attempt" -ge "$HEALTH_ATTEMPTS" ]; then',
  '    echo "Service did not answer $HEALTH_URL after $attempt attempt(s)." >&2',
  '    journalctl -u "$SERVICE_NAME" -n 40 --no-pager >&2 2>/dev/null || true',
  '    exit 1',
  '  fi',
  '  attempt=$((attempt + 1))',
  '  sleep 1',
  'done',
].join('\n')

// The deploy's admin check used to call /api/admin/summary with the static
// ADMIN_TOKEN straight from the env file. That is the one remaining thing
// keeping ADMIN_ALLOW_STATIC_TOKEN at true: docs/OPERATIONS_ADMIN_AUTH.md names
// this script as the blocker for step 2 of the tightening path.
//
// It now exchanges the static token for a short-lived session and calls the API
// with that instead. POST /api/admin/session deliberately does not go through
// requireAdmin (server/index.js), so this keeps working once direct static-token
// API access is switched off -- which is the whole point.
//
// The session is always revoked, including when the summary check fails. A
// deploy has no business leaving a 12-hour admin session behind it, and the
// failure path is exactly when one would go unnoticed.
//
// Expects: APP_ORIGIN, ENV_FILE.
export const ADMIN_SESSION_CHECK = [
  'STATIC_TOKEN="$(awk -F= \'$1 == "ADMIN_TOKEN" { print substr($0, index($0, $2)) }\' "$ENV_FILE")"',
  'if [ -z "$STATIC_TOKEN" ]; then',
  '  echo "ADMIN_TOKEN is empty in $ENV_FILE." >&2',
  '  exit 1',
  'fi',
  // node rather than grep/sed: the token is base64url, and hand-rolling a
  // matcher for it inside a JSON envelope is how you get a check that passes on
  // a truncated response. node is guaranteed here -- the service runs on it.
  'ADMIN_SESSION="$(curl -fsS -m 15 --noproxy "*" -X POST -H "Authorization: Bearer $STATIC_TOKEN" "$APP_ORIGIN/api/admin/session" 2>/dev/null | node -e \'let s="";process.stdin.on("data",d=>{s+=d}).on("end",()=>{try{const t=JSON.parse(s)?.data?.session?.token;if(t)process.stdout.write(t)}catch{}})\' || true)"',
  'if [ -z "$ADMIN_SESSION" ]; then',
  '  echo "Could not exchange ADMIN_TOKEN for an admin session at $APP_ORIGIN." >&2',
  '  exit 1',
  'fi',
  'if curl -fsS -m 15 --noproxy "*" -H "Authorization: Bearer $ADMIN_SESSION" "$APP_ORIGIN/api/admin/summary" >/dev/null 2>&1; then',
  '  ADMIN_CHECK_OK=1',
  'else',
  '  ADMIN_CHECK_OK=0',
  'fi',
  'curl -fsS -m 15 --noproxy "*" -X DELETE -H "Authorization: Bearer $ADMIN_SESSION" "$APP_ORIGIN/api/admin/session" >/dev/null 2>&1 || echo "Warning: could not revoke the deploy admin session." >&2',
  'if [ "$ADMIN_CHECK_OK" != "1" ]; then',
  '  echo "Admin summary check failed." >&2',
  '  exit 1',
  'fi',
  'echo "Admin summary check passed (short-lived session, revoked)."',
].join('\n')

// Matches only the exact suffix writeAppBackup produces, so a hand-named
// directory parked next to $REMOTE_DIR is never a deletion candidate. The
// timestamp format sorts lexically, so plain `sort` is chronological.
export const PRUNE_FUNCTION = [
  'prune_app_backups() {',
  '  if [ "$BACKUP_RETAIN" -lt 1 ]; then',
  '    echo "Backup pruning disabled (VPS_BACKUP_RETAIN=0); keeping every backup."',
  '    return 0',
  '  fi',
  '  STAMP="[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]"',
  '  FOUND="$(ls -1d "$REMOTE_DIR".backup-$STAMP 2>/dev/null | sort || true)"',
  '  if [ -z "$FOUND" ]; then return 0; fi',
  '  TOTAL="$(printf \'%s\\n\' "$FOUND" | wc -l)"',
  '  if [ "$TOTAL" -le "$BACKUP_RETAIN" ]; then',
  '    echo "Keeping all $TOTAL app backup(s) (retain=$BACKUP_RETAIN)."',
  '    return 0',
  '  fi',
  '  DROP="$((TOTAL - BACKUP_RETAIN))"',
  '  printf \'%s\\n\' "$FOUND" | head -n "$DROP" | while IFS= read -r victim; do',
  '    case "$victim" in',
  '      "$REMOTE_DIR".backup-*) rm -rf "$victim"; echo "Pruned $victim" ;;',
  '      *) echo "Refusing to prune unexpected path: $victim" >&2 ;;',
  '    esac',
  '  done',
  '  echo "Pruned $DROP app backup(s); kept the newest $BACKUP_RETAIN."',
  '}',
].join('\n')

// cp -al hardlinks instead of copying contents, so a file this deploy does not
// touch (public/uploads above all) costs a directory entry rather than its
// size. That is only safe because nothing under $REMOTE_DIR is written in
// place: dist/server/scripts are removed and re-extracted, node_modules is
// rebuilt by npm ci, and uploads are only ever created or unlinked.
//
// data/ is the exception. contactMessagesStore and downloadRequestsStore append
// to .jsonl files there, and appending mutates the shared inode -- it would
// rewrite history inside every hardlinked backup at once. Those stores are
// dormant while DATABASE_URL is set (server/index.js picks Postgres then), but
// data/ is ~17KB, so it gets a real copy rather than a bet on that staying true.
//
// --unlink-first on the extract guards the same inode-sharing property from the
// other side. package.json and package-lock.json are not removed below, so they
// are extracted over a path the backup still links to. GNU tar 1.35 already
// replaces rather than truncates by default, so this is not fixing a live bug --
// it pins the behaviour, because --overwrite (settable from the environment via
// TAR_OPTIONS, and the default in some other tars) flips it to an in-place
// truncate that writes straight through into the backup just taken.
export const BACKUP_AND_EXTRACT = [
  'if [ -e "$REMOTE_DIR" ]; then',
  '  APP_BACKUP="$REMOTE_DIR.backup-$(date +%Y%m%d-%H%M%S)"',
  '  if cp -al "$REMOTE_DIR" "$APP_BACKUP" 2>/dev/null; then',
  '    if [ -d "$APP_BACKUP/data" ]; then',
  '      rm -rf "$APP_BACKUP/data"',
  '      cp -a "$REMOTE_DIR/data" "$APP_BACKUP/data"',
  '    fi',
  '    echo "Backed up app to $APP_BACKUP (hardlinked; data/ copied)"',
  '  else',
  // Never let a hardlink failure (an exotic filesystem, a cross-device
  // $REMOTE_DIR) leave the deploy without a rollback point.
  '    cp -a "$REMOTE_DIR" "$APP_BACKUP"',
  '    echo "Backed up app to $APP_BACKUP (full copy; hardlinks unavailable)"',
  '  fi',
  'fi',
  'mkdir -p "$REMOTE_DIR"',
  'rm -rf "$REMOTE_DIR/dist" "$REMOTE_DIR/server" "$REMOTE_DIR/scripts"',
  'tar -xzf "$ARCHIVE" -C "$REMOTE_DIR" --unlink-first',
].join('\n')
