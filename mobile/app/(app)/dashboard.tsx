import React, { useState, useCallback, useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  dashboardService,
  TeamDashboard,
  MyDashboard,
  DashboardOrder,
} from '../../services/dashboardService'
import { formatDate } from '../../utils/date'
import { useOrderSocket } from '../../hooks/useOrderSocket'
import { useAuthStore } from '../../store/authStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDue(iso: string | null): { label: string; color: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (diff === 0)  return { label: 'Today',            color: '#F59E0B' }
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, color: '#EF4444' }
  if (diff === 1) return { label: 'Tomorrow',          color: '#6B7280' }
  return { label: formatDate(iso), color: '#6B7280' }
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_COLORS: Record<string, string> = {
  low:    '#6B7280',
  medium: '#F59E0B',
  high:   '#8B5CF6',
  urgent: '#EF4444',
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon, onPress, loading }: {
  label: string; value: number; color: string
  icon: keyof typeof Ionicons.glyphMap
  onPress?: () => void; loading?: boolean
}) {
  return (
    <Pressable
      style={S.kpiCard}
      onPress={onPress}
      android_ripple={onPress ? { color: '#E5E7EB' } : undefined}
    >
      <View style={S.kpiTop}>
        <Text style={S.kpiLabel}>{label}</Text>
        <Ionicons name={icon} size={15} color={color} style={{ opacity: 0.8 }} />
      </View>
      <Text style={[S.kpiValue, { color }]}>
        {loading ? '—' : value}
      </Text>
    </Pressable>
  )
}

// ─── Order Row ────────────────────────────────────────────────────────────────

