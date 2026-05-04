import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { orderService, type TrashOrder } from '../../../services/orderService'
import { purgeNotificationOrder } from '../../notifications/hooks/useNotifications'
import { useNavigate } from 'react-router-dom'
import { DateInput } from '../../../components/system/DateInput'
import { useAuthStore } from '../../../store/authStore'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'Yet to Start', color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}

const STATUS_OPTIONS = [
  { key: 'all',         label: 'All statuses' },
  { key: 'new',         label: 'Yet to Start' },
  { key: 'in_progress', label: 'Working' },
  { key: 'completed',   label: 'Done' },
]

function ConfirmDeleteModal({ order, onClose, onConfirm }: {
  order: TrashOrder
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={onClose}
    >
      <div style={{
        background: '#FFFFFF', borderRadius: 14, padding: 28, width: 420, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: '#FEF2F2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Delete permanently?</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>This cannot be undone.</div>
          </div>
        </div>

        <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 12px', marginBottom: 18, fontSize: 13, color: '#B91C1C' }}>
          Order <strong>#{order.title}</strong> and all its data (events, attachments, portal messages) will be permanently deleted.
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Type <strong>DELETE</strong> to confirm
          </label>
          <input
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="DELETE"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
              borderColor: typed === 'DELETE' ? '#EF4444' : '#E5E7EB',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #E5E7EB',
              background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#6B7280', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={typed !== 'DELETE' || loading}
            onClick={async () => {
              setLoading(true)
              await onConfirm()
              setLoading(false)
            }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
              background: typed === 'DELETE' ? '#EF4444' : '#FCA5A5',
              fontSize: 13, fontWeight: 600, color: '#FFFFFF',
              cursor: typed === 'DELETE' ? 'pointer' : 'default',
              transition: 'background 150ms ease',
            }}
          >
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TrashPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [deleteTarget, setDeleteTarget] = useState<TrashOrder | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')   // "YYYY-MM-DD" or ""

  const { data: orders = [], isLoading } = useQuery<TrashOrder[]>({
    queryKey: ['trash'],
    queryFn: orderService.listTrash,
  })

  const filteredOrders = orders.filter(o => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q ||
      o.title.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      (o.archived_by_name ?? '').toLowerCase().includes(q)
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter
    const matchesDate = !dateFrom || (
      o.archived_at
        ? new Date(o.archived_at) >= new Date(dateFrom + 'T00:00:00')
        : false
    )
    return matchesSearch && matchesStatus && matchesDate
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleRestore(order: TrashOrder) {
    setActionLoading(order.id)
    try {
      await orderService.restoreOrder(order.id)
      await queryClient.invalidateQueries({ queryKey: ['trash'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      showToast(`Order #${order.title} restored.`)
    } catch {
      showToast('Failed to restore order.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePermanentDelete(order: TrashOrder) {
    setActionLoading(order.id)
    try {
      await orderService.permanentDelete(order.id)
      purgeNotificationOrder(order.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trash'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications-activity'] }),
      ])
      showToast(`Order #${order.title} permanently deleted.`)
    } catch {
      showToast('Failed to delete order.')
    } finally {
      setActionLoading(null)
      setDeleteTarget(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 24, background: '#F5F6FA', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        .trash-table { width: 100%; border-collapse: collapse; }
        .trash-table th {
          padding: 10px 16px; text-align: left; font-size: 11.5px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .5px; color: #9CA3AF;
          background: #F0F1F5; border-bottom: 1px solid #E4E6EF; white-space: nowrap;
        }
        .trash-table td { padding: 11px 16px; font-size: 13px; color: #111827; vertical-align: middle; border-bottom: 1px solid #E4E6EF; }
        .trash-table tr:last-child td { border-bottom: none; }
        .trash-table tbody tr { background: #FFFFFF; }
        .trash-table tbody tr:hover { background: #F9FAFB; }
        .trash-select {
          appearance: none; -webkit-appearance: none;
          padding: 7px 32px 7px 11px; border-radius: 9px; border: 1.5px solid #E4E6EF;
          font-size: 13px; font-weight: 500; color: #374151; background: #FFFFFF;
          cursor: pointer; outline: none; min-width: 140px;
        }
        .trash-select:focus { border-color: #6366F1; }

      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>Trash</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {isLoading ? 'Loading…' : `${filteredOrders.length} of ${orders.length} archived order${orders.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>

        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160, maxWidth: 320 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by order, customer…"
            style={{
              width: '100%', paddingLeft: 32, paddingRight: search ? 32 : 12,
              paddingTop: 8, paddingBottom: 8, borderRadius: 9, border: '1.5px solid #E4E6EF',
              fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#FFFFFF',
              color: '#111827',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9CA3AF',
              display: 'flex', alignItems: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Status dropdown */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select
            className="trash-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5"
            style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {/* Date from */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DateInput
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="Archived from…"
            style={{
              padding: '7px 11px', borderRadius: 9,
              border: `1.5px solid ${dateFrom ? '#6366F1' : '#E4E6EF'}`,
              background: dateFrom ? '#EEF2FF' : '#FFFFFF',
              color: dateFrom ? '#4F46E5' : '#6B7280',
            }}
          />
          {dateFrom && (
            <button
              onClick={() => setDateFrom('')}
              title="Clear date filter"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: '#9CA3AF', display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

      </div>

      <div style={{ flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ height: '100%', overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ marginBottom: 12, color: '#D1D5DB' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Trash is empty</div>
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>Archived orders will appear here.</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ marginBottom: 12, color: '#D1D5DB' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 4 }}>No results</div>
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>Try adjusting your search, status, or date filter.</div>
            </div>
          ) : (
            <table className="trash-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Archived By</th>
                  <th>Archived Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const meta = STATUS_META[order.status] ?? STATUS_META.new
                  const busy = actionLoading === order.id
                  return (
                    <tr key={order.id}>
                      <td>
                        <button
                          onClick={() => navigate(`/orders/${order.id}`)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: '#2563EB', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'left' }}
                        >
                          #{order.title}
                        </button>
                      </td>
                      <td style={{ color: '#374151' }}>{order.customer_name}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
                          borderRadius: 9999, fontSize: 11.5, fontWeight: 600,
                          color: meta.color, background: meta.bg, whiteSpace: 'nowrap',
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ color: '#6B7280' }}>{order.archived_by_name ?? '—'}</td>
                      <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>{order.archived_at ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          {isAdmin && (
                            <button
                              disabled={busy}
                              onClick={() => handleRestore(order)}
                              style={{
                                padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                border: '1px solid #A7F3D0', background: '#ECFDF5', color: '#059669',
                                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                              }}
                            >
                              Restore
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              disabled={busy}
                              onClick={() => setDeleteTarget(order)}
                              style={{
                                padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                border: '1px solid #FECACA', background: '#FEF2F2', color: '#EF4444',
                                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          order={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handlePermanentDelete(deleteTarget)}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#1F2937', color: '#FFFFFF', borderRadius: 10,
          padding: '10px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          animation: 'slideInToast 200ms ease',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
