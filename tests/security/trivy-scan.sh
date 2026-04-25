#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Trivy Security Scanner — Gift Highway Backend
# ═══════════════════════════════════════════════════════════════════════════
#
# Scans:
#   1. Container image for CVEs (HIGH + CRITICAL)
#   2. Filesystem dependencies for known vulnerabilities
#
# Prerequisites:
#   - trivy installed (brew install trivy / apt install trivy)
#   - Docker image built: docker build -t gift-highway-backend ./backend
#
# Usage:
#   bash tests/security/trivy-scan.sh
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "═══════════════════════════════════════════════════════════════"
echo "  Trivy Security Scan — Gift Highway"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if trivy is installed
if ! command -v trivy &> /dev/null; then
    echo -e "${RED}ERROR: trivy is not installed.${NC}"
    echo "  Install with: brew install trivy (macOS) or see https://trivy.dev"
    exit 1
fi

EXIT_CODE=0

# ─── 1. Filesystem scan (Go dependencies) ────────────────────────────────
echo -e "${YELLOW}[1/2] Scanning backend filesystem for dependency vulnerabilities...${NC}"
echo ""

if trivy fs \
    --severity HIGH,CRITICAL \
    --exit-code 0 \
    --format table \
    "$PROJECT_ROOT/backend"; then
    echo -e "${GREEN}✓ Filesystem scan complete${NC}"
else
    echo -e "${RED}✗ Filesystem scan found vulnerabilities${NC}"
    EXIT_CODE=1
fi

echo ""

# ─── 2. Container image scan ─────────────────────────────────────────────
echo -e "${YELLOW}[2/2] Scanning Docker image for CVEs...${NC}"
echo ""

IMAGE_NAME="gift-highway-backend:latest"
if docker image inspect "$IMAGE_NAME" &> /dev/null 2>&1; then
    if trivy image \
        --severity HIGH,CRITICAL \
        --exit-code 0 \
        --format table \
        "$IMAGE_NAME"; then
        echo -e "${GREEN}✓ Image scan complete${NC}"
    else
        echo -e "${RED}✗ Image scan found vulnerabilities${NC}"
        EXIT_CODE=1
    fi
else
    echo -e "${YELLOW}⚠ Docker image '$IMAGE_NAME' not found — skipping image scan.${NC}"
    echo "  Build it first: docker build -t $IMAGE_NAME ./backend"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}  All scans passed!${NC}"
else
    echo -e "${RED}  Vulnerabilities found — review output above.${NC}"
fi
echo "═══════════════════════════════════════════════════════════════"

exit $EXIT_CODE