function OrderRow({ order, onPress }: { order: DashboardOrder; onPress: () => void }) {
  const due = fmtDue(order.due_date)
  const sm = STATUS_META[order.status]
  const priorityColor = PRIORITY_COLORS[order.priority] ?? '#9CA3AF'

  return (
    <TouchableOpacity style={S.orderRow} onPress={onPress} activeOpacity={0.7}>
      <View style={S.orderLeft}>
        <Text style={S.orderIdBadge} numberOfLines={1}>#{order.title}</Text>
        <View style={S.orderBody}>
          <Text style={S.orderTitle} numberOfLines={1}>{order.title}</Text>
          <Text style={S.orderCustomer} numberOfLines={1}>
            {order.customer_name}
            {order.assigned_names?.length > 0 ? ` · ${order.assigned_names[0].split(' ')[0]}` : ''}
          </Text>
        </View>
      </View>
      <View style={S.orderRight}>
        {due && <Text style={[S.dueLabel, { color: due.color }]}>{due.label}</Text>}
        <View style={S.orderRightBottom}>
          <View style={[S.priorityDot, { backgroundColor: priorityColor }]} />
          <View style={[S.statusBadge, { backgroundColor: sm?.bg ?? '#F3F4F6' }]}>
            <Text style={[S.statusText, { color: sm?.color ?? '#6B7280' }]}>
              {sm?.label ?? order.status}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ title, count, children, onViewAll, emptyText }: {
  title: string; count: number; children?: React.ReactNode
  onViewAll?: () => void; emptyText: string
}) {
  return (
    <View style={S.section}>
      <View style={S.sectionHeader}>
        <View style={S.sectionTitleRow}>
          <Text style={S.sectionTitle}>{title}</Text>
          {count > 0 && (
            <View style={S.sectionBadge}>
              <Text style={S.sectionBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        {onViewAll && (
          <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
            <Text style={S.viewAll}>View all →</Text>
          </TouchableOpacity>
        )}
      </View>
      {count === 0 ? (
        <View style={S.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={28} color="#D1D5DB" />
          <Text style={S.emptyText}>{emptyText}</Text>
        </View>
      ) : children}
    </View>
  )
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ data, refreshing, onRefresh }: {
  data: TeamDashboard; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { stats } = data

  const go = (id: string) => router.push(`/order/${id}` as any)

  const kpis: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap; route?: string }[] = [
    { label: 'New Orders',      value: stats.new_orders,       color: '#6B7280', icon: 'add-circle-outline' },
    { label: 'Working',         value: stats.working_orders,   color: '#3B82F6', icon: 'hammer-outline' },
    { label: 'Completed',       value: stats.completed_today,  color: '#10B981', icon: 'checkmark-done-outline' },
    { label: 'Due Today',       value: stats.due_today,        color: '#F59E0B', icon: 'time-outline' },
    { label: 'Overdue',         value: stats.overdue,          color: '#EF4444', icon: 'alert-circle-outline' },
    { label: 'Unread Customer', value: stats.unread_customer,  color: '#8B5CF6', icon: 'chatbubble-outline' },
    { label: 'Stale (7+ days)', value: stats.stale_orders,     color: '#F97316', icon: 'hourglass-outline' },
  ]

  return (
    <ScrollView
      contentContainerStyle={[S.tabContent, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
    >
      <View style={S.kpiGrid}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </View>

      <SectionCard title="Due Today" count={(data.due_today_list ?? []).length} emptyText="No orders due today"
        onViewAll={() => router.push('/(app)/all-orders' as any)}>
        {(data.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>

      <SectionCard title="Overdue" count={(data.overdue_orders ?? []).length} emptyText="No overdue orders"
        onViewAll={() => router.push('/(app)/all-orders' as any)}>
        {(data.overdue_orders ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>

      <SectionCard title="Stale Orders" count={(data.stale_orders ?? []).length} emptyText="No stale orders">
        {(data.stale_orders ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>

      <SectionCard title="Unread Customer Messages" count={(data.unread_customer_orders ?? []).length} emptyText="No unread customer messages"
        onViewAll={() => router.push('/(app)/all-orders' as any)}>
        {(data.unread_customer_orders ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>
    </ScrollView>
  )
}

// ─── My Tab ───────────────────────────────────────────────────────────────────

function MyTab({ data, refreshing, onRefresh }: {
  data: MyDashboard; refreshing: boolean; onRefresh: () => void
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { stats } = data

  const go = (id: string) => router.push(`/order/${id}` as any)

  const kpis: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Assigned to Me',  value: stats.assigned_to_me,      color: '#6366F1', icon: 'person-outline' },
    { label: 'Due Today',       value: stats.due_today,            color: '#F59E0B', icon: 'time-outline' },
    { label: 'Overdue',         value: stats.overdue,              color: '#EF4444', icon: 'alert-circle-outline' },
    { label: 'Done',            value: stats.completed_this_week,  color: '#10B981', icon: 'checkmark-done-outline' },
    { label: 'Unread Customer', value: stats.unread_customer,      color: '#8B5CF6', icon: 'chatbubble-outline' },
  ]

  return (
    <ScrollView
      contentContainerStyle={[S.tabContent, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
    >
      <View style={S.kpiGrid}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </View>

      <SectionCard title="Due Today" count={(data.due_today_list ?? []).length} emptyText="No orders due today"
        onViewAll={() => router.push('/(app)/my-orders' as any)}>
        {(data.due_today_list ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>

      <SectionCard title="Overdue" count={(data.overdue_orders ?? []).length} emptyText="No overdue orders"
        onViewAll={() => router.push('/(app)/my-orders' as any)}>
        {(data.overdue_orders ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>

      <SectionCard title="Unread Customer Messages" count={(data.unread_customer_orders ?? []).length} emptyText="No unread customer messages"
        onViewAll={() => router.push('/(app)/my-orders' as any)}>
        {(data.unread_customer_orders ?? []).map(o => <OrderRow key={o.id} order={o} onPress={() => go(o.id)} />)}
      </SectionCard>
    </ScrollView>
  )
}

// ─── Data Hook ────────────────────────────────────────────────────────────────

function useDashboardData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(false)
    try { setData(await fetcher()) }
    catch { setError(true) }
    finally { setLoading(false); setRefreshing(false) }
  }, [fetcher])

  const silentRefresh = useCallback(async () => {
    try { setData(await fetcher()) } catch {}
  }, [fetcher])

  React.useEffect(() => {
    load()
    const t = setInterval(() => silentRefresh(), 60_000)
    return () => clearInterval(t)
  }, [load, silentRefresh])

  return { data, loading, error, refreshing, refresh: () => load(true), silentRefresh }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type TabKey = 'my' | 'team'

export default function DashboardScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabKey>('my')

  const team = useDashboardData<TeamDashboard>(dashboardService.getTeam)
  const my   = useDashboardData<MyDashboard>(dashboardService.getMe)

  const teamRef = useRef(team.silentRefresh)
  const myRef   = useRef(my.silentRefresh)
  teamRef.current = team.silentRefresh
  myRef.current   = my.silentRefresh

  useOrderSocket(useCallback(() => {
    teamRef.current()
    myRef.current()
  }, []))

  const active = activeTab === 'team' ? team : my

  return (
    <View style={[S.container, { paddingTop: insets.top }]}>
      {/* Header & Tabs */}
      <View style={S.header}>
        <View style={S.headerTop}>
          <Text style={S.headerTitle}>Dashboard</Text>
          <Text style={S.headerSub}>
            Welcome back, {user?.first_name ?? 'there'} · {formatDate(new Date().toISOString())}
          </Text>
        </View>

        <View style={S.tabBar}>
          {(['my', 'team'] as TabKey[]).map(t => (
            <Pressable
              key={t}
              style={[S.tabBtn, activeTab === t && S.tabBtnActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[S.tabLabel, activeTab === t && S.tabLabelActive]}>
                {t === 'team' ? 'Team Dashboard' : 'My Dashboard'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Content */}
      {active.loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : active.error ? (
        <View style={S.center}>
          <Ionicons name="cloud-offline-outline" size={48} color="#D1D5DB" />
          <Text style={S.errorText}>Failed to load dashboard</Text>
          <TouchableOpacity style={S.retryBtn} onPress={() => active.refresh()}>
            <Text style={S.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : activeTab === 'team' && team.data ? (
        <TeamTab data={team.data} refreshing={team.refreshing} onRefresh={team.refresh} />
      ) : activeTab === 'my' && my.data ? (
        <MyTab data={my.data} refreshing={my.refreshing} onRefresh={my.refresh} />
      ) : null}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F3F4F6' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  // Header
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 12,
  },
  headerTop: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, color: '#6B7280', marginTop: 4, fontWeight: '500' },

  // Tabs (Segmented Control Style)
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabLabelActive: { color: '#111827' },

  // Scrollable content
  tabContent: { padding: 16, gap: 16 },

  // KPI Grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    width: '30.5%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  kpiTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 },
  kpiValue: { fontSize: 30, fontWeight: '800', lineHeight: 34 },

  // Section
  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#111827' },
  sectionBadge: {
    backgroundColor: '#F3F4F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionBadgeText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  viewAll:          { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  emptyState:       { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyText:        { fontSize: 13, color: '#9CA3AF' },

  // Order Row
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  orderLeft:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  orderIdBadge:  { fontSize: 11.5, fontWeight: '700', color: '#2563EB', fontVariant: ['tabular-nums'], flexShrink: 0 },
  orderBody:     { flex: 1, minWidth: 0 },
  orderTitle:    { fontSize: 13, fontWeight: '600', color: '#111827' },
  orderCustomer: { fontSize: 11.5, color: '#6B7280', marginTop: 1 },
  orderRight:    { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  orderRightBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityDot:   { width: 7, height: 7, borderRadius: 4 },
  statusBadge:   { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  statusText:    { fontSize: 11, fontWeight: '600' },
  dueLabel:      { fontSize: 11, fontWeight: '600' },

  // Error / Retry
  errorText: { fontSize: 15, color: '#6B7280' },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#6366F1', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
