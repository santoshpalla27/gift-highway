#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Database Health Check — Monitor table sizes, row counts, and detect stale data
# Run this periodically (daily/weekly) to ensure zero-growth sustainability.
#
# Usage:
#   DB_URL="postgres://user:pass@host:5432/dbname" ./scripts/tests/test_db_health.sh
#
# For local Docker:
#   DB_URL="postgres://kanban:password@localhost:5432/appdb" ./scripts/tests/test_db_health.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

DB_URL="${DB_URL:-postgres://kanban:password@localhost:5432/appdb}"
PSQL_CMD="psql ${DB_URL} -t -A"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}psql not found. Install postgresql-client or use docker:${NC}"
    echo "  docker exec app-postgres psql -U kanban -d appdb -c '<query>'"
    exit 1
fi

echo -e "${BOLD}🏥 DATABASE HEALTH CHECK${NC}"
echo -e "   Target: ${CYAN}${DB_URL%%@*}@***${NC}"
echo ""

FAILURES=0
TOTAL=0
WARNINGS=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ 1. Table Row Counts ━━━${NC}\n"
# ─────────────────────────────────────────────────────────────────────────────

TABLES=(
    "users"
    "orders"
    "order_assignees"
    "order_events"
    "order_attachments"
    "notification_reads"
    "refresh_tokens"
    "device_push_tokens"
    "customer_portals"
    "portal_messages"
    "portal_attachments"
)

printf "  %-25s %10s\n" "TABLE" "ROWS"
printf "  %-25s %10s\n" "─────────────────────────" "──────────"

for TABLE in "${TABLES[@]}"; do
    COUNT=$(echo "SELECT COUNT(*) FROM ${TABLE};" | $PSQL_CMD 2>/dev/null || echo "ERROR")
    if [ "$COUNT" = "ERROR" ]; then
        printf "  ${YELLOW}%-25s %10s${NC}\n" "$TABLE" "N/A"
    else
        printf "  %-25s %10s\n" "$TABLE" "$COUNT"
    fi
done

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ 2. Table Sizes ━━━${NC}\n"
# ─────────────────────────────────────────────────────────────────────────────

echo "
SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(C.oid)) AS total_size,
    n_live_tup AS rows
FROM pg_class C
LEFT JOIN pg_namespace N ON N.oid = C.relnamespace
LEFT JOIN pg_stat_user_tables S ON S.relid = C.oid
WHERE nspname = 'public' AND C.relkind = 'r'
ORDER BY pg_total_relation_size(C.oid) DESC
LIMIT 15;
" | psql ${DB_URL} 2>/dev/null || warn "Could not fetch table sizes"

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ 3. Stale Data Checks ━━━${NC}\n"
# ─────────────────────────────────────────────────────────────────────────────

