The table now sorts smart by default: overdue first → due today → high priority → recently updated

Scope of Portal Removal
What "portal" covers
Two linked features: the Customer Portal (a public link customers use to message staff and upload files) and the Staff Portal Chat (how staff view and reply to those messages inside the order detail).

Files that are 100% portal — delete entirely
These files exist only for portal and can be deleted with no side effects on anything else:

Backend

backend/internal/api/v1/portal.go
backend/internal/services/portal_service.go
backend/internal/repositories/portal_repository.go
backend/internal/models/portal.go
backend/migrations/000010_customer_portal.up.sql / .down.sql
Web

frontend-web/src/features/portal/pages/CustomerPortalPage.tsx
frontend-web/src/features/orders/components/StaffPortalChatModal.tsx
frontend-web/src/services/portalService.ts
Mobile

mobile/services/portalService.ts
mobile/app/order/\_components/PortalAttachmentCard.tsx
mobile/app/order/\_sheets/PortalChatSheet.tsx
mobile/app/order/\_hooks/usePortalChat.ts
Tests

tests/api/test_portal.py
Files with portal mixed in — need surgical edits (not full delete)
These files serve other purposes but have portal code stitched in:

File What to remove
backend/internal/api/router.go ~15 portal route registrations
backend/internal/models/event.go 4 event type constants (customer_message, customer_attachment, staff_portal_reply, portal_message_deleted)
backend/internal/repositories/order_repository.go Portal attachment cleanup on order delete
backend/internal/repositories/notification_repository.go References to portal event types
frontend-web/src/app/App.tsx The /portal/:token route
frontend-web/src/features/orders/pages/OrderDetailPage.tsx Portal chat modal import + trigger button
frontend-web/src/features/notifications/components/BellDropdown.tsx staff_portal_reply event rendering
mobile/app/order/[id].tsx Portal chat sheet import + trigger button
mobile/app/order/\_hooks/useOrderDetail.ts Portal message parsing helpers
mobile/app/order/\_components/TimelineItem.tsx Portal event rendering
mobile/app/order/\_components/SystemEventRow.tsx Portal event rendering
mobile/hooks/useNotifPreference.ts Portal event types in preferences
Database impact
3 tables get dropped: customer_portals, portal_messages, portal_attachments. All have CASCADE DELETE from orders, so no orphaned data. All Cloudflare R2 files stored under portal/ prefix would need manual cleanup (the database rows would be gone but files remain in R2 until deleted separately).

Is it feasible? Yes, cleanly.
The portal was built as a separate vertical feature — it has its own service, repository, models, and migration. It touches the core app only through:

A button in the order detail (to open the chat)
Portal event types in the timeline renderer
Notification handling of portal events
Nothing in the core order flow (creating orders, status changes, assignments, comments, regular attachments, billing) depends on portal. Removing it would not break any other feature.

Risks / things to be careful about
Order timeline events — if any live orders already have customer_message or staff_portal_reply events recorded, those event records will still exist in the order_events table but the timeline renderer won't know how to display them anymore. You'd want to either delete those events or add a fallback "unknown event" renderer.

Notifications — any stored notifications referencing portal event types will still be in the DB. They'll just render incorrectly unless you handle the missing type gracefully.

R2 file storage — portal attachments in Cloudflare R2 (under the portal/ key prefix) are not automatically removed by the DB migration. You'd need to separately purge those files.

The public URL /portal/:token — anyone with an existing portal link would get a 404 after removal. If you have active customers using live portal links, they'd lose access instantly.

How easy to reverse if you change your mind?
Very easy — because it's a separate migration file, separate files, and separate routes. You'd just restore the files from git history and run the migration up again. No core data structures were changed to accommodate portal.

Effort estimate
Backend: 1–2 hours — delete 5 files, edit 4 files (router + 3 repositories/models)
Web frontend: 1 hour — delete 3 files, edit 4 files
Mobile: 1–2 hours — delete 4 files, edit 5 files
Total: roughly half a day of focused work, no risk to unrelated features
