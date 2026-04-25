# Gift Highway — API & Security Test Suite

Repeatable testing system that verifies API functionality, permission enforcement,
rate limiting, vulnerability blocking, and release safety.

## Directory Structure

```
tests/
├── api/                          # Phases 1–4, 6–7: Python pytest tests
│   ├── conftest.py               # Shared fixtures (tokens, test data)
│   ├── helpers.py                # HTTP wrappers + assertion utilities
│   ├── test_auth.py              # Auth endpoints (login, refresh, logout, me)
│   ├── test_orders.py            # Order CRUD (list, create, get, update, archive)
│   ├── test_timeline.py          # Events, comments, attachments
│   ├── test_notifications.py     # Notification endpoints
│   ├── test_admin.py             # Admin user management
│   ├── test_portal.py            # Customer portal (public + staff)
│   ├── test_authz.py             # Authorization matrix (member vs admin)
│   ├── test_auth_security.py     # Token manipulation (expired, tampered, etc.)
│   ├── test_idor.py              # IDOR access control tests
│   ├── test_input_validation.py  # Bad input fuzzing (XSS, SQLi, unicode)
│   └── test_upload_security.py   # Upload abuse scenarios
├── security/                     # Phase 8–9: Headers, logging, Trivy
│   ├── test_headers.py           # Security header assertions
│   ├── test_logging.py           # Log event verification
│   └── trivy-scan.sh             # Container & dependency CVE scan
├── load/                         # Phase 5: Rate limit / load tests
│   ├── k6-login-ratelimit.js     # Login burst → 429
│   ├── k6-api-burst.js           # API burst → 429
│   └── run-load.sh               # Runner script
├── postman/                      # Importable Postman collection
│   └── gift-highway.postman_collection.json
├── requirements.txt              # Python dependencies
├── pytest.ini                    # pytest configuration
└── README.md                     # This file
```

## Prerequisites

- **Python 3.9+** with pip
- **Backend running** on `localhost:8080` with seed data loaded
- **k6** for load tests (`brew install k6`)
- **Trivy** for security scanning (`brew install trivy`)

## Quick Start

### 1. Install Python Dependencies

```bash
cd tests
pip install -r requirements.txt
```

### 2. Run All API & Security Tests

```bash
cd tests
pytest -v --tb=short
```

### 3. Run Specific Test Phase

```bash
# Phase 1 only (API functional)
pytest api/test_auth.py api/test_orders.py api/test_timeline.py api/test_notifications.py api/test_admin.py api/test_portal.py -v

# Phase 2 (Authorization)
pytest api/test_authz.py -v

# Phase 3 (Auth Security)
pytest api/test_auth_security.py -v

# Phase 4 (IDOR)
pytest api/test_idor.py -v

# Phase 6 (Input Validation)
pytest api/test_input_validation.py -v

# Phase 7 (Upload Security)
pytest api/test_upload_security.py -v

# Phase 8 (Headers)
pytest security/test_headers.py -v

# Phase 9 (Logging)
pytest security/test_logging.py -v
```

### 4. Run Load / Rate Limit Tests

```bash
cd tests/load
bash run-load.sh
```

### 5. Run Trivy Security Scan

```bash
cd tests/security
bash trivy-scan.sh
```

### 6. Import Postman Collection

1. Open Postman
2. File → Import → Upload `tests/postman/gift-highway.postman_collection.json`
3. Set `{{base_url}}` variable to `http://localhost:8080`
4. Run "Auth > Login (Admin)" first to populate `{{admin_token}}`

## Test Accounts (from seed data)

| Email | Password | Role |
|-------|----------|------|
| admin@company.com | Admin@123456 | admin |
| sarah@giftco.com | Admin@123456 | member |
| james@giftco.com | Admin@123456 | member |
| priya@giftco.com | Admin@123456 | member |
| tom@giftco.com | Admin@123456 | member |
| lisa@giftco.com | Admin@123456 | member |

## Excluding Slow Tests

```bash
pytest -v -m "not slow"
```

## Excluding Destructive Tests

```bash
pytest -v -m "not destructive"
```
