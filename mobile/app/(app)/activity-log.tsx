import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useState, useCallback, useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { apiClient } from '../../services/apiClient'
import { formatRelative } from '../../utils/date'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityEvent {
  id: string
  order_id: string
  order_number: number
  order_title: string
  type: string
  actor_name: string
  payload: Record<string, any>
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  yet_to_start: 'Yet to Start', working: 'Working',
  waiting_for_client: 'Waiting for Client', making: 'Making',
  done: 'Done', delivered: 'Delivered', cancelled: 'Cancelled',
}

function describeEvent(type: string, payload: Record<string, any>): string {
  switch (type) {
    case 'order_created':          return 'Created the order'
    case 'status_changed':         return `Status → ${STATUS_LABEL[payload.to] ?? payload.to}`
    case 'assignees_changed':      return 'Updated assignees'
    case 'due_date_changed':       return `Due date → ${payload.to ?? 'none'}`
    case 'priority_changed':       return `Priority → ${payload.to}`
    case 'order_updated':          return 'Updated order details'
    case 'attachment_added':       return `Added attachment${payload.name ? `: ${payload.name}` : ''}`
    case 'attachment_deleted':     return `Removed attachment`
    case 'comment_added': {
      const t = payload.text ?? ''
      return `Comment: "${t.length > 60 ? t.slice(0, 60) + '…' : t}"`
    }
    case 'customer_message':       return 'Customer sent a message'
    case 'customer_attachment':    return 'Customer uploaded attachment'
    case 'staff_portal_reply':     return 'Replied via portal'
    case 'portal_message_deleted': return 'Deleted portal message'
    case 'user_mentioned':         return `Mentioned ${payload.mentioned_name ?? 'a user'}`
    default:                       return type.replace(/_/g, ' ')
  }
}

type IoniconName = keyof typeof Ionicons.glyphMap

const EVENT_ICON: Record<string, { icon: IoniconName; color: string; bg: string }> = {
  order_created:          { icon: 'add-circle-outline',      color: '#6366F1', bg: '#EEF2FF' },
  status_changed:         { icon: 'swap-horizontal-outline', color: '#3B82F6', bg: '#EFF6FF' },
  assignees_changed:      { icon: 'people-outline',          color: '#8B5CF6', bg: '#F3E8FF' },
  due_date_changed:       { icon: 'calendar-outline',        color: '#F59E0B', bg: '#FFFBEB' },
  priority_changed:       { icon: 'flag-outline',            color: '#F97316', bg: '#FFF7ED' },
  order_updated:          { icon: 'create-outline',          color: '#6B7280', bg: '#F3F4F6' },
  attachment_added:       { icon: 'attach-outline',          color: '#10B981', bg: '#ECFDF5' },
  attachment_deleted:     { icon: 'trash-outline',           color: '#EF4444', bg: '#FEF2F2' },
  comment_added:          { icon: 'chatbubble-outline',      color: '#06B6D4', bg: '#ECFEFF' },
  customer_message:       { icon: 'chatbubbles-outline',     color: '#F59E0B', bg: '#FFFBEB' },
  customer_attachment:    { icon: 'image-outline',           color: '#F59E0B', bg: '#FFFBEB' },
  staff_portal_reply:     { icon: 'send-outline',            color: '#3B82F6', bg: '#EFF6FF' },
  portal_message_deleted: { icon: 'trash-outline',           color: '#EF4444', bg: '#FEF2F2' },
  user_mentioned:         { icon: 'at-outline',              color: '#8B5CF6', bg: '#F3E8FF' },
}
const DEFAULT_ICON = { icon: 'ellipse-outline' as IoniconName, color: '#6B7280', bg: '#F3F4F6' }

const formatTime = formatRelative

