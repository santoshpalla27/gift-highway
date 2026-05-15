import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { useNotifPreference } from '../hooks/useNotifPreference'
import type { DisplayGroup } from '../hooks/useNotifications'
import type { NotificationEvent } from '../../../services/notificationService'
import { formatRelative } from '../../../utils/date'

function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 0.2
    master.connect(ctx.destination)
    const now = ctx.currentTime

    function tone(freq: number, start: number, duration: number) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(1, start + 0.01)
      env.gain.exponentialRampToValueAtTime(0.001, start + duration)
      osc.connect(env)
      env.connect(master)
      osc.start(start)
      osc.stop(start + duration)
    }

    tone(880, now, 0.25)
    tone(1100, now + 0.13, 0.3)
    setTimeout(() => ctx.close(), 700)
  } catch { /* audio not available */ }
}

type Tab = 'mine' | 'others'

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
    case 'user_mentioned':
      return `${e.actor_name} mentioned you: ${String(p.text ?? '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 50)}`
    default:
      return `${e.actor_name} updated the order`
  }
}

function isMessageType(type: string): boolean {
  return type === 'customer_message' || type === 'comment_added' || type === 'staff_portal_reply'
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
  const topType = group.events[0]?.type ?? ''
  const newEventLabel = group.unread_count >= 2
    ? `${group.unread_count} new ${isMessageType(topType) ? 'messages' : 'events'}`
    : null

  return (
    <button
      onClick={onOpen}
      aria-label={`Order #${group.order_title}: ${group.unread_count > 0 ? `${group.unread_count} unread` : 'read'}`}
      className={group.isRead ? 'notif-group-row notif-group-read' : 'notif-group-row'}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        width: '100%', padding: '12px 16px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {!group.isRead && priorityDot(topPriority)}
        <span className="notif-group-title" style={{
          fontSize: 12, fontWeight: group.isRead ? 500 : 700,
          color: group.isRead ? 'var(--text-secondary)' : 'var(--text-primary)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          Order #{group.order_title}
        </span>
        {!group.isRead && (
          <span style={{
            fontSize: 10, fontWeight: 700, background: 'var(--accent)', color: '#fff',
            borderRadius: 10, padding: '1px 7px', flexShrink: 0,
          }}>
            {group.unread_count}
          </span>
        )}
      </div>

      {!group.isRead && newEventLabel ? (
        <div style={{ paddingLeft: 15, fontSize: 12, color: 'var(--text-tertiary)' }}>
          {newEventLabel}
        </div>
      ) : (
        group.events.slice(0, 1).map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: group.isRead ? 0 : 15 }}>
            <span className="notif-group-preview" style={{
              fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {eventPreview(e)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0, whiteSpace: 'nowrap', opacity: 0.7 }}>
              {formatRelative(e.created_at)}
            </span>
          </div>
        ))
      )}
    </button>
  )
}

// ── Bell Dropdown ─────────────────────────────────────────────────────────────

function filterGroupsByTypes(groups: DisplayGroup[], enabledTypes: string[]): DisplayGroup[] {
  const typeSet = new Set(enabledTypes)
  return groups
    .map(g => ({
      ...g,
      events: g.events.filter(e => typeSet.has(e.type)),
    }))
    .filter(g => g.events.length > 0 || g.isRead)
}

export function BellDropdown() {
  const navigate = useNavigate()
  const { scope, getEnabledTypes } = useNotifPreference()
  const [tab, setTab] = useState<Tab>('mine')

  const { groups: myGroupsRaw, isLoading: myLoading, markAllRead: markMyRead } =
    useNotifications({ mineOnly: true })
  const { groups: otherGroupsRaw, isLoading: otherLoading, markAllRead: markOtherRead } =
    useNotifications({ othersOnly: true })

  const myGroups = filterGroupsByTypes(myGroupsRaw, getEnabledTypes('my_orders'))
  const otherGroups = filterGroupsByTypes(otherGroupsRaw, getEnabledTypes('all_orders'))

  const myCount = myGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)
  const otherCount = otherGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)

  const badgeCount = scope === 'all_orders' ? myCount + otherCount : myCount

  const groups = tab === 'mine' ? myGroups : otherGroups
  const isLoading = tab === 'mine' ? myLoading : otherLoading
  const totalCount = tab === 'mine' ? myCount : otherCount
  const markAllRead = tab === 'mine' ? markMyRead : markOtherRead

  const prevBadgeRef = useRef<number | null>(null)
  useEffect(() => {
    if (prevBadgeRef.current === null) {
      prevBadgeRef.current = badgeCount
      return
    }
    if (badgeCount > prevBadgeRef.current) playNotificationSound()
    prevBadgeRef.current = badgeCount
  }, [badgeCount])

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

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function openOrder(group: DisplayGroup) {
    setOpen(false)
    navigate(`/orders/${group.order_id}`)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title="Notifications"
        aria-label={badgeCount > 0 ? `${badgeCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
        style={{ width: 42, height: 42, position: 'relative', background: open ? 'var(--accent-light)' : undefined }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {badgeCount > 0 && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: 6, right: 6,
            minWidth: 16, height: 16, borderRadius: 8,
            background: 'var(--danger)', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
          }}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 360, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 300, overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Notifications {totalCount > 0 && <span style={{ color: 'var(--accent)' }}>({totalCount})</span>}
              </span>
              {totalCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                >
                  Mark all read
                </button>
              )}
            </div>
            {/* Tabs */}
            <div role="tablist" style={{ display: 'flex', gap: 2 }}>
              {(['mine', 'others'] as Tab[]).map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: tab === t ? 'var(--accent)' : 'var(--text-tertiary)',
                    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'color 150ms, border-color 150ms',
                  }}
                >
                  {t === 'mine' ? 'My Orders' : 'Other Orders'}
                </button>
              ))}
            </div>
          </div>

          {/* Groups */}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>
            ) : groups.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }} aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
                  {tab === 'mine' ? "You're all caught up" : 'No activity on other orders'}
                </p>
              </div>
            ) : (
              groups.map(g => (
                <GroupRow key={g.order_id} group={g} onOpen={() => openOrder(g)} />
              ))
            )}
          </div>

          {/* Footer */}
          {groups.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <button
                onClick={() => { setOpen(false); navigate('/notifications') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: 0 }}
              >
                View all activity →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
