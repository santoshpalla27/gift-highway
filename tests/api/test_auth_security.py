"""
Phase 3 — Authentication security tests.

Tests token manipulation, missing tokens, expired tokens,
tampered tokens, wrong signing keys, and disabled-user tokens.
"""

import time
import jwt  # PyJWT
import pytest
from .helpers import (
    api_get, api_post,
    assert_status,
    ADMIN_EMAIL, ADMIN_PASSWORD,
    MEMBER_EMAIL, MEMBER_PASSWORD,
    login,
)


# The default dev JWT secret from config.go / .env
DEV_JWT_SECRET = "644f1998cdcf93dae9a392627f36684983a60c5f1c384b81db896c7213bd71a0"


class TestMissingToken:
    """Requests without Authorization header → 401."""

    def test_no_header_orders(self):
        resp = api_get("/api/v1/orders")
        assert_status(resp, 401)

    def test_no_header_me(self):
        resp = api_get("/api/v1/auth/me")
        assert_status(resp, 401)

    def test_no_header_admin(self):
        resp = api_get("/api/v1/admin/users")
        assert_status(resp, 401)

    def test_no_header_notifications(self):
        resp = api_get("/api/v1/notifications")
        assert_status(resp, 401)


class TestExpiredToken:
    """Manually craft an expired JWT → 401."""

    def test_expired_jwt(self):
        payload = {
            "user_id": "aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "email": MEMBER_EMAIL,
            "role": "member",
            "exp": int(time.time()) - 3600,  # Expired 1 hour ago
            "iat": int(time.time()) - 7200,
            "iss": "company-app",
        }
        token = jwt.encode(payload, DEV_JWT_SECRET, algorithm="HS256")
        resp = api_get("/api/v1/orders", token=token)
        assert_status(resp, 401)


class TestTamperedToken:
    """Flip characters in a valid JWT → 401."""

    def test_tampered_jwt(self):
        access, _, _ = login(MEMBER_EMAIL, MEMBER_PASSWORD)
        # Flip the last character of the signature portion
        parts = access.split(".")
        sig = parts[2]
        flipped = sig[:-1] + ("A" if sig[-1] != "A" else "B")
        tampered = f"{parts[0]}.{parts[1]}.{flipped}"

        resp = api_get("/api/v1/orders", token=tampered)
        assert_status(resp, 401)


class TestWrongSigningKey:
    """Sign JWT with a different secret → 401."""

    def test_wrong_secret(self):
        payload = {
            "user_id": "aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "email": MEMBER_EMAIL,
            "role": "member",
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            "iss": "company-app",
        }
        token = jwt.encode(payload, "totally-wrong-secret-key-12345678", algorithm="HS256")
        resp = api_get("/api/v1/orders", token=token)
        assert_status(resp, 401)


class TestWrongRefreshToken:
    """Random string as refresh token → 401."""

    def test_random_refresh_token(self):
        resp = api_post("/api/v1/auth/refresh", json={
            "refresh_token": "0000000000000000aaaaaaaaaaaaaaaa0000000000000000bbbbbbbbbbbbbbbb",
        })
        assert_status(resp, 401)


class TestDisabledUserToken:
    """
    Valid JWT for a disabled user → 401.
    The auth middleware checks user.is_active after verifying the token.
    """

    @pytest.mark.destructive
    def test_disabled_user_blocked(self, admin_token, test_user):
        from .helpers import api_patch

        # Login as test user first
        access, _, _ = login(test_user["email"], test_user["password"])

        # Confirm their token works
        resp = api_get("/api/v1/auth/me", token=access)
        assert_status(resp, 200)

        # Admin disables the user
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/disable",
            token=admin_token,
        )
        assert_status(resp, 200)

        # Now the old token should fail
        resp = api_get("/api/v1/auth/me", token=access)
        assert_status(resp, 401)

        # Re-enable for other tests
        api_patch(
            f"/api/v1/admin/users/{test_user['id']}/enable",
            token=admin_token,
        )


class TestMalformedAuthHeader:
    """Malformed Authorization headers → 401."""

    def test_no_bearer_prefix(self):
        import requests
        resp = requests.get(
            "http://localhost:8080/api/v1/orders",
            headers={"Authorization": "Token some-value"},
            timeout=5,
        )
        assert resp.status_code == 401

    def test_empty_bearer(self):
        import requests
        resp = requests.get(
            "http://localhost:8080/api/v1/orders",
            headers={"Authorization": "Bearer "},
            timeout=5,
        )
        assert resp.status_code == 401

    def test_bearer_garbage(self):
        import requests
        resp = requests.get(
            "http://localhost:8080/api/v1/orders",
            headers={"Authorization": "Bearer not.a.jwt"},
            timeout=5,
        )
        assert resp.status_code == 401
