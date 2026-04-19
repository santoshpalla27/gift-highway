import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders, useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import { EmptyState } from '../../../components/system/EmptyState'
import { TableSkeleton } from '../../../components/system/Skeleton'
import { orderService, type Order, type UserOption } from '../../../services/orderService'

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'Yet to Start', color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Filter Pill ──────────────────────────────────────────────────────────────

function FilterPill({
  label, value, onClear, children,
}: {
  label: string
  value?: string
  onClear?: () => void
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = !!value

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          border: `1.5px solid ${isActive ? '#6366F1' : '#E4E6EF'}`,
          background: isActive ? '#EEF2FF' : '#FFFFFF',
          color: isActive ? '#4F46E5' : '#374151',
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'all 120ms ease',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = '#C7CAD9' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = '#E4E6EF' }}
      >
        <span>{isActive ? `${label}: ${value}` : label}</span>
        {isActive ? (
          <span
            onClick={e => { e.stopPropagation(); onClear?.(); setOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', marginLeft: 2, opacity: 0.7 }}
            title="Clear"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{ opacity: 0.5 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
          background: '#FFFFFF', border: '1px solid #E4E6EF',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06)',
          minWidth: 160, overflow: 'hidden',
        }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
      borderRadius: 9999, fontSize: 11.5, fontWeight: 600,
      color: m.color, background: m.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {m.label}
    </span>
  )
}

// ─── Status Dropdown (inline table) ──────────────────────────────────────────

function StatusDropdown({ order, onChanged }: { order: Order; onChanged?: (msg: string) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate: updateStatus } = useUpdateOrderStatus()
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPos(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) { setPos(null); return }
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const dropH = 120
    const top = window.innerHeight - rect.bottom < dropH + 8 ? rect.top - dropH - 4 : rect.bottom + 4
    setPos({ top, left: rect.left })
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={handleToggle} style={{ cursor: 'pointer' }}>
        <StatusBadge status={order.status} />
      </div>
      {open && pos && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
          background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.08)', padding: 4, minWidth: 130,
        }}>
          {STATUS_OPTIONS.map(s => (
            <div key={s} onClick={e => {
              e.stopPropagation(); setPos(null)
              if (s !== order.status) updateStatus({ id: order.id, status: s }, { onSuccess: () => onChanged?.(`Status → ${STATUS_META[s].label}`) })
            }} style={{
              padding: '8px 12px', fontSize: 12, fontWeight: order.status === s ? 600 : 500,
              color: order.status === s ? '#111827' : '#6B7280',
              background: order.status === s ? '#F5F6FA' : 'transparent',
              borderRadius: 6, cursor: 'pointer',
            }}>
              {STATUS_META[s]?.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const isOverdue = d < now, isToday = d.getTime() === now.getTime()
  const formatted = isToday ? 'Today' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  return { formatted, isOverdue, isToday }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Pill dropdown contents ───────────────────────────────────────────────────

const pillListItem = (active: boolean): React.CSSProperties => ({
  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
  background: active ? '#EEF2FF' : 'transparent',
  color: active ? '#4F46E5' : '#374151',
  fontWeight: active ? 600 : 400,
  display: 'flex', alignItems: 'center', gap: 8,
})

// ─── Orders Page ─────────────────────────────────────────────────────────────

export function OrdersPage({ myOrdersOnly = false }: { myOrdersOnly?: boolean }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  // ── Filter state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [assigneeName, setAssigneeName] = useState('')
  const [dueDateFrom, setDueDateFrom] = useState('')
  const [dueDateTo, setDueDateTo] = useState('')
  const [dueDraftFrom, setDueDraftFrom] = useState('')
  const [dueDraftTo, setDueDraftTo] = useState('')

  const [overdueOnly, setOverdueOnly] = useState(false)
  const [dueTodayOnly, setDueTodayOnly] = useState(false)

  // ── Users for assignee dropdown ──────────────────────────────────────────
  const [users, setUsers] = useState<UserOption[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const loadUsers = useCallback(() => {
    if (usersLoaded) return
    orderService.listUsersForAssignment().then(u => { setUsers(u); setUsersLoaded(true) }).catch(() => {})
  }, [usersLoaded])

  const [showModal, setShowModal] = useState(false)
  const [modalKey, setModalKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const today = new Date().toISOString().split('T')[0]

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    assigned_to: myOrdersOnly && user ? user.id : (assigneeFilter || undefined),
    due_from: overdueOnly ? undefined : dueTodayOnly ? today : (dueDateFrom || undefined),
    due_to: overdueOnly ? today : dueTodayOnly ? today : (dueDateTo || undefined),
  }

  const { data, isLoading } = useOrders(params)
  const orders = (data?.orders ?? []).filter(o => {
    if (overdueOnly) {
      const d = o.due_date ? new Date(o.due_date) : null
      return d && d < new Date(today) && o.status !== 'completed'
    }
    return true
  })
  const total = data?.total ?? 0

  const hasFilters = !!(statusFilter || priorityFilter || assigneeFilter || dueDateFrom || dueDateTo || overdueOnly || dueTodayOnly)
  const clearAll = () => {
    setStatusFilter(''); setPriorityFilter(''); setAssigneeFilter(''); setAssigneeName('')
    setDueDateFrom(''); setDueDateTo(''); setDueDraftFrom(''); setDueDraftTo('')
    setOverdueOnly(false); setDueTodayOnly(false)
  }

  const dueDateLabel = dueDateFrom && dueDateTo
    ? `${fmtDate(dueDateFrom)} – ${fmtDate(dueDateTo)}`
    : dueDateFrom ? `From ${fmtDate(dueDateFrom)}`
    : dueDateTo ? `Until ${fmtDate(dueDateTo)}`
    : undefined

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '24px', background: '#F5F6FA', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        .orders-table { width: 100%; border-collapse: collapse; }
        .orders-table th {
          padding: 10px 16px; text-align: left; font-size: 11.5px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .5px; color: #9CA3AF;
          background: #F0F1F5; border-bottom: 1px solid #E4E6EF; white-space: nowrap; user-select: none;
        }
        .orders-table td { padding: 11px 16px; font-size: 13px; color: #111827; vertical-align: middle; }
        .orders-table tr {
          border-bottom: 1px solid #E4E6EF;
          transition: background 200ms cubic-bezier(.4,0,.2,1);
          cursor: pointer; background: #FFFFFF;
        }
        .orders-table tr:hover { background: #F0F1F5; }
        .orders-table tr:last-child { border-bottom: none; }
        @keyframes slideInToast { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
      `}</style>

      {/* Page Header */}
      <div style={{ padding: '0 0 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ marginTop: '-8px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 2px 0', letterSpacing: '-0.5px' }}>
            {myOrdersOnly ? 'My Orders' : 'All Orders'}
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
            {myOrdersOnly ? `${total} orders assigned to you` : `${total} total orders`}
          </p>
        </div>
        <button
          onClick={() => { setModalKey(k => k + 1); setShowModal(true) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 10, border: '1.5px solid transparent',
            background: '#6366F1', color: '#FFFFFF', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,.15)', whiteSpace: 'nowrap',
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#4F46E5' }}
          onMouseOut={e => { e.currentTarget.style.background = '#6366F1' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Order
        </button>
      </div>

      {/* ── Filter Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', background: '#FFFFFF',
          border: `1.5px solid ${search ? '#6366F1' : '#E4E6EF'}`,
          borderRadius: 8, padding: '6px 10px', width: 220,
          boxShadow: search ? '0 0 0 3px rgba(99,102,241,.10)' : 'none',
          transition: 'all 150ms ease', cursor: 'text',
        }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.10)'; e.currentTarget.style.width = '280px' }}
          onBlurCapture={e => { if (!search) { e.currentTarget.style.borderColor = '#E4E6EF'; e.currentTarget.style.boxShadow = 'none' } e.currentTarget.style.width = '220px' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" placeholder="Search orders…" value={search}
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

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: '#E4E6EF', flexShrink: 0 }} />

        {/* Status */}
        <FilterPill label="Status" value={statusFilter ? STATUS_META[statusFilter]?.label : undefined} onClear={() => setStatusFilter('')}>
          {close => (
            <div style={{ padding: 4 }}>
              {STATUS_OPTIONS.map(s => (
                <div key={s} style={pillListItem(statusFilter === s)} onMouseEnter={e => { if (statusFilter !== s) e.currentTarget.style.background = '#F5F6FA' }} onMouseLeave={e => { if (statusFilter !== s) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { setStatusFilter(s === statusFilter ? '' : s); close() }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_META[s].color, flexShrink: 0 }} />
                  {STATUS_META[s].label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Priority */}
        <FilterPill label="Priority" value={priorityFilter ? PRIORITY_META[priorityFilter]?.label : undefined} onClear={() => setPriorityFilter('')}>
          {close => (
            <div style={{ padding: 4 }}>
              {PRIORITY_OPTIONS.map(p => (
                <div key={p} style={pillListItem(priorityFilter === p)} onMouseEnter={e => { if (priorityFilter !== p) e.currentTarget.style.background = '#F5F6FA' }} onMouseLeave={e => { if (priorityFilter !== p) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { setPriorityFilter(p === priorityFilter ? '' : p); close() }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[p].color, flexShrink: 0 }} />
                  {PRIORITY_META[p].label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Assignee */}
        {!myOrdersOnly && (
          <FilterPill label="Assignee" value={assigneeName || undefined} onClear={() => { setAssigneeFilter(''); setAssigneeName('') }}>
            {close => {
              loadUsers()
              return (
                <div style={{ padding: 4, maxHeight: 220, overflowY: 'auto', minWidth: 180 }}>
                  {users.length === 0 ? (
                    <div style={{ padding: '10px 14px', fontSize: 13, color: '#9CA3AF' }}>Loading…</div>
                  ) : users.map(u => (
                    <div key={u.id} style={pillListItem(assigneeFilter === u.id)}
                      onMouseEnter={e => { if (assigneeFilter !== u.id) e.currentTarget.style.background = '#F5F6FA' }}
                      onMouseLeave={e => { if (assigneeFilter !== u.id) e.currentTarget.style.background = 'transparent' }}
                      onClick={() => {
                        if (assigneeFilter === u.id) { setAssigneeFilter(''); setAssigneeName('') }
                        else { setAssigneeFilter(u.id); setAssigneeName(u.name) }
                        close()
                      }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                        {getInitials(u.name)}
                      </div>
                      {u.name}
                    </div>
                  ))}
                </div>
              )
            }}
          </FilterPill>
        )}

        {/* Due Date range */}
        <FilterPill label="Due Date" value={dueDateLabel} onClear={() => { setDueDateFrom(''); setDueDateTo(''); setDueDraftFrom(''); setDueDraftTo('') }}>
          {close => (
            <div style={{ padding: 16, width: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.5px', marginBottom: 12 }}>DELIVERY DATE RANGE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>From</label>
                  <input type="date" value={dueDraftFrom} onChange={e => setDueDraftFrom(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                    onBlur={e => e.currentTarget.style.borderColor = '#E4E6EF'}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>To</label>
                  <input type="date" value={dueDraftTo} onChange={e => setDueDraftTo(e.target.value)}
                    min={dueDraftFrom || undefined}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                    onBlur={e => e.currentTarget.style.borderColor = '#E4E6EF'}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { setDueDateFrom(dueDraftFrom); setDueDateTo(dueDraftTo); close() }}
                  disabled={!dueDraftFrom && !dueDraftTo}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                    background: (dueDraftFrom || dueDraftTo) ? '#6366F1' : '#E4E6EF',
                    color: (dueDraftFrom || dueDraftTo) ? '#FFFFFF' : '#9CA3AF',
                    fontSize: 13, fontWeight: 600, cursor: (dueDraftFrom || dueDraftTo) ? 'pointer' : 'default',
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => { setDueDraftFrom(''); setDueDraftTo(''); setDueDateFrom(''); setDueDateTo(''); close() }}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E4E6EF', background: '#FFFFFF', fontSize: 13, fontWeight: 500, color: '#6B7280', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </FilterPill>

        {/* Overdue only toggle */}
        <button
          onClick={() => { setOverdueOnly(o => !o); setDueTodayOnly(false) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1.5px solid ${overdueOnly ? '#EF4444' : '#E4E6EF'}`,
            background: overdueOnly ? '#FEF2F2' : '#FFFFFF',
            color: overdueOnly ? '#EF4444' : '#374151',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => { if (!overdueOnly) e.currentTarget.style.borderColor = '#C7CAD9' }}
          onMouseLeave={e => { if (!overdueOnly) e.currentTarget.style.borderColor = '#E4E6EF' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Overdue
        </button>

        {/* Due today toggle */}
        <button
          onClick={() => { setDueTodayOnly(o => !o); setOverdueOnly(false) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1.5px solid ${dueTodayOnly ? '#F59E0B' : '#E4E6EF'}`,
            background: dueTodayOnly ? '#FFFBEB' : '#FFFFFF',
            color: dueTodayOnly ? '#D97706' : '#374151',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => { if (!dueTodayOnly) e.currentTarget.style.borderColor = '#C7CAD9' }}
          onMouseLeave={e => { if (!dueTodayOnly) e.currentTarget.style.borderColor = '#E4E6EF' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Today
        </button>

        {/* Clear all */}
        {hasFilters && (
          <button onClick={clearAll} style={{
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
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table className="orders-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Order ID</th>
                <th>Customer</th>
                <th>Title</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Delivery</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={7} cols={7} />
              ) : orders.length === 0 ? (
                <tr style={{ background: '#FFFFFF', cursor: 'default' }}>
                  <td colSpan={7}>
                    <EmptyState
                      title={hasFilters || search ? 'No matching orders' : myOrdersOnly ? 'No orders assigned to you' : 'No orders yet'}
                      description={hasFilters || search ? 'Try adjusting your filters.' : 'Create the first order to get started.'}
                      action={!hasFilters && !search ? { label: 'Create Order', onClick: () => { setModalKey(k => k + 1); setShowModal(true) } } : undefined}
                      icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                    />
                  </td>
                </tr>
              ) : orders.map(order => {
                const due = formatDueDate(order.due_date)
                const updateDate = new Date(order.updated_at)
                const hoursDiff = Math.round((Date.now() - updateDate.getTime()) / 3_600_000)
                const updatedText = hoursDiff < 24 ? (hoursDiff === 0 ? 'Just now' : `${hoursDiff}h ago`) : updateDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const dateColor = hoursDiff < 5 ? '#111827' : '#6B7280'

                return (
                  <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                    <td>
                      <span style={{ fontWeight: 700, color: '#6366F1', fontSize: 12.5, fontFamily: '"JetBrains Mono","Fira Code",monospace' }}>
                        #{order.order_number}
                      </span>
                    </td>
                    <td><span style={{ fontWeight: 600, fontSize: 13.5, color: '#111827' }}>{order.customer_name}</span></td>
                    <td><span style={{ fontSize: 13.5, color: '#374151' }}>{order.title}</span></td>
                    <td><StatusDropdown order={order} onChanged={msg => setToast(msg)} /></td>
                    <td>
                      {order.assigned_names?.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ display: 'flex' }}>
                            {order.assigned_names.slice(0, 3).map((name, i) => (
                              <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, marginLeft: i > 0 ? -6 : 0, border: '2px solid #FFFFFF', boxSizing: 'content-box' }}>
                                {getInitials(name)}
                              </div>
                            ))}
                          </div>
                          <span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>
                            {order.assigned_names[0].split(' ')[0]}
                            {order.assigned_names.length > 1 && ` +${order.assigned_names.length - 1}`}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, color: '#9CA3AF' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      {due ? (
                        <span style={{ fontWeight: (due.isOverdue || due.isToday) ? 600 : 500, color: due.isOverdue ? '#EF4444' : due.isToday ? '#F59E0B' : '#111827' }}>
                          {due.formatted}{due.isOverdue && ' (Overdue)'}
                        </span>
                      ) : <span style={{ color: '#9CA3AF' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12.5, color: dateColor, fontWeight: dateColor === '#111827' ? 500 : 400 }}>
                      {updatedText}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <OrderModal key={modalKey} onClose={() => setShowModal(false)} onSuccess={msg => setToast(msg)} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          background: '#111827', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: 10, fontSize: 14, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,.12)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideInToast 200ms cubic-bezier(.4,0,.2,1)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  )
}
