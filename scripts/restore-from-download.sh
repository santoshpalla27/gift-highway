#!/usr/bin/env bash
# GiftHighway — Restore from a manually downloaded R2 backup
#
# Use this when you've downloaded a backup from the Cloudflare R2 dashboard
# (or via rclone/wrangler) to your local working directory and want to restore it.
#
# Usage:
#   bash scripts/restore-from-download.sh                       # auto-picks newest .sql.gz in current dir
#   bash scripts/restore-from-download.sh app_2026-05-04.sql.gz # specific file in current dir
#   bash scripts/restore-from-download.sh /path/to/file.sql.gz  # absolute path anywhere
#
# What it does:
#   1. Finds the backup file (argument, or newest .sql.gz in current dir)
#   2. Checks the postgres container is running
#   3. Shows current tables and asks for confirmation
#   4. Stops backend + push-service (no writes during restore)
#   5. Drops and recreates the database
#   6. Restores from the downloaded backup
#   7. Restarts backend + push-service
#   8. Verifies tables exist after restore
#
# If the postgres container is down or the volume is lost, use disaster-recovery.sh instead.
set -euo pipefail

CONTAINER=app-postgres

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1090
if   [ -f "$SCRIPT_DIR/.env.prod" ];    then set -a; source "$SCRIPT_DIR/.env.prod";    set +a
elif [ -f "$SCRIPT_DIR/.env" ];         then set -a; source "$SCRIPT_DIR/.env";          set +a
elif [ -f "$SCRIPT_DIR/../.env.prod" ]; then set -a; source "$SCRIPT_DIR/../.env.prod";  set +a
elif [ -f "$SCRIPT_DIR/../.env" ];      then set -a; source "$SCRIPT_DIR/../.env";        set +a
fi

# Resolve docker-compose.yml
if   [ -f "$SCRIPT_DIR/docker-compose.yml" ];    then COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
elif [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then COMPOSE_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/docker-compose.yml"
else COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
fi

POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# ── Find backup file ──────────────────────────────────────────────────────────
CWD="$(pwd)"

if [ $# -ge 1 ]; then
  # Argument given — resolve relative to CWD if not absolute
  if [[ "$1" = /* ]]; then
    BACKUP_FILE="$1"
  else
    BACKUP_FILE="$CWD/$1"
  fi
  [ -f "$BACKUP_FILE" ] || die "File not found: $BACKUP_FILE"
  log "Using specified file: $BACKUP_FILE"
else
  # No argument — find the newest .sql.gz in the current working directory
  BACKUP_FILE=$(find "$CWD" -maxdepth 1 -name "*.sql.gz" 2>/dev/null | sort | tail -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo ""
    echo "  No .sql.gz file found in: $CWD"
    echo ""
    echo "  Download a backup from the Cloudflare R2 dashboard:"
    echo "    Bucket → db-backups/ → select a file → Download"
    echo ""
    echo "  Then run:"
    echo "    bash scripts/restore-from-download.sh <filename.sql.gz>"
    echo ""
    exit 1
  fi
  log "Auto-selected newest backup in current directory: $(basename "$BACKUP_FILE")"
fi

# Quick sanity check — must be gzipped SQL
file "$BACKUP_FILE" 2>/dev/null | grep -qi "gzip" \
  || { echo "WARNING: '$BACKUP_FILE' may not be a valid gzip file — proceeding anyway"; }

log "File: $(basename "$BACKUP_FILE")  ($(du -h "$BACKUP_FILE" | cut -f1))"

# ── Check postgres container ──────────────────────────────────────────────────
docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null \
  | grep -q "^running$" \
  || die "Container '$CONTAINER' is not running. If the database crashed or the volume is gone, use:
  sudo bash scripts/disaster-recovery.sh $(basename "$BACKUP_FILE")"

log "Postgres container: running"

# ── Show current state ────────────────────────────────────────────────────────
echo ""
log "Tables currently in '$POSTGRES_DB':"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "\dt" 2>/dev/null || echo "  (none or database unreachable)"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "  ┌───────────────────────────────────────────────────────────┐"
echo "  │  RESTORE FROM DOWNLOADED BACKUP                           │"
echo "  │                                                           │"
printf "  │  File   : %-50s │\n" "$(basename "$BACKUP_FILE")"
printf "  │  Target : %-50s │\n" "$POSTGRES_DB  (in $CONTAINER)"
echo "  │                                                           │"
echo "  │  This will DROP and RECREATE the database, then restore.  │"
echo "  │  Backend will be stopped briefly during restore.          │"
echo "  └───────────────────────────────────────────────────────────┘"
echo ""
read -r -p "  Type YES to continue: " CONFIRM
[ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

# ── Stop app services ─────────────────────────────────────────────────────────
log "Stopping backend and push-service..."
docker compose -f "$COMPOSE_FILE" stop backend push-service 2>/dev/null \
  || log "WARNING: could not stop services (may already be stopped)"

# ── Drop + recreate database ──────────────────────────────────────────────────
log "Terminating active connections to '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

log "Dropping database '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" > /dev/null

log "Creating fresh database '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" > /dev/null

# ── Restore ───────────────────────────────────────────────────────────────────
log "Restoring from $(basename "$BACKUP_FILE")..."
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
log "Restore complete."

# ── Verify ────────────────────────────────────────────────────────────────────
log "Tables after restore:"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

TABLE_COUNT=$(docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" \
  2>/dev/null | tr -d ' ')

[ "${TABLE_COUNT:-0}" -gt 0 ] \
  || die "Restore may have failed — no tables found in '$POSTGRES_DB'"

log "Verified: $TABLE_COUNT table(s) found."

# ── Restart app services ──────────────────────────────────────────────────────
log "Restarting backend and push-service..."
docker compose -f "$COMPOSE_FILE" start backend push-service 2>/dev/null \
  || log "WARNING: could not restart services — start them manually with: docker compose up -d"

echo ""
log "Done. '$POSTGRES_DB' restored from: $(basename "$BACKUP_FILE")"
