import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService, type FlatActivityEvent } from '../../../services/notificationService'
import { formatDate, formatDateTime, formatRelative } from '../../../utils/date'
import { useAuthStore } from '../../../store/authStore'
import { DateInput } from '../../../components/system/DateInput'

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_TYPE_OPTIONS = [
  { value: 'customer_message',    label: 'Customer Message',  color: '#6366F1' },
  { value: 'customer_attachment', label: 'Customer File',     color: '#10B981' },
  { value: 'comment_added',       label: 'Comment',           color: '#6B7280' },
  { value: 'attachment_added',    label: 'Attachment',        color: '#6B7280' },
  { value: 'status_changed',      label: 'Status Change',     color: '#3B82F6' },
  { value: 'assignees_changed',   label: 'Assignee Change',   color: '#8B5CF6' },
  { value: 'due_date_changed',    label: 'Due Date Change',   color: '#F59E0B' },
  { value: 'priority_changed',    label: 'Priority Change',   color: '#EC4899' },
  { value: 'staff_portal_reply',  label: 'Portal Reply',      color: '#14B8A6' },
  { value: 'order_updated',       label: 'Order Update',      color: '#9CA3AF' },
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

function eventSummary(e: FlatActivityEvent): string {
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
  const pillRef = useRef<HTMLDivElement>(null)
  const isActive = !!value

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={pillRef} style={{ position: 'relative', flexShrink: 0 }}>
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
          minWidth: 200, maxHeight: 280, overflowY: 'auto',
        }}>
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

