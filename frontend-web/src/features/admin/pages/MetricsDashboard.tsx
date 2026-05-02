import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../../services/apiClient'
import { useAuthStore } from '../../../store/authStore'

interface UserMetric {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  total_assigned: number
  new_count: number
  in_progress_count: number
  completed_count: number
}

type StatusFilter = 'all' | 'new' | 'in_progress' | 'completed'
type SortKey = 'name' | 'total_assigned' | 'new_count' | 'in_progress_count' | 'completed_count'

// Exactly the same colors as STATUS_META in OrdersPage
const STATUS_META = {
  new:         { label: 'New',         color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Completed',   color: '#10B981', bg: '#ECFDF5' },
  total:       { label: 'Total',       color: '#6366F1', bg: '#EEF2FF' },
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: 'All'         },
  { key: 'new',         label: 'New'         },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed'   },
]

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

// Matches the StatusBadge pill style from OrdersPage exactly
function StatusPill({ count, metaKey, onClick }: {
  count: number
  metaKey: 'new' | 'in_progress' | 'completed' | 'total'
  onClick?: () => void
}) {
  const m = STATUS_META[metaKey]
  return (
    <span
      onClick={count > 0 ? onClick : undefined}
      title={count > 0 ? `View ${m.label.toLowerCase()} orders` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 9999, fontSize: 13, fontWeight: 700,
        color: m.color, background: m.bg, whiteSpace: 'nowrap',
        cursor: count > 0 ? 'pointer' : 'default',
        opacity: count === 0 ? 0.4 : 1,
        transition: 'opacity 0.1s',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {count}
    </span>
  )
}

export function MetricsDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('total_assigned')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/'); return }
    apiClient.get<{ users: UserMetric[] }>('/admin/metrics/users')
      .then(r => setUsers(r.data.users))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, navigate])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = users
    .filter(u => {
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) &&
          !u.email.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter === 'new') return u.new_count > 0
      if (statusFilter === 'in_progress') return u.in_progress_count > 0
      if (statusFilter === 'completed') return u.completed_count > 0
      return true
    })
    .sort((a, b) => {
      const av = sortKey === 'name' ? a.name : (a as any)[sortKey] as number
      const bv = sortKey === 'name' ? b.name : (b as any)[sortKey] as number
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  const totals = users.reduce(
    (acc, u) => ({
      total: acc.total + u.total_assigned,
      new: acc.new + u.new_count,
      in_progress: acc.in_progress + u.in_progress_count,
      completed: acc.completed + u.completed_count,
    }),
    { total: 0, new: 0, in_progress: 0, completed: 0 }
  )

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === col ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
    </span>
  )

  const openUserOrders = (userId: string, status?: string) => {
    const params = new URLSearchParams({ assignee: userId })
    if (status) params.set('status', status)
    navigate(`/orders?${params.toString()}`)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>User Metrics</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6B7280' }}>
          Order workload breakdown per team member
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {([
          { metaKey: 'total' as const,       value: totals.total       },
          { metaKey: 'new' as const,         value: totals.new         },
          { metaKey: 'in_progress' as const, value: totals.in_progress },
          { metaKey: 'completed' as const,   value: totals.completed   },
        ]).map(card => {
          const m = STATUS_META[card.metaKey]
          return (
            <div key={card.metaKey} style={{ background: m.bg, border: `1px solid ${m.color}33`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: m.color }}>{card.value}</div>
            </div>
          )
        })}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13.5, outline: 'none', width: 220, color: '#111827' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.key
            const m = f.key !== 'all' ? STATUS_META[f.key] : null
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                style={{
                  padding: '5px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: active && m ? `1.5px solid ${m.color}` : '1.5px solid #E5E7EB',
                  background: active && m ? m.bg : active ? '#F3F4F6' : '#FFFFFF',
                  color: active && m ? m.color : active ? '#374151' : '#6B7280',
                  transition: 'all 0.15s',
                }}
              >
                {m && active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />}
                {f.label}
              </button>
            )
          })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#9CA3AF' }}>
          {filtered.length} of {users.length} users
        </span>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No users found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {/* User column */}
                <th
                  onClick={() => handleSort('name')}
                  style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                >
                  User<SortIcon col="name" />
                </th>
                {/* Status count columns — colored dot like StatusBadge */}
                {([
                  { key: 'total_assigned' as SortKey,    metaKey: 'total' as const      },
                  { key: 'new_count' as SortKey,         metaKey: 'new' as const        },
                  { key: 'in_progress_count' as SortKey, metaKey: 'in_progress' as const },
                  { key: 'completed_count' as SortKey,   metaKey: 'completed' as const  },
                ]).map(col => {
                  const m = STATUS_META[col.metaKey]
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                        {m.label}
                        <SortIcon col={col.key} />
                      </span>
                    </th>
                  )
                })}
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr
                  key={u.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* User cell */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', background: '#0F172A',
                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{u.email}</div>
                      </div>
                      {u.role === 'admin' && (
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#6366F1', background: '#EEF2FF', padding: '2px 8px', borderRadius: 20 }}>
                          Admin
                        </span>
                      )}
                      {!u.is_active && (
                        <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: 20 }}>
                          Inactive
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status count cells — always use StatusPill regardless of zero */}
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.total_assigned} metaKey="total" onClick={() => openUserOrders(u.id)} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.new_count} metaKey="new" onClick={() => openUserOrders(u.id, 'new')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.in_progress_count} metaKey="in_progress" onClick={() => openUserOrders(u.id, 'in_progress')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.completed_count} metaKey="completed" onClick={() => openUserOrders(u.id, 'completed')} />
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => openUserOrders(u.id)}
                      style={{
                        padding: '5px 12px', background: '#FFFFFF', border: '1.5px solid #E5E7EB',
                        borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: '#374151', cursor: 'pointer',
                      }}
                    >
                      View Orders
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
