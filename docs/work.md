GiftFlow — Full Implementation Roadmap
Current State (Done)
Auth backend: login, logout, me, refresh token rotation
JWT middleware, bcrypt, rate limiting, security headers
Protected/public routes, Zustand auth store
Design system ported from sample (CSS vars, dark mode, all components)
Login page, AppShell, Sidebar, Header — all wired to real API
Migrations: users, roles, refresh_tokens
Docker, CI pipeline, mobile base
PHASE 1 — Auth (Complete Now)
Frontend Web — ✅ Done

Backend remaining:

GET /api/v1/auth/me — ✅ done
POST /api/v1/auth/refresh — ✅ just added
Add login_history table migration (ip, user_agent, success, timestamp)
Add audit log insert on every login attempt in auth_service.go
Test the full loop:

# Start DB + backend

docker compose up -d postgres
cd backend && go run ./cmd/server

# Test login

curl -X POST http://localhost:8080/api/v1/auth/login \
 -H "Content-Type: application/json" \
 -d '{"email":"admin@company.com","password":"Admin@123456"}'
PHASE 2 — Database Schema
Run these migrations next (create the files, apply them):

migrations/
000004_create_orders.up.sql
000005_create_order_timeline.up.sql
000006_create_notifications.up.sql
000007_create_activity_logs.up.sql
Key schema decisions:

-- orders
id UUID, order_number SERIAL, customer_name, title, description,
status (yet_to_start|working|review|done), priority (low|medium|high|urgent),
assigned_to UUID REFERENCES users, created_by UUID REFERENCES users,
due_date TIMESTAMPTZ, completed_at, deleted_at (soft delete),
created_at, updated_at

-- order_timeline (unified feed)
id UUID, order_id UUID, actor_id UUID, type (comment|status_change|assignment|file|note),
content TEXT, metadata JSONB, created_at

-- notifications
id UUID, user_id UUID, type, title, body, reference_id, reference_type,
read_at TIMESTAMPTZ, created_at

-- activity_logs
id UUID, actor_id UUID, action, resource_type, resource_id,
metadata JSONB, ip_address, created_at
PHASE 3 — Orders CRUD
Backend APIs

GET /api/v1/orders — list + filters + pagination
GET /api/v1/orders/:id — single order with assignee
POST /api/v1/orders — create
PATCH /api/v1/orders/:id — update fields
DELETE /api/v1/orders/:id — soft delete (set deleted_at)
Structure to add:

backend/internal/
api/v1/orders.go handler
services/order_service.go business logic
repositories/order_repo.go DB queries
models/order.go structs + DTOs
Frontend Web
Port the sample OrdersDashboard.tsx directly — it already has the right layout. Wire it to TanStack Query:

// hooks/useOrders.ts
const { data } = useQuery({
queryKey: ['orders', filters],
queryFn: () => orderService.list(filters),
})
Pages to create:

features/orders/pages/OrdersPage.tsx — table view with filters/search
features/orders/components/CreateOrderModal.tsx — modal form
features/orders/hooks/useOrders.ts, useCreateOrder.ts
PHASE 4 — My Orders
Reuse the orders table but pre-filtered to assigned_to = current_user.

Backend: GET /api/v1/orders/mine or just GET /api/v1/orders?assigned_to=me

Frontend: Port MyOrdersPage.tsx from sample, add grouped sections (Due Today, Overdue, In Progress).

PHASE 5 — Order Detail + Timeline (Most Important)
This is the core UX. Layout:

┌─────────────────────────────┬──────────────────┐
│ Timeline Feed │ Meta Panel │
│ │ Status │
│ [comment][file][status] │ Assignee │
│ [comment][status] │ Due date │
│ [assignment] │ Priority │
│ │ Watchers │
├─────────────────────────────┴──────────────────┤
│ [Sticky composer: type message / attach file] │
└─────────────────────────────────────────────────┘
Backend:

GET /api/v1/orders/:id/timeline — all events sorted by time
POST /api/v1/orders/:id/comment — add comment
POST /api/v1/orders/:id/files — attach file (S3/R2)
PATCH /api/v1/orders/:id/status — change status (logs to timeline)
PATCH /api/v1/orders/:id/assign — reassign (logs to timeline)
Every status change, assignment, comment, file upload writes one row to order_timeline. The frontend reads one endpoint and renders everything in a single chronological feed.

PHASE 6 — Notifications
Backend: When these events happen, insert into notifications:

Order assigned to you
You're mentioned (@name in comment)
Order status changed (if you're watching)
Order overdue (cron job or checked at query time)

GET /api/v1/notifications — your notifications, unread first
POST /api/v1/notifications/read — mark specific as read
POST /api/v1/notifications/read-all
GET /api/v1/notifications/count — unread count for badge
Frontend: The bell icon in the header becomes a dropdown. Unread count badge updates on interval (or WebSocket later).

PHASE 7 — Mobile Parity
The mobile app already has auth. Next screens:

mobile/app/(app)/
orders/index.tsx — orders list
orders/[id].tsx — order detail
my-orders/index.tsx — my orders
notifications.tsx — notifications
profile.tsx — user profile + logout
All screens use the same API endpoints as web. No separate mobile API.

PHASE 8 — UI Polish (Ongoing)
The design system is in. As you build each page:

Loading skeleton: use .skeleton class from the design system CSS for table rows
Empty states: centered icon + message when tables are empty
Toast: minimal success/error toast (top-right, auto-dismiss 3s)
Responsive: sidebar collapses to icon-only on mobile (collapsed class already handles this)
Dark mode: already supported via [data-theme="dark"] in the design system CSS — add a toggle button in the header
PHASE 9 — Backend Quality
As features grow, add:

Request validation middleware: Gin binding already handles this, add response DTOs
Error types: internal/errors/errors.go — typed errors with HTTP codes
Pagination helper: internal/utils/pagination.go — parse ?page=&limit= consistently
Tests: \*\_test.go files alongside each service, use testcontainers-go for DB integration tests
Metrics: add prometheus/client_golang for request latency + error rate
PHASE 10 — Production
When ready to deploy:

Add TLS via Traefik labels in docker-compose.prod.yml
Add DATABASE_URL pointing to managed Postgres (RDS or Supabase)
Add SENTRY_DSN to backend for error tracking
GitHub Actions: add deploy job that SSHes to server and runs docker compose pull && docker compose up -d
Add pg_dump cron for daily backups
Build Order Summary

Now → Test login end-to-end (frontend + backend + DB)
Week 1 → Phase 2 (DB schema) + Phase 3 (Orders CRUD)  
Week 2 → Phase 4 (My Orders) + Phase 5 (Order Detail)
Week 3 → Phase 6 (Notifications) + Phase 7 (Mobile)
Week 4 → Phase 8 (Polish) + Phase 9 (Tests)
Later → Phase 10 (Production deploy)
Immediate next step: Start the backend with the real DB and test the login flow end-to-end:

cd /Users/vamsy/Downloads/hmmm/backend && go run ./cmd/server
Then open http://localhost:5174 and sign in with admin@company.com / Admin@123456. The migrations need to be applied to your remote DB first — let me know if you want that command.
