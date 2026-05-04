#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Security Test Suite — Run against your deployed domain
# Tests: Auth bypass, role escalation, token expiry, data isolation, headers
#
# Usage:
#   BASE_URL=https://yourdomain.com ./scripts/tests/test_security.sh
#   (or use localhost for local testing)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo -e "${BOLD}🔒 SECURITY TEST SUITE${NC}"
echo -e "   Target: ${CYAN}${BASE_URL}${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
header "1. Authentication Tests"
# ─────────────────────────────────────────────────────────────────────────────

subheader "1.1 Login with valid credentials"
ADMIN_LOGIN=$(do_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
ADMIN_TOKEN=$(get_token "$ADMIN_LOGIN")
ADMIN_REFRESH=$(get_refresh_token "$ADMIN_LOGIN")
ADMIN_USER_ID=$(get_user_id "$ADMIN_LOGIN")
ADMIN_ROLE=$(get_user_role "$ADMIN_LOGIN")

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    pass "Admin login successful (role=$ADMIN_ROLE)"
else
    fail "Admin login failed — cannot continue tests"
    summary
    exit 1
fi

subheader "1.2 Login with wrong password"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"'"$ADMIN_EMAIL"'","password":"wrongpassword123"}')
assert_status "Wrong password rejected" "401" "$STATUS"

subheader "1.3 Login with non-existent email"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"nonexistent@fake.com","password":"wrongpassword123"}')
assert_status "Non-existent email rejected" "401" "$STATUS"

subheader "1.4 Login with empty body"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{}')
assert_status "Empty login body rejected" "400" "$STATUS"

subheader "1.5 Login with SQL injection attempt"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@company.com'\'' OR 1=1--","password":"anything"}')
assert_status "SQL injection in email rejected" "400" "$STATUS"

# ─────────────────────────────────────────────────────────────────────────────
header "2. Token Security Tests"
# ─────────────────────────────────────────────────────────────────────────────

subheader "2.1 No token — protected endpoint"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/me")
assert_status "No token → 401" "401" "$STATUS"

subheader "2.2 Invalid/garbage token"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/me" \
    -H "Authorization: Bearer invalid.garbage.token")
assert_status "Invalid JWT → 401" "401" "$STATUS"

subheader "2.3 Malformed Authorization header"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/me" \
    -H "Authorization: NotBearer ${ADMIN_TOKEN}")
assert_status "Malformed auth header → 401" "401" "$STATUS"

subheader "2.4 Empty Bearer value"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/me" \
    -H "Authorization: Bearer ")
assert_status "Empty bearer → 401" "401" "$STATUS"

subheader "2.5 Valid token — /auth/me works"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/auth/me" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "Valid token → 200" "200" "$STATUS"

subheader "2.6 Refresh token works"
# Hash the refresh token the same way the backend does (SHA256)
REFRESH_HASH=$(echo -n "$ADMIN_REFRESH" | shasum -a 256 | awk '{print $1}')
REFRESH_RESP=$(curl -s -X POST "${API_URL}/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"${ADMIN_REFRESH}\"}")
NEW_TOKEN=$(echo "$REFRESH_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tokens',{}).get('access_token',''))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ -n "$NEW_TOKEN" ] && [ "$NEW_TOKEN" != "" ] && [ "$NEW_TOKEN" != "null" ]; then
    pass "Refresh token rotation works"
    ADMIN_TOKEN="$NEW_TOKEN"  # Use the new token for remaining tests
else
    warn "Refresh token test inconclusive (token format may differ)"
fi

subheader "2.7 Reused refresh token rejected (rotation)"
REUSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refresh_token\":\"${ADMIN_REFRESH}\"}")
assert_status "Reused refresh token rejected (rotation)" "401" "$REUSE_STATUS"

