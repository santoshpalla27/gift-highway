# Gift Highway Automated Test Suite

This directory contains a suite of bash scripts designed to validate the security, data lifecycle, and long-term sustainability of the Gift Highway platform.

These tests ensure the application can run indefinitely without accumulating stale data ("zero-growth architecture") and that it maintains strict role-based access control (RBAC) and data isolation.

## Prerequisites

The scripts require `curl` and `python3` (for JSON parsing). The Database Health test requires the `psql` client.

Before running against a new environment, update `scripts/tests/config.sh` or pass the variables via the command line. The default credentials in `config.sh` should match a valid admin account.

## Running Tests

You can run the tests individually or all at once using the master script.

### 1. Master Runner
Executes Security, Data Lifecycle, and Database Health checks sequentially.

```bash
# Run against local development server
BASE_URL=http://localhost:8080 ./scripts/tests/run_all.sh

# Run against production domain
BASE_URL=https://api.yourdomain.com ./scripts/tests/run_all.sh
```

### 2. Security Test Suite
Simulates malicious activity to verify the API's defenses.
**Validates:** Auth bypass attempts, Token rotation/expiration, Role-Based Access Control (RBAC), Order data isolation, SQL Injection / XSS payloads, and HTTP Security headers.

```bash
BASE_URL=https://api.yourdomain.com ./scripts/tests/test_security.sh
```

### 3. Data Lifecycle Test
Verifies the system's "zero-growth" capability to ensure infinite runtime.
**Validates:** Creates orders, enriches them with data (comments, attachments), deletes them, and verifies that the database and Cloudflare R2 bucket return to their exact pre-test baseline without leaking orphaned rows or files.

```bash
BASE_URL=https://api.yourdomain.com ./scripts/tests/test_data_lifecycle.sh
```

### 4. Database Health Check
Directly queries PostgreSQL to monitor long-term health and detect hidden stale data.
**Validates:** Orphaned rows (e.g., events pointing to deleted orders), expired refresh tokens, inactive push tokens, and monitors overall table disk sizes.

```bash
# Run against local docker database
DB_URL="postgres://kanban:password@localhost:5432/appdb" ./scripts/tests/test_db_health.sh

# Run against production database
DB_URL="postgres://user:password@production-host:5432/dbname" ./scripts/tests/test_db_health.sh
```

## Configuration Options

You can override the following environment variables when running any of the scripts:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8080` | The base URL of the backend API. |
| `ADMIN_EMAIL` | `admin@company.com` | An active admin account email. |
| `ADMIN_PASSWORD` | `Admin@123456` | Password for the admin account. |
| `DB_URL` | *(Local postgres URI)* | PostgreSQL connection string (only used by `test_db_health.sh`). |
