# Customer Portal — Hidden Feature

The portal feature is fully built and working but hidden from the UI. All backend routes, database tables, services, and frontend components are intact. Only the UI entry points have been commented out.

---

## What the Portal Does

- **Customer Portal** — a public, token-based URL customers use to send messages and upload files without logging in. URL format: `/portal/:token`
- **Staff Portal Chat** — staff view and reply to customer portal messages from inside the order detail page
- Messages and attachments appear in the order timeline as events alongside regular comments

---

## How Things Were Hidden (important to understand before restoring)

Every removed block was replaced with a one-line comment rather than being deleted. This means:

- **No code was deleted.** All logic, components, hooks, services, and backend files are 100% intact.
- **No imports were deleted.** Imports that are only needed by portal are still present — they just reference components that are no longer rendered.
- Each removed JSX block has a comment in the exact spot where it used to be, in the format:
  ```
  {/* PORTAL HIDDEN: <description> — see docs/portal-hidden.md to restore */}
  ```
  In `App.tsx` (non-JSX context), the same pattern is used with `//` prefix.
- To find all hidden spots in one go, search the codebase for `PORTAL HIDDEN`.

### TypeScript build fix (variable renames)

Hiding the portal UI left several state variables declared but never read, which caused `TS6133` build errors. To suppress them without deleting the variables, the following were prefixed with `_`:

**`frontend-web/src/features/orders/pages/OrderDetailPage.tsx`**

| Before | After | Reason |
|---|---|---|
| `const [portal, setPortal]` | `const [_portal, setPortal]` | `portal` value no longer rendered; `setPortal` still called by data-fetch |
| `const [portalLoading, setPortalLoading]` | `const [_portalLoading, _setPortalLoading]` | Both sides only used in commented-out UI |
| `const [portalCopied, setPortalCopied]` | `const [_portalCopied, _setPortalCopied]` | Both sides only used in commented-out UI |
| `const [showPortalChat, setShowPortalChat]` | `const [_showPortalChat, _setShowPortalChat]` | Both sides only used in commented-out UI |

`portalAttachments`, `portalMessages`, and `setPortal` were **not** renamed — they are still read by the timeline rendering and `highlightPortalMsg` callback.

**`frontend-web/src/features/orders/components/OrderModal.tsx`**

| Before | After | Reason |
|---|---|---|
| `const [createPortal, setCreatePortal]` | `const [createPortal, _setCreatePortal]` | `createPortal` is still read in `handleSubmit`; setter's checkbox was commented out |

**When restoring:** remove the `_` prefix from all variables listed above so they match the original names used in the JSX blocks you are re-enabling.

---

## What Was Hidden (the only changes made)

### Web — `frontend-web/src/app/App.tsx`

- **Import** for `CustomerPortalPage` commented out (line ~15)
- **`/portal/:token` route** commented out — customers with existing portal links now get a 404

### Web — `frontend-web/src/features/orders/pages/OrderDetailPage.tsx`

1. **Top header bar portal button** — was between the order title and the Edit button. Showed "Portal Chat" (green, clickable) when portal was active, "Portal (revoked)" (grey, disabled) when revoked, or "Create Portal" (green) when no portal existed yet.

2. **Right sidebar "Customer Portal" panel** — was a `<PanelSection label="Customer Portal">` between the Description section and the Archive section. Showed the portal status, a "Copy portal link" button, and Regenerate/Revoke action buttons.

3. **`<StaffPortalChatModal>`** — the modal that opened when you clicked the portal button. Located at the bottom of the JSX return.

### Mobile — `mobile/app/order/[id].tsx`

1. **Portal chip in the order header chip row** — was rendered alongside the due date chip. Showed "Portal Chat" (green) when active, "Revoked" (grey) when disabled, or "Create Portal" when no portal existed.

2. **`<PortalChatSheet>`** — the bottom sheet that opened when you tapped the chip. Located after the `<EditOrderSheet>` block near the bottom of the JSX return.

### Mobile — `mobile/app/order/_sheets/OrderInfoSheet.tsx`

1. **"CUSTOMER PORTAL" section inside `InfoSheet`** — the ⓘ (info) button sheet had a full portal management panel at the bottom of the scrollable info list, just above the Archive button. It showed: portal status (Active/Revoked), a "Copy portal link" share button, and Regenerate/Revoke action buttons. Also had a "+ Create portal link" button when no portal existed yet.

### Web — `frontend-web/src/features/orders/components/OrderModal.tsx`

