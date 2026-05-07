#!/usr/bin/env bash
# PostgreSQL backup for GiftHighway — primary off-site backup to AWS S3, runs every 5 minutes.
# Runs pg_dump inside the existing postgres container — zero extra RAM cost.
# Upload uses rclone (apt install rclone) — no AWS CLI needed.
# R2 is the secondary hourly backup. S3 is primary (5-min cadence = 5-min RPO).
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
LOG=/var/log/app-backup-s3.log
BACKUP_DIR=/var/backups/app
KEEP_DAYS=1           # keep 1 day of local S3 backups (288 files/day at 5-min cadence)
CONTAINER=app-postgres
LOCK_FILE=/tmp/app-backup-s3.lock

# ── Load .env (get DB creds + S3 creds) ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1090
if   [ -f "$SCRIPT_DIR/.env.prod" ];    then set -a; source "$SCRIPT_DIR/.env.prod";    set +a
elif [ -f "$SCRIPT_DIR/.env" ];         then set -a; source "$SCRIPT_DIR/.env";          set +a
elif [ -f "$SCRIPT_DIR/../.env.prod" ]; then set -a; source "$SCRIPT_DIR/../.env.prod";  set +a
elif [ -f "$SCRIPT_DIR/../.env" ];      then set -a; source "$SCRIPT_DIR/../.env";        set +a
fi

POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

# ── Fix log path if it was accidentally created as a directory ────────────────
if [ -d "$LOG" ]; then sudo rm -rf "$LOG"; fi
sudo touch "$LOG" 2>/dev/null || LOG=/tmp/app-backup-s3.log && touch "$LOG"
sudo chmod 644 "$LOG" 2>/dev/null || true

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }
exec 2>> "$LOG"

# ── Lock — prevent concurrent runs ───────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  log "ERROR: Another S3 backup is already running (lock: $LOCK_FILE). Exiting."
  exit 1
fi
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM
touch "$LOCK_FILE"

# ── Start ─────────────────────────────────────────────────────────────────────
if [ ! -d "$BACKUP_DIR" ] || [ ! -w "$BACKUP_DIR" ]; then
  sudo mkdir -p "$BACKUP_DIR"
  sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR"
  sudo chmod 755 "$BACKUP_DIR"
fi
mkdir -p "$BACKUP_DIR"
touch "$LOG"

DATE=$(date -u +%Y-%m-%d_%H-%M-%S)
FILENAME="app_s3_${DATE}.sql.gz"
DUMP_FILE="$BACKUP_DIR/$FILENAME"

log "Starting S3 backup"

# ── Dump ──────────────────────────────────────────────────────────────────────
if ! docker exec "$CONTAINER" pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
    | gzip -6 > "$DUMP_FILE"; then
  log "ERROR: pg_dump or gzip failed. Removing partial file."
  rm -f "$DUMP_FILE"
  exit 1
fi

# ── Integrity check ───────────────────────────────────────────────────────────
MIN_BYTES=1024
ACTUAL_BYTES=$(stat -c%s "$DUMP_FILE" 2>/dev/null || echo 0)
if [ "$ACTUAL_BYTES" -lt "$MIN_BYTES" ]; then
  log "ERROR: Dump is only ${ACTUAL_BYTES} bytes — likely corrupt or empty. Removing."
  rm -f "$DUMP_FILE"
  exit 1
fi

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump complete: $FILENAME ($SIZE)"

# ── Upload to AWS S3 (requires rclone + S3 creds in .env) ────────────────────
# Auto-install rclone if missing
if ! command -v rclone &>/dev/null; then
  log "rclone not found — installing..."
  if command -v apt-get &>/dev/null; then
    apt-get install -y rclone >> "$LOG" 2>&1
  else
    curl -s https://rclone.org/install.sh | bash >> "$LOG" 2>&1
  fi
fi
if command -v rclone &>/dev/null \
   && [ -n "${S3_ACCESS_KEY:-}" ] \
   && [ -n "${S3_SECRET_KEY:-}" ] \
   && [ -n "${S3_BUCKET:-}" ] \
   && [ -n "${S3_REGION:-}" ]; then

  if RCLONE_CONFIG_S3_TYPE=s3 \
     RCLONE_CONFIG_S3_PROVIDER=AWS \
     RCLONE_CONFIG_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
     RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
     RCLONE_CONFIG_S3_REGION="$S3_REGION" \
     RCLONE_CONFIG_S3_NO_CHECK_BUCKET=true \
     rclone copy "$DUMP_FILE" "s3:${S3_BUCKET}/db-backups/" \
       --no-traverse \
       --log-level ERROR 2>> "$LOG"; then
    log "Uploaded to S3: s3://${S3_BUCKET}/db-backups/$FILENAME"
  else
    log "WARNING: S3 upload failed — local backup is still intact"
  fi
else
  log "INFO: rclone or S3 creds not found — skipping S3 upload (need: rclone, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION)"
fi

# ── Rotate local backups ──────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "app_s3_*.sql.gz" -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && log "Rotated $DELETED local S3 backup(s) older than ${KEEP_DAYS} day(s)"

log "Done."
