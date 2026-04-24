import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { orderService, type TrashOrder } from '../../../services/orderService'
import { purgeNotificationOrder } from '../../notifications/hooks/useNotifications'
import { useNavigate } from 'react-router-dom'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'Yet to Start', color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}

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
  const [deleteTarget, setDeleteTarget] = useState<TrashOrder | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { data: orders = [], isLoading } = useQuery<TrashOrder[]>({
    queryKey: ['trash'],
    queryFn: orderService.listTrash,
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
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px 0', letterSpacing: '-0.5px' }}>Trash</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {isLoading ? 'Loading…' : `${orders.length} archived order${orders.length !== 1 ? 's' : ''}`}
        </p>
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
                {orders.map(order => {
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
