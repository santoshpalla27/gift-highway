import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService, type NotificationEvent } from '../../../services/notificationService'
import { formatRelative } from '../../../utils/date'
import { useAuthStore } from '../../../store/authStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPE_OPTIONS = [
  { value: 'customer_message',    label: 'Customer Messages',  color: '#6366F1' },
  { value: 'customer_attachment', label: 'Customer Files',     color: '#10B981' },
  { value: 'comment_added',       label: 'Comments',           color: '#6B7280' },
  { value: 'attachment_added',    label: 'Attachments',        color: '#6B7280' },
  { value: 'status_changed',      label: 'Status Changes',     color: '#3B82F6' },
  { value: 'assignees_changed',   label: 'Assignee Changes',   color: '#8B5CF6' },
] as const

const EVENT_ICON_COLOR: Record<string, string> = {
  customer_message:    '#6366F1',
  customer_attachment: '#10B981',
  comment_added:       '#6B7280',
  attachment_added:    '#6B7280',
  status_changed:      '#3B82F6',
  assignees_changed:   '#8B5CF6',
  due_date_changed:    '#F59E0B',
  priority_changed:    '#EC4899',
  staff_portal_reply:  '#14B8A6',
  order_updated:       '#9CA3AF',
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  customer_message:    'Customer Message',
  customer_attachment: 'Customer File',
  comment_added:       'Comment',
  attachment_added:    'Attachment',
  status_changed:      'Status Change',
  due_date_changed:    'Due Date Change',
  priority_changed:    'Priority Change',
  assignees_changed:   'Assignee Change',
  staff_portal_reply:  'Portal Reply',
  order_updated:       'Order Update',
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  high:   { label: 'High',   color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
}

// ── Event icon ────────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  const color = EVENT_ICON_COLOR[type] ?? '#9CA3AF'
  const icons: Record<string, React.ReactNode> = {
    customer_message: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
    ),
    customer_attachment: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    ),
    comment_added: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    attachment_added: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    ),
    status_changed: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    assignees_changed: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    due_date_changed: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    priority_changed: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    staff_portal_reply: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
      </svg>
    ),
  }
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      background: `${color}14`, border: `1.5px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {icons[type] ?? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      )}
    </div>
  )
}

// ── Event summary text ────────────────────────────────────────────────────────

function eventSummary(e: NotificationEvent): string {
  const p = e.payload ?? {}
  switch (e.type) {
    case 'customer_message':
      return `${p.customer_name ?? 'Customer'}: ${String(p.text ?? '').replace(/\[attachment:\d+:[^\]]+\]/g, '').trim().slice(0, 120) || 'sent a message'}`
    case 'customer_attachment':
      return `${p.customer_name ?? 'Customer'} uploaded ${p.file_name ?? 'a file'}`
    case 'comment_added':
      return `${e.actor_name}: ${String(p.text ?? '').replace(/^\[reply:[^\]]+\]\n?/, '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 120)}`
    case 'attachment_added':
      return `${e.actor_name} uploaded ${p.file_name ?? 'a file'}`
    case 'status_changed':
      return `${e.actor_name} changed status to ${p.to ?? ''}`
    case 'due_date_changed':
      return `${e.actor_name} changed due date to ${p.to ?? 'none'}`
    case 'assignees_changed':
      return `${e.actor_name} updated assignees`
    case 'priority_changed':
      return `${e.actor_name} changed priority to ${p.to ?? ''}`
    case 'staff_portal_reply':
      return `${e.actor_name} replied in portal: ${String(p.text ?? '').slice(0, 80)}`
    case 'order_updated':
      return `${e.actor_name} updated the order`
    default:
      return `${e.actor_name} made a change`
  }
}

// ── FilterPill ────────────────────────────────────────────────────────────────

