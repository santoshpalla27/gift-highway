import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, StatusBar,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notificationService, type FlatActivityEvent } from '../../services/notificationService'
import { formatRelative } from '../../utils/date'

// ── Event metadata ────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  customer_message:    { label: 'Customer Message', icon: 'chatbubble-outline',       color: '#6366F1' },
  customer_attachment: { label: 'Customer File',    icon: 'attach-outline',           color: '#10B981' },
  comment_added:       { label: 'Comment',          icon: 'chatbubbles-outline',       color: '#6B7280' },
  attachment_added:    { label: 'Attachment',       icon: 'document-attach-outline',   color: '#6B7280' },
  status_changed:      { label: 'Status Change',    icon: 'checkmark-circle-outline',  color: '#3B82F6' },
  assignees_changed:   { label: 'Assignee Change',  icon: 'people-outline',            color: '#8B5CF6' },
  due_date_changed:    { label: 'Due Date Change',  icon: 'calendar-outline',          color: '#F59E0B' },
  priority_changed:    { label: 'Priority Change',  icon: 'layers-outline',            color: '#EC4899' },
  staff_portal_reply:  { label: 'Portal Reply',     icon: 'return-up-back-outline',    color: '#14B8A6' },
  order_updated:       { label: 'Order Update',     icon: 'create-outline',            color: '#9CA3AF' },
}
const EVENT_TYPE_OPTIONS = Object.entries(EVENT_META).map(([value, m]) => ({ value, ...m }))

function eventSummary(e: FlatActivityEvent): string {
  const p = e.payload ?? {}
  switch (e.type) {
    case 'customer_message':
      return `${p.customer_name ?? 'Customer'}: ${String(p.text ?? '').replace(/\[attachment:\d+:[^\]]+\]/g, '').trim().slice(0, 100) || 'sent a message'}`
    case 'customer_attachment':
      return `${p.customer_name ?? 'Customer'} uploaded ${p.file_name ?? 'a file'}`
    case 'comment_added':
      return `${e.actor_name}: ${String(p.text ?? '').replace(/^\[reply:[^\]]+\]\n?/, '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 100)}`
    case 'attachment_added':
      return `${e.actor_name} uploaded ${p.file_name ?? 'a file'}`
    case 'status_changed':
      return `${e.actor_name} changed status to ${p.to ?? ''}`
    case 'due_date_changed':
      return `${e.actor_name} changed due date to ${p.to ?? 'none'}`
    case 'assignees_changed':
      return `${e.actor_name} updated assignees`
    case 'priority_changed':
      return `${e.actor_name} changed priority to ${p.to ?? ''}`
    case 'staff_portal_reply':
      return `${e.actor_name} replied in portal: ${String(p.text ?? '').slice(0, 80)}`
    case 'order_updated':
      return `${e.actor_name} updated the order`
    default:
      return `${e.actor_name} made a change`
  }
}

// ── Row ───────────────────────────────────────────────────────────────────────

