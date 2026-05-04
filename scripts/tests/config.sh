#!/bin/bash
# ─── Test Configuration ────────────────────────────────────────────────────────
# Set your domain and credentials here before running tests.
# Usage: source scripts/tests/config.sh

# ── Target ──
export BASE_URL="${BASE_URL:-http://localhost:8080}"
export API_URL="${BASE_URL}/api/v1"
export PORTAL_URL="${BASE_URL}/api/portal"

# ── Admin credentials ──
export ADMIN_EMAIL="${ADMIN_EMAIL:-admin@company.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123456}"

# ── Colors for output ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}✓ PASS${NC} $1"; }
fail() { echo -e "  ${RED}✗ FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}⚠ WARN${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ INFO${NC} $1"; }
header() { echo -e "\n${BOLD}━━━ $1 ━━━${NC}"; }
subheader() { echo -e "\n${BOLD}  ── $1${NC}"; }

FAILURES=0
TOTAL=0

assert_status() {
    local description="$1"
    local expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$actual" = "$expected" ]; then
        pass "$description (HTTP $actual)"
    else
        fail "$description (expected $expected, got $actual)"
    fi
}

assert_not_status() {
    local description="$1"
    local not_expected="$2"
    local actual="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$actual" != "$not_expected" ]; then
        pass "$description (HTTP $actual, not $not_expected)"
    else
        fail "$description (got $not_expected, should not be)"
    fi
}

# Login helper — returns JSON with tokens
do_login() {
    local email="$1"
    local password="$2"
    curl -s -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\"}"
}

# Extract access token from login response
get_token() {
    local login_response="$1"
    echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['access_token'])" 2>/dev/null
}

get_refresh_token() {
    local login_response="$1"
    echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['refresh_token'])" 2>/dev/null
}

get_user_id() {
    local login_response="$1"
    echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null
}

get_user_role() {
    local login_response="$1"
    echo "$login_response" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['role'])" 2>/dev/null
}

# Auth header helper
auth_header() {
    echo "Authorization: Bearer $1"
}

summary() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ $FAILURES -eq 0 ]; then
        echo -e "  ${GREEN}${BOLD}ALL $TOTAL TESTS PASSED ✓${NC}"
    else
        echo -e "  ${RED}${BOLD}$FAILURES / $TOTAL TESTS FAILED ✗${NC}"
    fi
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    return $FAILURES
}
