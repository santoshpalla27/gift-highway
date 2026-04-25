"""
Shared HTTP helper functions and assertion utilities for API tests.
"""

import time
import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:8080"

# Test credentials (from seed.sql)
ADMIN_EMAIL = "admin@company.com"
ADMIN_PASSWORD = "Admin@123456"

MEMBER_EMAIL = "sarah@giftco.com"
MEMBER_PASSWORD = "Admin@123456"

MEMBER2_EMAIL = "james@giftco.com"
MEMBER2_PASSWORD = "Admin@123456"

# Known seed IDs
SEED_ORDER_IDS = [
    f"bbbb{str(i).zfill(4)}-bbbb-bbbb-bbbb-bbbbbbbbbbbb" for i in range(1, 21)
]
SEED_MEMBER_IDS = {
    "sarah": "aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "james": "aaaa0002-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "priya": "aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "tom":   "aaaa0004-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "lisa":  "aaaa0005-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
}

# ---------------------------------------------------------------------------
# HTTP wrappers
# ---------------------------------------------------------------------------

def _headers(token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def api_get(path, token=None, **kwargs):
    """GET request to API."""
    url = f"{BASE_URL}{path}"
    return requests.get(url, headers=_headers(token), timeout=10, **kwargs)


def api_post(path, token=None, json=None, **kwargs):
    """POST request to API."""
    url = f"{BASE_URL}{path}"
    return requests.post(url, headers=_headers(token), json=json, timeout=10, **kwargs)


def api_patch(path, token=None, json=None, **kwargs):
    """PATCH request to API."""
    url = f"{BASE_URL}{path}"
    return requests.patch(url, headers=_headers(token), json=json, timeout=10, **kwargs)


def api_delete(path, token=None, **kwargs):
    """DELETE request to API."""
    url = f"{BASE_URL}{path}"
    return requests.delete(url, headers=_headers(token), timeout=10, **kwargs)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def login(email, password):
    """Login and return (access_token, refresh_token, user_dict)."""
    resp = api_post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    data = resp.json()
    tokens = data["tokens"]
    return tokens["access_token"], tokens["refresh_token"], data["user"]


def login_admin():
    return login(ADMIN_EMAIL, ADMIN_PASSWORD)


def login_member():
    return login(MEMBER_EMAIL, MEMBER_PASSWORD)


def login_member2():
    return login(MEMBER2_EMAIL, MEMBER2_PASSWORD)


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

def assert_status(resp, expected, msg=""):
    """Assert HTTP status code with helpful debug output."""
    actual = resp.status_code
    if actual != expected:
        body = resp.text[:500]
        raise AssertionError(
            f"Expected HTTP {expected}, got {actual}. {msg}\nBody: {body}"
        )


def assert_json_keys(resp, keys):
    """Assert that the response JSON contains all listed keys."""
    data = resp.json()
    missing = [k for k in keys if k not in data]
    assert not missing, f"Missing JSON keys {missing} in response: {list(data.keys())}"


def assert_response_time(resp, max_ms=2000):
    """Assert response completed within max_ms milliseconds."""
    elapsed_ms = resp.elapsed.total_seconds() * 1000
    assert elapsed_ms < max_ms, (
        f"Response took {elapsed_ms:.0f}ms, exceeds {max_ms}ms limit"
    )


def assert_error_message(resp, expected_substring):
    """Assert error message in response body contains expected text."""
    data = resp.json()
    error = data.get("error", "")
    assert expected_substring.lower() in error.lower(), (
        f"Expected error containing '{expected_substring}', got '{error}'"
    )
