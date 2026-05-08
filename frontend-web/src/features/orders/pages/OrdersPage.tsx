import { useState, useRef, useEffect, useCallback } from 'react'
import { formatDate, formatRelative } from '../../../utils/date'
import { DateInput } from '../../../components/system/DateInput'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import { EmptyState } from '../../../components/system/EmptyState'
import { TableSkeleton } from '../../../components/system/Skeleton'
import { orderService, type UserOption } from '../../../services/orderService'
import { useNotifications } from '../../notifications/hooks/useNotifications'

const STATUS_OPTIONS = ['yet_to_start', 'working', 'waiting_for_client', 'making', 'done', 'delivered'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const
const PAGE_LIMIT = 50

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Page number helper ───────────────────────────────────────────────────────

function getPageNums(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const nums: (number | '…')[] = [1]
  if (current > 3) nums.push('…')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) nums.push(i)
  if (current < total - 2) nums.push('…')
  nums.push(total)
  return nums
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
  const m = STATUS_META[status] ?? STATUS_META.yet_to_start
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


// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const isOverdue = d < now, isToday = d.getTime() === now.getTime()
  const formatted = isToday ? 'Today' : formatDate(dateStr)
  return { formatted, isOverdue, isToday }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

const pillListItem = (active: boolean): React.CSSProperties => ({
  padding: '9px 14px', fontSize: 13, cursor: 'pointer',
  background: active ? '#EEF2FF' : 'transparent',
  color: active ? '#4F46E5' : '#374151',
  fontWeight: active ? 600 : 400,
  display: 'flex', alignItems: 'center', gap: 8,
})

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortTh({
  label, field, sortBy, sortDir, onSort, style,
}: {
  label: string; field: string; sortBy: string; sortDir: string
  onSort: (f: string) => void; style?: React.CSSProperties
}) {
  const active = sortBy === field
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.5px',
        color: active ? '#4F46E5' : '#9CA3AF',
        background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap',
        userSelect: 'none', cursor: 'pointer',
        ...style,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, fontSize: 10 }}>
          {active && sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </span>
    </th>
  )
}

// ─── Orders Page ─────────────────────────────────────────────────────────────

