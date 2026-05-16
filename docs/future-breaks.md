# Future Break Reference

Things that will not break today but will need attention over time.
Use this as a reference when something stops working unexpectedly.

Last updated: 2026-05-16

---

## 1. Node 20 is EOL — frontend Docker image

**File**: `frontend-web/Dockerfile`
**Current**: `node:20-alpine`
**Status**: Node 20 maintenance support ended April 2026. No more security patches from Node.

**When it breaks**: Won't break builds immediately, but any Node 20 CVE discovered after April 2026 will go unpatched. CI/CD pipelines and some package registries may start warning or blocking EOL Node versions.

**Fix when needed**:
```dockerfile
# Change in frontend-web/Dockerfile
FROM node:22-alpine AS builder   # was node:20-alpine
```
Also update local dev environment to Node 22.
Node 22 LTS maintenance runs until April 2027.

---

## 2. Expo SDK 55 will age out — mobile app

**File**: `mobile/package.json`
**Current**: `expo: ~55.0.15`, `react-native: 0.83.4`
**Status**: Works fine now. Apple and Google raise minimum target API requirements every year.

**When it breaks**: When Apple/Google raise their minimum requirements past what SDK 55 supports, EAS Build will reject store submissions. Expo typically drops SDK support ~12-18 months after release. SDK 55 was released mid-2025, so plan for an upgrade around late 2026 / early 2027.

**Symptoms**: EAS Build error saying minimum iOS/Android target API is too low, or App Store Connect rejecting the build.

**Fix when needed**: Follow the official Expo SDK upgrade guide — usually `npx expo install expo@next` and resolving peer dependency conflicts. Expect 1-2 days of work per major SDK version jumped.

**Reference**: https://expo.dev/changelog

---

## 3. `lib/pq` PostgreSQL driver is maintenance-only — backend + push-service

**Files**: `backend/go.mod`, `push-service/go.mod`
**Current**: `github.com/lib/pq v1.10.9`
**Status**: In maintenance-only mode. Security fixes only, no new features. The Go community has moved to `pgx`.

**When it breaks**: Won't break on its own. You'll hit this wall if you need:
- Connection pooling (pgxpool)
- PostgreSQL-specific features (COPY protocol, logical replication, large objects)
- Better performance on high-concurrency workloads

**Fix when needed**:
Replace `lib/pq` with `pgx` driver:
```go
// go.mod
github.com/jackc/pgx/v5 v5.x.x
```
Update connection string format and any `pq.Array()` / `pq.Error` type assertions in the codebase.

---

## 4. `gopsutil/v3` has a v4 — monitor service

**File**: `monitor/go.mod`
**Current**: `github.com/shirou/gopsutil/v3 v3.24.5`
**Status**: v3 is frozen. v4 has better Linux kernel support and cgroup v2 improvements.

**When it breaks**: If the server OS kernel is upgraded significantly (e.g. kernel 6.x+ edge cases), some CPU/memory metrics may return incorrect values. v3 is not getting fixes for new OS behaviour.

**Fix when needed**:
```go
// go.mod — change import path
github.com/shirou/gopsutil/v4 v4.x.x
```
Update all imports in `system.go` and `docker.go` from `v3` to `v4`.

---

## 5. React version mismatch — web on 18, mobile on 19

**Files**: `frontend-web/package.json`, `mobile/package.json`
**Current**: Web uses `react: ^18.3.1`, mobile uses `react: 19.2.0`
**Status**: Both work fine independently. No shared code between them so no immediate conflict.

**When it breaks**: If you ever share components or utilities between web and mobile (e.g. a shared package), you'll hit peer dependency conflicts. Also React 18 will eventually reach its own EOL.

**Fix when needed**:
```json
// frontend-web/package.json
"react": "^19.0.0",
"react-dom": "^19.0.0"
```
React 19 has some breaking changes in concurrent features and ref handling — test thoroughly after upgrade.

---

## 6. Tailwind CSS v3 — will need migration to v4 eventually

**File**: `frontend-web/package.json`
**Current**: `tailwindcss: ^3.4.4`
**Status**: v4 is a complete rewrite with a different config format (CSS-first, no `tailwind.config.js`).

**When it breaks**: Never breaks automatically since `^3` won't pull v4. But v3 will eventually stop getting updates.

**Fix when needed**: v4 migration is significant — config file format changes, some utility class names changed, PostCSS setup changes. Allocate at least a day. Official migration guide will be at tailwindcss.com.

---

## 7. React Router v6 — v7 is available

**File**: `frontend-web/package.json`
**Current**: `react-router-dom: ^6.24.0`
**Status**: v7 merged React Router with Remix. `^6` won't auto-update. v6 will continue receiving security patches for a while.

**When it breaks**: Won't break automatically. Security patch window for v6 will eventually close.

**Fix when needed**: v7 migration guide at reactrouter.com. Main changes are around loaders/actions if you use those (this app uses client-side routing only, so migration should be straightforward).

---

## 8. ESLint v8 — v9 has breaking flat config

**File**: `frontend-web/package.json`
**Current**: `eslint: ^8.57.0`
**Status**: ESLint 9 uses a new "flat config" format (`eslint.config.js` instead of `.eslintrc`). v8 is in maintenance mode.

**When it breaks**: Won't break builds. Will break when you try to upgrade to v9 and the old `.eslintrc` config is not recognised.

**Fix when needed**: Migrate `.eslintrc` to the new flat config format. ESLint provides a migration tool: `npx @eslint/migrate-config .eslintrc.json`.

---

## Docker Image Versions

| Service | Image | Pinned To | Action Needed |
|---------|-------|-----------|---------------|
| frontend-web | `node:20-alpine` | Node 20 (EOL Apr 2026) | Upgrade to `node:22-alpine` |
| frontend-web | `nginx:alpine` | Unpinned (floating) | Pin to `nginx:1.27-alpine` |
| backend | `golang:1.24-alpine` → `scratch` | Go 1.24 | None — Go has strong backward compat |
| push-service | `golang:1.24-alpine` → `alpine:3.20` | Go 1.24 | None |
| monitor | `golang:1.25-alpine` → `alpine:3.20` | Go 1.25, mismatches others | Align to `golang:1.24-alpine` |

---

## Go Module Stability Notes

Go has a strict backwards compatibility guarantee — code written for Go 1.24 will compile and run unchanged on any future Go version. The Go modules below are all stable and low-risk:

- `gin v1.10`, `jwt/v5`, `sqlx v1.4`, `zerolog`, `gorilla/websocket` — mature, no planned breaking changes
- `aws-sdk-go-v2` — actively maintained by AWS, v2 path is stable
- `golang-migrate/v4` — stable, migration files are portable

The only Go dependency worth watching is `lib/pq` (see item 3 above).
