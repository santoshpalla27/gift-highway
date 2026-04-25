"""
Phase 1 — Timeline / Events / Attachments functional tests.

Covers:
  - POST   /api/v1/orders/:id/comments           (add comment)
  - GET    /api/v1/orders/:id/events              (list events)
  - PATCH  /api/v1/orders/:id/events/:eventId     (edit comment)
  - DELETE /api/v1/orders/:id/events/:eventId     (delete comment)
  - POST   /api/v1/orders/:id/attachments/upload-url (get presigned URL)
  - GET    /api/v1/orders/:id/attachments          (list attachments)
"""

import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status, assert_json_keys, assert_response_time,
    SEED_ORDER_IDS,
)


class TestAddComment:
    """POST /api/v1/orders/:id/comments."""

    def test_add_comment_success(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": "Test comment from automated suite"},
        )
        assert_status(resp, 201)
        event = resp.json()["event"]
        assert event["type"] == "comment_added"
        assert "id" in event

    def test_add_comment_empty_text(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": ""},
        )
        assert_status(resp, 400)

    def test_add_comment_missing_text(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={},
        )
        assert_status(resp, 400)

    def test_add_comment_no_auth(self, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            json={"text": "No auth"},
        )
        assert_status(resp, 401)


class TestListEvents:
    """GET /api/v1/orders/:id/events."""

    def test_list_events(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/events",
            token=admin_token,
        )
        assert_status(resp, 200)
        assert_json_keys(resp, ["events", "total"])
        assert isinstance(resp.json()["events"], list)
        # Seed data should have events for this order
        assert resp.json()["total"] > 0

    def test_list_events_pagination(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/events?page=1&limit=5",
            token=admin_token,
        )
        assert_status(resp, 200)
        assert len(resp.json()["events"]) <= 5

    def test_list_events_shape(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/events?limit=1",
            token=admin_token,
        )
        assert_status(resp, 200)
        events = resp.json()["events"]
        if events:
            event = events[0]
            for key in ["id", "order_id", "type", "payload", "created_at"]:
                assert key in event, f"Missing key '{key}' in event"

    def test_list_events_response_time(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/events",
            token=admin_token,
        )
        assert_response_time(resp)


class TestEditComment:
    """PATCH /api/v1/orders/:id/events/:eventId — edit a comment."""

    @pytest.mark.destructive
    def test_edit_comment(self, admin_token, created_order_id):
        # Create a comment first
        create_resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": "Original comment"},
        )
        assert_status(create_resp, 201)
        event_id = create_resp.json()["event"]["id"]

        # Edit it
        resp = api_patch(
            f"/api/v1/orders/{created_order_id}/events/{event_id}",
            token=admin_token,
            json={"text": "Edited comment text"},
        )
        assert_status(resp, 200)

    def test_edit_nonexistent_event(self, admin_token, created_order_id):
        fake_id = "00000000-0000-0000-0000-000000000000"
        resp = api_patch(
            f"/api/v1/orders/{created_order_id}/events/{fake_id}",
            token=admin_token,
            json={"text": "Won't work"},
        )
        assert_status(resp, 404)


class TestDeleteComment:
    """DELETE /api/v1/orders/:id/events/:eventId."""

    @pytest.mark.destructive
    def test_delete_comment(self, admin_token, created_order_id):
        # Create a comment to delete
        create_resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": "Comment to delete"},
        )
        assert_status(create_resp, 201)
        event_id = create_resp.json()["event"]["id"]

        # Delete it
        resp = api_delete(
            f"/api/v1/orders/{created_order_id}/events/{event_id}",
            token=admin_token,
        )
        assert_status(resp, 200)


class TestAttachmentUploadURL:
    """POST /api/v1/orders/:id/attachments/upload-url."""

    def test_get_upload_url(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "test-image.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 1024,
            },
        )
        # May return 503 if R2 not configured in dev — both 200 and 503 acceptable
        assert resp.status_code in (200, 503), f"Unexpected status: {resp.status_code}"
        if resp.status_code == 200:
            data = resp.json()
            assert "upload_url" in data
            assert "file_key" in data

    def test_upload_url_oversized(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "huge.zip",
                "mime_type": "image/jpeg",
                "size_bytes": 60 * 1024 * 1024,  # 60 MB > 50 MB limit
            },
        )
        assert_status(resp, 400)

    def test_upload_url_bad_mime(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "malware.exe",
                "mime_type": "application/x-msdownload",
                "size_bytes": 1024,
            },
        )
        assert_status(resp, 400)


class TestListAttachments:
    """GET /api/v1/orders/:id/attachments."""

    def test_list_attachments(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/attachments",
            token=admin_token,
        )
        assert_status(resp, 200)
        assert_json_keys(resp, ["attachments"])
        assert isinstance(resp.json()["attachments"], list)

    def test_list_attachments_response_time(self, admin_token, seed_order_id):
        resp = api_get(
            f"/api/v1/orders/{seed_order_id}/attachments",
            token=admin_token,
        )
        assert_response_time(resp)