export function OrdersPage({ myOrdersOnly = false }: { myOrdersOnly?: boolean }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { unreadByOrder } = useNotifications()

  // ── Read state from URL ──────────────────────────────────────────────────
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit     = PAGE_LIMIT
  const search       = searchParams.get('q') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const priorityFilter = searchParams.get('priority') ?? ''
  const assigneeRaw    = searchParams.get('assignee') ?? ''
  const assigneeIds    = assigneeRaw ? assigneeRaw.split(',').filter(Boolean) : []
  const dueDateFrom    = searchParams.get('due_from') ?? ''
  const dueDateTo      = searchParams.get('due_to') ?? ''
  const overdueOnly    = searchParams.get('overdue') === '1'
  const dueTodayOnly   = searchParams.get('today') === '1'
  const unreadOnly     = searchParams.get('unread') === '1'
  const staleOnly      = searchParams.get('stale') === '1'
  const sortBy         = searchParams.get('sort_by') ?? 'created_at'
  const sortDir        = searchParams.get('sort_dir') ?? 'desc'

  // Due date draft state — synced when URL values change (e.g. after back-nav)
  const [dueDraftFrom, setDueDraftFrom] = useState(dueDateFrom)
  const [dueDraftTo, setDueDraftTo] = useState(dueDateTo)
  useEffect(() => setDueDraftFrom(dueDateFrom), [dueDateFrom])
  useEffect(() => setDueDraftTo(dueDateTo), [dueDateTo])

  // ── URL update helpers ───────────────────────────────────────────────────
  function update(changes: Record<string, string | undefined>) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(changes)) {
        if (v != null && v !== '') next.set(k, v)
        else next.delete(k)
      }
      next.delete('page') // reset to page 1 on any filter/sort change
      return next
    }, { replace: true })
  }

  function gotoPage(p: number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (p <= 1) next.delete('page')
      else next.set('page', String(p))
      return next
    })
  }



  function handleSort(field: string) {
    const newDir = sortBy === field && sortDir === 'desc' ? 'asc' : 'desc'
    update({ sort_by: field, sort_dir: newDir })
  }

  // ── Users for assignee dropdown ──────────────────────────────────────────
  const [users, setUsers] = useState<UserOption[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const loadUsers = useCallback(() => {
    if (usersLoaded) return
    orderService.listUsersForAssignment().then(u => { setUsers(u); setUsersLoaded(true) }).catch(() => {})
  }, [usersLoaded])

  // Eagerly load users when arriving with a pre-set assignee filter (e.g. from User Metrics)
  useEffect(() => { if (assigneeRaw) loadUsers() }, [assigneeRaw, loadUsers])

  const [showModal, setShowModal] = useState(false)
  const [modalKey, setModalKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const d0 = new Date()
  const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`
  const d1 = new Date(d0); d1.setDate(d1.getDate() - 1)
  const yesterday = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    assigned_to: myOrdersOnly && user ? user.id : (assigneeRaw || undefined),
    due_from: overdueOnly ? undefined : dueTodayOnly ? today : (dueDateFrom || undefined),
    due_to: overdueOnly ? yesterday : dueTodayOnly ? today : (dueDateTo || undefined),
    stale: staleOnly ? '1' : undefined,
    page,
    limit,
    sort_by: sortBy,
    sort_dir: sortDir,
  }

  const { data, isLoading } = useOrders(params)
  const allOrders = data?.orders ?? []
  const orders = unreadOnly ? allOrders.filter(o => (unreadByOrder.get(o.id) ?? 0) > 0) : allOrders
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)

  // If the current page no longer exists (e.g. last row on page was deleted), jump back.
  useEffect(() => {
    if (!isLoading && total > 0 && page > totalPages) gotoPage(totalPages)
  }, [isLoading, total, page, totalPages])

  const hasFilters = !!(statusFilter || priorityFilter || assigneeRaw || dueDateFrom || dueDateTo || overdueOnly || dueTodayOnly || unreadOnly || staleOnly)

  function clearAll() {
    setSearchParams(prev => {
      const next = new URLSearchParams()
      // preserve sort
      if (prev.get('sort_by'))  next.set('sort_by',  prev.get('sort_by')!)
      if (prev.get('sort_dir')) next.set('sort_dir', prev.get('sort_dir')!)
      return next
    }, { replace: true })
    setDueDraftFrom('')
    setDueDraftTo('')
  }

  const assigneeLabel = (() => {
    if (!assigneeIds.length) return undefined
    const hasUnassigned = assigneeIds.includes('unassigned')
    const userIds = assigneeIds.filter(id => id !== 'unassigned')
    const parts: string[] = []
    if (hasUnassigned) parts.push('Unassigned')
    const matchedNames = userIds.map(id => users.find(u => u.id === id)?.name).filter(Boolean) as string[]
    parts.push(...matchedNames)
    if (parts.length === 0) return undefined
    if (parts.length <= 2) return parts.join(', ')
    return `${parts[0]}, ${parts[1]} +${parts.length - 2}`
  })()

  const dueDateLabel = dueDateFrom && dueDateTo
    ? `${formatDate(dueDateFrom)} – ${formatDate(dueDateTo)}`
    : dueDateFrom ? `From ${formatDate(dueDateFrom)}`
    : dueDateTo ? `Until ${formatDate(dueDateTo)}`
    : undefined

  // ── Subheader text ────────────────────────────────────────────────────────
  const subheader = isLoading ? 'Loading…'
    : unreadOnly ? `${orders.length} unread on this page`
    : total === 0 ? (myOrdersOnly ? '0 orders assigned to you' : '0 orders')
    : `Showing ${from}–${to} of ${total} ${myOrdersOnly ? 'assigned ' : ''}orders`

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
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{subheader}</p>
        </div>
        {user?.role === 'admin' && (
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
        )}
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
            onChange={e => update({ q: e.target.value || undefined })}
            style={{ border: 'none', background: 'transparent', padding: '0 8px', fontSize: 13, outline: 'none', width: '100%', color: '#111827' }}
          />
          {search && (
            <button onClick={() => update({ q: undefined })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: '#E4E6EF', flexShrink: 0 }} />

        {/* Status */}
        <FilterPill label="Status" value={statusFilter ? STATUS_META[statusFilter]?.label : undefined} onClear={() => update({ status: undefined })}>
          {close => (
            <div style={{ padding: 4 }}>
              {STATUS_OPTIONS.map(s => (
                <div key={s} style={pillListItem(statusFilter === s)} onMouseEnter={e => { if (statusFilter !== s) e.currentTarget.style.background = '#F5F6FA' }} onMouseLeave={e => { if (statusFilter !== s) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { update({ status: s === statusFilter ? undefined : s }); close() }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_META[s].color, flexShrink: 0 }} />
                  {STATUS_META[s].label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Priority */}
        <FilterPill label="Priority" value={priorityFilter ? PRIORITY_META[priorityFilter]?.label : undefined} onClear={() => update({ priority: undefined })}>
          {close => (
            <div style={{ padding: 4 }}>
              {PRIORITY_OPTIONS.map(p => (
                <div key={p} style={pillListItem(priorityFilter === p)} onMouseEnter={e => { if (priorityFilter !== p) e.currentTarget.style.background = '#F5F6FA' }} onMouseLeave={e => { if (priorityFilter !== p) e.currentTarget.style.background = 'transparent' }}
                  onClick={() => { update({ priority: p === priorityFilter ? undefined : p }); close() }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_META[p].color, flexShrink: 0 }} />
                  {PRIORITY_META[p].label}
                </div>
              ))}
            </div>
          )}
        </FilterPill>

        {/* Assignee */}
        {!myOrdersOnly && (
          <FilterPill label="Assignee" value={assigneeLabel} onClear={() => update({ assignee: undefined })}>
            {() => {
              loadUsers()
              const toggle = (id: string) => {
                const next = assigneeIds.includes(id)
                  ? assigneeIds.filter(x => x !== id)
                  : [...assigneeIds, id]
                update({ assignee: next.length ? next.join(',') : undefined })
              }
              return (
                <div style={{ padding: 4, maxHeight: 260, overflowY: 'auto', minWidth: 190 }}>
                  {/* Unassigned row */}
                  <div style={pillListItem(assigneeIds.includes('unassigned'))}
                    onMouseEnter={e => { if (!assigneeIds.includes('unassigned')) e.currentTarget.style.background = '#F5F6FA' }}
                    onMouseLeave={e => { if (!assigneeIds.includes('unassigned')) e.currentTarget.style.background = 'transparent' }}
                    onClick={() => toggle('unassigned')}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F3F4F6', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>—</div>
                    Unassigned
                    {assigneeIds.includes('unassigned') && <svg style={{ marginLeft: 'auto' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  {users.length === 0 ? (
                    <div style={{ padding: '10px 14px', fontSize: 13, color: '#9CA3AF' }}>Loading…</div>
                  ) : users.map(u => {
                    const active = assigneeIds.includes(u.id)
                    return (
                      <div key={u.id} style={pillListItem(active)}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F5F6FA' }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                        onClick={() => toggle(u.id)}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                          {getInitials(u.name)}
                        </div>
                        {u.name}
                        {active && <svg style={{ marginLeft: 'auto' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    )
                  })}
                </div>
              )
            }}
          </FilterPill>
        )}

        {/* Due Date range */}
        <FilterPill label="Due Date" value={dueDateLabel} onClear={() => update({ due_from: undefined, due_to: undefined })}>
          {close => (
            <div style={{ padding: 16, width: 280 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.5px', marginBottom: 12 }}>DELIVERY DATE RANGE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>From</label>
                  <DateInput value={dueDraftFrom} onChange={setDueDraftFrom}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>To</label>
                  <DateInput value={dueDraftTo} onChange={setDueDraftTo} min={dueDraftFrom || undefined}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #E4E6EF', borderRadius: 8, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => { update({ due_from: dueDraftFrom || undefined, due_to: dueDraftTo || undefined }); close() }}
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
                  onClick={() => { setDueDraftFrom(''); setDueDraftTo(''); update({ due_from: undefined, due_to: undefined }); close() }}
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
          onClick={() => update({ overdue: overdueOnly ? undefined : '1', today: undefined })}
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
          onClick={() => update({ today: dueTodayOnly ? undefined : '1', overdue: undefined })}
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

        {/* Stale toggle */}
        <button
          onClick={() => update({ stale: staleOnly ? undefined : '1' })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1.5px solid ${staleOnly ? '#F97316' : '#E4E6EF'}`,
            background: staleOnly ? '#FFF7ED' : '#FFFFFF',
            color: staleOnly ? '#EA580C' : '#374151',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => { if (!staleOnly) e.currentTarget.style.borderColor = '#C7CAD9' }}
          onMouseLeave={e => { if (!staleOnly) e.currentTarget.style.borderColor = '#E4E6EF' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Stale
        </button>

        {/* Unread alerts toggle */}
        <button
          onClick={() => update({ unread: unreadOnly ? undefined : '1' })}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: `1.5px solid ${unreadOnly ? '#6366F1' : '#E4E6EF'}`,
            background: unreadOnly ? '#EEF2FF' : '#FFFFFF',
            color: unreadOnly ? '#4F46E5' : '#374151',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'all 120ms ease',
          }}
          onMouseEnter={e => { if (!unreadOnly) e.currentTarget.style.borderColor = '#C7CAD9' }}
          onMouseLeave={e => { if (!unreadOnly) e.currentTarget.style.borderColor = '#E4E6EF' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            {unreadOnly && <circle cx="18" cy="5" r="3" fill="#6366F1" stroke="none"/>}
          </svg>
          Unread
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
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF', background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap' }}>Order ID</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF', background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap' }}>Customer</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF', background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF', background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap' }}>Assigned</th>
                <SortTh label="Delivery"  field="due_date"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Activity"  field="updated_at"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF', background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap' }}>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton rows={7} cols={6} />
              ) : orders.length === 0 ? (
                <tr style={{ background: '#FFFFFF', cursor: 'default' }}>
                  <td colSpan={7}>
                    <EmptyState
                      title={hasFilters || search ? 'No matching orders' : myOrdersOnly ? 'No orders assigned to you' : 'No orders yet'}
                      description={hasFilters || search ? 'Try adjusting your filters.' : 'Create the first order to get started.'}
                      action={!hasFilters && !search && user?.role === 'admin' ? { label: 'Create Order', onClick: () => { setModalKey(k => k + 1); setShowModal(true) } } : undefined}
                      icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                    />
                  </td>
                </tr>
              ) : orders.map(order => {
                const due = formatDueDate(order.due_date)
                const updatedText = formatRelative(order.updated_at)
                const hoursDiff = Math.round((Date.now() - new Date(order.updated_at).getTime()) / 3_600_000)
                const dateColor = hoursDiff < 5 ? '#111827' : '#6B7280'

                return (
                  <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                    <td><span style={{ fontWeight: 700, fontSize: 13.5, color: '#2563EB' }}>#{order.title}</span></td>
                    <td><span style={{ fontWeight: 600, fontSize: 13.5, color: '#111827' }}>{order.customer_name}</span></td>
                    <td><StatusBadge status={order.status} /></td>
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
                    <td onClick={e => e.stopPropagation()}>
                      {(unreadByOrder.get(order.id) ?? 0) > 0 && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 20, height: 20, borderRadius: 10,
                          background: '#EF4444', color: '#fff',
                          fontSize: 10, fontWeight: 700, padding: '0 5px',
                        }}>
                          {unreadByOrder.get(order.id)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!isLoading && total > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '10px 16px', borderTop: '1px solid #E4E6EF', background: '#FAFAFA',
            flexShrink: 0, gap: 12,
          }}>
            {/* Page controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => gotoPage(page - 1)}
                disabled={page <= 1}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                  border: '1px solid #E4E6EF', background: '#FFFFFF', cursor: page <= 1 ? 'default' : 'pointer',
                  color: page <= 1 ? '#C7CAD9' : '#374151', transition: 'all 100ms ease',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                Prev
              </button>

              {getPageNums(page, totalPages).map((n, i) =>
                n === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: '4px 6px', fontSize: 12, color: '#9CA3AF' }}>…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => gotoPage(n)}
                    style={{
                      width: 30, height: 28, borderRadius: 7, fontSize: 12, fontWeight: n === page ? 700 : 400,
                      border: `1px solid ${n === page ? '#6366F1' : '#E4E6EF'}`,
                      background: n === page ? '#6366F1' : '#FFFFFF',
                      color: n === page ? '#FFFFFF' : '#374151',
                      cursor: n === page ? 'default' : 'pointer',
                      transition: 'all 100ms ease',
                    }}
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => gotoPage(page + 1)}
                disabled={page >= totalPages}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                  border: '1px solid #E4E6EF', background: '#FFFFFF', cursor: page >= totalPages ? 'default' : 'pointer',
                  color: page >= totalPages ? '#C7CAD9' : '#374151', transition: 'all 100ms ease',
                }}
              >
                Next
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        )}
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