export function NotificationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuthStore()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [orderSearch, setOrderSearch] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateDraftFrom, setDateDraftFrom] = useState('')
  const [dateDraftTo, setDateDraftTo] = useState('')

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['notifications-activity'],
    queryFn: ({ pageParam = 1 }) =>
      notificationService.getActivity(pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.events.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  })

  const allEvents: FlatActivityEvent[] = useMemo(
    () => data?.pages.flatMap(p => p.events) ?? [],
    [data],
  )

  const totalCount = data?.pages[0]?.total ?? 0

  // Client-side filter: order search + event type + date range
  const filtered = useMemo(() => {
    return allEvents.filter(e => {
      if (eventTypeFilter && e.type !== eventTypeFilter) return false
      if (orderSearch.trim()) {
        const q = orderSearch.trim().toLowerCase()
        if (!e.order_title.toLowerCase().includes(q) && !String(e.order_number).includes(q)) return false
      }
      if (dateFrom) {
        if (new Date(e.created_at).getTime() < new Date(dateFrom).getTime()) return false
      }
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        if (new Date(e.created_at).getTime() > to.getTime()) return false
      }
      return true
    })
  }, [allEvents, orderSearch, eventTypeFilter, dateFrom, dateTo])

  const hasFilters = !!(orderSearch || eventTypeFilter || dateFrom || dateTo)

  // Infinity scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const { mutate: markAllRead, isPending: markingAll } = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-orders'] })
    },
  })

  const eventTypeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === eventTypeFilter)?.label

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      padding: '24px', background: '#F5F6FA', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to { transform: rotate(360deg) } }
        .activity-row { transition: background 120ms ease; cursor: pointer; }
        .activity-row:hover { background: #F0F1F5 !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ marginTop: '-8px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 2px', letterSpacing: '-0.5px' }}>
            Activity
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
            {isLoading
              ? 'Loading…'
              : `${totalCount} event${totalCount !== 1 ? 's' : ''} total${hasFilters && filtered.length !== allEvents.length ? ` · ${filtered.length} shown` : ''}`
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => refetch()}
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
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
          <button
            onClick={() => markAllRead()}
            disabled={markingAll}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, border: '1.5px solid transparent',
              background: '#6366F1', color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              cursor: markingAll ? 'default' : 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,.15)', opacity: markingAll ? 0.7 : 1,
            }}
            onMouseOver={e => { if (!markingAll) e.currentTarget.style.background = '#4F46E5' }}
            onMouseOut={e => { e.currentTarget.style.background = '#6366F1' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Order search */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#FFFFFF', border: `1.5px solid ${orderSearch ? '#6366F1' : '#E4E6EF'}`,
          borderRadius: 8, padding: '6px 10px', width: 220, transition: 'all 150ms ease',
        }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.10)' }}
          onBlurCapture={e => { if (!orderSearch) { e.currentTarget.style.borderColor = '#E4E6EF'; e.currentTarget.style.boxShadow = 'none' } }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" placeholder="Filter by order…" value={orderSearch}
            onChange={e => setOrderSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13, outline: 'none', width: '100%', color: '#111827' }}
          />
          {orderSearch && (
            <button onClick={() => setOrderSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: '#E4E6EF', flexShrink: 0 }} />

        {/* Event type filter */}
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

        {/* Date range */}
        {(() => {
          const dateLabel = dateFrom && dateTo
            ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
            : dateFrom ? `From ${formatDate(dateFrom)}`
            : dateTo ? `Until ${formatDate(dateTo)}`
            : undefined
          return (
            <FilterPill
              label="Date Range"
              value={dateLabel}
              onClear={() => { setDateFrom(''); setDateTo(''); setDateDraftFrom(''); setDateDraftTo('') }}
            >
              {close => (
                <div style={{ padding: 16, width: 260 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.5px', marginBottom: 12 }}>DATE RANGE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>From</label>
                      <DateInput value={dateDraftFrom} onChange={setDateDraftFrom}
                        style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>To</label>
                      <DateInput value={dateDraftTo} onChange={setDateDraftTo} min={dateDraftFrom || undefined}
                        style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={() => { setDateFrom(dateDraftFrom); setDateTo(dateDraftTo); close() }}
                      disabled={!dateDraftFrom && !dateDraftTo}
                      style={{
                        flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                        background: (dateDraftFrom || dateDraftTo) ? '#6366F1' : '#E4E6EF',
                        color: (dateDraftFrom || dateDraftTo) ? '#FFFFFF' : '#9CA3AF',
                        fontSize: 13, fontWeight: 600, cursor: (dateDraftFrom || dateDraftTo) ? 'pointer' : 'default',
                      }}
                    >Apply</button>
                    <button
                      onClick={() => { setDateDraftFrom(''); setDateDraftTo(''); setDateFrom(''); setDateTo(''); close() }}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E4E6EF', background: '#FFFFFF', fontSize: 13, fontWeight: 500, color: '#6B7280', cursor: 'pointer' }}
                    >Clear</button>
                  </div>
                </div>
              )}
            </FilterPill>
          )
        })()}

        {hasFilters && (
          <button
            onClick={() => { setOrderSearch(''); setEventTypeFilter(''); setDateFrom(''); setDateTo(''); setDateDraftFrom(''); setDateDraftTo('') }}
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
            Clear filters
          </button>
        )}
      </div>

      {/* Event table */}
      <div style={{
        flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid #E4E6EF',
        borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 180px 160px',
          gap: 12, padding: '10px 20px',
          background: '#F0F1F5', borderBottom: '1px solid #E4E6EF',
          fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.5px', color: '#9CA3AF',
        }}>
          <div />
          <div>Event</div>
          <div>Order</div>
          <div>Timestamp</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr 180px 160px',
                  gap: 12, padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center',
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div>
                    <div style={{ height: 13, width: '65%', borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 6 }} />
                    <div style={{ height: 11, width: '25%', borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </div>
                  <div style={{ height: 22, width: 110, borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 13, width: 100, borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
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
                {hasFilters ? 'No matching events' : 'No activity yet'}
              </p>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                {hasFilters ? 'Try adjusting your filters.' : 'Order events will appear here.'}
              </p>
            </div>
          ) : (
            <>
              {filtered.map((e, i) => (
                <div
                  key={e.id}
                  className="activity-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 180px 160px',
                    gap: 12, padding: '13px 20px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                    alignItems: 'center', background: '#FFFFFF',
                  }}
                  onClick={() => navigate(`/orders/${e.order_id}`)}
                >
                  <EventIcon type={e.type} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: EVENT_ICON_COLOR[e.type] ?? '#9CA3AF',
                        background: `${EVENT_ICON_COLOR[e.type] ?? '#9CA3AF'}14`,
                        borderRadius: 4, padding: '1px 6px', flexShrink: 0,
                      }}>
                        {EVENT_TYPE_OPTIONS.find(o => o.value === e.type)?.label ?? e.type}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {eventSummary(e)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#6366F1',
                      background: '#EEF2FF', border: '1px solid #C7D2FE',
                      borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace', flexShrink: 0,
                    }}>
                      #{e.order_number}
                    </span>
                    <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.order_title}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>
                      {formatRelative(e.created_at)}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      {formatDateTime(e.created_at)}
                    </div>
                  </div>
                </div>
              ))}

              <div ref={sentinelRef} style={{ height: 4 }} />

              {isFetchingNextPage && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0', borderTop: '1px solid #F3F4F6' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '2px solid #E4E6EF', borderTopColor: '#6366F1',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                </div>
              )}

              {!hasNextPage && allEvents.length > 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#D1D5DB', borderTop: '1px solid #F3F4F6' }}>
                  All events loaded
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
