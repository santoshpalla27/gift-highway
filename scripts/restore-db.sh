#!/usr/bin/env bash
# Restore a GiftHighway backup into the running database.
# Usage:
#   ./restore-db.sh              — restores the latest local backup
#   ./restore-db.sh <file.sql.gz> — restores a specific backup file
#
# What it does:
#   1. Checks the postgres container is running
#   2. Finds the backup file to restore
#   3. Lists tables currently in the database
#   4. Stops backend + push-service (no writes during restore)
#   5. Drops and recreates the database
#   6. Restores from the backup
#   7. Restarts backend + push-service
#   8. Verifies tables exist after restore
#
# If the postgres container is down or the volume is lost, use disaster-recovery.sh instead.
set -euo pipefail

BACKUP_DIR=/var/backups/app
CONTAINER=app-postgres

# Ensure backup directory exists and is writable
if [ ! -d "$BACKUP_DIR" ] || [ ! -w "$BACKUP_DIR" ]; then
  sudo mkdir -p "$BACKUP_DIR"
  sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR"
  sudo chmod 755 "$BACKUP_DIR"
fi

# ── Load .env ─────────────────────────────────────────────────────────────────
# Checks same directory first (standalone deployment), then parent directory
# (repo deployment where scripts live in gift-highway/scripts/).
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
  else COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"  # will fail below with a clear error
  fi
fi
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

if [ -z "${R2_ENDPOINT:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

r2_env() {
  RCLONE_CONFIG_R2_TYPE=s3 \
  RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  rclone "$@"
}

# ── Pick backup file ──────────────────────────────────────────────────────────
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
  [ -f "$BACKUP_FILE" ] || die "File not found: $BACKUP_FILE"
  log "Using specified file: $BACKUP_FILE"
else
  # Only look for R2 backup files (app_YYYY-*.sql.gz), not S3 files (app_s3_*)
  BACKUP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name "app_*.sql.gz" \
                  -not -name "app_s3_*.sql.gz" 2>/dev/null | sort | tail -1)

  if [ -n "$BACKUP_FILE" ]; then
    log "Found local R2 backup: $BACKUP_FILE"
  else
    log "No local R2 backup found — fetching latest from Cloudflare R2..."
    command -v rclone &>/dev/null || die "rclone not installed (apt install rclone)"
    [ -n "${R2_ACCESS_KEY:-}" ]   || die "R2_ACCESS_KEY not set in .env"
    [ -n "${R2_SECRET_KEY:-}" ]   || die "R2_SECRET_KEY not set in .env"
    [ -n "${R2_ENDPOINT:-}" ]     || die "R2_ENDPOINT or R2_ACCOUNT_ID not set in .env"
    [ -n "${R2_BUCKET:-}" ]       || die "R2_BUCKET not set in .env"

    LATEST_R2=$(r2_env lsf "r2:${R2_BUCKET}/db-backups/" --include "app_*.sql.gz" \
                  --files-only 2>/dev/null | grep -v "^app_s3_" | sort | tail -1)
    [ -n "$LATEST_R2" ] || die "No R2 backups found in r2://${R2_BUCKET}/db-backups/"

    mkdir -p "$BACKUP_DIR"
    log "Downloading from Cloudflare R2: r2://${R2_BUCKET}/db-backups/${LATEST_R2}"
    r2_env copy "r2:${R2_BUCKET}/db-backups/${LATEST_R2}" "$BACKUP_DIR/" \
      --no-traverse --log-level ERROR
    BACKUP_FILE="$BACKUP_DIR/$LATEST_R2"
    log "Downloaded: $BACKUP_FILE"
  fi
fi

BACKUP_AGE=$(( ($(date +%s) - $(stat -c%Y "$BACKUP_FILE" 2>/dev/null || echo 0)) / 60 ))
log "Backup file: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1), ${BACKUP_AGE} min old)"

# ── Check postgres container is running ───────────────────────────────────────
docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null | grep -q "^running$" \
  || die "Container '$CONTAINER' is not running. Start it with: docker compose up -d postgres"
log "Postgres container: running"

# ── Show current tables ───────────────────────────────────────────────────────
log "Tables currently in '$POSTGRES_DB':"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\dt" 2>/dev/null || echo "  (none or db unreachable)"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "  This will DROP and RECREATE the '$POSTGRES_DB' database,"
echo "  then restore from: $(basename "$BACKUP_FILE")"
echo ""
read -r -p "  Continue? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Stop app services ─────────────────────────────────────────────────────────
log "Stopping backend and push-service..."
docker compose -f "$COMPOSE_FILE" stop backend push-service 2>/dev/null \
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
log "Restoring from backup (errors will be shown)..."
set +e
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --set ON_ERROR_STOP=off 2>&1 | grep -v "^SET$\|^--\|already exists\|^$" || true
set -e

# ── Verify ────────────────────────────────────────────────────────────────────
log "Tables after restore:"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

# ── Restart app services ──────────────────────────────────────────────────────
log "Restarting backend and push-service..."
docker compose -f "$COMPOSE_FILE" start backend push-service 2>/dev/null \
  || log "WARNING: could not restart services — start them manually"

log "Done. Restore complete."
