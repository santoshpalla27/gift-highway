"""
Phase 6 — Input validation / fuzzing tests.

Tests bad inputs: empty fields, long strings, negative IDs,
invalid enums, malformed JSON, script tags, unicode edge cases.
"""

import pytest
import requests
from .helpers import (
    api_get, api_post, api_patch,
    assert_status,
    BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD,
)


class TestEmptyRequiredFields:
    """Required fields sent as empty strings → 400."""

    def test_login_empty_email(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": "",
            "password": ADMIN_PASSWORD,
        })
        assert_status(resp, 400)

    def test_login_empty_password(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "",
        })
        assert_status(resp, 400)

    def test_create_order_empty_title(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "",
            "customer_name": "Test",
            "priority": "low",
        })
        assert_status(resp, 400)

    def test_create_order_empty_customer(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "Test",
            "customer_name": "",
            "priority": "low",
        })
        assert_status(resp, 400)

    def test_create_user_empty_name(self, admin_token):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "",
            "email": "empty@test.local",
            "password": "StrongPass@1234",
            "role": "user",
        })
        assert_status(resp, 400)


class TestVeryLongStrings:
    """Extremely long strings should not crash the server."""

    def test_long_title(self, admin_token):
        long_title = "A" * 100_000
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": long_title,
            "customer_name": "Test",
            "priority": "low",
        })
        # Should be 400 or processed safely — never 500
        assert resp.status_code != 500, "Server returned 500 on long title"

    def test_long_email(self):
        long_email = "a" * 10000 + "@test.com"
        resp = api_post("/api/v1/auth/login", json={
            "email": long_email,
            "password": ADMIN_PASSWORD,
        })
        assert resp.status_code != 500, "Server returned 500 on long email"

    def test_long_comment(self, admin_token, created_order_id):
        long_text = "B" * 100_000
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": long_text},
        )
        # Should succeed or fail gracefully — never 500
        assert resp.status_code != 500, "Server returned 500 on long comment"


class TestNegativeIDs:
    """Negative or zero IDs in path → 404, never 500."""

    def test_negative_order_id(self, admin_token):
        resp = api_get("/api/v1/orders/-1", token=admin_token)
        assert resp.status_code in (400, 404), f"Unexpected: {resp.status_code}"

    def test_zero_order_id(self, admin_token):
        resp = api_get("/api/v1/orders/0", token=admin_token)
        assert resp.status_code in (400, 404), f"Unexpected: {resp.status_code}"

    def test_string_as_order_id(self, admin_token):
        resp = api_get("/api/v1/orders/abc", token=admin_token)
        assert resp.status_code in (400, 404), f"Unexpected: {resp.status_code}"


class TestInvalidEnums:
    """Invalid enum values → 400."""

    def test_invalid_priority(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "Test",
            "customer_name": "Test",
            "priority": "extreme",
        })
        assert_status(resp, 400)

    def test_invalid_status(self, admin_token, created_order_id):
        resp = api_patch(
            f"/api/v1/orders/{created_order_id}/status",
            token=admin_token,
            json={"status": "banana"},
        )
        assert_status(resp, 400)

    def test_invalid_role(self, admin_token):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "Enum Test",
            "email": "enum@test.local",
            "password": "StrongPass@1234",
            "role": "superadmin",
        })
        assert_status(resp, 400)


class TestMalformedJSON:
    """Broken JSON bodies → 400."""

    def test_broken_json_login(self):
        resp = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            data='{broken json',
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        assert resp.status_code == 400

    def test_broken_json_create_order(self, admin_token):
        resp = requests.post(
            f"{BASE_URL}/api/v1/orders",
            data='{"title": "test"',  # Missing closing brace
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {admin_token}",
            },
            timeout=5,
        )
        assert resp.status_code == 400

    def test_array_instead_of_object(self):
        resp = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            data='[1, 2, 3]',
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        assert resp.status_code == 400


class TestScriptTags:
    """XSS payloads should not cause 500 and should be stored safely."""

    def test_script_in_order_title(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": '<script>alert("xss")</script>',
            "customer_name": "XSS Test",
            "priority": "low",
        })
        # Should either store safely (201) or reject (400) — never 500
        assert resp.status_code != 500, "Server returned 500 on script tag"
        if resp.status_code == 201:
            # Cleanup
            from .helpers import api_delete
            oid = resp.json()["order"]["id"]
            api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)
            api_delete(f"/api/v1/orders/{oid}/permanent", token=admin_token)

    def test_script_in_comment(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/comments",
            token=admin_token,
            json={"text": '<img src=x onerror=alert(1)>'},
        )
        assert resp.status_code != 500, "Server returned 500 on XSS payload"

    def test_sql_injection_in_search(self, admin_token):
        resp = api_get(
            '/api/v1/orders?search=\' OR 1=1; --',
            token=admin_token,
        )
        assert resp.status_code != 500, "Server returned 500 on SQL injection"


class TestUnicodeEdgeCases:
    """Unicode, emoji, RTL, null bytes should not crash the server."""

    def test_emoji_in_title(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "🎁 Gift Order 🎀✨",
            "customer_name": "Unicode Customer 🎉",
            "priority": "low",
        })
        assert resp.status_code != 500
        if resp.status_code == 201:
            from .helpers import api_delete
            oid = resp.json()["order"]["id"]
            api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)
            api_delete(f"/api/v1/orders/{oid}/permanent", token=admin_token)

    def test_rtl_text(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "طلب هدية عربي",
            "customer_name": "عميل",
            "priority": "low",
        })
        assert resp.status_code != 500
        if resp.status_code == 201:
            from .helpers import api_delete
            oid = resp.json()["order"]["id"]
            api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)
            api_delete(f"/api/v1/orders/{oid}/permanent", token=admin_token)

    def test_null_bytes(self, admin_token):
        resp = api_post("/api/v1/orders", token=admin_token, json={
            "title": "Null\x00Byte",
            "customer_name": "Test\x00Null",
            "priority": "low",
        })
        assert resp.status_code != 500
        if resp.status_code == 201:
            from .helpers import api_delete
            oid = resp.json()["order"]["id"]
            api_post(f"/api/v1/orders/{oid}/archive", token=admin_token)
            api_delete(f"/api/v1/orders/{oid}/permanent", token=admin_token)
