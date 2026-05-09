import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../../services/apiClient'
import { formatRelative } from '../../../utils/date'

interface ActivityEvent {
  id: string
  order_id: string
  order_number: number
  order_title: string
  type: string
  actor_name: string
  payload: Record<string, any>
  created_at: string
}

interface ActivityResponse {
  events: ActivityEvent[]
  total: number
  page: number
  limit: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  yet_to_start: 'Yet to Start', working: 'Working',
  waiting_for_client: 'Waiting for Client', making: 'Making',
  done: 'Done', delivered: 'Delivered', cancelled: 'Cancelled',
}

function describeEvent(type: string, payload: Record<string, any>): string {
  switch (type) {
    case 'order_created':         return 'Created the order'
    case 'status_changed':        return `Status changed${payload.from ? ` from ${STATUS_LABEL[payload.from] ?? payload.from}` : ''} → ${STATUS_LABEL[payload.to] ?? payload.to}`
    case 'assignees_changed':     return 'Updated assignees'
    case 'due_date_changed':      return `Due date changed to ${payload.to ?? 'none'}`
    case 'priority_changed':      return `Priority changed to ${payload.to}`
    case 'order_updated':         return 'Updated order details'
    case 'attachment_added':      return `Added attachment${payload.name ? `: ${payload.name}` : ''}`
    case 'attachment_deleted':    return `Removed attachment${payload.name ? `: ${payload.name}` : ''}`
    case 'comment_added': {
      const text = payload.text ?? ''
      return `Commented: "${text.length > 80 ? text.slice(0, 80) + '…' : text}"`
    }
    case 'customer_message':      return 'Customer sent a message'
    case 'customer_attachment':   return 'Customer uploaded an attachment'
    case 'staff_portal_reply':    return 'Replied via customer portal'
    case 'portal_message_deleted':return 'Deleted a portal message'
    case 'user_mentioned':        return `Mentioned ${payload.mentioned_name ?? 'a user'}`
    default:                      return type.replace(/_/g, ' ')
  }
}

const EVENT_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  order_created:          { color: '#6366F1', bg: '#EEF2FF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
  status_changed:         { color: '#3B82F6', bg: '#EFF6FF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
  assignees_changed:      { color: '#8B5CF6', bg: '#F3E8FF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  due_date_changed:       { color: '#F59E0B', bg: '#FFFBEB', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  priority_changed:       { color: '#F97316', bg: '#FFF7ED', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> },
  order_updated:          { color: '#6B7280', bg: '#F3F4F6', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
  attachment_added:       { color: '#10B981', bg: '#ECFDF5', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> },
  attachment_deleted:     { color: '#EF4444', bg: '#FEF2F2', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> },
  comment_added:          { color: '#06B6D4', bg: '#ECFEFF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  customer_message:       { color: '#F59E0B', bg: '#FFFBEB', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> },
  customer_attachment:    { color: '#F59E0B', bg: '#FFFBEB', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
  staff_portal_reply:     { color: '#3B82F6', bg: '#EFF6FF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
  portal_message_deleted: { color: '#EF4444', bg: '#FEF2F2', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg> },
  user_mentioned:         { color: '#8B5CF6', bg: '#F3E8FF', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg> },
}

const DEFAULT_STYLE = { color: '#6B7280', bg: '#F3F4F6', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg> }

const formatTimestamp = formatRelative

const LIMIT = 50

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ActivityLogPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [orderInput, setOrderInput] = useState('')
  const [appliedOrder, setAppliedOrder] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const fetch = useCallback(async (pg: number, orderId: string, append: boolean) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    setError(false)
    try {
      const params: Record<string, string> = { page: String(pg), limit: String(LIMIT) }
      if (orderId) params.title = orderId
      const res = await apiClient.get<ActivityResponse>('/admin/activity', { params })
      const data = res.data
      setEvents(prev => append ? [...prev, ...data.events] : data.events)
      setTotal(data.total)
      setPage(pg)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { fetch(1, '', false) }, [fetch])

  const applyFilter = () => {
    const id = orderInput.trim()
    setAppliedOrder(id)
    setEvents([])
    fetch(1, id, false)
  }

  const clearFilter = () => {
    setOrderInput('')
    setAppliedOrder('')
    setEvents([])
    fetch(1, '', false)
    inputRef.current?.focus()
  }

  const hasMore = events.length < total

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>Activity Log</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6B7280' }}>
            Complete log of every action across all orders
          </p>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by Order ID…"
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilter()}
              style={{ padding: '7px 12px', border: 'none', outline: 'none', fontSize: 13.5, color: '#111827', width: 260 }}
            />
            {orderInput && (
              <button onClick={clearFilter} style={{ padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, lineHeight: 1 }}>×</button>
            )}
          </div>
          <button
            onClick={applyFilter}
            style={{ padding: '7px 16px', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Filter
          </button>
          {appliedOrder && (
            <span style={{ fontSize: 13, color: '#6B7280' }}>
              Order ID: <strong style={{ color: '#4338CA' }}>{appliedOrder}</strong> · <button onClick={clearFilter} style={{ background: 'none', border: 'none', color: '#6366F1', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Clear</button>
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#9CA3AF' }}>
            {total.toLocaleString()} events total
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#EF4444', marginBottom: 12 }}>Failed to load activity log.</p>
            <button onClick={() => fetch(1, appliedOrder, false)} style={{ padding: '6px 16px', border: '1.5px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>No activity found.</div>
        ) : (
          <>
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              {events.map((ev, i) => {
                const style = EVENT_STYLE[ev.type] ?? DEFAULT_STYLE
                return (
                  <div
                    key={ev.id}
                    onClick={() => navigate(`/orders/${ev.order_id}`)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
                      borderBottom: i < events.length - 1 ? '1px solid #F3F4F6' : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: style.bg, color: style.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {style.icon}
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{ev.actor_name}</span>
                        <span style={{ fontSize: 13, color: '#6B7280' }}>{describeEvent(ev.type, ev.payload)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6366F1' }}>
                          #{ev.order_title}
                        </span>
                      </div>
                    </div>

                    {/* Timestamp */}
                    <span style={{ fontSize: 11.5, color: '#9CA3AF', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {formatTimestamp(ev.created_at)}
                    </span>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  onClick={() => fetch(page + 1, appliedOrder, true)}
                  disabled={loadingMore}
                  style={{
                    padding: '8px 24px', border: '1.5px solid #E5E7EB', borderRadius: 8,
                    background: '#fff', cursor: loadingMore ? 'default' : 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#374151',
                    opacity: loadingMore ? 0.6 : 1,
                  }}
                >
                  {loadingMore ? 'Loading…' : `Load more (${total - events.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
