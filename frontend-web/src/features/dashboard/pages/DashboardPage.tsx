import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useTeamDashboard, useMyDashboard } from '../hooks/useDashboard'
import type { DashboardOrder } from '../../../services/dashboardService'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { color: string }> = {
  low:    { color: '#6B7280' },
  medium: { color: '#F59E0B' },
  high:   { color: '#8B5CF6' },
  urgent: { color: '#EF4444' },
}

function fmtDue(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  if (diff === 0) return { label: 'Today', color: '#F59E0B' }
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: '#EF4444' }
  if (diff === 1) return { label: 'Tomorrow', color: '#6B7280' }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: '#6B7280' }
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
        #{order.order_number}
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

function SectionCard({ title, count, children, onViewAll, emptyText }: {
  title: string; count?: number; children: React.ReactNode; onViewAll?: () => void; emptyText?: string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{ marginLeft: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
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
    { label: 'New Orders', value: s?.new_orders, color: '#6B7280', onClick: () => navigate('/orders?status=new'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { label: 'Working', value: s?.working_orders, color: '#3B82F6', onClick: () => navigate('/orders?status=in_progress'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { label: 'Completed Today', value: s?.completed_today, color: '#10B981', onClick: () => navigate('/orders?status=completed'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
    { label: 'Due Today', value: s?.due_today, color: '#F59E0B', onClick: () => navigate('/orders'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Overdue', value: s?.overdue, color: '#EF4444', onClick: () => navigate('/orders'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
    { label: 'Unread Customer', value: s?.unread_customer, color: '#8B5CF6',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { label: 'Stale (7+ days)', value: s?.stale_orders, color: '#F97316',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => <KpiCard key={k.label} loading={isLoading} {...k} />)}
      </div>

      {/* Row 2: Due today + Stale */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <SectionCard
          title="Due Today"
          count={(data?.due_today_list ?? []).length}
          onViewAll={() => navigate('/orders')}
          emptyText={!isLoading && (data?.due_today_list ?? []).length === 0 ? 'No orders due today' : undefined}
        >
          {(data?.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>

        <SectionCard
          title="Stale Orders"
          count={(data?.stale_orders ?? []).length}
          emptyText={!isLoading && (data?.stale_orders ?? []).length === 0 ? 'No stale orders' : undefined}
        >
          {(data?.stale_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>
      </div>

      {/* Row 3: Unread customer orders */}
      <SectionCard
        title="Unread Customer Messages"
        count={(data?.unread_customer_orders ?? []).length}
        onViewAll={() => navigate('/orders')}
        emptyText={!isLoading && (data?.unread_customer_orders ?? []).length === 0 ? 'No unread customer messages' : undefined}
      >
        {(data?.unread_customer_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
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
    { label: 'Assigned to Me', value: s?.assigned_to_me, color: '#6366F1', onClick: () => navigate('/my-orders'),
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { label: 'Due Today', value: s?.due_today, color: '#F59E0B',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: 'Overdue', value: s?.overdue, color: '#EF4444',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
    { label: 'Done This Week', value: s?.completed_this_week, color: '#10B981',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
    { label: 'Unread Customer', value: s?.unread_customer, color: '#8B5CF6',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
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
          onViewAll={() => navigate('/my-orders')}
          emptyText={!isLoading && (data?.due_today_list ?? []).length === 0 ? 'No orders due today' : undefined}
        >
          {(data?.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>

        <SectionCard
          title="Overdue"
          count={(data?.overdue_orders ?? []).length}
          onViewAll={() => navigate('/my-orders')}
          emptyText={!isLoading && (data?.overdue_orders ?? []).length === 0 ? 'No overdue orders' : undefined}
        >
          {(data?.overdue_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
        </SectionCard>
      </div>

      {/* Row 3: Unread customer messages */}
      <SectionCard
        title="Unread Customer Messages"
        count={(data?.unread_customer_orders ?? []).length}
        onViewAll={() => navigate('/my-orders')}
        emptyText={!isLoading && (data?.unread_customer_orders ?? []).length === 0 ? 'No unread customer messages' : undefined}
      >
        {(data?.unread_customer_orders ?? []).map(o => <OrderRow key={o.id} order={o} onClick={() => navigate(`/orders/${o.id}`)} />)}
      </SectionCard>

    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'team' | 'my'>('team')

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
              Welcome back, {user?.first_name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {(['team', 'my'] as const).map(t => (
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
