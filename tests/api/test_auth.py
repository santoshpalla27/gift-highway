"""
Phase 1 — Auth endpoint functional tests.

Covers:
  - POST /api/v1/auth/login       (success, invalid, disabled user)
  - POST /api/v1/auth/refresh     (valid refresh, invalid refresh)
  - POST /api/v1/auth/logout      (success)
  - GET  /api/v1/auth/me          (success)
"""

import pytest
from .helpers import (
    api_post, api_get,
    assert_status, assert_json_keys, assert_response_time,
    assert_error_message,
    ADMIN_EMAIL, ADMIN_PASSWORD,
    MEMBER_EMAIL, MEMBER_PASSWORD,
    login,
)


class TestLoginSuccess:
    """POST /api/v1/auth/login — valid credentials."""

    def test_returns_200(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
        assert_status(resp, 200)

    def test_response_shape(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
        assert_json_keys(resp, ["user", "tokens"])
        tokens = resp.json()["tokens"]
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        assert "expires_in" in tokens

    def test_user_fields(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
        user = resp.json()["user"]
        assert "id" in user
        assert user["email"] == ADMIN_EMAIL
        assert "role" in user

    def test_response_time(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        })
        assert_response_time(resp)


class TestLoginInvalid:
    """POST /api/v1/auth/login — invalid credentials."""

    def test_wrong_password(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "WrongPassword123",
        })
        assert_status(resp, 401)
        assert_error_message(resp, "invalid email or password")

    def test_nonexistent_email(self):
        resp = api_post("/api/v1/auth/login", json={
            "email": "nobody@nowhere.com",
            "password": "SomePassword1",
        })
        assert_status(resp, 401)

    def test_empty_body(self):
        resp = api_post("/api/v1/auth/login", json={})
        assert_status(resp, 400)

    def test_missing_password(self):
        resp = api_post("/api/v1/auth/login", json={"email": ADMIN_EMAIL})
        assert_status(resp, 400)

    def test_missing_email(self):
        resp = api_post("/api/v1/auth/login", json={"password": ADMIN_PASSWORD})
        assert_status(resp, 400)

    def test_short_password(self):
        """Password binding requires min=8."""
        resp = api_post("/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "short",
        })
        assert_status(resp, 400)


class TestLoginDisabledUser:
    """POST /api/v1/auth/login — disabled user gets 403."""

    @pytest.mark.destructive
    def test_disabled_user_blocked(self, admin_token, test_user):
        # Disable the test user
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/disable",
            token=admin_token,
        )
        assert_status(resp, 200)

        # Try to login as disabled user
        resp = api_post("/api/v1/auth/login", json={
            "email": test_user["email"],
            "password": test_user["password"],
        })
        assert_status(resp, 403)
        assert_error_message(resp, "inactive")

        # Re-enable for other tests
        api_patch(
            f"/api/v1/admin/users/{test_user['id']}/enable",
            token=admin_token,
        )


class TestTokenRefresh:
    """POST /api/v1/auth/refresh — token rotation."""

    def test_valid_refresh(self):
        # Get a fresh refresh token
        _, refresh_token, _ = login(MEMBER_EMAIL, MEMBER_PASSWORD)

        resp = api_post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert_status(resp, 200)
        assert_json_keys(resp, ["user", "tokens"])
        new_tokens = resp.json()["tokens"]
        assert new_tokens["access_token"]
        assert new_tokens["refresh_token"]
        # New refresh token should differ (rotation)
        assert new_tokens["refresh_token"] != refresh_token

    def test_invalid_refresh_token(self):
        resp = api_post("/api/v1/auth/refresh", json={
            "refresh_token": "totally-invalid-token-string",
        })
        assert_status(resp, 401)

    def test_missing_refresh_token(self):
        resp = api_post("/api/v1/auth/refresh", json={})
        assert_status(resp, 400)


class TestLogout:
    """POST /api/v1/auth/logout — revokes tokens."""

    def test_logout_success(self):
        # Login to get a fresh token
        access, _, _ = login(MEMBER_EMAIL, MEMBER_PASSWORD)
        resp = api_post("/api/v1/auth/logout", token=access)
        assert_status(resp, 200)

    def test_logout_without_token(self):
        resp = api_post("/api/v1/auth/logout")
        assert_status(resp, 401)


class TestMe:
    """GET /api/v1/auth/me — current user info."""

    def test_me_returns_user_info(self, admin_token):
        resp = api_get("/api/v1/auth/me", token=admin_token)
        assert_status(resp, 200)
        data = resp.json()
        assert "user_id" in data
        assert "email" in data
        assert "role" in data
        assert data["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        resp = api_get("/api/v1/auth/me")
        assert_status(resp, 401)

    def test_me_response_time(self, admin_token):
        resp = api_get("/api/v1/auth/me", token=admin_token)
        assert_response_time(resp, max_ms=500)
