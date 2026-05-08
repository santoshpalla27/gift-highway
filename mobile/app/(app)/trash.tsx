import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, StatusBar, ScrollView, Platform,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { orderService, type TrashOrder } from '../../services/orderService'
import { purgeNotificationOrder } from '../../hooks/useNotifications'
import { formatRelative, formatDate } from '../../utils/date'
import { useAuthStore } from '../../store/authStore'

// ── Metadata ──────────────────────────────────────────────────────────────────

const STATUS_CHIPS = ['yet_to_start', 'working', 'waiting_for_client', 'making', 'done', 'delivered'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
}

interface FilterState {
  status: string       // '' | 'yet_to_start' | 'working' | 'waiting_for_client' | 'making' | 'done' | 'delivered'
  archivedFrom: string // YYYY-MM-DD or ''
}

const emptyFilters: FilterState = { status: '', archivedFrom: '' }

function activeCount(f: FilterState) {
  return [f.status, f.archivedFrom].filter(Boolean).length
}

// ── Filter Sheet ──────────────────────────────────────────────────────────────

function FilterSheet({ visible, filters, onApply, onClose }: {
  visible: boolean
  filters: FilterState
  onApply: (f: FilterState) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<FilterState>(filters)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [tempDateObj, setTempDateObj] = useState(new Date())

  const set = (patch: Partial<FilterState>) => setDraft(d => ({ ...d, ...patch }))
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(filters)
  const draftCount = activeCount(draft)

  // Sync draft whenever sheet opens
  React.useEffect(() => { if (visible) setDraft(filters) }, [visible])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={FS.container}>

        {/* Header */}
        <View style={FS.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={FS.title}>Filters</Text>
          <TouchableOpacity onPress={() => setDraft(emptyFilters)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[FS.clearBtn, draftCount === 0 && { opacity: 0.3 }]}>Clear all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40) }}>

          {/* Status */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>STATUS</Text>
            <View style={FS.optionRow}>
              {STATUS_CHIPS.map(s => {
                const active = draft.status === s
                return (
                  <TouchableOpacity key={s}
                    style={[FS.optionChip, active && { backgroundColor: STATUS_META[s].bg, borderColor: STATUS_META[s].color }]}
                    onPress={() => set({ status: active ? '' : s })}
                  >
                    <View style={[FS.dot, { backgroundColor: STATUS_META[s].color }]} />
                    <Text style={[FS.optionText, active && { color: STATUS_META[s].color, fontWeight: '700' }]}>
                      {STATUS_META[s].label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Archived from date */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>ARCHIVED FROM</Text>
            {Platform.OS === 'web' ? (
              // Web: hidden native input behind a styled button
              (() => {
                const webPickerRef = React.createRef<any>()
                return (
                  <TouchableOpacity
                    style={[FS.dateInput, { flexDirection: 'row', alignItems: 'center' }]}
                    onPress={() => webPickerRef.current?.showPicker?.()}
                    activeOpacity={0.7}
                  >
                    <Text style={{ flex: 1, fontSize: 14, color: draft.archivedFrom ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                      {draft.archivedFrom ? formatDate(draft.archivedFrom) : 'DD/MM/YYYY'}
                    </Text>
                    <Ionicons name="calendar-outline" size={15} color="#94A3B8" />
                    <input ref={webPickerRef} type="date" value={draft.archivedFrom || ''}
                      onChange={(e: any) => set({ archivedFrom: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </TouchableOpacity>
                )
              })()
            ) : (
              <TouchableOpacity style={FS.dateInput} onPress={() => {
                setTempDateObj(draft.archivedFrom ? new Date(draft.archivedFrom + 'T00:00:00') : new Date())
                setShowDatePicker(true)
              }}>
                <Text style={{ color: draft.archivedFrom ? '#0F172A' : '#94A3B8', fontSize: 14 }}>
                  {draft.archivedFrom ? formatDate(draft.archivedFrom) : 'DD/MM/YYYY'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Native date picker — iOS: Cancel/Done sheet; Android: native dialog */}
            {Platform.OS === 'ios' && (
              <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                  <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        set({ archivedFrom: `${tempDateObj.getFullYear()}-${String(tempDateObj.getMonth()+1).padStart(2,'0')}-${String(tempDateObj.getDate()).padStart(2,'0')}` })
                        setShowDatePicker(false)
                      }}>
                        <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker value={tempDateObj} mode="date" display="spinner" maximumDate={new Date()}
                      onChange={(_, d) => { if (d) setTempDateObj(d) }}
                      style={{ width: '100%', height: 216 }} />
                  </View>
                </View>
              </Modal>
            )}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={draft.archivedFrom ? new Date(draft.archivedFrom + 'T00:00:00') : new Date()}
                mode="date" display="default" maximumDate={new Date()}
                onChange={(event, d) => {
                  setShowDatePicker(false)
                  if (event.type === 'set' && d) set({ archivedFrom: d.toISOString().split('T')[0] })
                }}
              />
            )}
          </View>

        </ScrollView>

        {/* Apply button */}
        <View style={[FS.footer, { paddingBottom: Math.max(insets.bottom + 16, 20) }]}>
          <TouchableOpacity
            style={[FS.applyBtn, !hasChanges && { opacity: 0.5 }]}
            onPress={() => { onApply(draft); onClose() }}
            disabled={!hasChanges}
          >
            <Text style={FS.applyText}>
              {draftCount > 0 ? `Apply ${draftCount} filter${draftCount !== 1 ? 's' : ''}` : 'Apply'}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ order, onClose, onConfirm }: {
  order: TrashOrder
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const ready = typed === 'DELETE'

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={D.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={D.sheet}>
          <View style={D.iconRow}>
            <View style={D.iconWrap}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={D.title}>Delete permanently?</Text>
              <Text style={D.subtitle}>This cannot be undone.</Text>
            </View>
          </View>

          <View style={D.warningBox}>
            <Text style={D.warningText}>
              Order <Text style={{ fontWeight: '700' }}>#{order.title}</Text> and all its data will be permanently deleted.
            </Text>
          </View>

          <Text style={D.inputLabel}>Type <Text style={{ fontWeight: '700' }}>DELETE</Text> to confirm</Text>
          <TextInput
            style={[D.input, ready && D.inputReady]}
            value={typed}
            onChangeText={setTyped}
            placeholder="DELETE"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
            autoFocus
          />

          <View style={D.actions}>
            <TouchableOpacity style={D.cancelBtn} onPress={onClose}>
              <Text style={D.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[D.deleteBtn, !ready && { opacity: 0.4 }]}
              disabled={!ready || loading}
              onPress={async () => {
                setLoading(true)
                await onConfirm()
                setLoading(false)
              }}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={D.deleteBtnText}>Delete permanently</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────

function TrashCard({ order, busy, isAdmin, onRestore, onDelete }: {
  order: TrashOrder
  busy: boolean
  isAdmin: boolean
  onRestore: () => void
  onDelete: () => void
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.new
  return (
    <View style={C.card}>
      <View style={C.cardTop}>
        <Text style={C.orderId} numberOfLines={1}>#{order.title}</Text>
        <View style={[C.statusBadge, { backgroundColor: meta.bg }]}>
          <View style={[C.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[C.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={C.customer} numberOfLines={1}>{order.customer_name}</Text>
      <View style={C.meta}>
        {order.archived_by_name && (
          <Text style={C.metaText}>Archived by {order.archived_by_name}</Text>
        )}
        {order.archived_at && (
          <Text style={C.metaText}>{formatRelative(order.archived_at)}</Text>
        )}
      </View>
      {isAdmin && (
        <View style={C.actions}>
          <TouchableOpacity
            style={[C.restoreBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={onRestore}
          >
            <Ionicons name="refresh-outline" size={14} color="#059669" />
            <Text style={C.restoreText}>Restore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[C.deleteBtn, busy && { opacity: 0.5 }]}
            disabled={busy}
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={C.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ── Active filter pills ───────────────────────────────────────────────────────

function ActiveFilterPills({ filters, onClear }: {
  filters: FilterState
  onClear: (key: keyof FilterState) => void
}) {
  const pills: { label: string; key: keyof FilterState }[] = []
  if (filters.status) pills.push({ label: STATUS_META[filters.status]?.label ?? filters.status, key: 'status' })
  if (filters.archivedFrom) pills.push({ label: `From ${formatDate(filters.archivedFrom)}`, key: 'archivedFrom' })
  if (pills.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
      {pills.map(pill => (
        <TouchableOpacity key={pill.key} style={AP.pill} onPress={() => onClear(pill.key)}>
          <Text style={AP.pillText}>{pill.label}</Text>
          <Ionicons name="close" size={12} color="#6366F1" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TrashScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [orders, setOrders] = useState<TrashOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrashOrder | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filterTs = filters.archivedFrom
      ? new Date(filters.archivedFrom + 'T00:00:00').getTime()
      : null
    return orders.filter(o => {
      const matchesSearch = !q ||
        o.title.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        (o.archived_by_name ?? '').toLowerCase().includes(q)
      const matchesStatus = !filters.status || o.status === filters.status
      const matchesDate = !filterTs || (
        o.archived_at ? new Date(o.archived_at).getTime() >= filterTs : false
      )
      return matchesSearch && matchesStatus && matchesDate
    })
  }, [orders, search, filters])

  const fetchTrash = useCallback(async () => {
    setLoading(true)
    try {
      const list = await orderService.listTrash()
      setOrders(list)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useFocusEffect(useCallback(() => { fetchTrash() }, [fetchTrash]))

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleRestore(order: TrashOrder) {
    setActionLoading(order.id)
    try {
      await orderService.restoreOrder(order.id)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      showToast(`Order #${order.title} restored.`)
    } catch {
      showToast('Failed to restore order.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePermanentDelete(order: TrashOrder) {
    setActionLoading(order.id)
    try {
      await orderService.permanentDelete(order.id)
      purgeNotificationOrder(order.id)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      showToast(`Order #${order.title} permanently deleted.`)
    } catch {
      showToast('Failed to delete order.')
    } finally {
      setActionLoading(null)
      setDeleteTarget(null)
    }
  }

  const filterCount = activeCount(filters)
  const hasAnyFilter = filterCount > 0 || !!search

  const clearFilterKey = (key: keyof FilterState) => {
    setFilters(f => ({ ...f, [key]: '' }))
  }

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Trash</Text>
          {!loading && (
            <Text style={S.headerSub}>
              {filteredOrders.length} of {orders.length} archived order{orders.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={fetchTrash} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={S.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Search bar + filter icon */}
      <View style={S.headerSurface}>
        <View style={S.searchRow}>
          <View style={[S.searchBox, isSearchFocused && S.searchFocused]}>
            <Ionicons name="search" size={16} color={isSearchFocused ? '#0F172A' : '#94A3B8'} />
            <TextInput
              style={S.searchInput}
              placeholder="Search orders…"
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[S.filterBtn, filterCount > 0 && S.filterBtnActive]}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="options-outline" size={20} color={filterCount > 0 ? '#6366F1' : '#475569'} />
            {filterCount > 0 && (
              <View style={S.filterBadge}>
                <Text style={S.filterBadgeText}>{filterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active filter pills */}
        <ActiveFilterPills filters={filters} onClear={clearFilterKey} />
      </View>

      {/* Count + clear bar */}
      <View style={S.countBar}>
        <Text style={S.countText}>
          {loading ? 'Loading…' : `${filteredOrders.length} of ${orders.length} archived order${orders.length !== 1 ? 's' : ''}${hasAnyFilter ? ' · filtered' : ''}`}
        </Text>
        {hasAnyFilter && (
          <TouchableOpacity onPress={() => { setFilters(emptyFilters); setSearch('') }}>
            <Text style={S.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : orders.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="trash-outline" size={40} color="#D1D5DB" />
          <Text style={S.emptyTitle}>Trash is empty</Text>
          <Text style={S.emptySub}>Archived orders will appear here.</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="search-outline" size={40} color="#D1D5DB" />
          <Text style={S.emptyTitle}>No results</Text>
          <Text style={S.emptySub}>Try adjusting your search or filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TrashCard
              order={item}
              busy={actionLoading === item.id}
              isAdmin={isAdmin}
              onRestore={() => handleRestore(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        />
      )}

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
      />

      {deleteTarget && (
        <DeleteModal
          order={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handlePermanentDelete(deleteTarget)}
        />
      )}

      {toast && (
        <View style={[S.toast, { bottom: insets.bottom + 24 }]} pointerEvents="none">
          <Text style={S.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 6 },
  headerSurface: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, marginBottom: 4,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#F3F4F6',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, gap: 8,
  },
  searchFocused: { borderColor: '#D1D5DB', backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }) },
  filterBtn: {
    width: 46, height: 46, borderRadius: 16,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  filterBadge: {
    position: 'absolute', top: -5, right: -5,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  countBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  countText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  clearAllText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF' },
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: '#1F2937', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  toastText: { fontSize: 13, fontWeight: '500', color: '#fff' },
})

const AP = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#EEF2FF',
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
})

const FS = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 20,
    paddingTop: Platform.OS === 'ios' ? 24 : 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  clearBtn: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  section: {
    paddingHorizontal: 24, paddingVertical: 20,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1, marginBottom: 16 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#F3F4F6', backgroundColor: '#FFFFFF',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  dateInput: {
    borderWidth: 1.5, borderColor: '#F3F4F6', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827', backgroundColor: '#FFFFFF',
  },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, overflow: 'hidden' },
  footer: {
    padding: 24, backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  applyBtn: {
    backgroundColor: '#111827', borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  applyText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
})

const C = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderId: { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  customer: { fontSize: 13, color: '#374151' },
  meta: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: '#9CA3AF' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  restoreBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
  },
  restoreText: { fontSize: 13, fontWeight: '600', color: '#059669' },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
})

const D = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 14 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  warningBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12 },
  warningText: { fontSize: 13, color: '#B91C1C' },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827',
  },
  inputReady: { borderColor: '#EF4444' },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  deleteBtn: {
    flex: 2, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#EF4444', alignItems: 'center',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
