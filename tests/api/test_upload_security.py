"""
Phase 7 — Upload security tests.

Tests:
  - .exe renamed to .jpg with bad MIME
  - Oversized file
  - Unsupported MIME type
  - Path traversal in filename
  - Rapid repeated upload requests
"""

import time
import threading
import pytest
from .helpers import (
    api_post,
    assert_status, assert_error_message,
)


class TestDisallowedMIME:
    """Files with disallowed MIME types must be rejected."""

    def test_exe_mime(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "program.exe",
                "mime_type": "application/x-msdownload",
                "size_bytes": 1024,
            },
        )
        assert_status(resp, 400)
        assert_error_message(resp, "file type not allowed")

    def test_shell_script_mime(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "script.sh",
                "mime_type": "application/x-sh",
                "size_bytes": 512,
            },
        )
        assert_status(resp, 400)

    def test_html_mime(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "page.html",
                "mime_type": "text/html",
                "size_bytes": 1024,
            },
        )
        assert_status(resp, 400)

    def test_javascript_mime(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "app.js",
                "mime_type": "application/javascript",
                "size_bytes": 1024,
            },
        )
        assert_status(resp, 400)


class TestOversizedFile:
    """Files exceeding the 50 MB limit must be rejected."""

    def test_60mb_file(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "huge-file.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 60 * 1024 * 1024,  # 60 MB
            },
        )
        assert_status(resp, 400)
        assert_error_message(resp, "50 MB")

    def test_exactly_50mb(self, admin_token, created_order_id):
        """50 MB exactly should be allowed (limit is >50MB)."""
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "max-file.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 50 * 1024 * 1024,  # Exactly 50 MB
            },
        )
        # Should be 200 (allowed) or 503 (R2 not configured)
        assert resp.status_code in (200, 503), f"Unexpected: {resp.status_code}"

    def test_negative_size(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "negative.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": -1,
            },
        )
        # Should not reach R2 — some validation should catch it
        assert resp.status_code != 500


class TestExeRenamedToJpg:
    """Renamed .exe with executable MIME → rejected."""

    def test_exe_renamed(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "malware.exe.jpg",
                "mime_type": "application/x-msdownload",
                "size_bytes": 2048,
            },
        )
        assert_status(resp, 400)

    def test_exe_as_pdf_mime(self, admin_token, created_order_id):
        """Even if they claim PDF mime with .exe extension, it should be handled."""
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "document.exe",
                "mime_type": "application/pdf",
                "size_bytes": 1024,
            },
        )
        # This tests if MIME-based validation alone is sufficient.
        # PDF MIME is allowed, so the backend may accept it.
        # The key is: the system doesn't crash.
        assert resp.status_code != 500


class TestStrangeFilename:
    """Path traversal and special characters in filenames."""

    def test_path_traversal(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "../../etc/passwd",
                "mime_type": "text/plain",
                "size_bytes": 128,
            },
        )
        # Should be 200/503 with sanitized filename or 400 — never 500
        assert resp.status_code != 500
        if resp.status_code == 200:
            # Verify the file_key doesn't contain path traversal
            file_key = resp.json().get("file_key", "")
            assert ".." not in file_key, f"Path traversal in file_key: {file_key}"

    def test_null_byte_filename(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "file\x00.jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 1024,
            },
        )
        assert resp.status_code != 500

    def test_very_long_filename(self, admin_token, created_order_id):
        resp = api_post(
            f"/api/v1/orders/{created_order_id}/attachments/upload-url",
            token=admin_token,
            json={
                "file_name": "a" * 1000 + ".jpg",
                "mime_type": "image/jpeg",
                "size_bytes": 1024,
            },
        )
        assert resp.status_code != 500


class TestRapidUploads:
    """Rapid repeated upload requests should not crash the server."""

    @pytest.mark.slow
    def test_rapid_upload_requests(self, admin_token, created_order_id):
        results = []

        def make_request():
            try:
                resp = api_post(
                    f"/api/v1/orders/{created_order_id}/attachments/upload-url",
                    token=admin_token,
                    json={
                        "file_name": "rapid-test.jpg",
                        "mime_type": "image/jpeg",
                        "size_bytes": 1024,
                    },
                )
                results.append(resp.status_code)
            except Exception:
                results.append(0)

        threads = [threading.Thread(target=make_request) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        # No 500s should have occurred
        server_errors = [s for s in results if s == 500]
        assert len(server_errors) == 0, f"Got {len(server_errors)} server errors"

        # Some should succeed (200) or hit rate limit (429) or storage error (503)
        valid = [s for s in results if s in (200, 429, 503)]
        assert len(valid) > 0, f"No valid responses: {results}"
