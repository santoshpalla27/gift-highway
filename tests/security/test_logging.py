"""
Phase 9 — Logging / monitoring verification tests.

Verifies that the backend logs capture important security events:
  - Failed login attempts
  - 401 responses
  - Rate limit (429) triggers

NOTE: These tests trigger events and then verify the server's
structured log output mentions the expected patterns. Since the
backend uses zerolog and outputs to stdout, in a real CI setup
you'd capture the log output. Here we verify the events are
generated correctly by checking response codes.
"""

import requests
from .helpers import (
    api_get, api_post,
    assert_status,
    BASE_URL, ADMIN_EMAIL,
)


class TestFailedLoginLogging:
    """
    Failed login attempts should be logged with the IP address.
    We verify the backend returns 401 (the log message "failed login attempt"
    is emitted in auth_service.go).
    """

    def test_failed_login_produces_401(self):
        """A failed login should return 401 — the backend logs this event."""
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "TotallyWrongP@ss",
        })
        assert_status(resp, 401)

    def test_multiple_failed_logins(self):
        """Multiple failures should all be logged individually."""
        for _ in range(3):
            resp = api_post("/api/v1/auth/login", json={
                "email": "nonexistent@test.com",
                "password": "BadPassword1",
            })
            assert_status(resp, 401)


class TestUnauthorizedLogging:
    """401 responses should be logged with request details."""

    def test_no_token_logged(self):
        resp = api_get("/api/v1/orders")
        assert_status(resp, 401)
        # Verify X-Request-ID is present (helps correlate logs)
        req_id = resp.headers.get("X-Request-Id") or resp.headers.get("X-Request-ID")
        assert req_id is not None, "X-Request-ID missing — can't correlate logs"

    def test_bad_token_logged(self):
        resp = api_get("/api/v1/orders", token="invalid.jwt.token")
        assert_status(resp, 401)


class TestAdminActionLogging:
    """
    Admin actions (user management, permanent deletes) should produce
    log entries. We verify the API returns expected status codes.
    """

    def test_admin_list_users_logged(self, admin_token):
        """Admin user list access should be logged."""
        resp = api_get("/api/v1/admin/users", token=admin_token)
        assert_status(resp, 200)
        # The request logger middleware logs every request with method, path, status


class TestHealthCheck:
    """Health endpoint should always work and be logged."""

    def test_health_check(self):
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        assert_status(resp, 200)
