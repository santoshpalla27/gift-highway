import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../../services/apiClient'
import { useAuthStore } from '../../../store/authStore'
import { STATUS_META as BASE_STATUS_META, STATUS_OPTIONS } from '../../../constants/status'

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
  cancelled_count: number
}

type StatusFilter = 'all' | 'yet_to_start' | 'working' | 'waiting_for_client' | 'making' | 'done' | 'delivered' | 'cancelled'
type SortKey = 'name' | 'total' | 'active' | 'pending' | 'done'
type SortDir = 'asc' | 'desc'

const BAR_SEGMENTS: { key: string; color: string }[] = [
  { key: 'working',            color: '#3B82F6' },
  { key: 'making',             color: '#8B5CF6' },
  { key: 'yet_to_start',       color: '#6B7280' },
  { key: 'waiting_for_client', color: '#F59E0B' },
  { key: 'done',               color: '#10B981' },
  { key: 'delivered',          color: '#0D9488' },
  { key: 'cancelled',          color: '#EF4444' },
]

const STATUS_COUNT_KEY: Record<string, keyof UserMetric> = {
  yet_to_start:       'new_count',
  working:            'working_count',
  waiting_for_client: 'waiting_for_client_count',
  making:             'making_count',
  done:               'done_count',
  delivered:          'delivered_count',
  cancelled:          'cancelled_count',
}

const STATUS_FILTERS = [
  { key: 'all' as StatusFilter, label: 'All' },
  ...STATUS_OPTIONS.map(k => ({ key: k as StatusFilter, label: BASE_STATUS_META[k].label })),
]

const TH: React.CSSProperties = {
  padding: '12px 16px', fontSize: 11.5, fontWeight: 700,
  color: 'var(--text-tertiary)', textTransform: 'uppercase',
  letterSpacing: '0.06em', whiteSpace: 'nowrap',
}

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}
function getActive(u: UserMetric)  { return u.working_count + u.making_count }
function getPending(u: UserMetric) { return u.new_count + u.waiting_for_client_count }
function getDone(u: UserMetric)    { return u.done_count + u.delivered_count }

function getSortValue(u: UserMetric, key: SortKey): string | number {
  if (key === 'name')    return u.name
  if (key === 'total')   return u.total_assigned
  if (key === 'active')  return getActive(u)
  if (key === 'pending') return getPending(u)
  if (key === 'done')    return getDone(u)
  return 0
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sublabel, color }: {
  label: string; value: number; sublabel: string; color: string
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{
        fontSize: 30, fontWeight: 800, color, lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginTop: 7 }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
        {sublabel}
      </div>
    </div>
  )
}

function StatusBar({ u, onNavigate }: {
  u: UserMetric
  onNavigate: (userId: string, status: string) => void
}) {
  if (u.total_assigned === 0) {
    return <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', width: 140 }} />
  }
  const segs = BAR_SEGMENTS
    .map(s => ({ ...s, count: u[STATUS_COUNT_KEY[s.key]] as number }))
    .filter(s => s.count > 0)
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', width: 140, gap: 1 }}>
      {segs.map(s => (
        <div
          key={s.key}
          title={`${BASE_STATUS_META[s.key]?.label}: ${s.count}`}
          onClick={e => { e.stopPropagation(); onNavigate(u.id, s.key) }}
          style={{ flex: s.count, background: s.color, cursor: 'pointer', transition: 'opacity 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.65')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        />
      ))}
    </div>
  )
}

