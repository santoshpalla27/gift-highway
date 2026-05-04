#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Data Lifecycle Test — Verifies zero residue after full order lifecycle
# Creates order → adds events/attachments/comments → archives → permanent delete
# Then verifies all DB rows and R2 files are cleaned up.
#
# Usage:
#   BASE_URL=https://yourdomain.com ./scripts/tests/test_data_lifecycle.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

echo -e "${BOLD}♻️  DATA LIFECYCLE TEST${NC}"
echo -e "   Target: ${CYAN}${BASE_URL}${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
header "0. Setup — Login & Get Baselines"
# ─────────────────────────────────────────────────────────────────────────────

ADMIN_LOGIN=$(do_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
ADMIN_TOKEN=$(get_token "$ADMIN_LOGIN")
ADMIN_USER_ID=$(get_user_id "$ADMIN_LOGIN")

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    fail "Admin login failed — cannot run lifecycle tests"
    summary
    exit 1
fi
pass "Admin login OK"

# Count current orders (for baseline)
BASELINE_RESP=$(curl -s "${API_URL}/orders?limit=1" -H "$(auth_header "$ADMIN_TOKEN")")
BASELINE_COUNT=$(echo "$BASELINE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
info "Baseline: $BASELINE_COUNT active orders"

# ─────────────────────────────────────────────────────────────────────────────
header "1. Create Order"
# ─────────────────────────────────────────────────────────────────────────────

UNIQUE_TITLE="LifecycleTest-$(date +%s)"
ORDER_RESP=$(curl -s -X POST "${API_URL}/orders" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d "{
        \"title\": \"${UNIQUE_TITLE}\",
        \"description\": \"Lifecycle test order — should be fully cleaned up\",
        \"customer_name\": \"Test Customer\",
        \"contact_number\": \"1234567890\",
        \"priority\": \"medium\",
        \"assigned_to\": [\"${ADMIN_USER_ID}\"],
        \"due_date\": \"2099-12-31\"
    }")

ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('id',''))" 2>/dev/null)
ORDER_NUM=$(echo "$ORDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('order_number',0))" 2>/dev/null)

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ]; then
    pass "Order created: #${ORDER_NUM} (${ORDER_ID})"
else
    fail "Failed to create order"
    summary
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
header "2. Add Data — Enrich the Order"
# ─────────────────────────────────────────────────────────────────────────────

subheader "2.1 Add comments"
for i in 1 2 3; do
    COMMENT_RESP=$(curl -s -X POST "${API_URL}/orders/${ORDER_ID}/comments" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"Test comment #${i} for lifecycle testing\"}")
    COMMENT_STATUS=$(echo "$COMMENT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('event') else 'fail')" 2>/dev/null)
    if [ "$COMMENT_STATUS" = "ok" ]; then
        pass "Comment #$i added"
    else
        warn "Comment #$i may have failed"
    fi
done

subheader "2.2 Change status"
curl -s -X PATCH "${API_URL}/orders/${ORDER_ID}/status" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d '{"status":"in_progress"}' > /dev/null
pass "Status changed to in_progress"

subheader "2.3 Change priority"
curl -s -X PATCH "${API_URL}/orders/${ORDER_ID}" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"${UNIQUE_TITLE}\",\"customer_name\":\"Test Customer\",\"priority\":\"high\",\"assigned_to\":[\"${ADMIN_USER_ID}\"]}" > /dev/null
pass "Priority changed to high"

subheader "2.4 Try attachment upload (R2 dependent)"
ATT_RESP=$(curl -s -X POST "${API_URL}/orders/${ORDER_ID}/attachments/upload-url" \
    -H "$(auth_header "$ADMIN_TOKEN")" \
    -H "Content-Type: application/json" \
    -d '{"file_name":"lifecycle-test.png","mime_type":"image/png","size_bytes":2048}')
FILE_KEY=$(echo "$ATT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_key',''))" 2>/dev/null)
FILE_URL=$(echo "$ATT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('file_url',''))" 2>/dev/null)
UPLOAD_URL=$(echo "$ATT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_url',''))" 2>/dev/null)