function FilterPill({
  label, value, onClear, children,
}: {
  label: string
  value?: string
  onClear?: () => void
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const isActive = !!value

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          border: `1.5px solid ${isActive ? '#6366F1' : '#E4E6EF'}`,
          background: isActive ? '#EEF2FF' : '#FFFFFF',
          color: isActive ? '#4F46E5' : '#374151',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 120ms ease',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = '#C7CAD9' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = '#E4E6EF' }}
      >
        <span>{isActive ? `${label}: ${value}` : label}</span>
        {isActive ? (
          <span onClick={ev => { ev.stopPropagation(); onClear?.(); setOpen(false) }} style={{ display: 'flex', alignItems: 'center', marginLeft: 2, opacity: 0.7 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
          background: '#FFFFFF', border: '1px solid #E4E6EF',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.10)',
          minWidth: 180, overflow: 'hidden',
        }}
          onMouseLeave={() => setOpen(false)}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

const pillItem = (active: boolean): React.CSSProperties => ({
  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
  background: active ? '#EEF2FF' : 'transparent',
  color: active ? '#4F46E5' : '#374151',
  fontWeight: active ? 600 : 400,
  display: 'flex', alignItems: 'center', gap: 8,
})

// ── Page ──────────────────────────────────────────────────────────────────────

export function OrderNotificationsPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuthStore()

  const [search, setSearch] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)

  // Capture last_seen_at before marking read, then auto-mark after 2.5s
  useEffect(() => {
    if (!orderId) return
    notificationService.getLastSeen(orderId).then(t => setLastSeenAt(t))
    const timer = setTimeout(() => {
      notificationService.markOrderRead(orderId).then(() => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        qc.invalidateQueries({ queryKey: ['notifications-orders'] })
      })
    }, 2500)
    return () => clearTimeout(timer)
  }, [orderId, qc])

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-order', orderId],
    queryFn: () => notificationService.getOrderEvents(orderId!),
    enabled: isAuthenticated && !!orderId,
    staleTime: 30_000,
  })

  const { mutate: markRead, isPending: marking } = useMutation({
    mutationFn: () => notificationService.markOrderRead(orderId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-orders'] })
      qc.invalidateQueries({ queryKey: ['notifications-order', orderId] })
      setLastSeenAt(new Date().toISOString())
    },
  })

  const allEvents = data?.events ?? []

  const isUnread = (e: NotificationEvent) =>
    !lastSeenAt || new Date(e.created_at) > new Date(lastSeenAt)

  const filtered = useMemo(() => {
    let evts = [...allEvents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    if (search.trim()) {
      const q = search.toLowerCase()
      evts = evts.filter(e => eventSummary(e).toLowerCase().includes(q) || e.actor_name.toLowerCase().includes(q))
    }
    if (eventTypeFilter) evts = evts.filter(e => e.type === eventTypeFilter)
    if (priorityFilter) evts = evts.filter(e => e.priority === priorityFilter)
    if (unreadOnly) evts = evts.filter(e => isUnread(e))
    return evts
  }, [allEvents, search, eventTypeFilter, priorityFilter, unreadOnly, lastSeenAt])

  const unreadCount = allEvents.filter(e => isUnread(e)).length
  const hasFilters = !!(search || eventTypeFilter || priorityFilter || unreadOnly)

  // Pull order number/title from the summaries cache if available
  const summariesData = qc.getQueryData<{ orders: { order_id: string; order_number: number; order_title: string }[] }>(['notifications-orders'])
  const orderInfo = summariesData?.orders.find(o => o.order_id === orderId)

  const eventTypeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === eventTypeFilter)?.label

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      padding: '24px', background: '#F5F6FA', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .event-row { transition: background 120ms ease; }
        .event-row:hover { background: #F9FAFB !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          {/* Back */}
          <button
            onClick={() => navigate('/notifications')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 10,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 13, fontWeight: 500, color: '#6B7280',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#111827' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6B7280' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Activity
          </button>

          <div style={{ marginTop: '-6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {orderInfo && (
                <span style={{
                  fontSize: 12, fontWeight: 700, color: '#6366F1',
                  background: '#EEF2FF', border: '1px solid #C7D2FE',
                  borderRadius: 6, padding: '3px 8px', fontFamily: 'monospace',
                }}>
                  Order #{orderInfo.order_title}
                </span>
              )}
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.4px' }}>
                {orderInfo?.order_title ?? 'Order Notifications'}
              </h1>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
              {isLoading ? 'Loading…' : `${allEvents.length} total · ${unreadCount} unread`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => navigate(`/orders/${orderId}`)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10,
              border: '1.5px solid #E4E6EF', background: '#FFFFFF',
              color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#C7CAD9' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#E4E6EF' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Open Order
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markRead()}
              disabled={marking}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10, border: '1.5px solid transparent',
                background: '#6366F1', color: '#FFFFFF', fontSize: 13, fontWeight: 600,
                cursor: marking ? 'default' : 'pointer',
                boxShadow: '0 2px 8px rgba(99,102,241,.15)', opacity: marking ? 0.7 : 1,
              }}
              onMouseOver={e => { if (!marking) e.currentTarget.style.background = '#4F46E5' }}
              onMouseOut={e => { e.currentTarget.style.background = '#6366F1' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {marking ? 'Marking…' : 'Mark read'}
            </button>
          )}
        </div>
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#FFFFFF', border: `1.5px solid ${search ? '#6366F1' : '#E4E6EF'}`,
          borderRadius: 8, padding: '6px 10px', width: 240,
          boxShadow: search ? '0 0 0 3px rgba(99,102,241,.10)' : 'none',
          transition: 'all 150ms ease',
        }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.10)' }}
          onBlurCapture={e => { if (!search) { e.currentTarget.style.borderColor = '#E4E6EF'; e.currentTarget.style.boxShadow = 'none' } }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" placeholder="Search events…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13, outline: 'none', width: '100%', color: '#111827' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: '#E4E6EF', flexShrink: 0 }} />

        {/* Event Type */}
        <FilterPill label="Event Type" value={eventTypeLabel} onClear={() => setEventTypeFilter('')}>
          {close => (
            <div style={{ padding: 4 }}>
              {EVENT_TYPE_OPTIONS.map(opt => (
                <div key={opt.value} style={pillItem(eventTypeFilter === opt.value)}
                  onMouseEnter={e => { if (eventTypeFilter !== opt.value) e.currentTarget.style.background = '#F5F6FA' }}
                  onMouseLeave={e => { if (eventTypeFilter !== opt.value) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { setEventTypeFilter(eventTypeFilter === opt.value ? '' : opt.value); close() }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Priority */}
        <FilterPill
          label="Priority"
          value={priorityFilter ? PRIORITY_META[priorityFilter]?.label : undefined}
          onClear={() => setPriorityFilter('')}
        >
          {close => (
            <div style={{ padding: 4 }}>
              {(['high', 'medium', 'low'] as const).map(p => (
                <div key={p} style={pillItem(priorityFilter === p)}
                  onMouseEnter={e => { if (priorityFilter !== p) e.currentTarget.style.background = '#F5F6FA' }}
                  onMouseLeave={e => { if (priorityFilter !== p) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { setPriorityFilter(priorityFilter === p ? '' : p); close() }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[p].color, flexShrink: 0 }} />
                  {PRIORITY_META[p].label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Unread only */}
        <button
          onClick={() => setUnreadOnly(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1.5px solid ${unreadOnly ? '#6366F1' : '#E4E6EF'}`,
            background: unreadOnly ? '#EEF2FF' : '#FFFFFF',
            color: unreadOnly ? '#4F46E5' : '#374151',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 120ms ease',
          }}
          onMouseEnter={e => { if (!unreadOnly) e.currentTarget.style.borderColor = '#C7CAD9' }}
          onMouseLeave={e => { if (!unreadOnly) e.currentTarget.style.borderColor = '#E4E6EF' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          Unread only
        </button>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setEventTypeFilter(''); setPriorityFilter(''); setUnreadOnly(false) }}
            style={{
              padding: '6px 10px', borderRadius: 8, border: 'none',
              background: 'transparent', fontSize: 13, fontWeight: 500,
              color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6B7280' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear all
          </button>
        )}

        {hasFilters && !isLoading && (
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Event list */}
      <div style={{
        flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid #E4E6EF',
        borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F3F4F6', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 13, width: '60%', borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 6 }} />
                    <div style={{ height: 11, width: '30%', borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                  {hasFilters
                    ? <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>
                    : <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>
                  }
                </svg>
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>
                {hasFilters ? 'No matching events' : 'No notifications'}
              </p>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                {hasFilters ? 'Try adjusting your filters.' : 'No notifiable events for this order.'}
              </p>
            </div>
          ) : (
            filtered.map((e, i) => {
              const unread = isUnread(e)
              const pm = PRIORITY_META[e.priority]
              return (
                <div
                  key={e.id}
                  className="event-row"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '14px 20px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                    background: unread ? '#FAFBFF' : '#FFFFFF',
                    borderLeft: unread ? '3px solid #6366F1' : '3px solid transparent',
                  }}
                >
                  <EventIcon type={e.type} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: EVENT_ICON_COLOR[e.type] ?? '#9CA3AF', background: `${EVENT_ICON_COLOR[e.type] ?? '#9CA3AF'}14`, borderRadius: 4, padding: '1px 6px' }}>
                        {EVENT_TYPE_LABEL[e.type] ?? e.type}
                      </span>
                      {unread && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {eventSummary(e)}
                    </p>
                  </div>

                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pm && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: pm.color,
                        background: pm.bg, border: `1px solid ${pm.border}`,
                        borderRadius: 4, padding: '2px 6px',
                      }}>
                        {pm.label.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 11.5, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                      {formatRelative(e.created_at)}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
