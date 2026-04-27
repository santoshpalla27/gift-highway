#!/usr/bin/env bash
# GiftHighway — Disaster Recovery
#
# Use this script when the normal restore-db.sh won't work because:
#   - The postgres container is stopped, crashed, or missing
#   - The data volume is empty or corrupted
#   - The entire server is gone and you're starting on a new machine
#
# This script will:
#   1. Stop all app services
#   2. Start (or recreate) the postgres container
#   3. Wait for postgres to be ready
#   4. Find the latest backup (local → R2 fallback)
#   5. Snapshot current DB state → /var/backups/app/disaster/ + R2 db-backups/disaster/
#   6. Drop + recreate the database
#   7. Restore from backup
#   8. Verify and restart all services
#
# Usage:
#   sudo bash scripts/disaster-recovery.sh              # auto-selects latest backup
#   sudo bash scripts/disaster-recovery.sh <file.sql.gz> # specific backup file
set -euo pipefail

BACKUP_DIR=/var/backups/app
CONTAINER=app-postgres
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"
PG_READY_TIMEOUT=60

# ── Load .env ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env.prod" ]; then
  set -a; source "$SCRIPT_DIR/../.env.prod"; set +a
elif [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-appdb}"

if [ -z "${R2_ENDPOINT:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "══════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════"; }

r2_env() {
  RCLONE_CONFIG_R2_TYPE=s3 \
  RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
  rclone "$@"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
step "Preflight checks"
command -v docker       &>/dev/null || die "Docker is not installed"
command -v docker       &>/dev/null && docker info &>/dev/null || die "Docker daemon is not running"
[ -f "$COMPOSE_FILE" ]              || die "docker-compose.yml not found at: $COMPOSE_FILE"
log "Docker: OK"
log "Compose file: $COMPOSE_FILE"

# ── Pick backup file ──────────────────────────────────────────────────────────
step "Finding backup"
if [ $# -ge 1 ]; then
  BACKUP_FILE="$1"
  [ -f "$BACKUP_FILE" ] || die "File not found: $BACKUP_FILE"
  log "Using specified file: $BACKUP_FILE"
else
  BACKUP_FILE=$(find "$BACKUP_DIR" -name "app_*.sql.gz" 2>/dev/null | sort | tail -1)

  if [ -n "$BACKUP_FILE" ]; then
    log "Found local backup: $BACKUP_FILE"
  else
    log "No local backup found — fetching latest from R2..."
    command -v rclone &>/dev/null || die "rclone not installed. Run: apt-get install -y rclone"
    [ -n "${R2_ACCESS_KEY:-}" ]   || die "R2_ACCESS_KEY not set in .env.prod"
    [ -n "${R2_SECRET_KEY:-}" ]   || die "R2_SECRET_KEY not set in .env.prod"
    [ -n "${R2_ENDPOINT:-}" ]     || die "R2_ENDPOINT or R2_ACCOUNT_ID not set in .env.prod"
    [ -n "${R2_BUCKET:-}" ]       || die "R2_BUCKET not set in .env.prod"

    LATEST_R2=$(r2_env lsf "r2:${R2_BUCKET}/db-backups/" --include "app_*.sql.gz" \
                  2>/dev/null | sort | tail -1)
    [ -n "$LATEST_R2" ] || die "No backups found in R2 bucket '${R2_BUCKET}'"

    mkdir -p "$BACKUP_DIR"
    log "Downloading $LATEST_R2 from R2..."
    r2_env copy "r2:${R2_BUCKET}/db-backups/${LATEST_R2}" "$BACKUP_DIR/" \
      --no-traverse --log-level ERROR
    BACKUP_FILE="$BACKUP_DIR/$LATEST_R2"
    log "Downloaded to: $BACKUP_FILE"
  fi
fi

log "Backup file: $(basename "$BACKUP_FILE") ($(du -h "$BACKUP_FILE" | cut -f1))"

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │           DISASTER RECOVERY                      │"
echo "  │                                                   │"
echo "  │  Backup : $(basename "$BACKUP_FILE" | head -c 40)$([ ${#BACKUP_FILE} -gt 40 ] && echo '…' || echo ' ')│"
echo "  │  Target : $POSTGRES_DB on $CONTAINER$(printf '%*s' $((22 - ${#POSTGRES_DB} - ${#CONTAINER})) '')│"
echo "  │                                                   │"
echo "  │  This will WIPE and RESTORE the database.        │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
read -r -p "  Type YES to continue: " CONFIRM
[ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

# ── Stop all app services ─────────────────────────────────────────────────────
step "Stopping app services"
docker compose -f "$COMPOSE_FILE" stop backend push-service 2>/dev/null \
  && log "backend and push-service stopped" \
  || log "Services were already stopped or not found — continuing"

# ── Ensure postgres container is running ──────────────────────────────────────
step "Starting postgres"
CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
log "Container status: $CONTAINER_STATUS"

case "$CONTAINER_STATUS" in
  running)
    log "Already running — no action needed"
    ;;
  missing)
    log "Container not found — creating via docker compose (fresh volume)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres
    ;;
  *)
    # exited, stopped, dead, paused, etc.
    log "Container exists but is '$CONTAINER_STATUS' — starting it..."
    docker compose -f "$COMPOSE_FILE" start postgres 2>/dev/null \
      || docker compose -f "$COMPOSE_FILE" up -d postgres
    ;;
esac

# Wait for postgres to accept connections
log "Waiting for postgres to be ready (timeout: ${PG_READY_TIMEOUT}s)..."
ELAPSED=0
until docker exec "$CONTAINER" pg_isready -U "$POSTGRES_USER" -q 2>/dev/null; do
  if [ "$ELAPSED" -ge "$PG_READY_TIMEOUT" ]; then
    die "Postgres did not become ready after ${PG_READY_TIMEOUT}s. Check: docker logs $CONTAINER"
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  log "  waiting... (${ELAPSED}s)"
done
log "Postgres is ready."

# ── Safety dump — snapshot current state before wiping ───────────────────────
step "Safety snapshot (pre-wipe)"

DATE=$(date -u +%Y-%m-%d_%H-%M-%S)
SAFETY_DIR=/var/backups/app/disaster
SAFETY_FILE="$SAFETY_DIR/pre_wipe_${DATE}.sql.gz"
mkdir -p "$SAFETY_DIR"

# Check the database actually exists and has tables before trying to dump it
DB_EXISTS=$(docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -t -c \
  "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB';" 2>/dev/null | tr -d ' \n' || echo "")

if [ "$DB_EXISTS" = "1" ]; then
  log "Dumping current '$POSTGRES_DB' to $SAFETY_FILE ..."
  if docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      | gzip -6 > "$SAFETY_FILE" 2>/dev/null; then
    SIZE=$(du -h "$SAFETY_FILE" | cut -f1)
    log "Safety dump saved locally: $SAFETY_FILE ($SIZE)"

    # Upload to R2 under db-backups/disaster/ if credentials are available
    if command -v rclone &>/dev/null \
       && [ -n "${R2_ACCESS_KEY:-}" ] \
       && [ -n "${R2_SECRET_KEY:-}" ] \
       && [ -n "${R2_ENDPOINT:-}" ] \
       && [ -n "${R2_BUCKET:-}" ]; then
      if r2_env copy "$SAFETY_FILE" "r2:${R2_BUCKET}/db-backups/disaster/" \
           --no-traverse --log-level ERROR 2>/dev/null; then
        log "Safety dump uploaded to R2: db-backups/disaster/$(basename "$SAFETY_FILE")"
      else
        log "WARNING: R2 upload of safety dump failed — local copy still at $SAFETY_FILE"
      fi
    else
      log "INFO: R2 not configured — safety dump kept locally only"
    fi
  else
    log "WARNING: pg_dump failed (DB may be corrupt/empty) — skipping safety snapshot"
    rm -f "$SAFETY_FILE"
  fi
else
  log "Database '$POSTGRES_DB' does not exist — nothing to snapshot"
fi

# ── Drop + recreate database ──────────────────────────────────────────────────
step "Preparing database"

log "Terminating any active connections..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

log "Dropping '$POSTGRES_DB' (if it exists)..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" > /dev/null

log "Creating fresh '$POSTGRES_DB'..."
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres -c \
  "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" > /dev/null

# ── Restore ───────────────────────────────────────────────────────────────────
step "Restoring data"
log "Streaming backup into postgres..."
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
log "Restore complete."

# ── Verify ────────────────────────────────────────────────────────────────────
step "Verification"
log "Tables in '$POSTGRES_DB' after restore:"
docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"

ROW_COUNT=$(docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
if [ "${ROW_COUNT:-0}" -eq 0 ]; then
  die "Restore appears to have failed — no tables found in '$POSTGRES_DB'"
fi
log "Verified: $ROW_COUNT table(s) found."

# ── Restart all services ──────────────────────────────────────────────────────
step "Starting all services"
docker compose -f "$COMPOSE_FILE" up -d \
  && log "All services started." \
  || log "WARNING: docker compose up -d failed — start services manually"

echo ""
log "══════════════════════════════════════════"
log "  Disaster recovery complete."
log "  Restored from: $(basename "$BACKUP_FILE")"
log "══════════════════════════════════════════"
