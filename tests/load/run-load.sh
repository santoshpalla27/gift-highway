#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Load / Rate Limit Tests — Runner
# ═══════════════════════════════════════════════════════════════════════════
#
# Prerequisites:
#   - k6 installed (brew install k6)
#   - Backend running on localhost:8080
#
# Usage:
#   bash tests/load/run-load.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:8080}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  Load / Rate Limit Tests"
echo "  Target: $BASE_URL"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check for k6
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}ERROR: k6 is not installed.${NC}"
    echo "  Install with: brew install k6 (macOS)"
    echo "  or see: https://k6.io/docs/get-started/installation/"
    exit 1
fi

# Check backend is running
if ! curl -sf "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Backend not responding at $BASE_URL/health${NC}"
    echo "  Start the backend first: cd backend && go run ./cmd/server"
    exit 1
fi

echo -e "${GREEN}✓ Backend is running${NC}"
echo ""

EXIT_CODE=0

# ─── Test 1: Login Rate Limit ────────────────────────────────────────────
echo -e "${YELLOW}[1/2] Login rate limit burst test...${NC}"
echo ""

if k6 run --env BASE_URL="$BASE_URL" "$SCRIPT_DIR/k6-login-ratelimit.js" 2>&1; then
    echo -e "${GREEN}✓ Login rate limit test complete${NC}"
else
    echo -e "${RED}✗ Login rate limit test failed${NC}"
    EXIT_CODE=1
fi

echo ""

# ─── Test 2: API Burst Rate Limit ────────────────────────────────────────
echo -e "${YELLOW}[2/2] API burst rate limit test...${NC}"
echo ""

if k6 run --env BASE_URL="$BASE_URL" "$SCRIPT_DIR/k6-api-burst.js" 2>&1; then
    echo -e "${GREEN}✓ API burst test complete${NC}"
else
    echo -e "${RED}✗ API burst test failed${NC}"
    EXIT_CODE=1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}  All load tests passed!${NC}"
else
    echo -e "${RED}  Some load tests failed — see output above.${NC}"
fi
echo "═══════════════════════════════════════════════════════════════"

exit $EXIT_CODE
