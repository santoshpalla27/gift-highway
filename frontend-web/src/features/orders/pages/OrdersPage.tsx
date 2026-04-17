import { useState, useRef, useEffect } from 'react'
import { useOrders, useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import type { Order } from '../../../services/orderService'

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new:         { label: 'New',         color: '#334155', bg: '#F8FAFC', border: '#E2E8F0' },
  in_progress: { label: 'In Progress', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  completed:   { label: 'Completed',   color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#475569', bg: '#F1F5F9' },
  medium: { label: 'Medium', color: '#92400E', bg: '#FEF3C7' },
  high:   { label: 'High',   color: '#86198F', bg: '#FAE8FF' },
  urgent: { label: 'Urgent', color: '#991B1B', bg: '#FEE2E2' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.new
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 8px',
      borderRadius: '6px', fontSize: '13px', fontWeight: 500,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, marginRight: 6 }} />
      {m.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
      borderRadius: '6px', fontSize: '12px', fontWeight: 600,
      color: m.color, background: m.bg,
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
      <button
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, outline: 'none' }}
      >
        <StatusBadge status={order.status} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 10,
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
          padding: '6px', minWidth: '160px',
        }}>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => {
                setOpen(false)
                if (s !== order.status) {
                  updateStatus(
                    { id: order.id, status: s },
                    { onSuccess: () => onChanged?.(`Status → ${STATUS_META[s].label}`) }
                  )
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', textAlign: 'left', padding: '8px 12px',
                background: order.status === s ? '#F8FAFC' : 'transparent',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                fontWeight: order.status === s ? 600 : 500, color: '#1E293B',
                transition: 'background 0.15s ease',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_META[s]?.color }} />
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
  const formatted = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
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
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: '#FAFAFA' }}>
      <style>{`
        .orders-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .orders-table th {
          text-align: left; padding: 12px 24px;
          font-size: 11px; font-weight: 600; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.05em;
          border-bottom: 1px solid #E2E8F0; background: #FFFFFF;
          position: sticky; top: 0; z-index: 1;
        }
        .orders-table td {
          padding: 16px 24px; font-size: 14px; color: #1E293B;
          border-bottom: 1px solid #F1F5F9; vertical-align: middle;
          background: #FFFFFF; transition: background 0.15s ease;
        }
        .orders-table tr:hover td { background: #F8FAFC; }
        .orders-table tr:last-child td { border-bottom: none; }
        
        .toolbar-item {
          padding: 8px 12px; border: 1px solid #E2E8F0; border-radius: 6px;
          font-size: 13px; color: #1E293B; background: #FFFFFF; cursor: pointer;
          outline: none; transition: all 0.15s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        .toolbar-item:focus { border-color: #94A3B8; box-shadow: 0 0 0 2px rgba(226,232,240,0.5); }
        .toolbar-item:hover { border-color: #CBD5E1; }
        
        
        @keyframes subtle-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .skeleton { background: #E2E8F0; border-radius: 4px; animation: subtle-pulse 1.5s infinite; }
        @keyframes slideInToast { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Header Container */}
      <div style={{ padding: '32px 48px 24px' }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span>Orbit</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          <span style={{ color: '#0F172A' }}>{myOrdersOnly ? 'My Orders' : 'All Orders'}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', lineHeight: '1.2' }}>
              {myOrdersOnly ? 'My Orders' : 'All Orders'}
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', margin: '4px 0 0 0' }}>
              {myOrdersOnly ? 'Orders assigned to you' : 'Track and manage all work orders'}
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', borderRadius: '8px', border: '1px solid #111827',
              background: '#111827', color: '#FFFFFF', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={e => e.currentTarget.style.background = '#000000'}
            onMouseOut={e => e.currentTarget.style.background = '#111827'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Order
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '0 48px 16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: '#FFFFFF',
          border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px',
          width: '320px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', transition: 'border-color 0.15s ease',
        }}
        onFocusCapture={e => e.currentTarget.style.borderColor = '#94A3B8'}
        onBlurCapture={e => e.currentTarget.style.borderColor = '#E2E8F0'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', padding: '10px 8px', fontSize: '13px', outline: 'none', width: '100%', color: '#0F172A' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <select className="toolbar-item" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>

        <select className="toolbar-item" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="">Priority</option>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>


      </div>

      {/* Table Container */}
      <div style={{ margin: '0 48px 48px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', 
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 6px -4px rgba(0,0,0,0.05)', 
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Order #</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Due Date</th>
                  <th>Updated</th>
                  <th style={{ width: '64px', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      {[80, 200, 120, 100, 80, 140, 90, 80, 40].map((w, j) => (
                        <td key={j}><span className="skeleton" style={{ display: 'block', height: '16px', width: w }} /></td>
                      ))}
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0' }}>No orders matching criteria</h3>
                        <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px 0' }}>
                          Get started by creating a new order.
                        </p>
                        <button
                          onClick={handleOpenCreate}
                          style={{
                            padding: '8px 16px', borderRadius: '6px', border: '1px solid #E2E8F0',
                            background: '#FFFFFF', color: '#0F172A', fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.15s ease'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
                          onMouseOut={e => e.currentTarget.style.background = '#FFFFFF'}
                        >
                          Create Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : orders.map(order => {
                  const due = formatDueDate(order.due_date)
                  
                  // Compute relative update time
                  const updateDate = new Date(order.updated_at)
                  const now = new Date()
                  const hoursDiff = Math.round((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60))
                  const isRecent = hoursDiff < 24
                  const updatedText = isRecent ? (hoursDiff === 0 ? 'Just now' : `${hoursDiff}h ago`) : updateDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                  return (
                    <tr key={order.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px', color: '#64748B' }}>
                        {order.order_number}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '14px' }}>{order.title}</div>
                        {order.description && (
                          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                            {order.description}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#334155', fontSize: '14px' }}>{order.customer_name}</td>
                      <td><StatusDropdown order={order} onChanged={msg => setToast(msg)} /></td>
                      <td><PriorityBadge priority={order.priority} /></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {order.assigned_name ? (
                            <>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, color: '#334155' }}>
                                {getInitials(order.assigned_name)}
                              </div>
                              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 500 }}>{order.assigned_name}</span>
                            </>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#94A3B8' }}>Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {due ? (
                          <span style={{ fontSize: '13px', fontWeight: due.isOverdue ? 600 : 400, color: due.isOverdue ? '#DC2626' : '#334155' }}>
                            {due.formatted}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '13px', color: '#64748B' }}>{updatedText}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleEdit(order)}
                          style={{
                            background: 'transparent', border: 'none', padding: '6px',
                            borderRadius: '6px', color: '#94A3B8', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'color 0.15s ease, background 0.15s ease'
                          }}
                          onMouseOver={e => { e.currentTarget.style.color = '#0F172A'; e.currentTarget.style.background = '#F1F5F9'; }}
                          onMouseOut={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'transparent'; }}
                          title="Edit"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* Footer of Table */}
          <div style={{ background: '#F8FAFC', padding: '12px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>
              {total} order{total !== 1 ? 's' : ''}
            </span>
          </div>

        </div>
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
          background: '#0F172A', color: '#fff', padding: '12px 20px',
          borderRadius: '10px', fontSize: '14px', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'slideInToast 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  )
}