1. **"Generate customer portal link after creation" checkbox** — shown at the bottom of the Create Order form (not visible in Edit mode). When checked, it would auto-create a portal for the new order immediately after saving.

### Mobile — `mobile/app/(app)/all-orders.tsx`

1. **"Generate customer portal link after creation" checkbox** — same as above, in the mobile Create Order bottom sheet, just above the Create Order button.

---

## How to Re-enable (step by step)

### Step 1 — Restore the public customer portal route

In `frontend-web/src/app/App.tsx`, find and restore these two commented lines:

```ts
// PORTAL HIDDEN: import CustomerPortalPage from '../features/portal/pages/CustomerPortalPage' — see docs/portal-hidden.md to restore
```
Restore to:
```ts
import CustomerPortalPage from '../features/portal/pages/CustomerPortalPage'
```

And find:
```tsx
{/* PORTAL HIDDEN: public portal route removed — see docs/portal-hidden.md to restore */}
{/* <Route path="/portal/:token" element={<CustomerPortalPage />} /> */}
```
Restore to:
```tsx
{/* Public portal route — no auth required */}
<Route path="/portal/:token" element={<CustomerPortalPage />} />
```

---

### Step 2 — Web header button

In `frontend-web/src/features/orders/pages/OrderDetailPage.tsx`, find:

```
{/* PORTAL HIDDEN: portal button removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
{/* Customer portal button */}
{portal !== undefined && (
  portal ? (
    <button
      onClick={() => { if (portal.enabled) setShowPortalChat(true) }}
      title={portal.enabled ? 'Open customer portal chat' : 'Portal is revoked'}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: portal.enabled ? 'pointer' : 'default',
        border: `1.5px solid ${portal.enabled ? '#A7F3D0' : '#E5E7EB'}`,
        background: portal.enabled ? '#F0FDF4' : '#F9FAFB',
        color: portal.enabled ? '#059669' : '#9CA3AF',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      {portal.enabled ? 'Portal Chat' : 'Portal (revoked)'}
    </button>
  ) : (
    <button
      onClick={async () => {
        setPortalLoading(true)
        try {
          const p = await staffPortalApi.createPortal(id!, order.customer_name)
          setPortal(p)
        } finally {
          setPortalLoading(false)
        }
      }}
      disabled={portalLoading}
      title="Create customer portal link"
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: portalLoading ? 'default' : 'pointer',
        border: '1.5px solid #A7F3D0', background: '#F0FDF4', color: '#059669',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      {portalLoading ? '…' : 'Create Portal'}
    </button>
  )
)}
```

---

### Step 3 — Web sidebar panel

In the same file, find:

```
{/* PORTAL HIDDEN: Customer Portal sidebar panel removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
<PanelSection label="Customer Portal">
  {portal === undefined ? (
    <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>
  ) : portal === null ? (
    <button
      disabled={portalLoading}
      onClick={async () => {
        setPortalLoading(true)
        try {
          const p = await staffPortalApi.createPortal(id!, order.customer_name)
          setPortal(p)
        } finally {
          setPortalLoading(false)
        }
      }}
      style={{
        width: '100%', fontSize: 12, fontWeight: 600, padding: '7px 0', borderRadius: 6,
        background: '#F0FDF4', color: '#10B981', border: '1px solid #A7F3D0', cursor: portalLoading ? 'default' : 'pointer',
      }}
    >
      {portalLoading ? '…' : '+ Create portal link'}
    </button>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: portal.enabled ? '#10B981' : '#9CA3AF',
        }} />
        <span style={{ fontSize: 12, color: portal.enabled ? '#10B981' : '#9CA3AF', fontWeight: 600 }}>
          {portal.enabled ? 'Active' : 'Revoked'}
        </span>
      </div>
      {portal.enabled && (
        <button
          onClick={() => {
            const url = getPortalURL(portal.token)
            navigator.clipboard.writeText(url).then(() => {
              setPortalCopied(true)
              setTimeout(() => setPortalCopied(false), 2000)
            })
          }}
          style={{
            fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 6,
            background: portalCopied ? '#ECFDF5' : '#F9FAFB',
            color: portalCopied ? '#10B981' : '#374151',
            border: `1px solid ${portalCopied ? '#A7F3D0' : '#E5E7EB'}`,
            cursor: 'pointer', width: '100%', textAlign: 'left' as const,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
          }}
        >
          {portalCopied ? '✓ Copied!' : '📋 Copy portal link'}
        </button>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          disabled={portalLoading}
          onClick={async () => {
            setPortalLoading(true)
            try {
              const p = await staffPortalApi.regenerateToken(id!)
              setPortal(p)
            } finally {
              setPortalLoading(false)
            }
          }}
          style={{
            flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6,
            background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE', cursor: 'pointer',
          }}
        >
          Regenerate
        </button>
        <button
          disabled={portalLoading}
          onClick={async () => {
            if (!portal.enabled) return
            setPortalLoading(true)
            try {
              await staffPortalApi.revokePortal(id!)
              setPortal(p => p ? { ...p, enabled: false } : p)
            } finally {
              setPortalLoading(false)
            }
          }}
          style={{
            flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6,
            background: portal.enabled ? '#FEF2F2' : '#F3F4F6',
            color: portal.enabled ? '#EF4444' : '#9CA3AF',
            border: `1px solid ${portal.enabled ? '#FECACA' : '#E5E7EB'}`,
            cursor: portal.enabled ? 'pointer' : 'default',
          }}
        >
          {portal.enabled ? 'Revoke' : 'Revoked'}
        </button>
      </div>
    </div>
  )}
</PanelSection>
```

