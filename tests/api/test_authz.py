"""
Phase 2 — Authorization matrix tests.

Ensures members cannot access admin-only routes and that
unassigned users cannot modify orders they're not assigned to.
"""

import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status,
    SEED_ORDER_IDS, SEED_MEMBER_IDS,
)


class TestMemberCannotAccessAdminRoutes:
    """A member token must receive 403 on all admin-only endpoints."""

    def test_member_cannot_list_users(self, member_token):
        resp = api_get("/api/v1/admin/users", token=member_token)
        assert_status(resp, 403)

    def test_member_cannot_create_user(self, member_token):
        resp = api_post("/api/v1/admin/users", token=member_token, json={
            "name": "Hacker",
            "email": "hacker@evil.com",
            "password": "H4cker@1234",
            "role": "admin",
        })
        assert_status(resp, 403)

    def test_member_cannot_update_user(self, member_token):
        target_id = SEED_MEMBER_IDS["james"]
        resp = api_patch(f"/api/v1/admin/users/{target_id}", token=member_token, json={
            "name": "Hacked Name",
            "email": "james@giftco.com",
            "role": "admin",
        })
        assert_status(resp, 403)

    def test_member_cannot_change_password(self, member_token):
        target_id = SEED_MEMBER_IDS["james"]
        resp = api_patch(
            f"/api/v1/admin/users/{target_id}/password",
            token=member_token,
            json={"password": "NewHacked@1234"},
        )
        assert_status(resp, 403)

    def test_member_cannot_disable_user(self, member_token):
        target_id = SEED_MEMBER_IDS["james"]
        resp = api_patch(
            f"/api/v1/admin/users/{target_id}/disable",
            token=member_token,
        )
        assert_status(resp, 403)

    def test_member_cannot_enable_user(self, member_token):
        target_id = SEED_MEMBER_IDS["james"]
        resp = api_patch(
            f"/api/v1/admin/users/{target_id}/enable",
            token=member_token,
        )
        assert_status(resp, 403)

    def test_member_cannot_delete_user(self, member_token):
        target_id = SEED_MEMBER_IDS["james"]
        resp = api_delete(
            f"/api/v1/admin/users/{target_id}",
            token=member_token,
        )
        assert_status(resp, 403)


class TestMemberCannotAccessTrashOrRestore:
    """Members cannot access trash list, restore, or permanent delete."""

    def test_member_cannot_list_trash(self, member_token):
        resp = api_get("/api/v1/orders/trash", token=member_token)
        assert_status(resp, 403)

    def test_member_cannot_restore_order(self, member_token):
        # Use a seed order ID — the restore will fail with 403 before
        # it even checks if the order is archived.
        order_id = SEED_ORDER_IDS[0]
        resp = api_post(
            f"/api/v1/orders/{order_id}/restore",
            token=member_token,
        )
        assert_status(resp, 403)

    def test_member_cannot_permanent_delete(self, member_token):
        order_id = SEED_ORDER_IDS[0]
        resp = api_delete(
            f"/api/v1/orders/{order_id}/permanent",
            token=member_token,
        )
        assert_status(resp, 403)


class TestAdminCanAccessAllRoutes:
    """Admin should be able to access all protected endpoints."""

    def test_admin_can_list_users(self, admin_token):
        resp = api_get("/api/v1/admin/users", token=admin_token)
        assert_status(resp, 200)

    def test_admin_can_list_trash(self, admin_token):
        resp = api_get("/api/v1/orders/trash", token=admin_token)
        assert_status(resp, 200)

    def test_admin_can_access_orders(self, admin_token):
        resp = api_get("/api/v1/orders", token=admin_token)
        assert_status(resp, 200)


class TestUnassignedMemberCannotModifyOrder:
    """
    A member who is NOT assigned to an order should get 403 when
    trying to update or change status on that order.

    james (member2) is assigned to order bbbb0002 but NOT to bbbb0003.
    bbbb0003 is assigned to priya only.
    """

    def test_unassigned_member_cannot_update_order(self, member2_token):
        # bbbb0003 is assigned to priya only — james should be blocked
        order_id = SEED_ORDER_IDS[2]  # bbbb0003
        resp = api_patch(f"/api/v1/orders/{order_id}", token=member2_token, json={
            "title": "Hacked Title",
            "customer_name": "Hacked Customer",
            "priority": "low",
        })
        assert_status(resp, 403)

    def test_unassigned_member_cannot_change_status(self, member2_token):
        order_id = SEED_ORDER_IDS[2]  # bbbb0003
        resp = api_patch(
            f"/api/v1/orders/{order_id}/status",
            token=member2_token,
            json={"status": "completed"},
        )
        assert_status(resp, 403)

    def test_unassigned_member_cannot_archive(self, member2_token):
        order_id = SEED_ORDER_IDS[2]  # bbbb0003
        resp = api_post(
            f"/api/v1/orders/{order_id}/archive",
            token=member2_token,
        )
        assert_status(resp, 403)
