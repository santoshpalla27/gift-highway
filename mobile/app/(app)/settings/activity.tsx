import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal, StatusBar, ScrollView, Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { notificationService, type FlatActivityEvent } from '../../../services/notificationService'
import { formatRelative, formatDate, datePickerToIST } from '../../../utils/date'

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
const EVENT_TYPE_OPTIONS = [
  'comment_added', 'attachment_added', 'status_changed', 'assignees_changed',
  'due_date_changed', 'priority_changed', 'order_updated',
].map(value => ({ value, ...EVENT_META[value] }))

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
    const iso = datePickerToIST(d)
    if (activePick === 'from') { set({ dateFrom: iso }); setShowFromPicker(false) }
    else                       { set({ dateTo:   iso }); setShowToPicker(false)   }
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(filters)
  const activeCount = [draft.eventType, draft.dateFrom, draft.dateTo].filter(Boolean).length

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[FS.container, { paddingTop: insets.top }]}>
        <View style={FS.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={FS.title}>Filters</Text>
          <TouchableOpacity onPress={() => setDraft(emptySheetFilters)} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
            <Text style={[FS.clearBtn, activeCount === 0 && { opacity: 0.3 }]}>Clear all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 80, 40) }}>
          <Text style={FS.sectionLabel}>EVENT TYPE</Text>
          <TouchableOpacity style={[FS.option, !draft.eventType && FS.optionActive]} onPress={() => set({ eventType: '' })}>
            <Text style={[FS.optionText, !draft.eventType && FS.optionTextActive]}>All events</Text>
            {!draft.eventType && <Ionicons name="checkmark" size={16} color="#6366F1" />}
          </TouchableOpacity>
          {EVENT_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.value}
              style={[FS.option, draft.eventType === opt.value && FS.optionActive]}
              onPress={() => set({ eventType: opt.value })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={[FS.dot, { backgroundColor: opt.color }]} />
                <Text style={[FS.optionText, draft.eventType === opt.value && FS.optionTextActive]}>{opt.label}</Text>
              </View>
              {draft.eventType === opt.value && <Ionicons name="checkmark" size={16} color="#6366F1" />}
            </TouchableOpacity>
          ))}

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
                    <TouchableOpacity onPress={() => set(field === 'from' ? { dateFrom: '' } : { dateTo: '' })} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                      <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

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
          {Platform.OS === 'android' && showFromPicker && (
            <DateTimePicker value={tempDate} mode="date" display="default" maximumDate={new Date()}
              onChange={(ev, d) => { setShowFromPicker(false); if (ev.type === 'set' && d) confirmDate(d) }} />
          )}
          {Platform.OS === 'android' && showToPicker && (
            <DateTimePicker value={tempDate} mode="date" display="default" maximumDate={new Date()}
              onChange={(ev, d) => { setShowToPicker(false); if (ev.type === 'set' && d) confirmDate(d) }} />
          )}
        </ScrollView>

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
  const [sheetFilters, setSheetFilters] = useState<SheetFilters>(emptySheetFilters)
  const [showFilter, setShowFilter] = useState(false)

  const { eventType, dateFrom, dateTo } = sheetFilters

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
    const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00+05:30').getTime() : null
    const toMs   = dateTo   ? new Date(dateTo   + 'T23:59:59.999+05:30').getTime() : null
    return events.filter(e => {
      if (eventType && e.type !== eventType) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        if (e.order_title.toLowerCase() !== q && String(e.order_number) !== q) return false
      }
      const ts = new Date(e.created_at).getTime()
      if (fromMs && ts < fromMs) return false
      if (toMs   && ts > toMs)   return false
      return true
    })
  }, [events, search, eventType, dateFrom, dateTo])

  const hasSheetFilters = !!(eventType || dateFrom || dateTo)
  const hasFilters = !!(search || hasSheetFilters)

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.navigate('/(app)/settings' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Notifications</Text>
          {!loading && <Text style={S.headerSub}>{total} event{total !== 1 ? 's' : ''}{hasFilters && filtered.length !== events.length ? ` · ${filtered.length} shown` : ''}</Text>}
        </View>
        <TouchableOpacity
          onPress={() => fetchPage(1, true)}
          disabled={loading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 8 }}
        >
          {loading
            ? <ActivityIndicator size="small" color="#6366F1" />
            : <Ionicons name="refresh-outline" size={20} color="#6B7280" />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.filterBtn, hasSheetFilters && S.filterBtnActive]}
          onPress={() => setShowFilter(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={18} color={hasSheetFilters ? '#6366F1' : '#6B7280'} />
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
        {eventType && (
          <TouchableOpacity style={S.activePill} onPress={() => setSheetFilters(f => ({ ...f, eventType: '' }))}>
            <Text style={S.activePillText}>{EVENT_META[eventType]?.label ?? eventType}</Text>
            <Ionicons name="close" size={12} color="#6366F1" />
          </TouchableOpacity>
        )}
        {dateFrom && (
          <TouchableOpacity style={S.activePill} onPress={() => setSheetFilters(f => ({ ...f, dateFrom: '' }))}>
            <Text style={S.activePillText}>From {formatDate(dateFrom)}</Text>
            <Ionicons name="close" size={12} color="#6366F1" />
          </TouchableOpacity>
        )}
        {dateTo && (
          <TouchableOpacity style={S.activePill} onPress={() => setSheetFilters(f => ({ ...f, dateTo: '' }))}>
            <Text style={S.activePillText}>To {formatDate(dateTo)}</Text>
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
        filters={sheetFilters}
        onApply={setSheetFilters}
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
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
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
  typeLabel: { fontSize: 11, fontWeight: '700' },
  rowTime: { fontSize: 11, color: '#9CA3AF', flexShrink: 0 },
  rowSummary: { fontSize: 13, color: '#374151', lineHeight: 18 },
  rowOrder: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginLeft: 62 },
  allLoaded: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', paddingVertical: 12 },
})

const FS = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F9FAFB' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:            { fontSize: 18, fontWeight: '800', color: '#111827' },
  clearBtn:         { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  sectionLabel:     { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginBottom: 10 },
  option:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 10, borderRadius: 8 },
  optionActive:     { backgroundColor: '#EEF2FF' },
  optionText:       { fontSize: 14, color: '#374151' },
  optionTextActive: { color: '#4338CA', fontWeight: '600' },
  dot:              { width: 8, height: 8, borderRadius: 4 },
  dateBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff' },
  dateBtnActive:    { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  dateBtnText:      { flex: 1, fontSize: 13, color: '#9CA3AF' },
  footer:           { paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  applyBtn:         { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyText:        { fontSize: 15, fontWeight: '700', color: '#fff' },
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, maxHeight: '80%' },
  handle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
})
