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

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'total_desc',   label: 'Most Orders'   },
  { value: 'total_asc',    label: 'Fewest Orders' },
  { value: 'active_desc',  label: 'Most Active'   },
  { value: 'pending_desc', label: 'Most Pending'  },
  { value: 'done_desc',    label: 'Most Closed'   },
  { value: 'name_asc',     label: 'Name A – Z'    },
  { value: 'name_desc',    label: 'Name Z – A'    },
]

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
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
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
    return <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', width: '100%' }} />
  }
  const segs = BAR_SEGMENTS
    .map(s => ({ ...s, count: u[STATUS_COUNT_KEY[s.key]] as number }))
    .filter(s => s.count > 0)
  return (
    <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', width: '100%', gap: 1 }}>
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

  const handleSortChange = (val: string) => {
    const [key, dir] = val.split('_') as [SortKey, SortDir]
    setSortKey(key); setSortDir(dir)
  }

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Search */}
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

          {/* Sort */}
          <select
            value={`${sortKey}_${sortDir}`}
            onChange={e => handleSortChange(e.target.value)}
            style={{
              padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 8,
              fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)',
              outline: 'none', cursor: 'pointer',
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Filter chips */}
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

        {/* Cards */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
            No users found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(u => {
              const cols = [
                { label: 'Total',     value: u.total_assigned,           color: 'var(--accent)', status: undefined        },
                { label: 'New',       value: u.new_count,                color: '#6B7280',       status: 'yet_to_start'       },
                { label: 'Working',   value: u.working_count,            color: '#3B82F6',       status: 'working'            },
                { label: 'Waiting',   value: u.waiting_for_client_count, color: '#F59E0B',       status: 'waiting_for_client' },
                { label: 'Making',    value: u.making_count,             color: '#8B5CF6',       status: 'making'             },
                { label: 'Done',      value: u.done_count,               color: '#10B981',       status: 'done'               },
                { label: 'Delivered', value: u.delivered_count,          color: '#0D9488',       status: 'delivered'          },
                { label: 'Cancelled', value: u.cancelled_count,          color: '#EF4444',       status: 'cancelled'          },
              ]
              return (
                <div
                  key={u.id}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 14, overflow: 'hidden',
                  }}
                >
                  {/* User row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent-light)', color: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {getInitials(u.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {u.role === 'admin' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', background: '#EEF2FF', padding: '3px 8px', borderRadius: 20 }}>
                          Admin
                        </span>
                      )}
                      {!u.is_active && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--surface-2)', padding: '3px 8px', borderRadius: 20 }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => goToOrders(u.id)}
                      className="btn btn-secondary"
                      style={{ fontSize: 12.5, padding: '6px 14px', flexShrink: 0 }}
                    >
                      View Orders
                    </button>
                  </div>

                  {/* Breakdown bar */}
                  <div style={{ padding: '0 20px 14px' }}>
                    <StatusBar u={u} onNavigate={goToOrders} />
                  </div>

                  {/* Count row */}
                  <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                    {cols.map((col, idx) => (
                      <div
                        key={col.label}
                        onClick={() => col.value > 0 && col.status && goToOrders(u.id, col.status)}
                        style={{
                          flex: 1,
                          borderRight: idx < cols.length - 1 ? '1px solid var(--border)' : 'none',
                          padding: '14px 8px',
                          textAlign: 'center',
                          cursor: col.value > 0 && col.status ? 'pointer' : 'default',
                        }}
                        onMouseEnter={e => { if (col.value > 0 && col.status) e.currentTarget.style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.5px', color: col.color,
                          opacity: col.value === 0 ? 0.35 : 1, marginBottom: 6,
                        }}>
                          {col.label}
                        </div>
                        <div style={{
                          fontSize: 22, fontWeight: 800, lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                          color: col.value > 0 ? col.color : 'var(--text-tertiary)',
                          opacity: col.value === 0 ? 0.3 : 1,
                        }}>
                          {col.value}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
