import { useState } from 'react'
import { formatDate } from '../../../utils/date'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useTeamDashboard, useMyDashboard } from '../hooks/useDashboard'
import type { DashboardOrder } from '../../../services/dashboardService'
import { STATUS_META, PRIORITY_META } from '../../../constants/status'

function fmtDue(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  if (diff === 0) return { label: 'Today', color: '#F59E0B' }
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: '#EF4444' }
  if (diff === 1) return { label: 'Tomorrow', color: '#6B7280' }
  return { label: formatDate(d), color: '#6B7280' }
}


// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon, onClick, loading }: {
  label: string; value: number | undefined; color: string; icon: React.ReactNode
  onClick?: () => void; loading?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '20px 20px 18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 150ms, transform 150ms',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</span>
        <span style={{ color, opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>
        {loading ? <span style={{ fontSize: 20, opacity: 0.3 }}>—</span> : (value ?? 0)}
      </div>
    </div>
  )
}

// ─── Order Row ────────────────────────────────────────────────────────────────

function OrderRow({ order, onClick }: { order: DashboardOrder; onClick: () => void }) {
  const sm = STATUS_META[order.status]
  const due = fmtDue(order.due_date)
  const pm = PRIORITY_META[order.priority]
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
        transition: 'background 100ms',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', flexShrink: 0 }}>
        #{order.title}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.customer_name}
          {order.assigned_names?.length > 0 && ` · ${order.assigned_names[0].split(' ')[0]}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {due && <span style={{ fontSize: 11.5, fontWeight: 600, color: due.color }}>{due.label}</span>}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: pm?.color ?? '#9CA3AF', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: sm?.color ?? '#9CA3AF', background: sm?.bg, padding: '2px 7px', borderRadius: 999, fontWeight: 600 }}>
          {sm?.label ?? order.status}
        </span>
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, count, children, onViewAll, emptyText, badgeColor }: {
  title: string; count?: number; children?: React.ReactNode; onViewAll?: () => void; emptyText?: string; badgeColor?: string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${badgeColor ? badgeColor + '40' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{
              marginLeft: 8, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700,
              background: badgeColor ? badgeColor + '18' : 'var(--surface-2)',
              border: `1px solid ${badgeColor ? badgeColor + '40' : 'var(--border)'}`,
              color: badgeColor ?? 'var(--text-secondary)',
            }}>
              {count}
            </span>
          )}
        </span>
        {onViewAll && (
          <button onClick={onViewAll} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
            View all →
          </button>
        )}
      </div>
      {children}
      {emptyText && (
        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
          {emptyText}
        </div>
      )}
    </div>
  )
}

// ─── Team Dashboard ───────────────────────────────────────────────────────────

function TeamDashboardTab() {
  const navigate = useNavigate()
  const { data, isLoading } = useTeamDashboard()
  const s = data?.stats

  const kpis = [
    { label: 'Total Orders', value: s?.total_orders, color: '#6366F1', onClick: () => navigate('/orders'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
    { label: 'Yet to Start', value: s?.new_orders, color: '#6B7280', onClick: () => navigate('/orders?status=yet_to_start'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { label: 'Working', value: s?.working_orders, color: '#3B82F6', onClick: () => navigate('/orders?status=working'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { label: 'Waiting for Client', value: s?.waiting_for_client_orders, color: '#F59E0B', onClick: () => navigate('/orders?status=waiting_for_client'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: 'Making', value: s?.making_orders, color: '#8B5CF6', onClick: () => navigate('/orders?status=making'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
    { label: 'Done', value: s?.done_orders, color: '#10B981', onClick: () => navigate('/orders?status=done'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
    { label: 'Delivered', value: s?.delivered_orders, color: '#0D9488', onClick: () => navigate('/orders?status=delivered'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
    { label: 'Cancelled', value: s?.cancelled_orders, color: '#EF4444', onClick: () => navigate('/orders?status=cancelled'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
    { label: 'Due Today', value: s?.due_today, color: '#F59E0B', onClick: () => navigate('/orders?today=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Overdue', value: s?.overdue, color: '#EF4444', onClick: () => navigate('/orders?overdue=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
    { label: 'Stale (7+ days)', value: s?.stale_orders, color: '#F97316', onClick: () => navigate('/orders?stale=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    { label: 'Unassigned', value: s?.unassigned_orders, color: '#F97316', onClick: () => navigate('/orders?unassigned=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => <KpiCard key={k.label} loading={isLoading} {...k} />)}
      </div>

      {/* Row 2: Due today + Overdue */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard
          title="Due Today"
          count={(data?.due_today_list ?? []).length}
          onViewAll={() => navigate('/orders?today=1')}
          emptyText={!isLoading && (data?.due_today_list ?? []).length === 0 ? 'No orders due today' : undefined}
        >
          {(data?.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>

        <SectionCard
          title="Overdue"
          count={(data?.overdue_orders ?? []).length}
          onViewAll={() => navigate('/orders?overdue=1')}
          emptyText={!isLoading && (data?.overdue_orders ?? []).length === 0 ? 'No overdue orders' : undefined}
        >
          {(data?.overdue_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>
      </div>

      {/* Row 3: Stale orders */}
      <SectionCard
        title="Stale Orders"
        count={(data?.stale_orders ?? []).length}
        onViewAll={() => navigate('/orders?stale=1')}
        emptyText={!isLoading && (data?.stale_orders ?? []).length === 0 ? 'No stale orders' : undefined}
      >
        {(data?.stale_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
      </SectionCard>
    </div>
  )
}

// ─── My Dashboard ─────────────────────────────────────────────────────────────

function MyDashboardTab() {
  const navigate = useNavigate()
  const { data, isLoading } = useMyDashboard()
  const s = data?.stats

  const kpis = [
    { label: 'Total Orders', value: s?.total_orders, color: '#6366F1', onClick: () => navigate('/my-orders'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
    { label: 'Yet to Start', value: s?.new_orders, color: '#6B7280', onClick: () => navigate('/my-orders?status=yet_to_start'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { label: 'Working', value: s?.working_orders, color: '#3B82F6', onClick: () => navigate('/my-orders?status=working'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
    { label: 'Waiting for Client', value: s?.waiting_for_client_orders, color: '#F59E0B', onClick: () => navigate('/my-orders?status=waiting_for_client'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { label: 'Making', value: s?.making_orders, color: '#8B5CF6', onClick: () => navigate('/my-orders?status=making'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
    { label: 'Done', value: s?.done_orders, color: '#10B981', onClick: () => navigate('/my-orders?status=done'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
    { label: 'Delivered', value: s?.delivered_orders, color: '#0D9488', onClick: () => navigate('/my-orders?status=delivered'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
    { label: 'Cancelled', value: s?.cancelled_orders, color: '#EF4444', onClick: () => navigate('/my-orders?status=cancelled'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
    { label: 'Due Today', value: s?.due_today, color: '#F59E0B', onClick: () => navigate('/my-orders?today=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Overdue', value: s?.overdue, color: '#EF4444', onClick: () => navigate('/my-orders?overdue=1'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => <KpiCard key={k.label} loading={isLoading} {...k} />)}
      </div>

      {/* Row 2: Due today + Overdue */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard
          title="Due Today"
          count={(data?.due_today_list ?? []).length}
          onViewAll={() => navigate('/my-orders?today=1')}
          emptyText={!isLoading && (data?.due_today_list ?? []).length === 0 ? 'No orders due today' : undefined}
        >
          {(data?.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>

        <SectionCard
          title="Overdue"
          count={(data?.overdue_orders ?? []).length}
          onViewAll={() => navigate('/my-orders?overdue=1')}
          emptyText={!isLoading && (data?.overdue_orders ?? []).length === 0 ? 'No overdue orders' : undefined}
        >
          {(data?.overdue_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>
      </div>

    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'team' | 'my'>('my')

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .kpi-skeleton { animation: pulse 1.5s ease-in-out infinite; background: var(--surface-2); border-radius: 8px; height: 34px; width: 60px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.4px' }}>
              Dashboard
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Welcome back, {user?.first_name} · {formatDate(new Date())}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {(['my', 'team'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'color 150ms',
            }}>
              {t === 'team' ? 'Team Dashboard' : 'My Dashboard'}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {tab === 'team' ? <TeamDashboardTab /> : <MyDashboardTab />}
      </div>
    </div>
  )
}
