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
  working_count: number
  waiting_for_client_count: number
  making_count: number
  done_count: number
  delivered_count: number
}

type StatusFilter = 'all' | 'yet_to_start' | 'working' | 'waiting_for_client' | 'making' | 'done' | 'delivered'
type SortKey = 'name' | 'total_assigned' | 'new_count' | 'working_count' | 'waiting_for_client_count' | 'making_count' | 'done_count' | 'delivered_count'

const STATUS_META = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
  total:              { label: 'Total',                     color: '#6366F1', bg: '#EEF2FF' },
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',                label: 'All'                      },
  { key: 'yet_to_start',       label: 'Yet to Start'             },
  { key: 'working',            label: 'Working'                   },
  { key: 'waiting_for_client', label: 'Waiting for Client Review' },
  { key: 'making',             label: 'Making'                    },
  { key: 'done',               label: 'Done'                      },
  { key: 'delivered',          label: 'Delivered'                 },
]

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

// Matches the StatusBadge pill style from OrdersPage exactly
function StatusPill({ count, metaKey, onClick }: {
  count: number
  metaKey: keyof typeof STATUS_META
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
      if (statusFilter === 'yet_to_start')       return u.new_count > 0
      if (statusFilter === 'working')            return u.working_count > 0
      if (statusFilter === 'waiting_for_client') return u.waiting_for_client_count > 0
      if (statusFilter === 'making')             return u.making_count > 0
      if (statusFilter === 'done')               return u.done_count > 0
      if (statusFilter === 'delivered')          return u.delivered_count > 0
      return true
    })
    .sort((a, b) => {
      const av = sortKey === 'name' ? a.name : (a as any)[sortKey] as number
      const bv = sortKey === 'name' ? b.name : (b as any)[sortKey] as number
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

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
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>User Metrics</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6B7280' }}>
          Order workload breakdown per team member
        </p>
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
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
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
                  { key: 'total_assigned'          as SortKey, metaKey: 'total'              as const },
                  { key: 'new_count'               as SortKey, metaKey: 'yet_to_start'       as const },
                  { key: 'working_count'           as SortKey, metaKey: 'working'            as const },
                  { key: 'waiting_for_client_count' as SortKey, metaKey: 'waiting_for_client' as const },
                  { key: 'making_count'            as SortKey, metaKey: 'making'             as const },
                  { key: 'done_count'              as SortKey, metaKey: 'done'               as const },
                  { key: 'delivered_count'         as SortKey, metaKey: 'delivered'          as const },
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
                    <StatusPill count={u.new_count} metaKey="yet_to_start" onClick={() => openUserOrders(u.id, 'yet_to_start')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.working_count} metaKey="working" onClick={() => openUserOrders(u.id, 'working')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.waiting_for_client_count} metaKey="waiting_for_client" onClick={() => openUserOrders(u.id, 'waiting_for_client')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.making_count} metaKey="making" onClick={() => openUserOrders(u.id, 'making')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.done_count} metaKey="done" onClick={() => openUserOrders(u.id, 'done')} />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <StatusPill count={u.delivered_count} metaKey="delivered" onClick={() => openUserOrders(u.id, 'delivered')} />
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
          </div>
        )}
      </div>
    </div>
    </div>
  )
}
