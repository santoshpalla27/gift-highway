import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '../../../services/notificationService'
import { formatRelative } from '../../../utils/date'
import { useAuthStore } from '../../../store/authStore'

export function NotificationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuthStore()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-summaries'],
    queryFn: () => notificationService.getOrderSummaries(),
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { mutate: markAllRead, isPending: markingAll } = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-summaries'] })
    },
  })

  const orders = data?.orders ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(o =>
      o.order_title.toLowerCase().includes(q) ||
      String(o.order_number).includes(q)
    )
  }, [orders, search])

  const totalUnread = orders.reduce((s, o) => s + o.unread_count, 0)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      padding: '24px', background: '#F5F6FA', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .notif-row { transition: background 150ms ease; cursor: pointer; }
        .notif-row:hover { background: #F0F1F5 !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ marginTop: '-8px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 2px', letterSpacing: '-0.5px' }}>
            Activity
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
            {isLoading ? 'Loading…' : `${filtered.length} orders with activity · ${totalUnread} unread`}
          </p>
        </div>
        {totalUnread > 0 && (
          <button
            onClick={() => markAllRead()}
            disabled={markingAll}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, border: '1.5px solid transparent',
              background: '#6366F1', color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              cursor: markingAll ? 'default' : 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,.15)', whiteSpace: 'nowrap',
              opacity: markingAll ? 0.7 : 1,
            }}
            onMouseOver={e => { if (!markingAll) e.currentTarget.style.background = '#4F46E5' }}
            onMouseOut={e => { e.currentTarget.style.background = '#6366F1' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          background: '#FFFFFF', border: `1.5px solid ${search ? '#6366F1' : '#E4E6EF'}`,
          borderRadius: 8, padding: '6px 10px', width: 260,
          boxShadow: search ? '0 0 0 3px rgba(99,102,241,.10)' : 'none',
          transition: 'all 150ms ease',
        }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = '#6366F1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.10)' }}
          onBlurCapture={e => { if (!search) { e.currentTarget.style.borderColor = '#E4E6EF'; e.currentTarget.style.boxShadow = 'none' } }}
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
      </div>

      {/* Table */}
      <div style={{
        flex: 1, minHeight: 0, background: '#FFFFFF', border: '1px solid #E4E6EF',
        borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Order', 'Name', 'Events', 'Unread', 'Last Activity', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11.5, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '.5px', color: '#9CA3AF',
                    background: '#F0F1F5', borderBottom: '1px solid #E4E6EF', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[100, 280, 50, 50, 100, 30].map((w, j) => (
                      <td key={j} style={{ padding: '13px 16px' }}>
                        <div style={{ height: 13, width: w, borderRadius: 6, background: '#F3F4F6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div style={{ textAlign: 'center', padding: '64px 0' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                          {search
                            ? <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>
                            : <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>
                          }
                        </svg>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>
                        {search ? 'No matching orders' : 'No activity yet'}
                      </p>
                      <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                        {search ? 'Try a different search.' : 'Order events will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(o => (
                  <tr
                    key={o.order_id}
                    className="notif-row"
                    style={{ borderBottom: '1px solid #E4E6EF', background: '#FFFFFF' }}
                    onClick={() => navigate(`/notifications/${o.order_id}`)}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: '#6366F1',
                        background: '#EEF2FF', border: '1px solid #C7D2FE',
                        borderRadius: 6, padding: '3px 8px', fontFamily: 'monospace',
                      }}>
                        Order #{o.order_title}
                      </span>
                    </td>

                    <td style={{ padding: '13px 16px', maxWidth: 340 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {o.order_title}
                      </span>
                    </td>

                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>{o.total_count}</span>
                    </td>

                    <td style={{ padding: '13px 16px' }}>
                      {o.unread_count > 0 ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 22, height: 22, borderRadius: 11,
                          background: '#6366F1', color: '#fff',
                          fontSize: 11, fontWeight: 700, padding: '0 6px',
                        }}>
                          {o.unread_count}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: '#D1D5DB' }}>—</span>
                      )}
                    </td>

                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 12.5, color: '#6B7280' }}>{formatRelative(o.last_event_at)}</span>
                    </td>

                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7CAD9" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
