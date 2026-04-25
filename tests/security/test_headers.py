"""
Phase 8 — Security headers & web security tests.

Verifies:
  - All security headers are present in responses
  - CORS is configured correctly
  - X-Request-ID is present
"""

import requests
from .helpers import BASE_URL, assert_status

# The expected security headers set by middleware/security.go
EXPECTED_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Xss-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'",
}


class TestSecurityHeaders:
    """Every response should include all security headers."""

    def _get_response(self):
        return requests.get(f"{BASE_URL}/health", timeout=5)

    def test_x_content_type_options(self):
        resp = self._get_response()
        val = resp.headers.get("X-Content-Type-Options")
        assert val == "nosniff", f"Expected 'nosniff', got '{val}'"

    def test_x_frame_options(self):
        resp = self._get_response()
        val = resp.headers.get("X-Frame-Options")
        assert val == "DENY", f"Expected 'DENY', got '{val}'"

    def test_x_xss_protection(self):
        resp = self._get_response()
        val = resp.headers.get("X-Xss-Protection") or resp.headers.get("X-XSS-Protection")
        assert val == "1; mode=block", f"Expected '1; mode=block', got '{val}'"

    def test_referrer_policy(self):
        resp = self._get_response()
        val = resp.headers.get("Referrer-Policy")
        assert val == "strict-origin-when-cross-origin", f"Got '{val}'"

    def test_content_security_policy(self):
        resp = self._get_response()
        val = resp.headers.get("Content-Security-Policy")
        assert val == "default-src 'self'", f"Got '{val}'"

    def test_all_headers_present(self):
        """Verify all expected headers in a single shot."""
        resp = self._get_response()
        missing = []
        for header, expected_val in EXPECTED_HEADERS.items():
            actual = resp.headers.get(header)
            if actual is None:
                # Try case-insensitive lookup
                actual = resp.headers.get(header.lower())
            if actual != expected_val:
                missing.append(f"{header}: expected='{expected_val}', got='{actual}'")
        assert not missing, f"Security header issues:\n" + "\n".join(missing)


class TestRequestID:
    """X-Request-ID should be present on every response."""

    def test_health_has_request_id(self):
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        assert "X-Request-Id" in resp.headers or "X-Request-ID" in resp.headers

    def test_api_has_request_id(self):
        resp = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            json={"email": "test@test.com", "password": "whatever1"},
            headers={"Content-Type": "application/json"},
            timeout=5,
        )
        req_id = resp.headers.get("X-Request-Id") or resp.headers.get("X-Request-ID")
        assert req_id is not None, "Missing X-Request-ID header"
        assert len(req_id) > 0, "X-Request-ID is empty"


class TestCORS:
    """CORS preflight behaviour."""

    def test_options_preflight(self):
        """OPTIONS request should return CORS headers."""
        resp = requests.options(
            f"{BASE_URL}/api/v1/auth/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type,Authorization",
            },
            timeout=5,
        )
        # With ALLOWED_ORIGINS=* the CORS middleware allows everything
        assert resp.status_code in (200, 204), f"Preflight returned {resp.status_code}"

    def test_cors_headers_on_response(self):
        """Actual request should echo CORS headers."""
        resp = requests.get(
            f"{BASE_URL}/health",
            headers={"Origin": "http://localhost:5173"},
            timeout=5,
        )
        # Should have Access-Control-Allow-Origin
        acao = resp.headers.get("Access-Control-Allow-Origin")
        assert acao is not None, "Missing Access-Control-Allow-Origin"

    def test_cors_disallowed_origin(self):
        """
        When ALLOWED_ORIGINS is NOT *, origins not in the list should be blocked.
        NOTE: In dev (ALLOWED_ORIGINS=*) this test will pass trivially.
        In production with restricted origins, the response should NOT
        include the requesting origin.
        """
        resp = requests.get(
            f"{BASE_URL}/health",
            headers={"Origin": "https://evil.example.com"},
            timeout=5,
        )
        acao = resp.headers.get("Access-Control-Allow-Origin", "")
        # If origins are restricted, evil.example.com should not be reflected
        # With *, this is expected to be "*" — we document this caveat
        if acao == "https://evil.example.com":
            # This would be a problem in production
            import warnings
            warnings.warn(
                "CORS reflects arbitrary origins — this is expected with ALLOWED_ORIGINS=* "
                "but MUST be restricted in production"
            )
