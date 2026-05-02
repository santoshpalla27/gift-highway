import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { apiClient } from '../../services/apiClient'
import { useAuthStore } from '../../store/authStore'

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

const FILTERS: { key: StatusFilter; label: string; color: string; bg: string }[] = [
  { key: 'all',         label: 'All',         color: '#6B7280', bg: '#F3F4F6' },
  { key: 'new',         label: 'New',         color: '#6B7280', bg: '#F3F4F6' },
  { key: 'in_progress', label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
  { key: 'completed',   label: 'Completed',   color: '#10B981', bg: '#ECFDF5' },
]

function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

// Always show in status color — matches StatusBadge style throughout the app
function CountBadge({ value, color, bg, onPress }: { value: number; color: string; bg: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      onPress={value > 0 ? onPress : undefined}
      activeOpacity={value > 0 ? 0.7 : 1}
      style={[M.countBadge, { backgroundColor: bg, opacity: value === 0 ? 0.4 : 1 }]}
    >
      <View style={[M.countDot, { backgroundColor: color }]} />
      <Text style={[M.countNum, { color }]}>{value}</Text>
    </TouchableOpacity>
  )
}

export default function AdminMetricsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const [users, setUsers] = useState<UserMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') { router.back(); return }
    fetchMetrics()
  }, [])

  const fetchMetrics = () => {
    setLoading(true); setError(false)
    apiClient.get<{ users: UserMetric[] }>('/admin/metrics/users')
      .then(r => setUsers(r.data.users))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  const goToOrders = (userId: string, status?: string) => {
    const params: Record<string, string> = { assignee: userId }
    if (status) params.status = status
    router.push({ pathname: '/(app)/all-orders', params } as any)
  }

  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter === 'new') return u.new_count > 0
    if (statusFilter === 'in_progress') return u.in_progress_count > 0
    if (statusFilter === 'completed') return u.completed_count > 0
    return true
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

  return (
    <View style={[M.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={M.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={M.headerTitle}>User Metrics</Text>
        <TouchableOpacity onPress={fetchMetrics} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh-outline" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Summary strip */}
      {!loading && !error && (
        <View style={M.summaryStrip}>
          {[
            { label: 'Total',    value: totals.total,       color: '#6366F1', bg: '#EEF2FF' },
            { label: 'New',      value: totals.new,         color: '#6B7280', bg: '#F3F4F6' },
            { label: 'In Prog.', value: totals.in_progress, color: '#3B82F6', bg: '#EFF6FF' },
            { label: 'Done',     value: totals.completed,   color: '#10B981', bg: '#ECFDF5' },
          ].map(s => (
            <View key={s.label} style={[M.summaryItem, { backgroundColor: s.bg }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.color }} />
                <Text style={[M.summaryLabel, { color: s.color }]}>{s.label}</Text>
              </View>
              <Text style={[M.summaryValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={M.searchRow}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={M.searchInput}
          placeholder="Search by name or email…"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={M.chipScroll} contentContainerStyle={M.chipRow}>
        {FILTERS.map(f => {
          const active = statusFilter === f.key
          const hasColor = f.key !== 'all'
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                M.chip,
                active && hasColor && { backgroundColor: f.bg, borderColor: f.color },
                active && !hasColor && { backgroundColor: '#F3F4F6', borderColor: '#6B7280' },
              ]}
              onPress={() => setStatusFilter(f.key)}
              activeOpacity={0.7}
            >
              {active && hasColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: f.color }} />}
              <Text style={[M.chipText, active && { color: hasColor ? f.color : '#374151', fontWeight: '700' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={M.center}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : error ? (
        <View style={M.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={M.errorText}>Failed to load metrics.</Text>
          <TouchableOpacity onPress={fetchMetrics} style={M.retryBtn}>
            <Text style={M.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={M.list}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <View style={M.center}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No users match this filter.</Text>
            </View>
          ) : (
            filtered.map(u => (
              <View key={u.id} style={M.card}>
                {/* User info */}
                <View style={M.cardTop}>
                  <View style={M.avatar}>
                    <Text style={M.avatarText}>{getInitials(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={M.userName} numberOfLines={1}>{u.name}</Text>
                      {u.role === 'admin' && (
                        <View style={M.adminChip}>
                          <Text style={M.adminChipText}>Admin</Text>
                        </View>
                      )}
                      {!u.is_active && (
                        <View style={M.inactiveChip}>
                          <Text style={M.inactiveChipText}>Inactive</Text>
                        </View>
                      )}
                    </View>
                    <Text style={M.userEmail} numberOfLines={1}>{u.email}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => goToOrders(u.id)}
                    style={M.viewBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={M.viewBtnText}>Orders</Text>
                    <Ionicons name="chevron-forward" size={14} color="#6366F1" />
                  </TouchableOpacity>
                </View>

                {/* Counts row — always colored like status chips */}
                <View style={M.countsRow}>
                  {[
                    { label: 'Total',    value: u.total_assigned,    color: '#6366F1', bg: '#EEF2FF', status: undefined },
                    { label: 'New',      value: u.new_count,         color: '#6B7280', bg: '#F3F4F6', status: 'new' },
                    { label: 'In Prog.', value: u.in_progress_count, color: '#3B82F6', bg: '#EFF6FF', status: 'in_progress' },
                    { label: 'Done',     value: u.completed_count,   color: '#10B981', bg: '#ECFDF5', status: 'completed' },
                  ].map((col, idx, arr) => (
                    <View key={col.label} style={{ flexDirection: 'row', flex: 1 }}>
                      <View style={M.countCol}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }}>
                          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: col.color }} />
                          <Text style={[M.countLabel, { color: col.color }]}>{col.label}</Text>
                        </View>
                        <CountBadge value={col.value} color={col.color} bg={col.bg} onPress={() => goToOrders(u.id, col.status)} />
                      </View>
                      {idx < arr.length - 1 && <View style={M.countDivider} />}
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

const M = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  summaryStrip: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9', gap: 0,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },

  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },

  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  errorText: { fontSize: 14, color: '#EF4444', marginTop: 12 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  retryText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  userName: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  userEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  adminChip: { backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  adminChipText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  inactiveChip: { backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  inactiveChipText: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  viewBtnText: { fontSize: 12.5, fontWeight: '600', color: '#6366F1' },

  countsRow: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  countCol: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  countLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  countDivider: { width: 1, backgroundColor: '#F1F5F9' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, minWidth: 34, alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center' },
  countDot: { width: 5, height: 5, borderRadius: 2.5 },
  countNum: { fontSize: 14, fontWeight: '700' },
})