function EventRow({ event, onPress }: { event: FlatActivityEvent; onPress: () => void }) {
  const meta = EVENT_META[event.type] ?? { label: event.type, icon: 'ellipse-outline' as keyof typeof Ionicons.glyphMap, color: '#9CA3AF' }
  return (
    <TouchableOpacity style={S.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[S.iconWrap, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon} size={16} color={meta.color} />
      </View>
      <View style={S.rowBody}>
        <View style={S.rowTop}>
          <View style={[S.typePill, { backgroundColor: meta.color + '18' }]}>
            <Text style={[S.typeLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={S.rowTime}>{formatRelative(event.created_at)}</Text>
        </View>
        <Text style={S.rowSummary} numberOfLines={2}>{eventSummary(event)}</Text>
        <Text style={S.rowOrder} numberOfLines={1}>#{event.order_title}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Filter sheet ──────────────────────────────────────────────────────────────

function FilterSheet({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean
  selected: string
  onSelect: (v: string) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={FS.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[FS.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <View style={FS.handle} />
          <Text style={FS.title}>Filter by Event Type</Text>
          <TouchableOpacity style={[FS.option, !selected && FS.optionActive]} onPress={() => { onSelect(''); onClose() }}>
            <Text style={[FS.optionText, !selected && FS.optionTextActive]}>All events</Text>
            {!selected && <Ionicons name="checkmark" size={16} color="#6366F1" />}
          </TouchableOpacity>
          {EVENT_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[FS.option, selected === opt.value && FS.optionActive]}
              onPress={() => { onSelect(opt.value); onClose() }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[FS.dot, { backgroundColor: opt.color }]} />
                <Text style={[FS.optionText, selected === opt.value && FS.optionTextActive]}>{opt.label}</Text>
              </View>
              {selected === opt.value && <Ionicons name="checkmark" size={16} color="#6366F1" />}
            </TouchableOpacity>
          ))}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [events, setEvents] = useState<FlatActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [search, setSearch] = useState('')
  const [eventType, setEventType] = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const fetchPage = useCallback(async (p: number, reset = false) => {
    if (p === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await notificationService.getActivity(p)
      setTotal(res.total)
      setHasMore(res.events.length > 0 && (reset ? res.events.length : events.length + res.events.length) < res.total)
      setEvents(prev => reset ? res.events : [...prev, ...res.events])
      setPage(p)
    } catch { /* ignore */ }
    finally { setLoading(false); setLoadingMore(false) }
  }, [events.length])

  useEffect(() => { fetchPage(1, true) }, [])

  useFocusEffect(useCallback(() => { fetchPage(1, true) }, []))

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (eventType && e.type !== eventType) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (!e.order_title.toLowerCase().includes(q) && !String(e.order_number).includes(q)) return false
      }
      return true
    })
  }, [events, search, eventType])

  const filterLabel = eventType ? (EVENT_META[eventType]?.label ?? eventType) : null
  const hasFilters = !!(search || eventType)

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Activity</Text>
          {!loading && <Text style={S.headerSub}>{total} event{total !== 1 ? 's' : ''}{hasFilters && filtered.length !== events.length ? ` · ${filtered.length} shown` : ''}</Text>}
        </View>
        <TouchableOpacity
          style={[S.filterBtn, eventType && S.filterBtnActive]}
          onPress={() => setShowFilter(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={18} color={eventType ? '#6366F1' : '#6B7280'} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={S.searchRow}>
        <View style={S.searchBox}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" />
          <TextInput
            style={S.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by order…"
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        {filterLabel && (
          <TouchableOpacity style={S.activePill} onPress={() => setEventType('')}>
            <Text style={S.activePillText}>{filterLabel}</Text>
            <Ionicons name="close" size={12} color="#6366F1" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="pulse-outline" size={40} color="#D1D5DB" />
          <Text style={S.emptyTitle}>{hasFilters ? 'No matching events' : 'No activity yet'}</Text>
          <Text style={S.emptySub}>{hasFilters ? 'Try adjusting your filters.' : 'Order events will appear here.'}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <EventRow event={item} onPress={() => router.push(`/order/${item.order_id}` as any)} />
          )}
          ItemSeparatorComponent={() => <View style={S.sep} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (!hasMore || loadingMore || hasFilters) return
            fetchPage(page + 1)
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#6366F1" />
              </View>
            ) : !hasMore && events.length > 0 ? (
              <Text style={S.allLoaded}>All events loaded</Text>
            ) : null
          }
        />
      )}

      <FilterSheet
        visible={showFilter}
        selected={eventType}
        onSelect={setEventType}
        onClose={() => setShowFilter(false)}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  filterBtn: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  filterBtnActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EEF2FF', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#C7D2FE',
  },
  activePillText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF' },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    backgroundColor: '#fff',
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typePill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeLabel: { fontSize: 10, fontWeight: '700' },
  rowTime: { fontSize: 11, color: '#9CA3AF', flexShrink: 0 },
  rowSummary: { fontSize: 13, color: '#374151', lineHeight: 18 },
  rowOrder: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginLeft: 62 },
  allLoaded: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', paddingVertical: 12 },
})

const FS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 12, maxHeight: '80%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 8 },
  optionActive: { backgroundColor: '#EEF2FF' },
  optionText: { fontSize: 14, color: '#374151' },
  optionTextActive: { color: '#4F46E5', fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
