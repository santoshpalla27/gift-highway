"""
Phase 1 — Admin user management functional tests.

Covers:
  - GET    /api/v1/admin/users               (list users)
  - POST   /api/v1/admin/users               (create user)
  - PATCH  /api/v1/admin/users/:id           (update user)
  - PATCH  /api/v1/admin/users/:id/password  (change password)
  - PATCH  /api/v1/admin/users/:id/disable   (disable user)
  - PATCH  /api/v1/admin/users/:id/enable    (enable user)
  - DELETE /api/v1/admin/users/:id           (delete user)
"""

import uuid
import pytest
from .helpers import (
    api_get, api_post, api_patch, api_delete,
    assert_status, assert_json_keys, assert_response_time,
    assert_error_message,
)


class TestListUsers:
    """GET /api/v1/admin/users."""

    def test_list_users(self, admin_token):
        resp = api_get("/api/v1/admin/users", token=admin_token)
        assert_status(resp, 200)
        assert_json_keys(resp, ["users"])
        users = resp.json()["users"]
        assert isinstance(users, list)
        assert len(users) > 0

    def test_list_users_shape(self, admin_token):
        resp = api_get("/api/v1/admin/users", token=admin_token)
        users = resp.json()["users"]
        user = users[0]
        for key in ["id", "name", "email", "role", "is_active"]:
            assert key in user, f"Missing key '{key}' in user list item"

    def test_list_users_response_time(self, admin_token):
        resp = api_get("/api/v1/admin/users", token=admin_token)
        assert_response_time(resp)


class TestCreateUser:
    """POST /api/v1/admin/users."""

    @pytest.mark.destructive
    def test_create_user_success(self, admin_token):
        unique = uuid.uuid4().hex[:8]
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": f"AutoTest {unique}",
            "email": f"auto-{unique}@test.local",
            "password": "StrongPass@1234",
            "role": "user",
        })
        assert_status(resp, 201)
        user = resp.json()["user"]
        assert user["email"] == f"auto-{unique}@test.local"
        assert user["role"] == "user"

        # Cleanup
        api_delete(f"/api/v1/admin/users/{user['id']}", token=admin_token)

    def test_create_user_missing_fields(self, admin_token):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "Incomplete",
        })
        assert_status(resp, 400)

    def test_create_user_invalid_role(self, admin_token):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "Bad Role",
            "email": "badrole@test.local",
            "password": "StrongPass@1234",
            "role": "superadmin",
        })
        assert_status(resp, 400)

    def test_create_user_short_password(self, admin_token):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "Short Pass",
            "email": "shortpass@test.local",
            "password": "abc",
            "role": "user",
        })
        assert_status(resp, 400)


class TestDuplicateEmail:
    """POST /api/v1/admin/users — duplicate email."""

    @pytest.mark.destructive
    def test_duplicate_email_returns_409(self, admin_token, test_user):
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": "Duplicate",
            "email": test_user["email"],
            "password": "StrongPass@1234",
            "role": "user",
        })
        assert_status(resp, 409)
        assert_error_message(resp, "email already in use")


class TestUpdateUser:
    """PATCH /api/v1/admin/users/:id."""

    def test_update_user(self, admin_token, test_user):
        resp = api_patch(f"/api/v1/admin/users/{test_user['id']}", token=admin_token, json={
            "name": "Updated Name",
            "email": test_user["email"],
            "role": "user",
        })
        assert_status(resp, 200)

    def test_update_user_bad_email(self, admin_token, test_user):
        resp = api_patch(f"/api/v1/admin/users/{test_user['id']}", token=admin_token, json={
            "name": "Test",
            "email": "not-an-email",
            "role": "user",
        })
        assert_status(resp, 400)


class TestChangePassword:
    """PATCH /api/v1/admin/users/:id/password."""

    def test_change_password(self, admin_token, test_user):
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/password",
            token=admin_token,
            json={"password": "NewStrongP@ss1234"},
        )
        assert_status(resp, 200)

    def test_change_password_too_short(self, admin_token, test_user):
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/password",
            token=admin_token,
            json={"password": "short"},
        )
        assert_status(resp, 400)


class TestDisableEnableUser:
    """PATCH /api/v1/admin/users/:id/disable and /enable."""

    @pytest.mark.destructive
    def test_disable_then_enable(self, admin_token, test_user):
        # Disable
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/disable",
            token=admin_token,
        )
        assert_status(resp, 200)

        # Enable
        resp = api_patch(
            f"/api/v1/admin/users/{test_user['id']}/enable",
            token=admin_token,
        )
        assert_status(resp, 200)


class TestDeleteUser:
    """DELETE /api/v1/admin/users/:id."""

    @pytest.mark.destructive
    def test_delete_user(self, admin_token):
        # Create a user to delete
        unique = uuid.uuid4().hex[:8]
        resp = api_post("/api/v1/admin/users", token=admin_token, json={
            "name": f"DeleteMe {unique}",
            "email": f"deleteme-{unique}@test.local",
            "password": "StrongPass@1234",
            "role": "user",
        })
        assert_status(resp, 201)
        uid = resp.json()["user"]["id"]

        # Delete
        resp = api_delete(f"/api/v1/admin/users/{uid}", token=admin_token)
        assert_status(resp, 200)
