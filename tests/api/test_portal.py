"""
Phase 1 — Customer Portal endpoint functional tests.

Covers the public portal routes (/api/portal/:token) and
the staff-side portal management routes (/api/v1/orders/:id/portal).

NOTE: Portal tests require a live order with a portal token. We create one
on the fly using the staff endpoint and clean up after.
"""

import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status, assert_json_keys, assert_response_time,
)


@pytest.fixture(scope="module")
def portal_context(admin_token, created_order_id):
    """Create a portal for the test order and return (order_id, portal_token)."""
    # Create portal
    resp = api_post(
        f"/api/v1/orders/{created_order_id}/portal",
        token=admin_token,
    )
    # May already exist from a previous run — 200 or 201 both OK
    assert resp.status_code in (200, 201), f"Portal creation failed: {resp.text}"
    data = resp.json()
    portal_token = data.get("token") or data.get("portal", {}).get("token")
    assert portal_token, f"No portal token in response: {data}"
    return created_order_id, portal_token


# ═══════════════════════════════════════════════════════════════════════════
# Staff-side portal management
# ═══════════════════════════════════════════════════════════════════════════

class TestStaffPortalManagement:
    """Staff endpoints under /api/v1/orders/:id/portal."""

    def test_get_order_portal(self, admin_token, portal_context):
        order_id, _ = portal_context
        resp = api_get(
            f"/api/v1/orders/{order_id}/portal",
            token=admin_token,
        )
        assert_status(resp, 200)

    def test_staff_reply(self, admin_token, portal_context):
        order_id, _ = portal_context
        resp = api_post(
            f"/api/v1/orders/{order_id}/portal/reply",
            token=admin_token,
            json={"text": "Staff reply from test suite"},
        )
        assert_status(resp, 201)

    def test_staff_get_messages(self, admin_token, portal_context):
        order_id, _ = portal_context
        resp = api_get(
            f"/api/v1/orders/{order_id}/portal/messages",
            token=admin_token,
        )
        assert_status(resp, 200)

    def test_staff_list_attachments(self, admin_token, portal_context):
        order_id, _ = portal_context
        resp = api_get(
            f"/api/v1/orders/{order_id}/portal/attachments",
            token=admin_token,
        )
        assert_status(resp, 200)


# ═══════════════════════════════════════════════════════════════════════════
# Public portal routes (no auth, token-based)
# ═══════════════════════════════════════════════════════════════════════════

class TestPublicPortal:
    """Public endpoints under /api/portal/:token."""

    def test_get_portal(self, portal_context):
        _, token = portal_context
        resp = api_get(f"/api/portal/{token}")
        assert_status(resp, 200)

    def test_get_messages(self, portal_context):
        _, token = portal_context
        resp = api_get(f"/api/portal/{token}/messages")
        assert_status(resp, 200)

    def test_send_message(self, portal_context):
        _, token = portal_context
        resp = api_post(
            f"/api/portal/{token}/messages",
            json={"text": "Customer message from test suite"},
        )
        assert_status(resp, 201)

    def test_get_attachments(self, portal_context):
        _, token = portal_context
        resp = api_get(f"/api/portal/{token}/attachments")
        assert_status(resp, 200)

    def test_invalid_portal_token(self):
        resp = api_get("/api/portal/invalid-token-12345")
        assert resp.status_code in (404, 400)

    def test_portal_response_time(self, portal_context):
        _, token = portal_context
        resp = api_get(f"/api/portal/{token}")
        assert_response_time(resp)