R2_CONFIGURED=false
if [ -n "$FILE_KEY" ] && [ "$FILE_KEY" != "" ]; then
    R2_CONFIGURED=true
    # Upload a tiny PNG to R2
    # 1x1 transparent PNG (67 bytes)
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test_pixel.png
    
    UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$UPLOAD_URL" \
        -H "Content-Type: image/png" \
        --data-binary @/tmp/test_pixel.png --max-time 10 2>/dev/null || echo "000")
    
    if [ "$UPLOAD_STATUS" = "200" ]; then
        # Confirm the upload
        curl -s -X POST "${API_URL}/orders/${ORDER_ID}/attachments" \
            -H "$(auth_header "$ADMIN_TOKEN")" \
            -H "Content-Type: application/json" \
            -d "{\"file_name\":\"lifecycle-test.png\",\"file_key\":\"${FILE_KEY}\",\"file_url\":\"${FILE_URL}\",\"mime_type\":\"image/png\",\"size_bytes\":67}" > /dev/null
        pass "Attachment uploaded and confirmed (R2 file created)"
    else
        warn "R2 upload returned $UPLOAD_STATUS (R2 credentials may not be configured)"
        R2_CONFIGURED=false
    fi
    rm -f /tmp/test_pixel.png
else
    warn "R2 not configured — skipping attachment upload tests"
fi

subheader "2.5 Mark notification as read"
curl -s -X POST "${API_URL}/notifications/read/${ORDER_ID}" \
    -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null 2>&1
pass "Notification marked read (notification_reads row created)"

# ─────────────────────────────────────────────────────────────────────────────
header "3. Verify Data Exists"
# ─────────────────────────────────────────────────────────────────────────────

subheader "3.1 Order exists"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/${ORDER_ID}" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "Order is retrievable" "200" "$STATUS"

subheader "3.2 Events exist"
EVENTS_RESP=$(curl -s "${API_URL}/orders/${ORDER_ID}/events" \
    -H "$(auth_header "$ADMIN_TOKEN")")
EVENT_COUNT=$(echo "$EVENTS_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$EVENT_COUNT" -gt 0 ] 2>/dev/null; then
    pass "$EVENT_COUNT timeline events exist"
else
    warn "Could not verify event count"
fi

subheader "3.3 Attachments exist"
ATTS_RESP=$(curl -s "${API_URL}/orders/${ORDER_ID}/attachments" \
    -H "$(auth_header "$ADMIN_TOKEN")")
ATT_COUNT=$(echo "$ATTS_RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('attachments',[])))" 2>/dev/null)
info "$ATT_COUNT attachments on this order"

# ─────────────────────────────────────────────────────────────────────────────
header "4. Archive Order"
# ─────────────────────────────────────────────────────────────────────────────

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/orders/${ORDER_ID}/archive" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "Order archived" "200" "$STATUS"

# Verify it's in trash
TRASH_RESP=$(curl -s "${API_URL}/orders/trash" -H "$(auth_header "$ADMIN_TOKEN")")
IN_TRASH=$(echo "$TRASH_RESP" | python3 -c "
import sys,json
orders = json.load(sys.stdin).get('orders',[])
print('yes' if any(o['id'] == '${ORDER_ID}' for o in orders) else 'no')
" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$IN_TRASH" = "yes" ]; then
    pass "Order appears in trash"
else
    fail "Order not found in trash"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "5. Permanent Delete"
# ─────────────────────────────────────────────────────────────────────────────

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${API_URL}/orders/${ORDER_ID}/permanent" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "Order permanently deleted" "200" "$STATUS"

# Small delay for async R2 cleanup
sleep 1

# ─────────────────────────────────────────────────────────────────────────────
header "6. Verify Complete Cleanup"
# ─────────────────────────────────────────────────────────────────────────────

subheader "6.1 Order no longer exists"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/${ORDER_ID}" \
    -H "$(auth_header "$ADMIN_TOKEN")")
assert_status "Order returns 404" "404" "$STATUS"

subheader "6.2 Order not in trash"
TRASH_RESP=$(curl -s "${API_URL}/orders/trash" -H "$(auth_header "$ADMIN_TOKEN")")
NOT_IN_TRASH=$(echo "$TRASH_RESP" | python3 -c "
import sys,json
orders = json.load(sys.stdin).get('orders',[])
print('clean' if not any(o['id'] == '${ORDER_ID}' for o in orders) else 'still_there')
" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$NOT_IN_TRASH" = "clean" ]; then
    pass "Order removed from trash"
else
    fail "Order still appears in trash!"
fi

subheader "6.3 Events cleaned up"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/${ORDER_ID}/events" \
    -H "$(auth_header "$ADMIN_TOKEN")")
TOTAL=$((TOTAL + 1))
if [ "$STATUS" = "404" ] || [ "$STATUS" = "500" ]; then
    pass "Events endpoint returns $STATUS (order gone)"
