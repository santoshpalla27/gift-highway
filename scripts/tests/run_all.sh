#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Run All Tests — Master script that runs security + data lifecycle + db health
#
# Usage:
#   BASE_URL=https://yourdomain.com ./scripts/tests/run_all.sh
#
# For local:
#   ./scripts/tests/run_all.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

export BASE_URL="${BASE_URL:-http://localhost:8080}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@company.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123456}"

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         Gift Highway — Full Test Suite                 ║${NC}"
echo -e "${BOLD}║         Target: ${CYAN}${BASE_URL}${NC}${BOLD}                    ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

TOTAL_FAILURES=0

# ── Test 1: Security ─────────────────────────────────────────────────────────
echo -e "${BOLD}╭──────────────────────────────────────────────────────╮${NC}"
echo -e "${BOLD}│  1/3  🔒 Security Tests                              │${NC}"
echo -e "${BOLD}╰──────────────────────────────────────────────────────╯${NC}"

if bash "${SCRIPT_DIR}/test_security.sh"; then
    echo -e "\n${GREEN}Security tests passed ✓${NC}\n"
else
    echo -e "\n${RED}Security tests had failures ✗${NC}\n"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# ── Test 2: Data Lifecycle ───────────────────────────────────────────────────
echo -e "${BOLD}╭──────────────────────────────────────────────────────╮${NC}"
echo -e "${BOLD}│  2/3  ♻️  Data Lifecycle Tests                        │${NC}"
echo -e "${BOLD}╰──────────────────────────────────────────────────────╯${NC}"

if bash "${SCRIPT_DIR}/test_data_lifecycle.sh"; then
    echo -e "\n${GREEN}Data lifecycle tests passed ✓${NC}\n"
else
    echo -e "\n${RED}Data lifecycle tests had failures ✗${NC}\n"
    TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# ── Test 3: DB Health ────────────────────────────────────────────────────────
echo -e "${BOLD}╭──────────────────────────────────────────────────────╮${NC}"
echo -e "${BOLD}│  3/3  🏥 Database Health Check                       │${NC}"
echo -e "${BOLD}╰──────────────────────────────────────────────────────╯${NC}"

if [ -n "${DB_URL:-}" ]; then
    if bash "${SCRIPT_DIR}/test_db_health.sh"; then
        echo -e "\n${GREEN}DB health check passed ✓${NC}\n"
    else
        echo -e "\n${RED}DB health check had issues ✗${NC}\n"
        TOTAL_FAILURES=$((TOTAL_FAILURES + 1))
    fi
else
    echo -e "  ${CYAN}ℹ Skipped — set DB_URL to run database health checks${NC}"
    echo -e "  ${CYAN}  Example: DB_URL=postgres://user:pass@host:5432/db${NC}"
fi

# ── Final Summary ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════╗${NC}"
if [ $TOTAL_FAILURES -eq 0 ]; then
    echo -e "${BOLD}║  ${GREEN}ALL TEST SUITES PASSED ✓${NC}${BOLD}                              ║${NC}"
else
    echo -e "${BOLD}║  ${RED}${TOTAL_FAILURES} TEST SUITE(S) HAD FAILURES ✗${NC}${BOLD}                       ║${NC}"
fi
echo -e "${BOLD}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

exit $TOTAL_FAILURES
