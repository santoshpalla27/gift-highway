"""
Pytest fixtures shared across all API test modules.
"""

import uuid
import pytest
from .helpers import (
    login_admin, login_member, login_member2,
    api_post, api_delete, api_patch, SEED_ORDER_IDS,
)


# ---------------------------------------------------------------------------
# Session-scoped tokens (login once per test run)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def admin_auth():
    """Returns (access_token, refresh_token, user_dict) for admin."""
    return login_admin()


@pytest.fixture(scope="session")
def member_auth():
    """Returns (access_token, refresh_token, user_dict) for member (sarah)."""
    return login_member()


@pytest.fixture(scope="session")
def member2_auth():
    """Returns (access_token, refresh_token, user_dict) for member2 (james)."""
    return login_member2()


@pytest.fixture(scope="session")
def admin_token(admin_auth):
    return admin_auth[0]


@pytest.fixture(scope="session")
def admin_refresh_token(admin_auth):
    return admin_auth[1]


@pytest.fixture(scope="session")
def admin_user(admin_auth):
    return admin_auth[2]


@pytest.fixture(scope="session")
def member_token(member_auth):
    return member_auth[0]


@pytest.fixture(scope="session")
def member_refresh_token(member_auth):
    return member_auth[1]


@pytest.fixture(scope="session")
def member_user(member_auth):
    return member_auth[2]


@pytest.fixture(scope="session")
def member2_token(member2_auth):
    return member2_auth[0]


@pytest.fixture(scope="session")
def member2_user(member2_auth):
    return member2_auth[2]


# ---------------------------------------------------------------------------
# Test order — created once per session, cleaned up at end
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def created_order_id(admin_token):
    """Create a disposable order for tests and clean up after all tests run."""
    resp = api_post("/api/v1/orders", token=admin_token, json={
        "title": f"Test Order {uuid.uuid4().hex[:8]}",
        "customer_name": "Test Customer",
        "priority": "medium",
        "description": "Auto-created by test suite",
        "contact_number": "+1-555-0000",
    })
    assert resp.status_code == 201, f"Failed to create test order: {resp.text}"
    order_id = resp.json()["order"]["id"]
    yield order_id
    # Cleanup: archive then permanent delete
    api_post(f"/api/v1/orders/{order_id}/archive", token=admin_token)
    api_delete(f"/api/v1/orders/{order_id}/permanent", token=admin_token)


# ---------------------------------------------------------------------------
# Seed order IDs (convenience)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def seed_order_id():
    """Return the first seed order ID for read-only tests."""
    return SEED_ORDER_IDS[0]


@pytest.fixture(scope="session")
def seed_order_id_2():
    """Return a second seed order ID (assigned to different users)."""
    return SEED_ORDER_IDS[1]


# ---------------------------------------------------------------------------
# Test user — created and deleted per session for admin/auth tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def test_user(admin_token):
    """Create a throwaway user for testing, clean up at end."""
    unique = uuid.uuid4().hex[:8]
    resp = api_post("/api/v1/admin/users", token=admin_token, json={
        "name": f"TestUser {unique}",
        "email": f"testuser-{unique}@test.local",
        "password": "TestPass@1234",
        "role": "user",
    })
    assert resp.status_code == 201, f"Failed to create test user: {resp.text}"
    user = resp.json()["user"]
    yield {
        "id": user["id"],
        "email": f"testuser-{unique}@test.local",
        "password": "TestPass@1234",
        "name": f"TestUser {unique}",
    }
    # Cleanup
    api_delete(f"/api/v1/admin/users/{user['id']}", token=admin_token)
