import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, ScrollView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { apiClient } from '../../../services/apiClient'
import { formatRelative, formatDate } from '../../../utils/date'

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

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'order_created',      label: 'Order Created' },
  { value: 'comment_added',      label: 'Comment' },
  { value: 'attachment_added',   label: 'Attachment Added' },
  { value: 'attachment_deleted', label: 'Attachment Deleted' },
  { value: 'status_changed',     label: 'Status Change' },
  { value: 'assignees_changed',  label: 'Assignee Change' },
  { value: 'due_date_changed',   label: 'Due Date Change' },
  { value: 'priority_changed',   label: 'Priority Change' },
  { value: 'order_updated',      label: 'Order Update' },
  { value: 'user_mentioned',     label: 'Mention' },
]

interface SheetFilters { eventType: string; dateFrom: string; dateTo: string }
const emptySheetFilters: SheetFilters = { eventType: '', dateFrom: '', dateTo: '' }

function FilterSheet({ visible, filters, onApply, onClose }: {
  visible: boolean
  filters: SheetFilters
  onApply: (f: SheetFilters) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = React.useState<SheetFilters>(filters)
  const [showFromPicker, setShowFromPicker] = React.useState(false)
  const [showToPicker, setShowToPicker]     = React.useState(false)
  const [tempDate, setTempDate]             = React.useState(new Date())
  const [activePick, setActivePick]         = React.useState<'from'|'to'>('from')

  React.useEffect(() => { if (visible) setDraft(filters) }, [visible, filters])

  const set = (patch: Partial<SheetFilters>) => setDraft(d => ({ ...d, ...patch }))

  const openPicker = (field: 'from'|'to') => {
    const val = field === 'from' ? draft.dateFrom : draft.dateTo
    setTempDate(val ? new Date(val + 'T00:00:00') : new Date())
    setActivePick(field)
    if (field === 'from') setShowFromPicker(true)
    else setShowToPicker(true)
  }

  const confirmDate = (d: Date) => {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (activePick === 'from') { set({ dateFrom: iso }); setShowFromPicker(false) }
    else                       { set({ dateTo:   iso }); setShowToPicker(false)   }
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(filters)
  const activeCount = [draft.eventType, draft.dateFrom, draft.dateTo].filter(Boolean).length

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[FS.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={FS.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={FS.title}>Filters</Text>
          <TouchableOpacity onPress={() => setDraft(emptySheetFilters)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[FS.clearBtn, activeCount === 0 && { opacity: 0.3 }]}>Clear all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 80, 40) }}>
          {/* Event Type */}
          <Text style={FS.sectionLabel}>EVENT TYPE</Text>
          <TouchableOpacity style={[FS.option, !draft.eventType && FS.optionActive]} onPress={() => set({ eventType: '' })}>
            <Text style={[FS.optionText, !draft.eventType && FS.optionTextActive]}>All events</Text>
            {!draft.eventType && <Ionicons name="checkmark" size={16} color="#6366F1" />}
          </TouchableOpacity>
          {EVENT_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[FS.option, draft.eventType === opt.value && FS.optionActive]}
              onPress={() => set({ eventType: opt.value })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[FS.dot, { backgroundColor: (EVENT_ICON[opt.value] ?? DEFAULT_ICON).color }]} />
                <Text style={[FS.optionText, draft.eventType === opt.value && FS.optionTextActive]}>{opt.label}</Text>
              </View>
              {draft.eventType === opt.value && <Ionicons name="checkmark" size={16} color="#6366F1" />}
            </TouchableOpacity>
          ))}

          {/* Date Range */}
          <Text style={[FS.sectionLabel, { marginTop: 20 }]}>DATE RANGE</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['from', 'to'] as const).map(field => {
              const val = field === 'from' ? draft.dateFrom : draft.dateTo
              return (
                <TouchableOpacity key={field} style={[FS.dateBtn, val && FS.dateBtnActive]} onPress={() => openPicker(field)}>
                  <Ionicons name="calendar-outline" size={14} color={val ? '#6366F1' : '#9CA3AF'} />
                  <Text style={[FS.dateBtnText, val && { color: '#4338CA' }]}>
                    {val ? formatDate(val) : field === 'from' ? 'From date' : 'To date'}
                  </Text>
                  {val && (
                    <TouchableOpacity onPress={() => set(field === 'from' ? { dateFrom: '' } : { dateTo: '' })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* iOS date picker modal */}
          {Platform.OS === 'ios' && (showFromPicker || showToPicker) && (
            <Modal visible transparent animationType="slide" onRequestClose={() => { setShowFromPicker(false); setShowToPicker(false) }}>
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <TouchableOpacity onPress={() => { setShowFromPicker(false); setShowToPicker(false) }}>
                      <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDate(tempDate)}>
                      <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker value={tempDate} mode="date" display="spinner" maximumDate={new Date()}
                    onChange={(_, d) => { if (d) setTempDate(d) }} style={{ width: '100%', height: 216 }} />
                </View>
              </View>
            </Modal>
          )}
          {/* Android date pickers */}
          {Platform.OS === 'android' && showFromPicker && (
            <DateTimePicker value={tempDate} mode="date" display="default" maximumDate={new Date()}
              onChange={(ev, d) => { setShowFromPicker(false); if (ev.type === 'set' && d) confirmDate(d) }} />
          )}
          {Platform.OS === 'android' && showToPicker && (
            <DateTimePicker value={tempDate} mode="date" display="default" maximumDate={new Date()}
              onChange={(ev, d) => { setShowToPicker(false); if (ev.type === 'set' && d) confirmDate(d) }} />
          )}
        </ScrollView>

        {/* Apply */}
        <View style={[FS.footer, { paddingBottom: Math.max(insets.bottom + 16, 20) }]}>
          <TouchableOpacity
            style={[FS.applyBtn, !hasChanges && { opacity: 0.5 }]}
            onPress={() => { onApply(draft); onClose() }}
            disabled={!hasChanges}
          >
            <Text style={FS.applyText}>{activeCount > 0 ? `Apply ${activeCount} filter${activeCount !== 1 ? 's' : ''}` : 'Apply'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const FS = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#F9FAFB' },
  header:          {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:           { fontSize: 18, fontWeight: '800', color: '#111827' },
  clearBtn:        { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginBottom: 10 },
  option:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 10, borderRadius: 8 },
  optionActive:    { backgroundColor: '#EEF2FF' },
  optionText:      { fontSize: 14, color: '#374151' },
  optionTextActive:{ color: '#4338CA', fontWeight: '600' },
  dot:             { width: 8, height: 8, borderRadius: 4 },
  dateBtn:         {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff',
  },
  dateBtnActive:   { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  dateBtnText:     { flex: 1, fontSize: 13, color: '#9CA3AF' },
  footer:          { paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  applyBtn:        { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyText:       { fontSize: 15, fontWeight: '700', color: '#fff' },
})

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
  const [sheetFilters, setSheetFilters] = useState<SheetFilters>(emptySheetFilters)
  const [showFilter, setShowFilter] = useState(false)

  const fetchData = useCallback(async (pg: number, orderId: string, evType: string, dFrom: string, dTo: string, append: boolean) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    setError(false)
    try {
      const params: Record<string, string> = { page: String(pg), limit: String(LIMIT) }
      if (orderId) params.title = orderId
      if (evType) params.event_type = evType
      if (dFrom) params.date_from = dFrom
      if (dTo) params.date_to = dTo
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

  useEffect(() => { fetchData(1, '', '', '', '', false) }, [fetchData])

  const { eventType, dateFrom: filterDateFrom, dateTo: filterDateTo } = sheetFilters

  const applyFilter = () => {
    const id = orderInput.trim()
    setAppliedOrder(id)
    setEvents([])
    fetchData(1, id, eventType, filterDateFrom, filterDateTo, false)
  }

  const clearFilter = () => {
    setOrderInput('')
    setAppliedOrder('')
    setSheetFilters(emptySheetFilters)
    setEvents([])
    fetchData(1, '', '', '', '', false)
  }

  const hasMore = events.length < total
  const hasSheetFilters = !!(eventType || filterDateFrom || filterDateTo)

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
        <TouchableOpacity onPress={() => fetchData(1, appliedOrder, eventType, filterDateFrom, filterDateTo, false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
            <TouchableOpacity onPress={() => { setOrderInput(''); setAppliedOrder(''); fetchData(1, '', eventType, filterDateFrom, filterDateTo, false) }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={17} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[S.etBtn, hasSheetFilters && S.etBtnActive]}
          onPress={() => setShowFilter(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="options-outline" size={16} color={hasSheetFilters ? '#6366F1' : '#6B7280'} />
        </TouchableOpacity>
        <TouchableOpacity style={S.filterBtn} onPress={applyFilter} activeOpacity={0.8}>
          <Text style={S.filterBtnText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {(appliedOrder || hasSheetFilters) ? (
        <View style={S.activeFilter}>
          {appliedOrder ? <Text style={S.activeFilterText} numberOfLines={1}>Order: {appliedOrder}</Text> : null}
          {eventType ? <Text style={S.activeFilterText} numberOfLines={1}>{EVENT_TYPE_OPTIONS.find(o => o.value === eventType)?.label ?? eventType}</Text> : null}
          {filterDateFrom ? <Text style={S.activeFilterText} numberOfLines={1}>From {formatDate(filterDateFrom)}</Text> : null}
          {filterDateTo   ? <Text style={S.activeFilterText} numberOfLines={1}>To {formatDate(filterDateTo)}</Text>   : null}
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
          <TouchableOpacity style={S.retryBtn} onPress={() => fetchData(1, appliedOrder, eventType, filterDateFrom, filterDateTo, false)}>
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
                onPress={() => fetchData(page + 1, appliedOrder, eventType, filterDateFrom, filterDateTo, true)}
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

      <FilterSheet
        visible={showFilter}
        filters={sheetFilters}
        onApply={f => { setSheetFilters(f); setEvents([]); fetchData(1, appliedOrder, f.eventType, f.dateFrom, f.dateTo, false) }}
        onClose={() => setShowFilter(false)}
      />
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
  etBtn:     { width: 36, height: 36, borderRadius: 8, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  etBtnActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
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