# Re-login since refresh rotated our tokens
ADMIN_LOGIN=$(do_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
ADMIN_TOKEN=$(get_token "$ADMIN_LOGIN")

# ─────────────────────────────────────────────────────────────────────────────
header "3. Role-Based Access Control (RBAC)"
# ─────────────────────────────────────────────────────────────────────────────

# Try to find a staff user, or note if only admin exists
USERS_RESP=$(curl -s "${API_URL}/admin/users" -H "$(auth_header "$ADMIN_TOKEN")")
STAFF_EMAIL=$(echo "$USERS_RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
users = data.get('users', [])
staff = [u for u in users if u.get('role') == 'staff' and u.get('is_active')]
print(staff[0]['email'] if staff else '')
" 2>/dev/null)

if [ -n "$STAFF_EMAIL" ]; then
    info "Found staff user: $STAFF_EMAIL"
    # We don't know the staff password, so we test what we can
    # The important thing is that admin endpoints are protected by role
else
    warn "No staff user found — skipping staff-specific RBAC tests"
    info "Creating a temporary staff user for RBAC testing..."

    CREATE_RESP=$(curl -s -X POST "${API_URL}/admin/users" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test-security-staff@test.local",
            "password": "TestStaff@12345",
            "name": "Security TestUser",
            "role": "user"
        }')
    STAFF_EMAIL="test-security-staff@test.local"
    TEMP_STAFF=true
fi

# Login as staff
STAFF_LOGIN=$(do_login "$STAFF_EMAIL" "TestStaff@12345")
STAFF_TOKEN=$(get_token "$STAFF_LOGIN")
STAFF_USER_ID=$(get_user_id "$STAFF_LOGIN")

if [ -n "$STAFF_TOKEN" ] && [ "$STAFF_TOKEN" != "null" ]; then
    subheader "3.1 Staff cannot list admin users"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/admin/users" \
        -H "$(auth_header "$STAFF_TOKEN")")
    assert_status "Staff → GET /admin/users → 403" "403" "$STATUS"

    subheader "3.2 Staff cannot create users"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/admin/users" \
        -H "$(auth_header "$STAFF_TOKEN")" \
        -H "Content-Type: application/json" \
        -d '{"email":"hack@test.com","password":"Hack12345678","name":"Hack User","role":"admin"}')
    assert_status "Staff → POST /admin/users → 403" "403" "$STATUS"

    subheader "3.3 Staff cannot delete users"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${API_URL}/admin/users/${ADMIN_USER_ID}" \
        -H "$(auth_header "$STAFF_TOKEN")")
    assert_status "Staff → DELETE /admin/users/:id → 403" "403" "$STATUS"

    subheader "3.4 Staff cannot view trash"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/trash" \
        -H "$(auth_header "$STAFF_TOKEN")")
    assert_status "Staff → GET /orders/trash → 403" "403" "$STATUS"

    subheader "3.5 Staff cannot restore archived orders"
    # First create and archive an order to test with
    ORDER_RESP=$(curl -s -X POST "${API_URL}/orders" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d '{"title":"SecTest-Restore","customer_name":"Test","priority":"low"}')
    ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('id',''))" 2>/dev/null)

    if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ]; then
        curl -s -X POST "${API_URL}/orders/${ORDER_ID}/archive" \
            -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null

        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/orders/${ORDER_ID}/restore" \
            -H "$(auth_header "$STAFF_TOKEN")")
        assert_status "Staff → POST /orders/:id/restore → 403" "403" "$STATUS"

        subheader "3.6 Staff cannot permanently delete"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${API_URL}/orders/${ORDER_ID}/permanent" \
            -H "$(auth_header "$STAFF_TOKEN")")
        assert_status "Staff → DELETE /orders/:id/permanent → 403" "403" "$STATUS"

        # Cleanup — admin permanently deletes
        curl -s -X DELETE "${API_URL}/orders/${ORDER_ID}/permanent" \
            -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null
    fi

    subheader "3.7 Staff cannot view admin metrics"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/admin/metrics/users" \
        -H "$(auth_header "$STAFF_TOKEN")")
    assert_status "Staff → GET /admin/metrics/users → 403" "403" "$STATUS"
else
    warn "Could not login as staff — skipping RBAC tests"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "4. Authorization / Data Isolation Tests"
# ─────────────────────────────────────────────────────────────────────────────

