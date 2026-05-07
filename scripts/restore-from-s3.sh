#!/usr/bin/env bash
# Restore a GiftHighway backup from AWS S3 (primary backup — 5-min cadence).
# Usage:
#   ./restore-from-s3.sh              — fetches the latest backup from S3 and restores
#   ./restore-from-s3.sh <file.sql.gz> — restores a specific local backup file
#
# What it does:
#   1. Checks the postgres container is running
#   2. Finds the backup file (local first, then pulls latest from S3)
#   3. Lists tables currently in the database
#   4. Stops backend + push-service + frontend (no writes during restore)
#   5. Drops and recreates the database
#   6. Restores from the backup
#   7. Restarts all services
#   8. Verifies tables exist after restore
set -euo pipefail

BACKUP_DIR=/var/backups/app
CONTAINER=app-postgres
LOG=/var/log/app-restore-s3.log

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1090
if   [ -f "$SCRIPT_DIR/.env.prod" ];    then set -a; source "$SCRIPT_DIR/.env.prod";    set +a
elif [ -f "$SCRIPT_DIR/.env" ];         then set -a; source "$SCRIPT_DIR/.env";          set +a
elif [ -f "$SCRIPT_DIR/../.env.prod" ]; then set -a; source "$SCRIPT_DIR/../.env.prod";  set +a
elif [ -f "$SCRIPT_DIR/../.env" ];      then set -a; source "$SCRIPT_DIR/../.env";        set +a
fi

# Resolve compose file — COMPOSE_FILE env var overrides auto-detection
if [ -z "${COMPOSE_FILE:-}" ]; then
  if   [ -f "$SCRIPT_DIR/docker-compose.yml" ];     then COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
  elif [ -f "$SCRIPT_DIR/../docker-compose.yml" ];  then COMPOSE_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/docker-compose.yml"
  else COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
  fi
fi

POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

# ── Log file setup ────────────────────────────────────────────────────────────
touch "$LOG" 2>/dev/null || LOG=/tmp/app-restore-s3.log && touch "$LOG"
chmod 644 "$LOG" 2>/dev/null || true
exec > >(tee -a "$LOG") 2>&1

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

s3_env() {
  RCLONE_CONFIG_S3_TYPE=s3 \
  RCLONE_CONFIG_S3_PROVIDER=AWS \
  RCLONE_CONFIG_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  RCLONE_CONFIG_S3_REGION="$S3_REGION" \
  RCLONE_CONFIG_S3_NO_CHECK_BUCKET=true \
  rclone "$@"
}

# ── Backup dir ────────────────────────────────────────────────────────────────
if [ ! -d "$BACKUP_DIR" ] || [ ! -w "$BACKUP_DIR" ]; then
  sudo mkdir -p "$BACKUP_DIR"
  sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR"
  sudo chmod 755 "$BACKUP_DIR"
fi

# ── Pick backup file ──────────────────────────────────────────────────────────
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
  [ -f "$BACKUP_FILE" ] || die "File not found: $BACKUP_FILE"
else
  BACKUP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name "app_s3_*.sql.gz" 2>/dev/null | sort | tail -1)

  if [ -z "$BACKUP_FILE" ]; then
    log "No local S3 backup found — fetching latest from AWS S3..."
    if ! command -v rclone &>/dev/null; then
      log "rclone not found — installing..."
      if command -v apt-get &>/dev/null; then apt-get install -y rclone
      else curl -s https://rclone.org/install.sh | bash; fi
    fi
    command -v rclone &>/dev/null || die "rclone installation failed"
    [ -n "${S3_ACCESS_KEY:-}" ] || die "S3_ACCESS_KEY not set in .env"
    [ -n "${S3_SECRET_KEY:-}" ] || die "S3_SECRET_KEY not set in .env"
    [ -n "${S3_REGION:-}" ]     || die "S3_REGION not set in .env"
    [ -n "${S3_BUCKET:-}" ]     || die "S3_BUCKET not set in .env"

    LATEST_S3=$(s3_env lsf "s3:${S3_BUCKET}/db-backups/" --include "app_s3_*.sql.gz" \
                  --files-only 2>/dev/null | sort | tail -1)
    [ -n "$LATEST_S3" ] || die "No backups found in S3 (s3://${S3_BUCKET}/db-backups/)"

    log "Downloading $LATEST_S3 from S3..."
    s3_env copy "s3:${S3_BUCKET}/db-backups/${LATEST_S3}" "$BACKUP_DIR/" \
      --no-traverse --log-level ERROR
    BACKUP_FILE="$BACKUP_DIR/$LATEST_S3"
  fi
fi

BACKUP_AGE=$(( ($(date +%s) - $(stat -c%Y "$BACKUP_FILE" 2>/dev/null || echo 0)) / 60 ))
log "Backup file: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1), ${BACKUP_AGE} min old)"

# ── Check postgres container is running ───────────────────────────────────────
docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null | tr -d '[:space:]' | grep -q "^running$" \
  || die "Container '$CONTAINER' is not running. Start it with: docker compose up -d postgres"
log "Postgres container: running"

# ── Show current tables ───────────────────────────────────────────────────────
log "Tables currently in '$POSTGRES_DB':"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\dt" 2>/dev/null || echo "  (none or db unreachable)"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "  This will DROP and RECREATE the '$POSTGRES_DB' database,"
echo "  then restore from: $(basename "$BACKUP_FILE") (${BACKUP_AGE} min old)"
echo ""
read -r -p "  Continue? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Stop app services ─────────────────────────────────────────────────────────
log "Stopping backend, push-service and frontend..."
docker compose -f "$COMPOSE_FILE" stop backend push-service frontend 2>/dev/null \
  || log "WARNING: could not stop services (they may not be running)"

# ── Drop + recreate database ──────────────────────────────────────────────────
log "Terminating active connections to '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
  > /dev/null

log "Dropping database '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" > /dev/null

log "Creating fresh database '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" > /dev/null

# ── Restore ───────────────────────────────────────────────────────────────────
log "Restoring from backup..."
set +e
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --set ON_ERROR_STOP=off 2>&1 | grep -v "^SET$\|^--\|already exists\|^$" || true
set -e
log "Restore complete."

# ── Verify ────────────────────────────────────────────────────────────────────
log "Tables after restore:"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

ROW_COUNT=$(docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
if [ "${ROW_COUNT:-0}" -eq 0 ]; then
  die "Restore appears to have failed — no tables found in '$POSTGRES_DB'"
fi
log "Verified: $ROW_COUNT table(s) found."

# ── Restart app services ──────────────────────────────────────────────────────
log "Restarting all services..."
docker compose -f "$COMPOSE_FILE" up -d \
  || log "WARNING: could not restart services — start them manually"

log "Done. Restore from S3 complete. Full log: $LOG"
