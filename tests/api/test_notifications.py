"""
Phase 1 — Notification endpoint functional tests.

Covers:
  - GET  /api/v1/notifications                       (unread groups)
  - GET  /api/v1/notifications/activity               (flat activity)
  - GET  /api/v1/notifications/history                (full history)
  - GET  /api/v1/notifications/orders                 (order summaries)
  - GET  /api/v1/notifications/order/:orderId         (order notifications)
  - GET  /api/v1/notifications/order/:orderId/last-seen
  - POST /api/v1/notifications/read/:orderId          (mark order read)
  - POST /api/v1/notifications/read-all               (mark all read)
"""

from .helpers import (
    api_get, api_post,
    assert_status, assert_json_keys, assert_response_time,
    SEED_ORDER_IDS,
)


class TestGetUnread:
    """GET /api/v1/notifications."""

    def test_unread_returns_200(self, member_token):
        resp = api_get("/api/v1/notifications", token=member_token)
        assert_status(resp, 200)

    def test_unread_shape(self, member_token):
        resp = api_get("/api/v1/notifications", token=member_token)
        assert_json_keys(resp, ["groups", "total_count"])

    def test_unread_mine_filter(self, member_token):
        resp = api_get("/api/v1/notifications?mine=true", token=member_token)
        assert_status(resp, 200)
        assert_json_keys(resp, ["groups", "total_count"])

    def test_unread_others_filter(self, member_token):
        resp = api_get("/api/v1/notifications?others=true", token=member_token)
        assert_status(resp, 200)

    def test_unread_response_time(self, member_token):
        resp = api_get("/api/v1/notifications", token=member_token)
        assert_response_time(resp)

    def test_unread_no_auth(self):
        resp = api_get("/api/v1/notifications")
        assert_status(resp, 401)


class TestGetActivity:
    """GET /api/v1/notifications/activity."""

    def test_activity_returns_200(self, member_token):
        resp = api_get("/api/v1/notifications/activity", token=member_token)
        assert_status(resp, 200)

    def test_activity_shape(self, member_token):
        resp = api_get("/api/v1/notifications/activity", token=member_token)
        assert_json_keys(resp, ["events", "total", "page"])

    def test_activity_pagination(self, member_token):
        resp = api_get("/api/v1/notifications/activity?page=2", token=member_token)
        assert_status(resp, 200)
        assert resp.json()["page"] == 2

    def test_activity_filter_by_order(self, member_token):
        order_id = SEED_ORDER_IDS[0]
        resp = api_get(
            f"/api/v1/notifications/activity?order_id={order_id}",
            token=member_token,
        )
        assert_status(resp, 200)


class TestGetHistory:
    """GET /api/v1/notifications/history."""

    def test_history_returns_200(self, member_token):
        resp = api_get("/api/v1/notifications/history", token=member_token)
        assert_status(resp, 200)

    def test_history_shape(self, member_token):
        resp = api_get("/api/v1/notifications/history", token=member_token)
        assert_json_keys(resp, ["groups", "total", "page"])


class TestGetOrderSummaries:
    """GET /api/v1/notifications/orders."""

    def test_order_summaries(self, member_token):
        resp = api_get("/api/v1/notifications/orders", token=member_token)
        assert_status(resp, 200)
        assert_json_keys(resp, ["orders"])


class TestGetOrderNotifications:
    """GET /api/v1/notifications/order/:orderId."""

    def test_order_notifications(self, member_token):
        order_id = SEED_ORDER_IDS[0]
        resp = api_get(
            f"/api/v1/notifications/order/{order_id}",
            token=member_token,
        )
        assert_status(resp, 200)
        assert_json_keys(resp, ["events"])


class TestGetLastSeen:
    """GET /api/v1/notifications/order/:orderId/last-seen."""

    def test_last_seen(self, member_token):
        order_id = SEED_ORDER_IDS[0]
        resp = api_get(
            f"/api/v1/notifications/order/{order_id}/last-seen",
            token=member_token,
        )
        assert_status(resp, 200)
        assert "last_seen_at" in resp.json()


class TestMarkRead:
    """POST /api/v1/notifications/read/:orderId."""

    def test_mark_order_read(self, member_token):
        order_id = SEED_ORDER_IDS[0]
        resp = api_post(
            f"/api/v1/notifications/read/{order_id}",
            token=member_token,
        )
        assert_status(resp, 200)

    def test_mark_order_read_no_auth(self):
        order_id = SEED_ORDER_IDS[0]
        resp = api_post(f"/api/v1/notifications/read/{order_id}")
        assert_status(resp, 401)


class TestMarkAllRead:
    """POST /api/v1/notifications/read-all."""

    def test_mark_all_read(self, member_token):
        resp = api_post("/api/v1/notifications/read-all", token=member_token)
        assert_status(resp, 200)