const LIMIT = 50

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ActivityLogScreen() {
  const insets = useSafeAreaInsets()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [orderInput, setOrderInput] = useState('')
  const [appliedOrder, setAppliedOrder] = useState('')

  const fetchData = useCallback(async (pg: number, orderId: string, append: boolean) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    setError(false)
    try {
      const params: Record<string, string> = { page: String(pg), limit: String(LIMIT) }
      if (orderId) params.title = orderId
      const res = await apiClient.get<{ events: ActivityEvent[]; total: number; page: number }>('/admin/activity', { params })
      const data = res.data
      setEvents(prev => append ? [...prev, ...(data.events ?? [])] : (data.events ?? []))
      setTotal(data.total)
      setPage(pg)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { fetchData(1, '', false) }, [fetchData])

  const applyFilter = () => {
    const id = orderInput.trim()
    setAppliedOrder(id)
    setEvents([])
    fetchData(1, id, false)
  }

  const clearFilter = () => {
    setOrderInput('')
    setAppliedOrder('')
    setEvents([])
    fetchData(1, '', false)
  }

  const hasMore = events.length < total

  const renderItem = ({ item, index }: { item: ActivityEvent; index: number }) => {
    const meta = EVENT_ICON[item.type] ?? DEFAULT_ICON
    return (
      <View style={[S.row, index === events.length - 1 && { borderBottomWidth: 0 }]}>
        <View style={[S.iconCircle, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={15} color={meta.color} />
        </View>
        <View style={S.rowBody}>
          <View style={S.rowTop}>
            <Text style={S.actor} numberOfLines={1}>{item.actor_name}</Text>
            <Text style={S.desc} numberOfLines={2}>{describeEvent(item.type, item.payload)}</Text>
          </View>
          <View style={S.rowMeta}>
            <Text style={S.orderNum}>#{item.order_title}</Text>
          </View>
        </View>
        <Text style={S.time}>{formatTime(item.created_at)}</Text>
      </View>
    )
  }

  return (
    <View style={[S.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.navigate('/(app)/settings' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Activity Log</Text>
        <TouchableOpacity onPress={() => fetchData(1, appliedOrder, false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh-outline" size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Filter */}
      <View style={S.filterRow}>
        <View style={S.searchBox}>
          <TextInput
            style={S.searchInput}
            placeholder="Search by Order ID…"
            placeholderTextColor="#9CA3AF"
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            value={orderInput}
            onChangeText={setOrderInput}
            onSubmitEditing={applyFilter}
            returnKeyType="search"
          />
          {orderInput.length > 0 && (
            <TouchableOpacity onPress={clearFilter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={17} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={S.filterBtn} onPress={applyFilter} activeOpacity={0.8}>
          <Text style={S.filterBtnText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {appliedOrder ? (
        <View style={S.activeFilter}>
          <Text style={S.activeFilterText} numberOfLines={1}>Order ID: {appliedOrder}</Text>
          <TouchableOpacity onPress={clearFilter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color="#6366F1" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Content */}
      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : error ? (
        <View style={S.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={S.errorText}>Failed to load activity log</Text>
          <TouchableOpacity style={S.retryBtn} onPress={() => fetchData(1, appliedOrder, false)}>
            <Text style={S.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          style={S.list}
          ListEmptyComponent={
            <View style={S.center}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No activity found.</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={S.loadMore}
                onPress={() => fetchData(page + 1, appliedOrder, true)}
                disabled={loadingMore}
                activeOpacity={0.7}
              >
                {loadingMore
                  ? <ActivityIndicator size="small" color="#6366F1" />
                  : <Text style={S.loadMoreText}>Load more ({total - events.length} remaining)</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', paddingVertical: 8 },
  filterBtn: { backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  filterBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  activeFilter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEF2FF' },
  activeFilterText: { flex: 1, fontSize: 12.5, color: '#4338CA', fontWeight: '600' },

  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  errorText: { fontSize: 14, color: '#EF4444' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  retryText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center' },
  actor: { fontSize: 13, fontWeight: '700', color: '#111827' },
  desc: { fontSize: 13, color: '#4B5563', flex: 1 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  orderNum: { fontSize: 11.5, fontWeight: '700', color: '#6366F1', fontVariant: ['tabular-nums'] },
  orderTitle: { fontSize: 11.5, color: '#9CA3AF', flex: 1 },
  time: { fontSize: 11, color: '#9CA3AF', flexShrink: 0, textAlign: 'right', marginTop: 2 },

  loadMore: { alignItems: 'center', paddingVertical: 16 },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
})