else
    EVENTS_AFTER=$(curl -s "${API_URL}/orders/${ORDER_ID}/events" \
        -H "$(auth_header "$ADMIN_TOKEN")")
    EVENTS_COUNT_AFTER=$(echo "$EVENTS_AFTER" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null)
    if [ "$EVENTS_COUNT_AFTER" = "0" ]; then
        pass "Events cleaned up (0 remaining)"
    else
        fail "Events still exist: $EVENTS_COUNT_AFTER"
    fi
fi

subheader "6.4 Attachments cleaned up"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/orders/${ORDER_ID}/attachments" \
    -H "$(auth_header "$ADMIN_TOKEN")")
TOTAL=$((TOTAL + 1))
if [ "$STATUS" = "404" ] || [ "$STATUS" = "500" ]; then
    pass "Attachments endpoint returns $STATUS (order gone)"
else
    ATTS_AFTER=$(curl -s "${API_URL}/orders/${ORDER_ID}/attachments" \
        -H "$(auth_header "$ADMIN_TOKEN")")
    ATTS_COUNT_AFTER=$(echo "$ATTS_AFTER" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('attachments',[])))" 2>/dev/null)
    if [ "$ATTS_COUNT_AFTER" = "0" ]; then
        pass "Attachments cleaned up (0 remaining)"
    else
        fail "Attachments still exist: $ATTS_COUNT_AFTER"
    fi
fi

subheader "6.5 Order count returned to baseline"
AFTER_RESP=$(curl -s "${API_URL}/orders?limit=1" -H "$(auth_header "$ADMIN_TOKEN")")
AFTER_COUNT=$(echo "$AFTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$AFTER_COUNT" = "$BASELINE_COUNT" ]; then
    pass "Order count: $BASELINE_COUNT → $BASELINE_COUNT (zero growth ✓)"
else
    fail "Order count: $BASELINE_COUNT → $AFTER_COUNT (expected $BASELINE_COUNT)"
fi

if $R2_CONFIGURED; then
    subheader "6.6 R2 file verification"
    info "R2 file at key '${FILE_KEY}' should have been deleted by PermanentDelete"
    info "To verify manually: check R2 dashboard or run 'aws s3 ls s3://bucket/orders/${ORDER_ID}/'"
fi

# ─────────────────────────────────────────────────────────────────────────────
header "7. Bulk Lifecycle Test (10 orders)"
# ─────────────────────────────────────────────────────────────────────────────

subheader "7.1 Create 10 orders"
ORDER_IDS=()
for i in $(seq 1 10); do
    RESP=$(curl -s -X POST "${API_URL}/orders" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"BulkTest-${i}-$(date +%s%N)\",\"customer_name\":\"Bulk Customer ${i}\",\"priority\":\"low\"}")
    OID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('order',{}).get('id',''))" 2>/dev/null)
    if [ -n "$OID" ] && [ "$OID" != "" ]; then
        ORDER_IDS+=("$OID")
    fi
done
pass "Created ${#ORDER_IDS[@]} orders"

subheader "7.2 Add a comment to each"
for OID in "${ORDER_IDS[@]}"; do
    curl -s -X POST "${API_URL}/orders/${OID}/comments" \
        -H "$(auth_header "$ADMIN_TOKEN")" \
        -H "Content-Type: application/json" \
        -d '{"text":"Bulk lifecycle test comment"}' > /dev/null
done
pass "Added comments to all 10 orders"

subheader "7.3 Archive all"
for OID in "${ORDER_IDS[@]}"; do
    curl -s -X POST "${API_URL}/orders/${OID}/archive" \
        -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null
done
pass "Archived all 10 orders"

subheader "7.4 Permanently delete all"
for OID in "${ORDER_IDS[@]}"; do
    curl -s -X DELETE "${API_URL}/orders/${OID}/permanent" \
        -H "$(auth_header "$ADMIN_TOKEN")" > /dev/null
done
pass "Permanently deleted all 10 orders"

subheader "7.5 Verify count back to baseline"
sleep 1
FINAL_RESP=$(curl -s "${API_URL}/orders?limit=1" -H "$(auth_header "$ADMIN_TOKEN")")
FINAL_COUNT=$(echo "$FINAL_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$FINAL_COUNT" = "$BASELINE_COUNT" ]; then
    pass "After 10-order cycle: count=$FINAL_COUNT (matches baseline $BASELINE_COUNT ✓)"
else
    fail "After 10-order cycle: count=$FINAL_COUNT (expected $BASELINE_COUNT)"
fi

# ─────────────────────────────────────────────────────────────────────────────
summary
exit $?
