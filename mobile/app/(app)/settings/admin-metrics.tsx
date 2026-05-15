import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
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
  cancelled_count: number
}



function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}
function getActive(u: UserMetric)  { return u.working_count + u.making_count }
function getPending(u: UserMetric) { return u.new_count + u.waiting_for_client_count }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, sublabel, color }: {
  label: string; value: number; sublabel: string; color: string
}) {
  return (
    <View style={M.statTile}>
      <Text style={[M.statValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={M.statLabel}>{label}</Text>
      <Text style={M.statSublabel}>{sublabel}</Text>
    </View>
  )
}


// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminMetricsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const [users, setUsers] = useState<UserMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') { router.navigate('/(app)/settings' as any); return }
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
    return true
  })

  const totalOrders  = users.reduce((s, u) => s + u.total_assigned, 0)
  const totalActive  = users.reduce((s, u) => s + getActive(u), 0)
  const totalPending = users.reduce((s, u) => s + getPending(u), 0)

  return (
    <View style={[M.screen, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={M.header}>
        <TouchableOpacity onPress={() => router.navigate('/(app)/settings' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={M.headerTitle}>User Metrics</Text>
        <TouchableOpacity onPress={fetchMetrics} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh-outline" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

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
          {/* Summary tiles — 2 × 2 grid */}
          <View style={M.statRow}>
            <StatTile
              label="Team Members"
              value={users.length}
              sublabel={`${users.filter(u => u.is_active).length} active`}
              color="#111827"
            />
            <StatTile
              label="Total Orders"
              value={totalOrders}
              sublabel="all members"
              color="#6366F1"
            />
          </View>
          <View style={[M.statRow, { marginBottom: 16 }]}>
            <StatTile
              label="In Progress"
              value={totalActive}
              sublabel="working + making"
              color="#3B82F6"
            />
            <StatTile
              label="Needs Attention"
              value={totalPending}
              sublabel="new + waiting"
              color="#F59E0B"
            />
          </View>

          {/* Result count */}
          <Text style={M.userCount}>{filtered.length} of {users.length} members</Text>

          {filtered.length === 0 ? (
            <View style={M.center}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No users match this filter.</Text>
            </View>
          ) : (
            filtered.map(u => {
              const cols = [
                { label: 'Total',     value: u.total_assigned,           color: '#6366F1', status: undefined        },
                { label: 'New',       value: u.new_count,                color: '#6B7280', status: 'yet_to_start'       },
                { label: 'Working',   value: u.working_count,            color: '#3B82F6', status: 'working'            },
                { label: 'Waiting',   value: u.waiting_for_client_count, color: '#F59E0B', status: 'waiting_for_client' },
                { label: 'Making',    value: u.making_count,             color: '#8B5CF6', status: 'making'             },
                { label: 'Done',      value: u.done_count,               color: '#10B981', status: 'done'               },
                { label: 'Delivered', value: u.delivered_count,          color: '#0D9488', status: 'delivered'          },
                { label: 'Cancelled', value: u.cancelled_count,          color: '#EF4444', status: 'cancelled'          },
              ]
              return (
                <View key={u.id} style={M.card}>

                  {/* User row */}
                  <View style={M.cardTop}>
                    <View style={M.avatar}>
                      <Text style={M.avatarText}>{getInitials(u.name)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={M.userName} numberOfLines={1}>{u.name}</Text>
                        {u.role === 'admin' && (
                          <View style={M.adminChip}><Text style={M.adminChipText}>Admin</Text></View>
                        )}
                        {!u.is_active && (
                          <View style={M.inactiveChip}><Text style={M.inactiveChipText}>Inactive</Text></View>
                        )}
                      </View>
                      <Text style={M.userEmail} numberOfLines={1}>{u.email}</Text>
                    </View>
                    <TouchableOpacity onPress={() => goToOrders(u.id)} style={M.viewBtn} activeOpacity={0.7}>
                      <Text style={M.viewBtnText}>Orders</Text>
                      <Ionicons name="chevron-forward" size={14} color="#6366F1" />
                    </TouchableOpacity>
                  </View>

{/* Counts grid — 4 per row, 2 rows */}
                  <View style={M.countsGrid}>
                    {cols.map((col, idx) => (
                      <TouchableOpacity
                        key={col.label}
                        onPress={() => col.value > 0 && col.status ? goToOrders(u.id, col.status) : undefined}
                        activeOpacity={col.value > 0 && col.status ? 0.6 : 1}
                        style={[
                          M.countCol,
                          idx < 4 && { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
                          idx % 4 !== 3 && { borderRightWidth: 1, borderRightColor: '#F1F5F9' },
                        ]}
                      >
                        <Text style={[M.countLabel, { color: col.color, opacity: col.value === 0 ? 0.35 : 1 }]}>
                          {col.label}
                        </Text>
                        <Text style={[M.countNum, { color: col.value > 0 ? col.color : '#9CA3AF', opacity: col.value === 0 ? 0.35 : 1 }]}>
                          {col.value}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                </View>
              )
            })
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

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },


  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  errorText: { fontSize: 14, color: '#EF4444', marginTop: 12 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  retryText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Summary tiles
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statTile: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  statValue:   { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  statLabel:   { fontSize: 12.5, fontWeight: '600', color: '#111827', marginTop: 5 },
  statSublabel:{ fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  userCount: { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },

  // Cards
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText:      { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  userName:        { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  userEmail:       { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  adminChip:       { backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  adminChipText:   { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  inactiveChip:    { backgroundColor: '#F3F4F6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  inactiveChipText:{ fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  viewBtn:         { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  viewBtnText:     { fontSize: 12.5, fontWeight: '600', color: '#6366F1' },


  // Count columns
  countsGrid:   { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  countCol:     { width: '25%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  countLabel:   { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 },
  countNum:     { fontSize: 20, fontWeight: '800' },
})
