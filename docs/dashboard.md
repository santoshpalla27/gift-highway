# Dashboard

## Overview

The dashboard has two tabs: **My Dashboard** (personal view) and **Team Dashboard** (admin/overview).

---

## Team Dashboard — KPI Cards & Redirects

Each KPI card is clickable and navigates to the All Orders table pre-filtered.

| Card | Filter applied | URL |
|---|---|---|
| New Orders | status = new | `/orders?status=new` |
| Working | status = in_progress | `/orders?status=in_progress` |
| Completed | status = completed | `/orders?status=completed` |
| Due Today | due today toggle | `/orders?today=1` |
| Overdue | overdue toggle | `/orders?overdue=1` |
| Stale (7+ days) | no update in 7+ days, not completed | `/orders?stale=1` |

## Section Cards — "View all" links

| Section | Link |
|---|---|
| Due Today | `/orders?today=1` |
| Overdue | `/orders?overdue=1` |
| Stale Orders | `/orders?stale=1` |

---

## Hidden: Unread Customer Messages

The **Unread Customer** KPI card and **Unread Customer Messages** section have been removed from both Team and My Dashboard tabs. The underlying data (`unread_customer`, `unread_customer_orders`) is still returned by the backend dashboard endpoints — it is simply not displayed.

To restore: add the KPI entry back to the `kpis` array in `DashboardPage.tsx` and re-add the `SectionCard` block for `unread_customer_orders`. The `unread=1` URL param in `OrdersPage` also still works if you want to link through.

---

## URL Params — OrdersPage filters

These params are read by `frontend-web/src/features/orders/pages/OrdersPage.tsx`:

| Param | Effect |
|---|---|
| `status=new\|in_progress\|completed` | Status chip filter |
| `today=1` | Due-today toggle (maps to due_from=today, due_to=today) |
| `overdue=1` | Overdue toggle (maps to due_to=yesterday, no status=completed) |
| `stale=1` | Stale toggle — orders not updated in 7+ days with status != completed |
| `assignee=<user_id>` | Pre-selects assignee filter |
| `q=<search>` | Pre-fills search box |
| `priority=<p>` | Priority chip filter |
