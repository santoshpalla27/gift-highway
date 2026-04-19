import React, { useState, useEffect, useCallback } from 'react'
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

// ─── Helpers ─────────────────────────────────────────────────────────────────


function fmtDue(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true }
  if (diff === 0) return { label: 'Due today', overdue: false }
  if (diff === 1) return { label: 'Due tomorrow', overdue: false }
  return {
    label: new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false,
  }
}

const STATUS_COLORS: Record<string, string> = {
  new: '#6366F1',
  working: '#3B82F6',
  completed: '#10B981',
  cancelled: '#6B7280',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  urgent: '#DC2626',
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number
  color: string
  icon: keyof typeof Ionicons.glyphMap
  onPress?: () => void
}

function KpiCard({ label, value, color, icon, onPress }: KpiCardProps) {
  return (
    <Pressable
      style={[S.kpiCard, onPress && S.kpiCardTappable]}
      onPress={onPress}
      android_ripple={onPress ? { color: '#E5E7EB' } : undefined}
    >
      <View style={[S.kpiIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[S.kpiValue, { color }]}>{value}</Text>
      <Text style={S.kpiLabel}>{label}</Text>
    </Pressable>
  )
}

// ─── Order Row ───────────────────────────────────────────────────────────────

function OrderRow({ order, onPress }: { order: DashboardOrder; onPress: () => void }) {
  const due = fmtDue(order.due_date)
  const priorityColor = PRIORITY_COLORS[order.priority] ?? '#6B7280'
  const statusColor = STATUS_COLORS[order.status] ?? '#6B7280'

  return (
    <TouchableOpacity style={S.orderRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[S.priorityDot, { backgroundColor: priorityColor }]} />
      <View style={S.orderInfo}>
        <View style={S.orderTitleRow}>
          <Text style={S.orderNum}>#{order.order_number}</Text>
          <Text style={S.orderTitle} numberOfLines={1}>{order.title}</Text>
        </View>
        <Text style={S.orderCustomer} numberOfLines={1}>{order.customer_name}</Text>
        {order.assigned_names.length > 0 && (
          <Text style={S.orderAssigned} numberOfLines={1}>
            {order.assigned_names.join(', ')}
          </Text>
        )}
      </View>
      <View style={S.orderMeta}>
        <View style={[S.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[S.statusText, { color: statusColor }]}>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Text>
        </View>
        {due && (
          <Text style={[S.dueLabel, due.overdue && S.dueLabelOverdue]}>
            {due.label}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ─── Section Card ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  count,
  children,
  emptyText,
}: {
  title: string
  count: number
  children: React.ReactNode
  emptyText: string
}) {
  return (
    <View style={S.section}>
      <View style={S.sectionHeader}>
        <Text style={S.sectionTitle}>{title}</Text>
        {count > 0 && (
          <View style={S.sectionBadge}>
            <Text style={S.sectionBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      {count === 0 ? (
        <View style={S.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={32} color="#D1D5DB" />
          <Text style={S.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        children
      )}
    </View>
  )
}

// ─── Team Tab ────────────────────────────────────────────────────────────────

function TeamTab({
  data,
  refreshing,
  onRefresh,
}: {
  data: TeamDashboard
  refreshing: boolean
  onRefresh: () => void
}) {
  const router = useRouter()
  const { stats } = data

  function goToOrder(id: string) {
    router.push(`/order/${id}` as any)
  }

  return (
    <ScrollView
      contentContainerStyle={S.tabContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
    >
      {/* KPI Grid */}
      <View style={S.kpiGrid}>
        <KpiCard label="New" value={stats.new_orders} color="#6366F1" icon="add-circle-outline" />
        <KpiCard label="Working" value={stats.working_orders} color="#3B82F6" icon="hammer-outline" />
        <KpiCard label="Done Today" value={stats.completed_today} color="#10B981" icon="checkmark-done-outline" />
        <KpiCard label="Overdue" value={stats.overdue} color="#EF4444" icon="alert-circle-outline" />
        <KpiCard label="Due Today" value={stats.due_today} color="#F59E0B" icon="time-outline" />
        <KpiCard label="Unread" value={stats.unread_customer} color="#8B5CF6" icon="chatbubble-outline" />
        <KpiCard label="Stale" value={stats.stale_orders} color="#6B7280" icon="hourglass-outline" />
      </View>

      {/* Due Today */}
      <SectionCard title="Due Today" count={(data.due_today_list ?? []).length} emptyText="No orders due today">
        {(data.due_today_list ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>

      {/* Stale Orders */}
      <SectionCard title="Stale Orders" count={(data.stale_orders ?? []).length} emptyText="No stale orders">
        {(data.stale_orders ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>

      {/* Unread Customer Orders */}
      <SectionCard
        title="Unread Customer Messages"
        count={(data.unread_customer_orders ?? []).length}
        emptyText="No unread customer messages"
      >
        {(data.unread_customer_orders ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>
    </ScrollView>
  )
}

// ─── My Tab ──────────────────────────────────────────────────────────────────

function MyTab({
  data,
  refreshing,
  onRefresh,
}: {
  data: MyDashboard
  refreshing: boolean
  onRefresh: () => void
}) {
  const router = useRouter()
  const { stats } = data

  function goToOrder(id: string) {
    router.push(`/order/${id}` as any)
  }

  return (
    <ScrollView
      contentContainerStyle={S.tabContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
    >
      {/* KPI Grid */}
      <View style={S.kpiGrid}>
        <KpiCard label="Assigned" value={stats.assigned_to_me} color="#6366F1" icon="person-outline" />
        <KpiCard label="Due Today" value={stats.due_today} color="#F59E0B" icon="time-outline" />
        <KpiCard label="Overdue" value={stats.overdue} color="#EF4444" icon="alert-circle-outline" />
        <KpiCard label="Done This Week" value={stats.completed_this_week} color="#10B981" icon="checkmark-done-outline" />
        <KpiCard label="Unread" value={stats.unread_customer} color="#8B5CF6" icon="chatbubble-outline" />
      </View>

      {/* Due Today */}
      <SectionCard title="Due Today" count={(data.due_today_list ?? []).length} emptyText="No orders due today">
        {(data.due_today_list ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>

      {/* Overdue */}
      <SectionCard title="Overdue" count={(data.overdue_orders ?? []).length} emptyText="No overdue orders">
        {(data.overdue_orders ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>

      {/* Unread Customer Messages */}
      <SectionCard title="Unread Customer Messages" count={(data.unread_customer_orders ?? []).length} emptyText="No unread customer messages">
        {(data.unread_customer_orders ?? []).map(o => (
          <OrderRow key={o.id} order={o} onPress={() => goToOrder(o.id)} />
        ))}
      </SectionCard>

    </ScrollView>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type TabKey = 'team' | 'my'

function useDashboardData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(false)
    try {
      const result = await fetcher()
      setData(result)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetcher])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 60_000)
    return () => clearInterval(interval)
  }, [load])

  return { data, loading, error, refreshing, refresh: () => load(true) }
}

export default function DashboardScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('team')

  const team = useDashboardData<TeamDashboard>(dashboardService.getTeam)
  const my = useDashboardData<MyDashboard>(dashboardService.getMe)

  const active = activeTab === 'team' ? team : my

  return (
    <View style={S.container}>
      {/* Segmented Control */}
      <View style={S.segmentWrap}>
        <View style={S.segment}>
          <TouchableOpacity
            style={[S.segBtn, activeTab === 'team' && S.segBtnActive]}
            onPress={() => setActiveTab('team')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={activeTab === 'team' ? '#fff' : '#6B7280'}
            />
            <Text style={[S.segLabel, activeTab === 'team' && S.segLabelActive]}>
              Team
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.segBtn, activeTab === 'my' && S.segBtnActive]}
            onPress={() => setActiveTab('my')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="person-outline"
              size={15}
              color={activeTab === 'my' ? '#fff' : '#6B7280'}
            />
            <Text style={[S.segLabel, activeTab === 'my' && S.segLabelActive]}>
              My Dashboard
            </Text>
          </TouchableOpacity>
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#6B7280',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // Segment
  segmentWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  segBtnActive: {
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  segLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segLabelActive: {
    color: '#fff',
  },

  // Tab content
  tabContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '30.5%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiCardTappable: {
    // extra visual cue applied via Pressable
  },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },

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
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  sectionBadge: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  sectionBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // Order Row
  orderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  orderInfo: {
    flex: 1,
    gap: 2,
  },
  orderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
    flexShrink: 0,
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  orderCustomer: {
    fontSize: 12,
    color: '#6B7280',
  },
  orderAssigned: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  orderMeta: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dueLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  dueLabelOverdue: {
    color: '#EF4444',
    fontWeight: '600',
  },

})