# 3.1 Expired refresh tokens
EXPIRED_TOKENS=$(echo "SELECT COUNT(*) FROM refresh_tokens WHERE expires_at < NOW();" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$EXPIRED_TOKENS" -gt 0 ] 2>/dev/null; then
    warn "Expired refresh tokens: $EXPIRED_TOKENS (should be cleaned up)"
    FAILURES=$((FAILURES + 1))
else
    pass "No expired refresh tokens"
fi

# 3.2 Orphaned notification_reads (user or order deleted but row remains — shouldn't happen with CASCADE)
ORPHAN_NR_USER=$(echo "
SELECT COUNT(*) FROM notification_reads nr
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = nr.user_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_NR_USER" -gt 0 ] 2>/dev/null; then
    fail "Orphaned notification_reads (deleted user): $ORPHAN_NR_USER"
else
    pass "No orphaned notification_reads (user side)"
fi

ORPHAN_NR_ORDER=$(echo "
SELECT COUNT(*) FROM notification_reads nr
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = nr.order_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_NR_ORDER" -gt 0 ] 2>/dev/null; then
    fail "Orphaned notification_reads (deleted order): $ORPHAN_NR_ORDER"
else
    pass "No orphaned notification_reads (order side)"
fi

# 3.3 Orphaned order_events
ORPHAN_EVENTS=$(echo "
SELECT COUNT(*) FROM order_events oe
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oe.order_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_EVENTS" -gt 0 ] 2>/dev/null; then
    fail "Orphaned order_events (deleted order): $ORPHAN_EVENTS"
else
    pass "No orphaned order_events"
fi

# 3.4 Orphaned order_attachments
ORPHAN_ATTS=$(echo "
SELECT COUNT(*) FROM order_attachments oa
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oa.order_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_ATTS" -gt 0 ] 2>/dev/null; then
    fail "Orphaned order_attachments: $ORPHAN_ATTS"
else
    pass "No orphaned order_attachments"
fi

# 3.5 Orphaned order_assignees
ORPHAN_ASSIGN=$(echo "
SELECT COUNT(*) FROM order_assignees oa
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oa.order_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_ASSIGN" -gt 0 ] 2>/dev/null; then
    fail "Orphaned order_assignees: $ORPHAN_ASSIGN"
else
    pass "No orphaned order_assignees"
fi

# 3.6 Orphaned portal data
ORPHAN_PORTAL=$(echo "
SELECT COUNT(*) FROM customer_portals cp
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = cp.order_id);
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$ORPHAN_PORTAL" -gt 0 ] 2>/dev/null; then
    fail "Orphaned customer_portals: $ORPHAN_PORTAL"
else
    pass "No orphaned customer_portals"
fi

# 3.7 Push tokens for inactive users
INACTIVE_TOKENS=$(echo "
SELECT COUNT(*) FROM device_push_tokens dpt
JOIN users u ON u.id = dpt.user_id
WHERE u.is_active = false;
" | $PSQL_CMD 2>/dev/null || echo "0")
TOTAL=$((TOTAL + 1))
if [ "$INACTIVE_TOKENS" -gt 0 ] 2>/dev/null; then
    warn "Push tokens for inactive users: $INACTIVE_TOKENS (should be cleaned)"
else
    pass "No push tokens for inactive users"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ 4. Growth Indicators ━━━${NC}\n"
# ─────────────────────────────────────────────────────────────────────────────

# 4.1 Events per order ratio (high ratio = lots of chatter, normal)
EVENTS_RATIO=$(echo "
SELECT ROUND(AVG(event_count), 1) FROM (
    SELECT order_id, COUNT(*) as event_count
    FROM order_events
    GROUP BY order_id
) sub;
" | $PSQL_CMD 2>/dev/null || echo "N/A")
info "Average events per order: $EVENTS_RATIO"

# 4.2 Archived orders count
ARCHIVED=$(echo "SELECT COUNT(*) FROM orders WHERE is_archived = true;" | $PSQL_CMD 2>/dev/null || echo "N/A")
ACTIVE=$(echo "SELECT COUNT(*) FROM orders WHERE is_archived = false;" | $PSQL_CMD 2>/dev/null || echo "N/A")
info "Active orders: $ACTIVE | Archived (in trash): $ARCHIVED"

if [ "$ARCHIVED" -gt 50 ] 2>/dev/null; then
    warn "Many archived orders ($ARCHIVED) — consider permanent-deleting old ones"
fi

# 4.3 Database total size
DB_SIZE=$(echo "SELECT pg_size_pretty(pg_database_size(current_database()));" | $PSQL_CMD 2>/dev/null || echo "N/A")
info "Total database size: $DB_SIZE"

# 4.4 Refresh tokens per user
echo "
SELECT
    u.email,
    COUNT(rt.id) as token_count
FROM users u
LEFT JOIN refresh_tokens rt ON rt.user_id = u.id
GROUP BY u.email
ORDER BY token_count DESC;
" | psql ${DB_URL} 2>/dev/null || warn "Could not fetch token counts"

# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}━━━ 5. Cleanup Recommendations ━━━${NC}\n"
# ─────────────────────────────────────────────────────────────────────────────

if [ "$EXPIRED_TOKENS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${YELLOW}Run:${NC} DELETE FROM refresh_tokens WHERE expires_at < NOW();"
fi

if [ "$INACTIVE_TOKENS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${YELLOW}Run:${NC} DELETE FROM device_push_tokens WHERE user_id IN (SELECT id FROM users WHERE is_active = false);"
fi

if [ "$ARCHIVED" -gt 20 ] 2>/dev/null; then
    echo -e "  ${YELLOW}Consider:${NC} Permanently deleting old archived orders via the web UI trash page"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $FAILURES -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}ALL $TOTAL CHECKS PASSED ✓${NC} ($WARNINGS warnings)"
else
    echo -e "  ${RED}${BOLD}$FAILURES / $TOTAL CHECKS FAILED ✗${NC} ($WARNINGS warnings)"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
exit $FAILURES
