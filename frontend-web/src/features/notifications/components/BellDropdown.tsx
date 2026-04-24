import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import type { DisplayGroup } from '../hooks/useNotifications'
import type { NotificationEvent } from '../../../services/notificationService'
import { formatRelative } from '../../../utils/date'

// ── Event preview text ────────────────────────────────────────────────────────

function eventPreview(e: NotificationEvent): string {
  const p = e.payload ?? {}
  switch (e.type) {
    case 'customer_message':
      return `${p.customer_name ?? 'Customer'}: ${String(p.text ?? '').slice(0, 60)}`
    case 'customer_attachment':
      return `${p.customer_name ?? 'Customer'} uploaded ${p.file_name ?? 'a file'}`
    case 'comment_added':
      return `${e.actor_name}: ${String(p.text ?? '').replace(/^\[reply:[^\]]+\]\n?/, '').slice(0, 60)}`
    case 'attachment_added':
      return `${e.actor_name} uploaded ${p.file_name ?? 'a file'}`
    case 'status_changed':
      return `${e.actor_name} changed status to ${p.to ?? ''}`
    case 'assignees_changed':
      return `${e.actor_name} updated assignees`
    case 'due_date_changed':
      return `${e.actor_name} changed due date`
    case 'staff_portal_reply':
      return `${e.actor_name}: ${String(p.text ?? '').slice(0, 60)}`
    default:
      return `${e.actor_name} updated the order`
  }
}

function priorityDot(priority: string) {
  const color = priority === 'high' ? '#EF4444' : priority === 'medium' ? '#F59E0B' : '#9CA3AF'
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, flexShrink: 0, marginTop: 1,
    }} />
  )
}

// ── Group row ─────────────────────────────────────────────────────────────────

function GroupRow({ group, onOpen }: { group: DisplayGroup; onOpen: () => void }) {
  const topPriority = group.events[0]?.priority ?? 'medium'

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        width: '100%', padding: '12px 16px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F3F4F6',
        opacity: group.isRead ? 0.45 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {!group.isRead && priorityDot(topPriority)}
        <span style={{ fontSize: 12, fontWeight: group.isRead ? 500 : 700, color: group.isRead ? '#6B7280' : '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Order #{group.order_number} · {group.order_title}
        </span>
        {!group.isRead && (
          <span style={{
            fontSize: 10, fontWeight: 700, background: '#6366F1', color: '#fff',
            borderRadius: 10, padding: '1px 7px', flexShrink: 0,
          }}>
            {group.unread_count}
          </span>
        )}
      </div>

      {/* Event lines */}
      {group.events.slice(0, group.unread_count <= 2 ? group.unread_count : 1).map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: group.isRead ? 0 : 15 }}>
          <span style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {eventPreview(e)}
          </span>
          <span style={{ fontSize: 10, color: '#C4C9D4', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatRelative(e.created_at)}
          </span>
        </div>
      ))}
      {!group.isRead && group.unread_count > 2 && (
        <div style={{ paddingLeft: 15, fontSize: 12, color: '#9CA3AF' }}>
          {group.unread_count} new updates
        </div>
      )}
    </button>
  )
}

// ── Bell Dropdown ─────────────────────────────────────────────────────────────

export function BellDropdown() {
  const navigate = useNavigate()
  const { groups, totalCount, isLoading, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function openOrder(group: DisplayGroup) {
    setOpen(false)
    navigate(`/orders/${group.order_id}`)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        className="icon-btn"
        title="Notifications"
        onClick={() => setOpen(o => !o)}
        style={{ width: 42, height: 42, position: 'relative', background: open ? '#F5F3FF' : undefined }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {totalCount > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 6,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#EF4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
          }}>
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 360, background: '#fff',
          border: '1px solid #E5E7EB', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,.12)',
          zIndex: 300, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              Notifications {totalCount > 0 && <span style={{ color: '#6366F1' }}>({totalCount})</span>}
            </span>
            {totalCount > 0 && (
              <button
                onClick={() => { markAllRead(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366F1', fontWeight: 600, padding: 0 }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Groups */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Loading…</div>
            ) : groups.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>You're all caught up</p>
              </div>
            ) : (
              groups.map(g => (
                <GroupRow key={g.order_id} group={g} onOpen={() => openOrder(g)} />
              ))
            )}
          </div>

          {/* Footer */}
          {groups.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #F3F4F6', textAlign: 'center' }}>
              <button
                onClick={() => { setOpen(false); navigate('/notifications') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6366F1', fontWeight: 600, padding: 0 }}
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
