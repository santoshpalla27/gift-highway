#!/usr/bin/env bash
# PostgreSQL backup for GiftHighway (2 GB server, Ubuntu)
# Runs pg_dump inside the existing postgres container — zero extra RAM cost.
# Off-site upload uses rclone (apt install rclone) — no AWS CLI needed.
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
LOG=/var/log/app-backup.log
BACKUP_DIR=/var/backups/app
KEEP_DAYS=7
CONTAINER=app-postgres
LOCK_FILE=/tmp/app-backup.lock

# ── Load .env (get DB creds + R2 creds) ──────────────────────────────────────
# Checks same directory first (standalone deployment), then parent directory
# (repo deployment where scripts live in gift-highway/scripts/).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1090
if   [ -f "$SCRIPT_DIR/.env.prod" ];    then set -a; source "$SCRIPT_DIR/.env.prod";    set +a
elif [ -f "$SCRIPT_DIR/.env" ];         then set -a; source "$SCRIPT_DIR/.env";          set +a
elif [ -f "$SCRIPT_DIR/../.env.prod" ]; then set -a; source "$SCRIPT_DIR/../.env.prod";  set +a
elif [ -f "$SCRIPT_DIR/../.env" ];      then set -a; source "$SCRIPT_DIR/../.env";        set +a
fi

POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

# Derive R2_ENDPOINT from R2_ACCOUNT_ID if not set explicitly
if [ -z "${R2_ENDPOINT:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

# Redirect all unexpected stderr to the log as well
exec 2>> "$LOG"

# ── Lock — prevent concurrent runs ───────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  log "ERROR: Another backup is already running (lock: $LOCK_FILE). Exiting."
  exit 1
fi
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM
touch "$LOCK_FILE"

# ── Start ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
touch "$LOG"

DATE=$(date -u +%Y-%m-%d_%H-%M-%S)
FILENAME="app_${DATE}.sql.gz"
DUMP_FILE="$BACKUP_DIR/$FILENAME"

log "Starting backup"

# ── Dump ──────────────────────────────────────────────────────────────────────
# pg_dump runs *inside* the existing app-postgres container.
# No extra memory needed on the host; gzip pipe is ~2 MB RSS.
if ! docker exec "$CONTAINER" pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
    | gzip -6 > "$DUMP_FILE"; then
  log "ERROR: pg_dump or gzip failed. Removing partial file."
  rm -f "$DUMP_FILE"
  exit 1
fi

# ── Integrity check — fail fast on empty/truncated dump ──────────────────────
MIN_BYTES=1024
ACTUAL_BYTES=$(stat -c%s "$DUMP_FILE" 2>/dev/null || echo 0)
if [ "$ACTUAL_BYTES" -lt "$MIN_BYTES" ]; then
  log "ERROR: Dump is only ${ACTUAL_BYTES} bytes — likely corrupt or empty. Removing."
  rm -f "$DUMP_FILE"
  exit 1
fi

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump complete: $FILENAME ($SIZE)"

# ── Upload to Cloudflare R2 (optional — requires rclone) ─────────────────────
# Install once on the host:  sudo apt install rclone
# rclone is configured entirely via env vars below — no config file needed.
if command -v rclone &>/dev/null \
   && [ -n "${R2_ACCESS_KEY:-}" ] \
   && [ -n "${R2_SECRET_KEY:-}" ] \
   && [ -n "${R2_ENDPOINT:-}" ] \
   && [ -n "${R2_BUCKET:-}" ]; then

  if RCLONE_CONFIG_R2_TYPE=s3 \
     RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
     RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
     RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
     RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
     RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
     rclone copy "$DUMP_FILE" "r2:${R2_BUCKET}/db-backups/" \
       --no-traverse \
       --log-level ERROR 2>> "$LOG"; then
    log "Uploaded to R2: db-backups/$FILENAME"
  else
    log "WARNING: R2 upload failed — local backup is still intact"
  fi
else
  log "INFO: rclone or R2 creds not found — skipping R2 upload (need: rclone, R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID, R2_BUCKET)"
fi

# ── Rotate local backups ──────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "app_*.sql.gz" -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && log "Rotated $DELETED local backup(s) older than ${KEEP_DAYS} day(s)"

log "Done."