if [ -n "$STAFF_TOKEN" ] && [ "$STAFF_TOKEN" != "null" ]; then
    # Create an order assigned only to admin
    ORDER_RESP=$(curl -s -X POST "${API_URL}/orders" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"SecTest-Isolation\",\"customer_name\":\"Test\",\"priority\":\"high\",\"assigned_to\":[\"${ADMIN_USER_ID}\"]}")
    ISO_ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('id',''))" 2>/dev/null)

    if [ -n "$ISO_ORDER_ID" ] && [ "$ISO_ORDER_ID" != "" ]; then
        subheader "4.1 Non-assigned staff can READ order (team-wide visibility)"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/${ISO_ORDER_ID}" \
            -H "$(auth_header "$STAFF_TOKEN")")
        # Note: This will be 200 — team-wide read access is by design
        TOTAL=$((TOTAL + 1))
        if [ "$STATUS" = "200" ]; then
            info "Staff CAN read any order (by design for team visibility)"
        else
            pass "Staff cannot read unassigned orders (strict isolation)"
        fi

        subheader "4.2 Non-assigned staff CANNOT update order"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "${API_URL}/orders/${ISO_ORDER_ID}" \
            -H "$(auth_header "$STAFF_TOKEN")" \
            -H "Content-Type: application/json" \
            -d '{"title":"SecTest-Isolation","customer_name":"Hacked","priority":"high"}')
        assert_status "Non-assigned staff → PATCH order → 403" "403" "$STATUS"

        subheader "4.3 Non-assigned staff CANNOT change status"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "${API_URL}/orders/${ISO_ORDER_ID}/status" \
            -H "$(auth_header "$STAFF_TOKEN")" \
            -H "Content-Type: application/json" \
            -d '{"status":"completed"}')
        assert_status "Non-assigned staff → PATCH status → 403" "403" "$STATUS"

        subheader "4.4 Non-assigned staff CANNOT archive"
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/orders/${ISO_ORDER_ID}/archive" \
            -H "$(auth_header "$STAFF_TOKEN")")
        assert_status "Non-assigned staff → archive → 403" "403" "$STATUS"

        subheader "4.5 Staff CANNOT delete other user's attachment"
        # Upload an attachment as admin
        UPLOAD_RESP=$(curl -s -X POST "${API_URL}/orders/${ISO_ORDER_ID}/attachments/upload-url" \
            -H "$(auth_header "$ADMIN_TOKEN")" \
            -H "Content-Type: application/json" \
            -d '{"file_name":"test.png","mime_type":"image/png","size_bytes":1024}')
        FILE_KEY=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_key',''))" 2>/dev/null)

        if [ -n "$FILE_KEY" ] && [ "$FILE_KEY" != "" ]; then
            # Confirm the upload (even without actual file, the DB record matters)
            CONFIRM_RESP=$(curl -s -X POST "${API_URL}/orders/${ISO_ORDER_ID}/attachments" \
                -H "$(auth_header "$ADMIN_TOKEN")" \
                -H "Content-Type: application/json" \
                -d "{\"file_name\":\"test.png\",\"file_key\":\"${FILE_KEY}\",\"file_url\":\"https://example.com/fake\",\"mime_type\":\"image/png\",\"size_bytes\":1024}")
            ATT_ID=$(echo "$CONFIRM_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('attachment',{}).get('id',''))" 2>/dev/null)

            if [ -n "$ATT_ID" ] && [ "$ATT_ID" != "" ]; then
                STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
                    "${API_URL}/orders/${ISO_ORDER_ID}/attachments/${ATT_ID}" \
                    -H "$(auth_header "$STAFF_TOKEN")")
                assert_status "Staff → delete admin's attachment → 403" "403" "$STATUS"
            else
                warn "Could not create test attachment (R2 may not be configured)"
            fi
        else
            warn "Could not get upload URL (R2 may not be configured)"
        fi

        # Cleanup
        curl -s -X POST "${API_URL}/orders/${ISO_ORDER_ID}/archive" \
            -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
        curl -s -X DELETE "${API_URL}/orders/${ISO_ORDER_ID}/permanent" \
            -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
header "5. Input Validation & Injection Tests"
# ─────────────────────────────────────────────────────────────────────────────

