import { useState, useRef, useEffect } from 'react'
import { useOrders, useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import type { Order } from '../../../services/orderService'

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new:         { label: 'New',         color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  completed:   { label: 'Completed',   color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#2563EB', bg: '#EFF6FF' },
  high:   { label: 'High',   color: '#D97706', bg: '#FFFBEB' },
  urgent: { label: 'Urgent', color: '#DC2626', bg: '#FEF2F2' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>{m.label}</span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 600,
      color: m.color, background: m.bg,
    }}>{m.label}</span>
  )
}

function StatusDropdown({ order }: { order: Order }) {
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
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <StatusBadge status={order.status} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '4px', minWidth: '150px',
        }}>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { updateStatus({ id: order.id, status: s }); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', textAlign: 'left', padding: '7px 10px',
                background: order.status === s ? '#F3F4F6' : 'transparent',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                fontWeight: order.status === s ? 600 : 500, color: '#374151',
              }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: STATUS_META[s]?.color, flexShrink: 0,
              }} />
              {STATUS_META[s]?.label}
            </button>
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
  const formatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return { formatted, isOverdue }
}

export function OrdersPage({ myOrdersOnly = false }: { myOrdersOnly?: boolean }) {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    assigned_to: myOrdersOnly && user ? user.id : undefined,
  }

  const { data, isLoading } = useOrders(params)
  const orders = data?.orders ?? []
  const total = data?.total ?? 0

  const handleOpenCreate = () => { setEditOrder(null); setShowModal(true) }
  const handleEdit = (order: Order) => { setEditOrder(order); setShowModal(true) }

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F9FAFB' }}>
      <style>{`
        .orders-table { width: 100%; border-collapse: collapse; }
        .orders-table th {
          text-align: left; padding: 12px 16px;
          font-size: 11px; font-weight: 700; color: #6B7280;
          text-transform: uppercase; letter-spacing: 0.05em;
          border-bottom: 1px solid #F3F4F6; background: #FAFAFA;
        }
        .orders-table td {
          padding: 14px 16px; font-size: 13px; color: #374151;
          border-bottom: 1px solid #F3F4F6; vertical-align: middle;
        }
        .orders-table tr:last-child td { border-bottom: none; }
        .orders-table tr:hover td { background: #F9FAFB; }
        .filter-select {
          padding: 8px 12px; border: 1px solid #E5E7EB; border-radius: 8px;
          font-size: 13px; color: #374151; background: #fff; cursor: pointer;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .skeleton { background: #E5E7EB; border-radius: 4px; animation: pulse 2s infinite; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '32px 40px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
            {myOrdersOnly ? 'My Orders' : 'All Orders'}
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0 0' }}>
            {myOrdersOnly ? 'Orders assigned to you' : 'Track and manage all work orders'}
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '8px', border: 'none',
            background: '#4F46E5', color: '#fff', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 2px 4px rgba(99,102,241,0.3)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Order
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '16px 40px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: '#fff',
          border: '1px solid #E5E7EB', borderRadius: '8px', padding: '0 12px',
          width: '280px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search orders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '9px 8px', fontSize: '14px', outline: 'none', width: '100%', color: '#111827' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        <select className="filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '8px 12px' }}>
          {total} order{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div style={{ margin: '0 40px 40px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'visible' }}>
        <table className="orders-table">
          <thead>
            <tr>
              <th style={{ width: '72px' }}>Order #</th>
              <th>Title / Customer</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned</th>
              <th>Due Date</th>
              <th>Updated</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  {[72, 200, 100, 90, 120, 90, 90, 60].map((w, j) => (
                    <td key={j}><span className="skeleton" style={{ display: 'block', height: '16px', width: w }} /></td>
                  ))}
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '72px 20px', gap: '8px' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>No orders found</div>
                    <div style={{ fontSize: '13px', color: '#6B7280' }}>
                      {search || statusFilter || priorityFilter ? 'Try adjusting your filters.' : 'Create your first order to get started.'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : orders.map(order => {
              const due = formatDueDate(order.due_date)
              const updatedAt = new Date(order.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              return (
                <tr key={order.id}>
                  <td>
                    <span style={{ fontWeight: 700, color: '#4F46E5', fontSize: '13px' }}>#{order.order_number}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>{order.title}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{order.customer_name}</div>
                  </td>
                  <td><StatusDropdown order={order} /></td>
                  <td><PriorityBadge priority={order.priority} /></td>
                  <td>
                    {order.assigned_name
                      ? <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{order.assigned_name}</span>
                      : <span style={{ fontSize: '12px', color: '#9CA3AF' }}>—</span>
                    }
                  </td>
                  <td>
                    {due
                      ? <span style={{ fontSize: '13px', fontWeight: 500, color: due.isOverdue ? '#DC2626' : '#374151' }}>
                          {due.isOverdue && '⚠ '}{due.formatted}
                        </span>
                      : <span style={{ fontSize: '12px', color: '#9CA3AF' }}>—</span>
                    }
                  </td>
                  <td><span style={{ fontSize: '13px', color: '#9CA3AF' }}>{updatedAt}</span></td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleEdit(order)}
                        style={{
                          background: 'transparent', border: 'none', padding: '6px 8px',
                          borderRadius: '6px', color: '#9CA3AF', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '5px',
                          fontSize: '12px', fontWeight: 500,
                        }}
                        title="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <OrderModal order={editOrder} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
