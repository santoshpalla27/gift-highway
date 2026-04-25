"""
Phase 1 — Order CRUD functional tests.

Covers:
  - GET    /api/v1/orders             (list, pagination, filters)
  - POST   /api/v1/orders             (create)
  - GET    /api/v1/orders/:id         (get by ID, not found)
  - PATCH  /api/v1/orders/:id         (update)
  - PATCH  /api/v1/orders/:id/status  (status change)
  - POST   /api/v1/orders/:id/archive (archive)
  - POST   /api/v1/orders/:id/restore (restore — admin only)
  - GET    /api/v1/orders/trash       (trash list — admin only)
  - DELETE /api/v1/orders/:id/permanent (permanent delete — admin only)
"""

import uuid
import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status, assert_json_keys, assert_response_time,
    SEED_ORDER_IDS,
)


class TestListOrders:
    """GET /api/v1/orders."""

    def test_list_returns_200(self, admin_token):
        resp = api_get("/api/v1/orders", token=admin_token)
        assert_status(resp, 200)

    def test_list_shape(self, admin_token):
        resp = api_get("/api/v1/orders", token=admin_token)
        assert_json_keys(resp, ["orders", "total", "page", "limit"])
        assert isinstance(resp.json()["orders"], list)

    def test_list_pagination(self, admin_token):
        resp = api_get("/api/v1/orders?page=1&limit=5", token=admin_token)
        assert_status(resp, 200)
        data = resp.json()
        assert len(data["orders"]) <= 5
        assert data["page"] == 1

    def test_list_filter_by_status(self, admin_token):
        resp = api_get("/api/v1/orders?status=completed", token=admin_token)
        assert_status(resp, 200)
        for order in resp.json()["orders"]:
            assert order["status"] == "completed"

    def test_list_filter_by_priority(self, admin_token):
        resp = api_get("/api/v1/orders?priority=urgent", token=admin_token)
        assert_status(resp, 200)
        for order in resp.json()["orders"]:
            assert order["priority"] == "urgent"

    def test_list_search(self, admin_token):
        resp = api_get("/api/v1/orders?search=Wedding", token=admin_token)
        assert_status(resp, 200)

    def test_list_response_time(self, admin_token):
        resp = api_get("/api/v1/orders", token=admin_token)
        assert_response_time(resp)

    def test_list_without_token(self):
        resp = api_get("/api/v1/orders")
        assert_status(resp, 401)


class TestCreateOrder:
    """POST /api/v1/orders."""

    @pytest.mark.destructive
    def test_create_success(self, admin_token):
        payload = {
            "title": f"Test Order {uuid.uuid4().hex[:8]}",
            "customer_name": "Create Test Customer",
            "priority": "low",
            "description": "Testing order creation",
            "contact_number": "+1-555-9999",
        }
        resp = api_post("/api/v1/orders", token=admin_token, json=payload)
        assert_status(resp, 201)
        order = resp.json()["order"]
        assert order["title"] == payload["title"]
        assert order["customer_name"] == payload["customer_name"]
        assert order["status"] == "new"
        assert "id" in order

        # Cleanup
        api_post(f"/api/v1/orders/{order['id']}/archive", token=admin_token)
        api_delete(f"/api/v1/orders/{order['id']}/permanent", token=admin_token)

    def test_create_missing_required(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "description": "No title or customer_name",
        })
        assert_status(resp, 400)

    def test_create_invalid_priority(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "Test",
            "customer_name": "Test",
            "priority": "extreme",
        })
        assert_status(resp, 400)

    def test_create_without_token(self):
        resp = api_post("/api/v1/orders", json={
            "title": "No Auth",
            "customer_name": "Test",
            "priority": "low",
        })
        assert_status(resp, 401)


class TestGetOrder:
    """GET /api/v1/orders/:id."""

    def test_get_by_id(self, admin_token, seed_order_id):
        resp = api_get(f"/api/v1/orders/{seed_order_id}", token=admin_token)
        assert_status(resp, 200)
        order = resp.json()["order"]
        assert order["id"] == seed_order_id
        # Verify all expected fields present
        expected_keys = [
            "id", "order_number", "title", "description",
            "customer_name", "status", "priority", "created_by",
            "assigned_to", "created_at", "updated_at",
        ]
        for key in expected_keys:
            assert key in order, f"Missing key '{key}' in order response"

    def test_get_not_found(self, admin_token):
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = api_get(f"/api/v1/orders/{fake_id}", token=admin_token)
        assert_status(resp, 404)

    def test_get_response_time(self, admin_token, seed_order_id):
        resp = api_get(f"/api/v1/orders/{seed_order_id}", token=admin_token)
        assert_response_time(resp, max_ms=1000)


class TestUpdateOrder:
    """PATCH /api/v1/orders/:id."""

    def test_update_success(self, admin_token, created_order_id):
        resp = api_patch(f"/api/v1/orders/{created_order_id}", token=admin_token, json={
            "title": "Updated Title",
            "customer_name": "Updated Customer",
            "priority": "high",
            "description": "Updated description",
            "contact_number": "+1-555-1111",
            "assigned_to": [],
        })
        assert_status(resp, 200)

        # Verify update persisted
        get_resp = api_get(f"/api/v1/orders/{created_order_id}", token=admin_token)
        assert get_resp.json()["order"]["title"] == "Updated Title"

    def test_update_bad_priority(self, admin_token, created_order_id):
        resp = api_patch(f"/api/v1/orders/{created_order_id}", token=admin_token, json={
            "title": "Test",
            "customer_name": "Test",
            "priority": "invalid",
        })
        assert_status(resp, 400)


class TestUpdateStatus:
    """PATCH /api/v1/orders/:id/status."""

    def test_status_change(self, admin_token, created_order_id):
        resp = api_patch(f"/api/v1/orders/{created_order_id}/status", token=admin_token, json={
            "status": "in_progress",
        })
        assert_status(resp, 200)

    def test_invalid_status(self, admin_token, created_order_id):
        resp = api_patch(f"/api/v1/orders/{created_order_id}/status", token=admin_token, json={
            "status": "banana",
        })
        assert_status(resp, 400)


class TestArchiveRestoreDelete:
    """Archive, restore, trash, permanent delete — admin flow."""

    @pytest.mark.destructive
    def test_full_archive_restore_delete_flow(self, admin_token):
        # Create a disposable order
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": f"Archive Test {uuid.uuid4().hex[:8]}",
            "customer_name": "Archive Customer",
            "priority": "low",
        })
        assert_status(resp, 201)
        oid = resp.json()["order"]["id"]

        # Archive
        resp = api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)
        assert_status(resp, 200)

        # Trash list should contain it
        resp = api_get("/api/v1/orders/trash", token=admin_token)
        assert_status(resp, 200)
        trash_ids = [o["id"] for o in resp.json()["orders"]]
        assert oid in trash_ids

        # Restore
        resp = api_post(f"/api/v1/orders/{oid}/restore", token=admin_token)
        assert_status(resp, 200)

        # Archive again for cleanup
        api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)

        # Permanent delete
        resp = api_delete(f"/api/v1/orders/{oid}/permanent", token=admin_token)
        assert_status(resp, 200)

        # Should be gone
        resp = api_get(f"/api/v1/orders/{oid}", token=admin_token)
        assert_status(resp, 404)