---

### Step 4 — Web modal

In the same file, find:

```
{/* PORTAL HIDDEN: StaffPortalChatModal removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
{showPortalChat && portal && (
  <StaffPortalChatModal
    orderId={order.id}
    portal={portal}
    onClose={() => setShowPortalChat(false)}
  />
)}
```

---

### Step 5 — Mobile chip

In `mobile/app/order/[id].tsx`, find:

```
{/* PORTAL HIDDEN: portal chip removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
{D.portal !== undefined && (
  D.portal ? (
    <TouchableOpacity
      style={[S.chip, { backgroundColor: D.portal.enabled ? '#F0FDF4' : '#F9FAFB', borderWidth: 1, borderColor: D.portal.enabled ? '#A7F3D0' : '#E5E7EB' }]}
      onPress={D.portal.enabled ? D.openPortalChat : undefined}
      activeOpacity={D.portal.enabled ? 0.7 : 1}
    >
      <Ionicons name="chatbubbles-outline" size={13} color={D.portal.enabled ? '#059669' : '#9CA3AF'} />
      <Text style={[S.chipText, { color: D.portal.enabled ? '#059669' : '#9CA3AF', marginLeft: 4 }]}>
        {D.portal.enabled ? 'Portal Chat' : 'Revoked'}
      </Text>
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      style={[S.chip, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }]}
      onPress={D.createPortal}
      activeOpacity={0.7}
      disabled={D.portalCreating}
    >
      {D.portalCreating
        ? <ActivityIndicator size="small" color="#64748B" />
        : <><Ionicons name="add-outline" size={13} color="#64748B" /><Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>Create Portal</Text></>
      }
    </TouchableOpacity>
  )
)}
```

---

### Step 6 — Mobile sheet

In the same file, find:

```
{/* PORTAL HIDDEN: PortalChatSheet removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
{D.showPortalChat && D.portal && (
  <PortalChatSheet
    orderId={id!}
    portal={D.portal}
    portalAttachments={D.portalAttachments}
    onClose={() => D.setShowPortalChat(false)}
    onPortalChange={p => D.setPortal(p ?? null)}
    onAttachmentsChange={D.setPortalAttachments}
    refreshRef={D.portalChatRefreshRef}
  />
)}
```

---

### Step 7 — Mobile Order Info Sheet (ⓘ button)

In `mobile/app/order/_sheets/OrderInfoSheet.tsx`, find:

```
{/* PORTAL HIDDEN: CUSTOMER PORTAL section removed — see docs/portal-hidden.md to restore */}
```

Replace with:

