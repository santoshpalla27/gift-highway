#!/usr/bin/env bash
# Restore a company app backup into the running database.
# Usage:
#   ./restore-db.sh              — restores the latest local backup
#   ./restore-db.sh <file.sql.gz> — restores a specific backup file
#
# What it does:
#   1. Checks the postgres container is running
#   2. Finds the backup file to restore
#   3. Lists tables currently in the database
#   4. Stops the backend (no writes during restore)
#   5. Drops and recreates the database
#   6. Restores from the backup
#   7. Restarts the backend
#   8. Verifies tables exist after restore
set -euo pipefail

BACKUP_DIR=/var/backups/app
CONTAINER=app-postgres
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.prod.yml"

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env.prod" ]; then
  set -a; source "$SCRIPT_DIR/../.env.prod"; set +a
elif [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

# Derive R2_ENDPOINT from R2_ACCOUNT_ID if not set explicitly
if [ -z "${R2_ENDPOINT:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# ── R2 rclone helper ──────────────────────────────────────────────────────────
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
else
  # 1. Try local first
  BACKUP_FILE=$(find "$BACKUP_DIR" -name "app_*.sql.gz" 2>/dev/null | sort | tail -1)

  # 2. Fall back to latest from R2
  if [ -z "$BACKUP_FILE" ]; then
    log "No local backup found — fetching latest from R2..."

    command -v rclone &>/dev/null        || die "rclone not installed (apt install rclone)"
    [ -n "${R2_ACCESS_KEY:-}" ]          || die "R2_ACCESS_KEY not set in .env.prod"
    [ -n "${R2_SECRET_KEY:-}" ]          || die "R2_SECRET_KEY not set in .env.prod"
    [ -n "${R2_ENDPOINT:-}" ]            || die "R2_ENDPOINT or R2_ACCOUNT_ID not set in .env.prod"
    [ -n "${R2_BUCKET:-}" ]              || die "R2_BUCKET not set in .env.prod"

    LATEST_R2=$(r2_env lsf "r2:${R2_BUCKET}/db-backups/" --include "app_*.sql.gz" \
                  2>/dev/null | sort | tail -1)
    [ -n "$LATEST_R2" ] || die "No backups found in R2 (r2:${R2_BUCKET}/db-backups/)"

    mkdir -p "$BACKUP_DIR"
    log "Downloading $LATEST_R2 from R2..."
    r2_env copy "r2:${R2_BUCKET}/db-backups/${LATEST_R2}" "$BACKUP_DIR/" \
      --no-traverse --log-level ERROR
    BACKUP_FILE="$BACKUP_DIR/$LATEST_R2"
  fi
fi

log "Backup file: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ── Check postgres container is running ───────────────────────────────────────
docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null | grep -q "^running$" \
  || die "Container '$CONTAINER' is not running"
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
log "Stopping backend..."
docker compose -f "$COMPOSE_FILE" stop backend 2>/dev/null \
  || log "WARNING: could not stop backend (it may not be running)"

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
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q

# ── Verify ────────────────────────────────────────────────────────────────────
log "Tables after restore:"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

# ── Restart app services ──────────────────────────────────────────────────────
log "Restarting backend..."
docker compose -f "$COMPOSE_FILE" start backend 2>/dev/null \
  || log "WARNING: could not restart backend — start it manually"

log "Done. Restore complete."