function CountCell({ items, userId, onNavigate }: {
  items: { label: string; value: number; color: string; status?: string }[]
  userId: string
  onNavigate: (userId: string, status?: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map(item => (
        <div
          key={item.label}
          onClick={() => item.value > 0 && item.status && onNavigate(userId, item.status)}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 7,
            cursor: item.value > 0 && item.status ? 'pointer' : 'default',
          }}
        >
          <span style={{
            fontSize: 11, color: 'var(--text-tertiary)',
            width: 54, flexShrink: 0, lineHeight: '20px',
          }}>
            {item.label}
          </span>
          <span style={{
            fontSize: 16, fontWeight: 700, lineHeight: 1,
            color: item.value > 0 ? item.color : 'var(--text-tertiary)',
            opacity: item.value === 0 ? 0.3 : 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MetricsDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
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

  const goToOrders = (userId: string, status?: string) => {
    const params = new URLSearchParams({ assignee: userId })
    if (status) params.set('status', status)
    navigate(`/orders?${params.toString()}`)
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
      if (statusFilter === 'cancelled')          return u.cancelled_count > 0
      return true
    })
    .sort((a, b) => {
      const av = getSortValue(a, sortKey)
      const bv = getSortValue(b, sortKey)
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  const totalOrders  = users.reduce((s, u) => s + u.total_assigned, 0)
  const totalActive  = users.reduce((s, u) => s + getActive(u), 0)
  const totalPending = users.reduce((s, u) => s + getPending(u), 0)

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span style={{ marginLeft: 3, opacity: sortKey === col ? 1 : 0.3, fontSize: 9 }}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
    </span>
  )

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            User Metrics
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Order workload breakdown per team member
          </p>
        </div>

        {/* Summary strip */}
        {!loading && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <SummaryCard
              label="Team Members"
              value={users.length}
              sublabel={`${users.filter(u => u.is_active).length} active`}
              color="var(--text-primary)"
            />
            <SummaryCard
              label="Total Orders"
              value={totalOrders}
              sublabel="across all members"
              color="var(--accent)"
            />
            <SummaryCard
              label="In Progress"
              value={totalActive}
              sublabel="working + making"
              color="#3B82F6"
            />
            <SummaryCard
              label="Needs Attention"
              value={totalPending}
              sublabel="new + waiting for client"
              color="#F59E0B"
            />
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 8,
              fontSize: 13.5, outline: 'none', width: 220,
              color: 'var(--text-primary)', background: 'var(--surface)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.key
              const m = f.key !== 'all' ? BASE_STATUS_META[f.key] : null
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  style={{
                    padding: '5px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                    border: active && m ? `1.5px solid ${m.color}` : '1.5px solid var(--border)',
                    background: active && m ? m.bg : active ? 'var(--surface-2)' : 'var(--surface)',
                    color: active && m ? m.color : active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {m && active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color }} />}
                  {f.label}
                </button>
              )
            })}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {filtered.length} of {users.length} users
          </span>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
              No users found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    <th onClick={() => handleSort('name')} style={{ ...TH, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                      User <SortIcon col="name" />
                    </th>
                    <th onClick={() => handleSort('total')} style={{ ...TH, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                      Total <SortIcon col="total" />
                    </th>
                    <th style={{ ...TH, textAlign: 'left' }}>
                      Breakdown
                    </th>
                    <th onClick={() => handleSort('active')} style={{ ...TH, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                      Active <SortIcon col="active" />
                    </th>
                    <th onClick={() => handleSort('pending')} style={{ ...TH, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                      Queue <SortIcon col="pending" />
                    </th>
                    <th onClick={() => handleSort('done')} style={{ ...TH, textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                      Closed <SortIcon col="done" />
                    </th>
                    <th style={{ ...TH, textAlign: 'center' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr
                      key={u.id}
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      {/* User */}
                      <td style={{ padding: '16px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: '50%',
                            background: 'var(--accent-light)', color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>
                            {getInitials(u.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                              {u.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                              {u.email}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {u.role === 'admin' && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#6366F1', background: '#EEF2FF', padding: '2px 7px', borderRadius: 20 }}>
                                Admin
                              </span>
                            )}
                            {!u.is_active && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 20 }}>
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{ padding: '16px 16px', textAlign: 'center' }}>
                        <div
                          onClick={() => goToOrders(u.id)}
                          style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
                        >
                          <span style={{
                            fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
                            lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                          }}>
                            {u.total_assigned}
                          </span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 3 }}>orders</span>
                        </div>
                      </td>

                      {/* Breakdown bar */}
                      <td style={{ padding: '16px 16px' }}>
                        <StatusBar u={u} onNavigate={goToOrders} />
                      </td>

                      {/* Active: working + making */}
                      <td style={{ padding: '16px 16px' }}>
                        <CountCell
                          userId={u.id}
                          onNavigate={goToOrders}
                          items={[
                            { label: 'Working', value: u.working_count, color: '#3B82F6', status: 'working' },
                            { label: 'Making',  value: u.making_count,  color: '#8B5CF6', status: 'making'  },
                          ]}
                        />
                      </td>

                      {/* Queue: yet_to_start + waiting */}
                      <td style={{ padding: '16px 16px' }}>
                        <CountCell
                          userId={u.id}
                          onNavigate={goToOrders}
                          items={[
                            { label: 'New',     value: u.new_count,                color: '#6B7280', status: 'yet_to_start'       },
                            { label: 'Waiting', value: u.waiting_for_client_count, color: '#F59E0B', status: 'waiting_for_client' },
                          ]}
                        />
                      </td>

                      {/* Closed: done + delivered + cancelled */}
                      <td style={{ padding: '16px 16px' }}>
                        <CountCell
                          userId={u.id}
                          onNavigate={goToOrders}
                          items={[
                            { label: 'Done',      value: u.done_count,      color: '#10B981', status: 'done'      },
                            { label: 'Delivered', value: u.delivered_count, color: '#0D9488', status: 'delivered' },
                            { label: 'Cancelled', value: u.cancelled_count, color: '#EF4444', status: 'cancelled' },
                          ]}
                        />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '16px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => goToOrders(u.id)}
                          className="btn btn-secondary"
                          style={{ fontSize: 12.5, padding: '5px 12px' }}
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
