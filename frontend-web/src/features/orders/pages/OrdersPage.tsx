import { useState, useRef, useEffect } from 'react'
import { useOrders, useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import type { Order } from '../../../services/orderService'

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

// Match exact order-app colors
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

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px',
      borderRadius: '9999px', fontSize: '11.5px', fontWeight: 600,
      color: m.color, background: m.bg, whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px',
      borderRadius: '9999px', fontSize: '11.5px', fontWeight: 600,
      color: m.color, background: m.bg, whiteSpace: 'nowrap'
    }}>{m.label}</span>
  )
}

function StatusDropdown({ order, onChanged }: { order: Order; onChanged?: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { mutate: updateStatus } = useUpdateOrderStatus()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ cursor: 'pointer' }}>
        <StatusBadge status={order.status} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px',
          background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)',
          padding: '4px', minWidth: '130px',
        }}>
          {STATUS_OPTIONS.map(s => (
            <div
              key={s}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                if (s !== order.status) {
                  updateStatus(
                    { id: order.id, status: s },
                    { onSuccess: () => onChanged?.(`Status → ${STATUS_META[s].label}`) }
                  )
                }
              }}
              style={{
                padding: '8px 12px', fontSize: '12px', fontWeight: order.status === s ? 600 : 500,
                color: order.status === s ? '#111827' : '#6B7280',
                background: order.status === s ? '#F5F6FA' : 'transparent',
                borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s ease'
              }}
            >
              {STATUS_META[s]?.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const isOverdue = d < now
  const formatted = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  return { formatted, isOverdue }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export function OrdersPage({ myOrdersOnly = false }: { myOrdersOnly?: boolean }) {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [modalKey, setModalKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    assigned_to: myOrdersOnly && user ? user.id : undefined,
  }

  const { data, isLoading } = useOrders(params)
  const orders = data?.orders ?? []
  const total = data?.total ?? 0

  const handleOpenCreate = () => { setEditOrder(null); setModalKey(k => k + 1); setShowModal(true) }
  const handleEdit = (order: Order) => { setEditOrder(order); setModalKey(k => k + 1); setShowModal(true) }

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', padding: '24px', background: '#F5F6FA', boxSizing: 'border-box' }}>
      <style>{`
        .orders-table { width: 100%; border-collapse: collapse; }
        .orders-table th {
          padding: 10px 16px;
          text-align: left;
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .5px;
          color: #9CA3AF;
          background: #F0F1F5;
          border-bottom: 1px solid #E4E6EF;
          white-space: nowrap;
          user-select: none;
        }
        .orders-table td {
          padding: 11px 16px;
          font-size: 13px;
          color: #111827;
          vertical-align: middle;
        }
        .orders-table tr {
          border-bottom: 1px solid #E4E6EF;
          transition: background 200ms cubic-bezier(.4,0,.2,1);
          cursor: pointer;
          background: #FFFFFF;
        }
        .orders-table tr:hover { background: #F0F1F5; }
        .orders-table tr:last-child { border-bottom: none; }
        
        .toolbar-item {
          padding: 6px 10px; border: 1.5px solid #E4E6EF; border-radius: 10px;
          font-size: 13px; color: #111827; background: #FFFFFF; cursor: pointer;
          outline: none; transition: border-color 150ms cubic-bezier(.4,0,.2,1);
          font-family: inherit;
        }
        .toolbar-item:hover, .toolbar-item:focus { border-color: #6366F1; }
        
        @keyframes slideInToast { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Page Header (Order-App styling) */}
      <div style={{ padding: '0 0 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ marginTop: '-8px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0', letterSpacing: '-0.5px' }}>
            {myOrdersOnly ? 'My Orders' : 'All Orders'}
          </h1>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            {myOrdersOnly ? `${total} orders assigned to you` : `${total} total orders`}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleOpenCreate}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '10px', border: '1.5px solid transparent',
              background: '#6366F1', color: '#FFFFFF', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 150ms cubic-bezier(.4,0,.2,1)', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.15)',
              whiteSpace: 'nowrap'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#4F46E5'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.15)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#6366F1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Order
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '0 0 16px 0', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: '#FFFFFF',
          border: '1.5px solid #E4E6EF', borderRadius: '10px', padding: '6px 12px',
          width: '220px', transition: 'all 150ms cubic-bezier(.4,0,.2,1)', cursor: 'text'
        }}
        onFocusCapture={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.15)'; e.currentTarget.style.width = '320px'; }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = '#E4E6EF'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.width = '220px'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '2px 8px', fontSize: '13px', outline: 'none', width: '100%', color: '#111827' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <select className="toolbar-item" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Any Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        <select className="toolbar-item" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">Any Priority</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
      </div>

      {/* Table Container */}
      <div style={{ margin: '0 0 24px 0', background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}>
        <table className="orders-table">
          <thead>
            <tr>
              <th style={{ width: '90px' }}>Order ID</th>
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
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr style={{ background: '#FFFFFF', cursor: 'default' }}>
                <td colSpan={7} style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>No orders found</div>
                  <div style={{ fontSize: '13px', color: '#6B7280' }}>Try adjusting your search or filters.</div>
                </td>
              </tr>
            ) : orders.map(order => {
              const due = formatDueDate(order.due_date)
              
              // Compute relative update time
              const updateDate = new Date(order.updated_at)
              const now = new Date()
              const hoursDiff = Math.round((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60))
              const isRecent = hoursDiff < 24
              const updatedText = isRecent ? (hoursDiff === 0 ? 'Just now' : `${hoursDiff} hr ago`) : updateDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const dateColor = isRecent && hoursDiff < 5 ? '#111827' : '#6B7280'

              return (
                <tr key={order.id} onClick={() => handleEdit(order)}>
                  <td>
                    <span style={{ fontWeight: 700, color: '#6366F1', fontSize: '12.5px', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                      #{order.order_number}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#111827' }}>
                      {order.customer_name}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 400, fontSize: '13.5px', color: '#374151' }}>{order.title}</span>
                  </td>
                  <td>
                    <StatusDropdown order={order} onChanged={msg => setToast(msg)} />
                  </td>
                  <td>
                    {order.assigned_name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700 }}>
                          {getInitials(order.assigned_name)}
                        </div>
                        <span style={{ fontSize: '13px', color: '#111827', fontWeight: 500 }}>{order.assigned_name.split(' ')[0]}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    {due ? (
                      <span style={{ fontWeight: due.isOverdue ? 600 : 500, color: due.isOverdue ? '#EF4444' : '#111827' }}>
                        {due.formatted} {due.isOverdue && '(Overdue)'}
                      </span>
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '12.5px', color: dateColor, fontWeight: dateColor === '#111827' ? 500 : 400 }}>
                    {updatedText}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <OrderModal
          key={modalKey}
          order={editOrder}
          onClose={() => setShowModal(false)}
          onSuccess={msg => setToast(msg)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 1000,
          background: '#111827', color: '#FFFFFF', padding: '12px 20px',
          borderRadius: '10px', fontSize: '14px', fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)',
          display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'slideInToast 200ms cubic-bezier(.4,0,.2,1)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  )
}