```tsx
<View style={IN.section}>
  <Text style={IN.label}>CUSTOMER PORTAL</Text>
  {portal === undefined ? (
    <Text style={IN.sub}>Loading…</Text>
  ) : portal === null ? (
    <TouchableOpacity
      style={IN.portalBtn}
      disabled={portalLoading}
      onPress={async () => {
        setPortalLoading(true)
        try {
          const p = await staffPortalApi.createPortal(order.id, order.customer_name)
          onPortalChange(p)
        } catch { Alert.alert('Error', 'Could not create portal') }
        finally { setPortalLoading(false) }
      }}
    >
      {portalLoading
        ? <ActivityIndicator size="small" color="#10B981" />
        : <Text style={IN.portalBtnText}>+ Create portal link</Text>
      }
    </TouchableOpacity>
  ) : (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[IN.dot, { backgroundColor: portal.enabled ? '#10B981' : '#9CA3AF' }]} />
        <Text style={[IN.value, { fontSize: 13 }]}>{portal.enabled ? 'Active' : 'Revoked'}</Text>
      </View>
      {portal.enabled && (
        <TouchableOpacity style={IN.copyBtn} onPress={handleCopyLink}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#10B981' : '#64748B'} />
          <Text style={[IN.copyBtnText, copied && { color: '#10B981' }]}>{copied ? 'Copied!' : 'Copy portal link'}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[IN.portalActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
          disabled={portalLoading}
          onPress={() => Alert.alert('Regenerate link?', 'The old link will stop working immediately.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Regenerate', onPress: async () => {
              setPortalLoading(true)
              try {
                const p = await staffPortalApi.regenerateToken(order.id)
                onPortalChange(p)
              } catch { Alert.alert('Error', 'Could not regenerate') }
              finally { setPortalLoading(false) }
            }},
          ])}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#3B82F6' }}>Regenerate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[IN.portalActionBtn, { backgroundColor: portal.enabled ? '#FEF2F2' : '#F3F4F6', borderColor: portal.enabled ? '#FECACA' : '#E5E7EB' }]}
          disabled={!portal.enabled || portalLoading}
          onPress={() => Alert.alert('Revoke portal?', 'The customer link will stop working.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Revoke', style: 'destructive', onPress: async () => {
              setPortalLoading(true)
              try {
                await staffPortalApi.revokePortal(order.id)
                onPortalChange({ ...portal, enabled: false })
              } catch { Alert.alert('Error', 'Could not revoke') }
              finally { setPortalLoading(false) }
            }},
          ])}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: portal.enabled ? '#EF4444' : '#9CA3AF' }}>
            {portal.enabled ? 'Revoke' : 'Revoked'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )}
</View>
```

---

## Full File Inventory (nothing deleted)

All portal code is still in the repo at these paths:

| Layer | File | Purpose |
|---|---|---|
| Backend | `backend/internal/api/v1/portal.go` | All HTTP handlers |
| Backend | `backend/internal/services/portal_service.go` | Business logic |
| Backend | `backend/internal/repositories/portal_repository.go` | DB access |
| Backend | `backend/internal/models/portal.go` | Data models |
| Backend | `backend/migrations/000010_customer_portal.up.sql` | DB schema |
| Backend | `backend/migrations/000010_customer_portal.down.sql` | DB rollback |
| Web | `frontend-web/src/features/portal/pages/CustomerPortalPage.tsx` | Public customer UI |
| Web | `frontend-web/src/features/orders/components/StaffPortalChatModal.tsx` | Staff chat modal |
| Web | `frontend-web/src/services/portalService.ts` | API client |
| Mobile | `mobile/services/portalService.ts` | API client |
| Mobile | `mobile/app/order/_components/PortalAttachmentCard.tsx` | Attachment card |
| Mobile | `mobile/app/order/_sheets/PortalChatSheet.tsx` | Chat bottom sheet |
| Mobile | `mobile/app/order/_hooks/usePortalChat.ts` | Chat state hook |
| Tests | `tests/api/test_portal.py` | API tests |

The 7 files actually edited:

| File | What was changed |
|---|---|
| `frontend-web/src/app/App.tsx` | Commented out: import + `/portal/:token` route |
| `frontend-web/src/features/orders/pages/OrderDetailPage.tsx` | Commented out: header button, sidebar panel, modal mount · `_` prefix on 4 unused state variables (see TypeScript build fix above) |
| `frontend-web/src/features/orders/components/OrderModal.tsx` | Commented out: "Generate portal link" checkbox · `_setCreatePortal` rename |
| `mobile/app/order/[id].tsx` | Commented out: portal chip, sheet mount |
| `mobile/app/order/_sheets/OrderInfoSheet.tsx` | Commented out: "CUSTOMER PORTAL" section in the ⓘ info sheet |
| `mobile/app/(app)/all-orders.tsx` | Commented out: "Generate portal link" checkbox in Create Order sheet |

To find all hidden spots in one search, run: `grep -r "PORTAL HIDDEN" --include="*.tsx" --include="*.ts" .`

---

## Database Tables (untouched)

- `customer_portals` — one row per order, stores the token and enabled status
- `portal_messages` — all messages between customer and staff
- `portal_attachments` — all files uploaded via the portal

All tables have `CASCADE DELETE` from orders so they clean themselves up automatically when an order is deleted.
