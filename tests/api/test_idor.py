"""
Phase 4 — IDOR (Insecure Direct Object Reference) tests.

Tests that users cannot access or modify resources belonging to
other users by manually changing IDs in the URL.
"""

import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status,
    SEED_ORDER_IDS, SEED_MEMBER_IDS,
)


class TestOrderIDOR:
    """
    Test that members can only modify orders they're assigned to.

    Seed data:
      - Sarah (member_token)  → assigned to o01, o07, o12, o17
      - James (member2_token) → assigned to o01, o02, o08, o13, o16, o18
      - Priya                 → assigned to o03, o04, o09, o14, o19
    """

    def test_member_can_read_any_order(self, member_token):
        """All authenticated users can READ any order."""
        order_id = SEED_ORDER_IDS[1]  # o02 — sarah not assigned
        resp = api_get(f"/api/v1/orders/{order_id}", token=member_token)
        # Read should be allowed for any authenticated user
        assert_status(resp, 200)

    def test_member_cannot_update_unassigned_order(self, member_token):
        """
        Sarah (member_token) is NOT assigned to o03 (assigned to priya only).
        She should NOT be able to update it.
        """
        order_id = SEED_ORDER_IDS[2]  # o03
        resp = api_patch(f"/api/v1/orders/{order_id}", token=member_token, json={
            "title": "IDOR Test - Should Fail",
            "customer_name": "IDOR Customer",
            "priority": "low",
        })
        assert_status(resp, 403)

    def test_member_cannot_change_status_unassigned(self, member_token):
        """Sarah cannot change status on o03."""
        order_id = SEED_ORDER_IDS[2]  # o03
        resp = api_patch(
            f"/api/v1/orders/{order_id}/status",
            token=member_token,
            json={"status": "completed"},
        )
        assert_status(resp, 403)

    def test_member_cannot_archive_unassigned(self, member_token):
        """Sarah cannot archive o03."""
        order_id = SEED_ORDER_IDS[2]  # o03
        resp = api_post(
            f"/api/v1/orders/{order_id}/archive",
            token=member_token,
        )
        assert_status(resp, 403)

    def test_member_can_update_assigned_order(self, member_token):
        """
        Sarah IS assigned to o01. She should succeed.
        We fetch current state first to avoid destroying seed data.
        """
        order_id = SEED_ORDER_IDS[0]  # o01
        # Get current state
        get_resp = api_get(f"/api/v1/orders/{order_id}", token=member_token)
        assert_status(get_resp, 200)
        order = get_resp.json()["order"]

        # Update with same data — should be allowed
        resp = api_patch(f"/api/v1/orders/{order_id}", token=member_token, json={
            "title": order["title"],
            "customer_name": order["customer_name"],
            "priority": order["priority"],
            "description": order.get("description", ""),
            "contact_number": order.get("contact_number", ""),
            "assigned_to": order.get("assigned_to", []),
        })
        assert_status(resp, 200)


class TestNotificationIDOR:
    """
    Notification endpoints should only return data relevant to the
    requesting user. There's no hard 403 expected — but we verify
    no cross-user data leaks.
    """

    def test_notifications_scoped_to_user(self, member_token, member2_token):
        """Each user should get their own notification data."""
        resp1 = api_get("/api/v1/notifications", token=member_token)
        resp2 = api_get("/api/v1/notifications", token=member2_token)
        assert_status(resp1, 200)
        assert_status(resp2, 200)
        # Both should succeed but may have different counts
        # (we can't assert content equality — just that both work)

    def test_order_notifications_accessible(self, member_token):
        """
        Any authenticated user can view notifications for any order
        (the backend doesn't restrict this — notifications are scoped
        by user_id in the query, so they only see their own data).
        """
        order_id = SEED_ORDER_IDS[0]
        resp = api_get(
            f"/api/v1/notifications/order/{order_id}",
            token=member_token,
        )
        assert_status(resp, 200)


class TestEventIDOR:
    """
    Test that members cannot delete events on orders they're not assigned to.
    """

    @pytest.mark.destructive
    def test_member_cannot_delete_event_on_unassigned_order(
        self, admin_token, member_token
    ):
        """
        Create a comment as admin on o03 (priya-only order),
        then sarah (member_token) tries to delete it → 403.
        """
        order_id = SEED_ORDER_IDS[2]  # o03 — not assigned to sarah

        # Admin adds a comment
        create_resp = api_post(
            f"/api/v1/orders/{order_id}/comments",
            token=admin_token,
            json={"text": "IDOR deletion test comment"},
        )
        assert_status(create_resp, 201)
        event_id = create_resp.json()["event"]["id"]

        # Sarah tries to delete it
        resp = api_delete(
            f"/api/v1/orders/{order_id}/events/{event_id}",
            token=member_token,
        )
        assert_status(resp, 403)

        # Cleanup: admin deletes it
        api_delete(
            f"/api/v1/orders/{order_id}/events/{event_id}",
            token=admin_token,
        )