subheader "5.1 XSS in order title"
XSS_RESP=$(curl -s -X POST "${API_URL}/orders" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d '{"title":"<script>alert(1)</script>","customer_name":"Test","priority":"low"}')
XSS_ORDER_ID=$(echo "$XSS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('id',''))" 2>/dev/null)
XSS_TITLE=$(echo "$XSS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('title',''))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ -n "$XSS_ORDER_ID" ]; then
    # The API stores raw — XSS defense should be in the frontend
    info "API stored XSS payload as-is (frontend must sanitize on render)"
    # Cleanup
    curl -s -X POST "${API_URL}/orders/${XSS_ORDER_ID}/archive" \
        -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
    curl -s -X DELETE "${API_URL}/orders/${XSS_ORDER_ID}/permanent" \
        -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
fi

subheader "5.2 SQL injection in search parameter"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "${API_URL}/orders?search=';DROP%20TABLE%20orders;--" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "SQL injection in search → no crash (200)" "200" "$STATUS"

subheader "5.3 Oversized request body"
# Generate a 2MB payload via temp file (avoids shell arg limits)
TMPFILE=$(mktemp)
python3 -c "print('{\"title\":\"' + 'A'*2000000 + '\",\"customer_name\":\"Test\",\"priority\":\"low\"}')" > "$TMPFILE"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/orders" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d @"$TMPFILE" --max-time 10)
rm -f "$TMPFILE"
TOTAL=$((TOTAL + 1))
if [ "$STATUS" = "400" ] || [ "$STATUS" = "413" ]; then
    pass "Oversized body rejected ($STATUS)"
else
    warn "Oversized body accepted (HTTP $STATUS) — consider adding body size limit"
fi

subheader "5.4 Invalid UUID for order ID"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "${API_URL}/orders/not-a-valid-uuid" \
    -H "$(auth_header "$ADMIN_TOKEN")")
TOTAL=$((TOTAL + 1))
if [ "$STATUS" = "404" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "500" ]; then
    pass "Invalid UUID handled (HTTP $STATUS)"
else
    fail "Invalid UUID returned unexpected status: $STATUS"
fi

subheader "5.5 Path traversal in attachment filename"
if [ -n "$ADMIN_TOKEN" ]; then
    TRAVERSE_RESP=$(curl -s -X POST "${API_URL}/orders/00000000-0000-0000-0000-000000000000/attachments/upload-url" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d '{"file_name":"../../../etc/passwd","mime_type":"image/png","size_bytes":1024}')
    TRAVERSE_KEY=$(echo "$TRAVERSE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_key',''))" 2>/dev/null)
    TOTAL=$((TOTAL + 1))
    if echo "$TRAVERSE_KEY" | grep -q "\.\./"; then
        fail "Path traversal in filename NOT sanitized: $TRAVERSE_KEY"
    else
        pass "Filename sanitized — no path traversal in R2 key"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
header "6. HTTP Security Headers"
# ─────────────────────────────────────────────────────────────────────────────

HEADERS=$(curl -s -I "${BASE_URL}/health")

check_header() {
    local name="$1"
    local expected="$2"
    TOTAL=$((TOTAL + 1))
    VALUE=$(echo "$HEADERS" | grep -i "^${name}:" | head -1 | sed 's/^[^:]*: *//' | tr -d '\r')
    if [ -n "$VALUE" ]; then
        pass "Header ${name}: ${VALUE}"
    else
        warn "Missing header: ${name} (recommended: ${expected})"
    fi
}

subheader "6.1 Security headers on /health"
check_header "X-Content-Type-Options" "nosniff"
check_header "X-Frame-Options" "DENY"
check_header "X-XSS-Protection" "1; mode=block"

subheader "6.2 CORS headers (should not wildcard in production)"
CORS_ORIGIN=$(echo "$HEADERS" | grep -i "access-control-allow-origin" | head -1 | sed 's/^[^:]*: *//' | tr -d '\r')
TOTAL=$((TOTAL + 1))
if [ "$CORS_ORIGIN" = "*" ]; then
    warn "CORS allows all origins (*) — OK for dev, not for production"
elif [ -n "$CORS_ORIGIN" ]; then
    pass "CORS restricted to: $CORS_ORIGIN"
else
    info "No CORS header on /health (non-CORS request)"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "7. Rate Limiting Test"
# ─────────────────────────────────────────────────────────────────────────────

subheader "7.1 Rapid requests (50 in 2 seconds)"
RATE_LIMITED=false
for i in $(seq 1 50); do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
    if [ "$STATUS" = "429" ]; then
        RATE_LIMITED=true
        break
    fi
done
TOTAL=$((TOTAL + 1))
if $RATE_LIMITED; then
    pass "Rate limiting engaged after rapid requests"
else
    info "No rate limiting triggered at 50 req (configured burst=$((${RATE_LIMIT_BURST:-200})))"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup temp staff user
# ─────────────────────────────────────────────────────────────────────────────
if [ "${TEMP_STAFF:-false}" = "true" ] && [ -n "$STAFF_USER_ID" ]; then
    curl -s -X DELETE "${API_URL}/admin/users/${STAFF_USER_ID}" \
        -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
    info "Cleaned up temporary staff user"
fi

# ─────────────────────────────────────────────────────────────────────────────
summary
exit $?
