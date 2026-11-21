import { OrderSheetHeader, sheetUI } from '../../components/order-sheet-ui'
import { COLORS } from '../../constants/theme'
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Pressable, KeyboardAvoidingView, Keyboard,
  TextInput, ActivityIndicator, Modal, Platform, Alert, RefreshControl, AppState,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { formatDate, fmt12hrStr, localDateStr, datePickerToIST, timePickerToIST } from '../../utils/date'
import { orderService, Order, UserOption } from '../../services/orderService'
import { staffPortalApi } from '../../services/portalService'
import { useAuthStore } from '../../store/authStore'
import { useOrderSocket } from '../../hooks/useOrderSocket'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import { CardSkeleton } from '../../components/CardSkeleton'
import { useNotifications } from '../../hooks/useNotifications'

// ─── Metadata ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['yet_to_start', 'working', 'waiting_for_client', 'making', 'done', 'delivered', 'cancelled'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
  cancelled:          { label: 'Cancelled',                 color: '#EF4444', bg: '#FEF2F2' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } | null {
  if (!dateStr) return null
  const today = localDateStr(0)
  const tomorrow = localDateStr(1)
  const overdue = dateStr < today
  let text = ''
  if (dateStr === today)    text = 'Due Today'
  else if (dateStr === tomorrow) text = 'Due Tomorrow'
  else text = `Due ${formatDate(new Date(dateStr + 'T00:00:00+05:30'))}`
  return { text, overdue }
}

function fmtDateShort(iso: string) {
  return formatDate(iso)
}

// ─── Filter Sheet ─────────────────────────────────────────────────────────────

interface FilterState {
  statuses: string[]
  priorities: string[]
  assigneeIds: string[]
  dueDateFrom: string
  dueDateTo: string
  overdueOnly: boolean
  dueTodayOnly: boolean
  unreadOnly: boolean
  staleOnly: boolean
}

const emptyFilters: FilterState = {
  statuses: [], priorities: [], assigneeIds: [],
  dueDateFrom: '', dueDateTo: '', overdueOnly: false, dueTodayOnly: false, unreadOnly: false, staleOnly: false,
}

function activeCount(f: FilterState) {
  return [f.statuses.length > 0, f.priorities.length > 0, f.assigneeIds.length > 0, f.dueDateFrom || f.dueDateTo, f.overdueOnly, f.dueTodayOnly, f.unreadOnly, f.staleOnly].filter(Boolean).length
}

function FilterSheet({
  visible, filters, onApply, onClose, myOrdersOnly,
}: {
  visible: boolean
  filters: FilterState
  onApply: (f: FilterState) => void
  onClose: () => void
  myOrdersOnly: boolean
}) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<FilterState>(filters)
  const [users, setUsers] = useState<UserOption[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [showAssigneeList, setShowAssigneeList] = useState(false)
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)
  const [tempFromDate, setTempFromDate] = useState(new Date())
  const [tempToDate, setTempToDate] = useState(new Date())
  const fromPickerRef = useRef<any>(null)
  const toPickerRef = useRef<any>(null)

  useEffect(() => {
    if (visible) {
      setDraft(filters)
      setShowAssigneeList(false)
      if (!usersLoaded && !myOrdersOnly) {
        orderService.listUsersForAssignment().then(u => { setUsers(u); setUsersLoaded(true) }).catch(() => {})
      }
    }
  }, [visible])

  const set = (patch: Partial<FilterState>) => setDraft(d => ({ ...d, ...patch }))
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(filters)
  const draftCount = activeCount(draft)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => showAssigneeList ? setShowAssigneeList(false) : onClose()}>
      <View style={FS.container}>
        {/* Header */}
        <OrderSheetHeader title="Filters" subtitle="Focus on the orders that matter." onClose={onClose} topInset={Platform.OS === 'ios' ? 0 : insets.top} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

          <View style={sheetUI.filterSummary}><Text style={sheetUI.summaryText}>{draftCount ? draftCount + ' active filters' : 'All orders included'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Reset all filters" onPress={() => setDraft(emptyFilters)} style={sheetUI.reset}><Text style={sheetUI.resetText}>Reset all</Text></Pressable></View>
          {/* Status */}
          <View style={FS.section}>
            <Text accessibilityRole="header" style={FS.sectionLabel}>Status</Text><Text style={FS.helper}>Choose any combination of statuses</Text>
            <View style={{ gap: 2 }}>
              {STATUS_OPTIONS.map(s => {
                const active = draft.statuses.includes(s)
                return (
                  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: active }} key={s}
                    style={[sheetUI.statusRow, active && sheetUI.rowSelected]}
                    onPress={() => setDraft(d => {
                      const next = d.statuses.includes(s) ? d.statuses.filter(x => x !== s) : [...d.statuses, s]
                      return { ...d, statuses: next }
                    })}
                  >
                    <View style={[FS.dot, { backgroundColor: STATUS_META[s].color }]} />
                    <Text style={[sheetUI.statusText, active && sheetUI.selectedText]}>
                      {STATUS_META[s].label}
                    </Text>
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={22} color={active ? COLORS.primaryDark : COLORS.border} />
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Priority */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>Priority</Text>
            <View style={FS.optionRow}>
              {PRIORITY_OPTIONS.map(p => {
                const active = draft.priorities.includes(p)
                return (
                  <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: active }} key={p}
                    style={[sheetUI.chip, active && sheetUI.chipSelected]}
                    onPress={() => setDraft(d => {
                      const next = d.priorities.includes(p) ? d.priorities.filter(x => x !== p) : [...d.priorities, p]
                      return { ...d, priorities: next }
                    })}
                  >
                    <View style={[FS.dot, { backgroundColor: PRIORITY_META[p].color }]} />
                    <Text style={[FS.optionText, active && sheetUI.selectedText]}>
                      {PRIORITY_META[p].label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Assignee */}
          {!myOrdersOnly && (
            <View style={FS.section}>
              <Text style={FS.sectionLabel}>Assigned to</Text>
              {/* Trigger */}
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel="Filter by assignee" accessibilityState={{ expanded: showAssigneeList }}
                style={FS.assigneeTrigger}
                onPress={() => setShowAssigneeList(true)}
                activeOpacity={0.7}
              >
                <Text style={[FS.assigneeTriggerText, draft.assigneeIds.length === 0 && { color: '#94A3B8' }]} numberOfLines={1}>
                  {draft.assigneeIds.length === 0
                    ? 'Select assignees…'
                    : (() => {
                        const parts: string[] = []
                        if (draft.assigneeIds.includes('unassigned')) parts.push('Unassigned')
                        const userNames = draft.assigneeIds
                          .filter(id => id !== 'unassigned')
                          .map(id => users.find(u => u.id === id)?.name.split(' ')[0])
                          .filter(Boolean) as string[]
                        parts.push(...userNames)
                        if (parts.length <= 2) return parts.join(', ')
                        return `${parts[0]}, ${parts[1]} +${parts.length - 2}`
                      })()
                  }
                </Text>
                <Ionicons name={showAssigneeList ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
              </TouchableOpacity>
              {/* Dropdown list */}

            </View>
          )}

          {/* Due Date range */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>Delivery date range</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={FS.dateLabel}>From</Text>
                {Platform.OS === 'web' ? (
                  <TouchableOpacity
                    style={[FS.dateInput, { flexDirection: 'row', alignItems: 'center' }]}
                    onPress={() => fromPickerRef.current?.showPicker?.()}
                    activeOpacity={0.7}
                  >
                    <Text style={{ flex: 1, fontSize: 14, color: draft.dueDateFrom ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                      {draft.dueDateFrom ? formatDate(draft.dueDateFrom) : 'DD/MM/YYYY'}
                    </Text>
                    <Ionicons name="calendar-outline" size={15} color="#94A3B8" />
                    <input ref={fromPickerRef} type="date" value={draft.dueDateFrom || ''}
                      onChange={(e: any) => set({ dueDateFrom: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={FS.dateInput} onPress={() => {
                    setTempFromDate(draft.dueDateFrom ? new Date(draft.dueDateFrom + 'T00:00:00') : new Date())
                    setShowFromPicker(true)
                  }}>
                    <Text style={{ color: draft.dueDateFrom ? '#0F172A' : '#94A3B8', fontSize: 14 }}>
                      {draft.dueDateFrom ? formatDate(draft.dueDateFrom) : 'DD/MM/YYYY'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={FS.dateLabel}>To</Text>
                {Platform.OS === 'web' ? (
                  <TouchableOpacity
                    style={[FS.dateInput, { flexDirection: 'row', alignItems: 'center' }]}
                    onPress={() => toPickerRef.current?.showPicker?.()}
                    activeOpacity={0.7}
                  >
                    <Text style={{ flex: 1, fontSize: 14, color: draft.dueDateTo ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                      {draft.dueDateTo ? formatDate(draft.dueDateTo) : 'DD/MM/YYYY'}
                    </Text>
                    <Ionicons name="calendar-outline" size={15} color="#94A3B8" />
                    <input ref={toPickerRef} type="date" value={draft.dueDateTo || ''}
                      onChange={(e: any) => set({ dueDateTo: e.target.value })}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={FS.dateInput} onPress={() => {
                    setTempToDate(draft.dueDateTo ? new Date(draft.dueDateTo + 'T00:00:00') : new Date())
                    setShowToPicker(true)
                  }}>
                    <Text style={{ color: draft.dueDateTo ? '#0F172A' : '#94A3B8', fontSize: 14 }}>
                      {draft.dueDateTo ? formatDate(draft.dueDateTo) : 'DD/MM/YYYY'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* From date picker (native only) */}
          {Platform.OS === 'ios' && (
            <Modal visible={showFromPicker} transparent animationType="slide" onRequestClose={() => setShowFromPicker(false)}>
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                      <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      set({ dueDateFrom: datePickerToIST(tempFromDate) })
                      setShowFromPicker(false)
                    }}>
                      <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker value={tempFromDate} mode="date" display="spinner"
                    onChange={(_, d) => { if (d) setTempFromDate(d) }}
                    style={{ width: '100%', height: 216 }} />
                </View>
              </View>
            </Modal>
          )}
          {Platform.OS === 'android' && showFromPicker && (
            <DateTimePicker
              value={draft.dueDateFrom ? new Date(draft.dueDateFrom + 'T00:00:00') : new Date()}
              mode="date" display="default"
              onChange={(event, d) => {
                setShowFromPicker(false)
                if (event.type === 'set' && d) set({ dueDateFrom: datePickerToIST(d) })
              }}
            />
          )}

          {/* To date picker (native only) */}
          {Platform.OS === 'ios' && (
            <Modal visible={showToPicker} transparent animationType="slide" onRequestClose={() => setShowToPicker(false)}>
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <TouchableOpacity onPress={() => setShowToPicker(false)}>
                      <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      set({ dueDateTo: datePickerToIST(tempToDate) })
                      setShowToPicker(false)
                    }}>
                      <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker value={tempToDate} mode="date" display="spinner"
                    onChange={(_, d) => { if (d) setTempToDate(d) }}
                    style={{ width: '100%', height: 216 }} />
                </View>
              </View>
            </Modal>
          )}
          {Platform.OS === 'android' && showToPicker && (
            <DateTimePicker
              value={draft.dueDateTo ? new Date(draft.dueDateTo + 'T00:00:00') : new Date()}
              mode="date" display="default"
              onChange={(event, d) => {
                setShowToPicker(false)
                if (event.type === 'set' && d) set({ dueDateTo: datePickerToIST(d) })
              }}
            />
          )}

          {/* Quick filters */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>Quick filters</Text>
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                accessibilityRole="switch" accessibilityState={{ checked: draft.overdueOnly }} style={[FS.toggleRow, draft.overdueOnly && FS.toggleRowActive]}
                onPress={() => set({ overdueOnly: !draft.overdueOnly, dueTodayOnly: false })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.overdueOnly && { color: '#EF4444' }]}>Overdue</Text>
                  <Text style={FS.toggleSub}>Orders past their due date</Text>
                </View>
                <View style={[FS.toggle, draft.overdueOnly && FS.toggleOn]}>
                  <View style={[FS.toggleThumb, draft.overdueOnly && FS.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="switch" accessibilityState={{ checked: draft.dueTodayOnly }} style={[FS.toggleRow, draft.dueTodayOnly && FS.toggleRowToday]}
                onPress={() => set({ dueTodayOnly: !draft.dueTodayOnly, overdueOnly: false })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.dueTodayOnly && { color: '#D97706' }]}>Today</Text>
                  <Text style={FS.toggleSub}>Orders due on today's date</Text>
                </View>
                <View style={[FS.toggle, draft.dueTodayOnly && { backgroundColor: '#F59E0B' }]}>
                  <View style={[FS.toggleThumb, draft.dueTodayOnly && FS.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="switch" accessibilityState={{ checked: draft.unreadOnly }} style={[FS.toggleRow, draft.unreadOnly && FS.toggleRowUnread]}
                onPress={() => set({ unreadOnly: !draft.unreadOnly })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.unreadOnly && { color: '#6366F1' }]}>Unread</Text>
                  <Text style={FS.toggleSub}>Orders with unread notifications</Text>
                </View>
                <View style={[FS.toggle, draft.unreadOnly && { backgroundColor: '#6366F1' }]}>
                  <View style={[FS.toggleThumb, draft.unreadOnly && FS.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="switch" accessibilityState={{ checked: draft.staleOnly }} style={[FS.toggleRow, draft.staleOnly && { backgroundColor: '#FFF7ED' }]}
                onPress={() => set({ staleOnly: !draft.staleOnly })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.staleOnly && { color: '#EA580C' }]}>Stale (7+ days)</Text>
                  <Text style={FS.toggleSub}>No activity in over 7 days</Text>
                </View>
                <View style={[FS.toggle, draft.staleOnly && { backgroundColor: '#F97316' }]}>
                  <View style={[FS.toggleThumb, draft.staleOnly && FS.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
            </View>
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
        {showAssigneeList && <View style={FS.assigneeOverlay} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close assignee filter" onPress={() => setShowAssigneeList(false)} />
          <View style={[FS.assigneePanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={FS.assigneePanelHeader}><View style={{ flex: 1 }}><Text style={FS.title}>Assigned to</Text><Text style={FS.helper}>Select one or more team members</Text></View><Pressable style={FS.doneButton} accessibilityRole="button" onPress={() => setShowAssigneeList(false)}><Text style={FS.doneText}>Done</Text></Pressable></View>
            <ScrollView style={FS.assigneeList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {/* Unassigned row */}
                  {(() => {
                    const active = draft.assigneeIds.includes('unassigned')
                    const toggle = () => set({ assigneeIds: active ? draft.assigneeIds.filter(x => x !== 'unassigned') : ['unassigned', ...draft.assigneeIds] })
                    return (
                      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: active }} style={[FS.assigneeRow, active && FS.assigneeRowActive, FS.assigneeRowBorder]} onPress={toggle}>
                        <View style={[FS.avatar, { backgroundColor: '#F3F4F6' }]}>
                          <Text style={[FS.avatarText, { color: '#6B7280' }]}>—</Text>
                        </View>
                        <Text style={[FS.userRowText, active && { color: '#0F172A', fontWeight: '700' }]}>Unassigned</Text>
                        {active
                          ? <Ionicons name="checkbox" size={20} color="#6366F1" />
                          : <Ionicons name="square-outline" size={20} color="#CBD5E1" />}
                      </TouchableOpacity>
                    )
                  })()}
                  {users.length === 0 ? (
                    <Text style={[FS.dimText, { padding: 14 }]}>{usersLoaded ? 'No team members available' : 'Loading…'}</Text>
                  ) : users.map((u, i) => {
                    const active = draft.assigneeIds.includes(u.id)
                    const initials = u.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                    const toggle = () => set({ assigneeIds: active ? draft.assigneeIds.filter(x => x !== u.id) : [...draft.assigneeIds, u.id] })
                    return (
                      <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={u.name} accessibilityState={{ checked: active }} key={u.id}
                        style={[FS.assigneeRow, active && FS.assigneeRowActive, i < users.length - 1 && FS.assigneeRowBorder]}
                        onPress={toggle}
                      >
                        <View style={FS.avatar}>
                          <Text style={FS.avatarText}>{initials}</Text>
                        </View>
                        <Text style={[FS.userRowText, active && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                        {active
                          ? <Ionicons name="checkbox" size={20} color="#6366F1" />
                          : <Ionicons name="square-outline" size={20} color="#CBD5E1" />}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
          </View>
        </View>}
      </View>
    </Modal>
  )
}

// ─── Order Form Modal ─────────────────────────────────────────────────────────

interface OrderFormProps {
  visible: boolean
  order?: Order | null
  onClose: () => void
  onRefresh: () => void
}

function OrderFormModal({ visible, order, onClose, onRefresh }: OrderFormProps) {
  const insets = useSafeAreaInsets()
  const isEdit = !!order
  const { isOnline } = useNetworkStatus()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'
  const [orderDescription, setOrderDescription] = useState('')
  const [orderSource, setOrderSource] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [orderValue, setOrderValue] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [tempDateObj, setTempDateObj] = useState(new Date())
  const [tempTimeObj, setTempTimeObj] = useState(new Date())
  const [createPortal, setCreatePortal] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const datePickerRef = useRef<any>(null)
  const timePickerRef = useRef<any>(null)

  useEffect(() => {
    if (visible) orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [visible])

  useEffect(() => {
    if (order) {
      setOrderDescription(order.order_description ?? ''); setOrderSource(order.order_source ?? ''); setCustomerName(order.customer_name)
      setContactNumber(order.contact_number ?? ''); setDescription(order.description)
      setPriority(order.priority); setAssignedTo(order.assigned_to ?? []); setDueDate(order.due_date ?? ''); setDueTime(order.due_time ?? '')
      setOrderValue(order.order_value != null ? String(order.order_value) : '')
    } else {
      setOrderDescription(''); setOrderSource(''); setCustomerName(''); setContactNumber(''); setDescription('')
      setPriority('medium'); setAssignedTo([]); setDueDate(''); setDueTime(''); setCreatePortal(false); setOrderValue('')
    }
    setError('')
    setAssignOpen(false)
  }, [order, visible])

  const handleSubmit = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!orderDescription.trim() || !customerName.trim()) { setError('Order Description and Customer Name are required.'); return }
    setLoading(true); setError('')
    try {
      const parsedOrderValue = isAdmin && orderValue.trim() !== '' ? parseFloat(orderValue) : null
      const payload = { order_description: orderDescription.trim(), order_source: orderSource || undefined, customer_name: customerName.trim(), contact_number: contactNumber.trim(), description: description.trim(), priority, assigned_to: assignedTo, due_date: dueDate || null, due_time: dueTime || null, order_value: isAdmin ? parsedOrderValue : undefined }
      if (isEdit) {
        await orderService.updateOrder(order!.id, payload)
      } else {
        const created = await orderService.createOrder(payload)
        if (createPortal) {
          try { await staffPortalApi.createPortal(created.id, customerName.trim()) } catch (_) {}
        }
      }
      onRefresh(); onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not save order.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => assignOpen ? setAssignOpen(false) : onClose()}>
      <KeyboardAvoidingView style={F.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <OrderSheetHeader title={isEdit ? 'Edit order' : 'New order'} subtitle="The details your team needs to get started." onClose={onClose} topInset={Platform.OS === 'ios' ? 0 : insets.top} />
        <ScrollView style={F.body} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {error ? <View style={F.errorBox} accessibilityRole="alert"><Text style={F.errorText}>{error}</Text></View> : null}
          <View style={[sheetUI.metadata, { paddingHorizontal: 8 }]}><Ionicons name="lock-closed-outline" size={14} color={COLORS.textSecondary} /><Text style={sheetUI.metadataText}>{isEdit ? 'Order #' + order?.order_number : 'Order number assigned automatically'}</Text></View>
          <View style={sheetUI.group}><Text accessibilityRole="header" style={sheetUI.sectionTitle}>Order details</Text>
          <Text style={F.label}>Order Description *</Text>
          <TextInput
            style={[F.input, focusedField === 'orderDescription' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            accessibilityLabel="Order description, required" value={orderDescription}
            onChangeText={setOrderDescription}
            placeholder="e.g. Wedding Cake - John"
            placeholderTextColor="#94A3B8"
            onFocus={() => setFocusedField('orderDescription')}
            onBlur={() => setFocusedField(null)}
          />
          
          <Text style={F.label}>Order Source</Text>
          <View style={F.chipRow}>
            {['', 'amazon', 'b2b', 'store', 'whatsapp', 'online', 'google_ads', 'insta_ads'].map(src => {
              const isActive = orderSource === src
              const label = src === '' ? 'None' : src === 'google_ads' ? 'Google Ads' : src === 'insta_ads' ? 'Insta Ads' : src.charAt(0).toUpperCase() + src.slice(1)
              return (
                <TouchableOpacity
                  key={src}
                  accessibilityRole="radio" accessibilityState={{ selected: isActive }} style={[sheetUI.chip, isActive && sheetUI.chipSelected]}
                  onPress={() => setOrderSource(src)}
                >
                  <Text style={[F.chipText, isActive && sheetUI.selectedText]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          </View><View style={sheetUI.group}><Text accessibilityRole="header" style={sheetUI.sectionTitle}>Customer information</Text>
          <Text style={F.label}>Customer Name *</Text>
          <TextInput
            style={[F.input, focusedField === 'customerName' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            accessibilityLabel="Customer name, required" value={customerName}
            onChangeText={setCustomerName}
            autoCapitalize="words"
            onFocus={() => setFocusedField('customerName')}
            onBlur={() => setFocusedField(null)}
          />
          <Text style={F.label}>Contact Number</Text>
          <TextInput
            style={[F.input, focusedField === 'contactNumber' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            accessibilityLabel="Contact number" value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            onFocus={() => setFocusedField('contactNumber')}
            onBlur={() => setFocusedField(null)}
          />
          <Text style={F.label}>Description</Text>
          <TextInput
            style={[F.input, { minHeight: 80 }, focusedField === 'description' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            accessibilityLabel="Description" value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            onFocus={() => setFocusedField('description')}
            onBlur={() => setFocusedField(null)}
          />

          </View><View style={sheetUI.group}><Text accessibilityRole="header" style={sheetUI.sectionTitle}>Schedule &amp; team</Text>
          <View style={{ gap: 12, marginBottom: 8 }}>
            <View>
              <Text style={[F.label, { marginTop: 0 }]}>Priority</Text>
              <View style={[F.chipRow, { gap: 6 }]}>
                {PRIORITY_OPTIONS.map(p => (
                  <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: priority === p }} key={p} style={[sheetUI.chip, priority === p && sheetUI.chipSelected]} onPress={() => setPriority(p)}>
                    <Text style={[F.chipText, { fontSize: 13 }, priority === p && sheetUI.selectedText]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {isAdmin && (
              <View>
                <Text style={[F.label, { marginTop: 0 }]}>Order Value</Text>
                <View style={[F.input, { flexDirection: 'row', alignItems: 'center', marginTop: 8 }, focusedField === 'orderValue' && { borderColor: '#6366F1', borderWidth: 1.5 }]}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#475569', marginRight: 6 }}>₹</Text>
                  <TextInput
                    style={[{ flex: 1, fontSize: 16, color: '#0F172A', padding: 0 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    accessibilityLabel="Order value" value={orderValue}
                    onChangeText={setOrderValue}
                    keyboardType="numeric"
                    placeholder="e.g. 5000"
                    placeholderTextColor="#94A3B8"
                    onFocus={() => setFocusedField('orderValue')}
                    onBlur={() => setFocusedField(null)}
                    {...({ onWheel: Platform.OS === 'web' ? (e: any) => e.target.blur() : undefined })}
                  />
                </View>
              </View>
            )}
          </View>

          <Text style={F.label}>Due Date & Time</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {Platform.OS === 'web' ? (
              <>
                <TouchableOpacity
                  style={[F.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => datePickerRef.current?.showPicker?.()}
                  activeOpacity={0.7}
                >
                  <Text style={{ flex: 1, fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                    {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                  <input ref={datePickerRef} type="date" value={dueDate || ''}
                    onChange={(e: any) => setDueDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[F.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => timePickerRef.current?.showPicker?.()}
                  activeOpacity={0.7}
                >
                  <Text style={{ flex: 1, fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                    {dueTime ? fmt12hrStr(dueTime) : 'Time'}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                  <input ref={timePickerRef} type="time" value={dueTime || ''}
                    onChange={(e: any) => setDueTime(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[F.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => {
                    setTempDateObj(dueDate ? new Date(dueDate + 'T00:00:00') : new Date())
                    setShowDatePicker(true)
                  }}
                >
                  <Text style={{ fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }}>
                    {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[F.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => {
                    const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date()
                    if (dueTime) { const [h, min] = dueTime.split(':').map(Number); base.setHours(h, min, 0, 0) }
                    setTempTimeObj(base)
                    setShowTimePicker(true)
                  }}
                >
                  <Text style={{ fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }}>
                    {dueTime ? fmt12hrStr(dueTime) : 'Time'}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                {/* iOS date picker */}
                {Platform.OS === 'ios' ? (
                  <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
                     <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                          <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                            <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => {
                            setDueDate(datePickerToIST(tempDateObj))
                            setShowDatePicker(false)
                          }}>
                            <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        <DateTimePicker value={tempDateObj} mode="date" display="spinner"
                          onChange={(_, date) => { if (date) setTempDateObj(date) }}
                          style={{ width: '100%', height: 216 }} />
                      </View>
                    </View>
                  </Modal>
                ) : (
                  showDatePicker && (
                    <DateTimePicker
                      value={dueDate ? new Date(dueDate + 'T00:00:00') : new Date()}
                      mode="date" display="default"
                      onChange={(event, date) => {
                        setShowDatePicker(false)
                        if (event.type === 'set' && date) setDueDate(datePickerToIST(date))
                      }}
                    />
                  )
                )}
                {/* iOS time picker */}
                {Platform.OS === 'ios' ? (
                  <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
                    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 8, 24) }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                          <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                            <Text style={{ fontSize: 16, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => {
                            setDueTime(timePickerToIST(tempTimeObj))
                            setShowTimePicker(false)
                          }}>
                            <Text style={{ fontSize: 16, color: '#6366F1', fontWeight: '700' }}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        <DateTimePicker value={tempTimeObj} mode="time" display="spinner"
                          onChange={(_, date) => { if (date) setTempTimeObj(date) }}
                          style={{ width: '100%', height: 216 }} />
                      </View>
                    </View>
                  </Modal>
                ) : (
                  showTimePicker && (
                    <DateTimePicker
                      value={(() => {
                        const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date()
                        if (dueTime) { const [h, min] = dueTime.split(':').map(Number); base.setHours(h, min, 0, 0) }
                        return base
                      })()}
                      mode="time" display="default"
                      onChange={(event, date) => {
                        setShowTimePicker(false)
                        if (event.type === 'set' && date) setDueTime(timePickerToIST(date))
                      }}
                    />
                  )
                )}
              </>
            )}
          </View>
          <Text style={F.label}>Assign To</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Assign team members" accessibilityState={{ expanded: assignOpen }} style={[F.input, { flexDirection: 'row', gap: 10, justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => { Keyboard.dismiss(); setAssignOpen(true) }}>
            <Text style={{ flex: 1, fontSize: 15, color: assignedTo.length > 0 ? '#0F172A' : '#64748B' }} numberOfLines={1}>
              {assignedTo.length === 0 ? 'Unassigned' : users.filter(u => assignedTo.includes(u.id)).map(u => u.name.split(' ')[0]).join(', ')}
            </Text>
            <Ionicons name={assignOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>
          {/* PORTAL HIDDEN: "Generate customer portal link" checkbox removed — see docs/portal-hidden.md to restore */}
          </View>
        </ScrollView>
        <View style={[F.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={F.requiredNote}>* Required fields</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }} style={[F.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={F.submitText}>{isEdit ? 'Save Changes' : 'Create Order'}</Text>}
          </TouchableOpacity>
        </View>
        {assignOpen && <View style={F.assignmentOverlay} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssignOpen(false)} accessibilityRole="button" accessibilityLabel="Close assignment picker" />
          <View style={[F.assignmentPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={F.assignmentHeader}>
              <View style={{ flex: 1 }}><Text style={F.sectionTitle}>Assign team members</Text><Text style={F.subtitle}>Select one or more · {assignedTo.length} selected</Text></View>
              <Pressable accessibilityRole="button" onPress={() => setAssignOpen(false)} style={F.doneButton}><Text style={F.doneText}>Done</Text></Pressable>
            </View>
            <FlatList data={users} keyExtractor={u => u.id} keyboardShouldPersistTaps="handled"
              ListHeaderComponent={<Pressable accessibilityRole="button" accessibilityState={{ selected: assignedTo.length === 0 }} style={[F.assignRow, assignedTo.length === 0 && F.assignRowActive]} onPress={() => setAssignedTo([])}>
                <View style={F.avatar}><Ionicons name="person-outline" size={18} color="#64748B" /></View><Text style={F.assignText}>Unassigned</Text>
                {assignedTo.length === 0 && <Ionicons name="checkmark" size={22} color="#4F46E5" />}
              </Pressable>}
              renderItem={({ item: u }) => {
                const selected = assignedTo.includes(u.id)
                return <Pressable accessibilityRole="checkbox" accessibilityLabel={u.name} accessibilityState={{ checked: selected }} style={[F.assignRow, selected && F.assignRowActive]} onPress={() => setAssignedTo(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                  <View style={F.avatar}><Text style={F.avatarText}>{u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</Text></View>
                  <Text style={[F.assignText, selected && { color: '#3730A3', fontWeight: '700' }]}>{u.name}</Text>
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? '#4F46E5' : '#94A3B8'} />
                </Pressable>
              }} />
          </View>
        </View>}
      </KeyboardAvoidingView>
    </Modal>
  )
}


// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onOpen, unreadCount = 0 }: {
  order: Order; onOpen: () => void; unreadCount?: number
}) {
  const due = formatDueDate(order.due_date)
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium
  const assigneeText = order.assigned_names?.length > 0
    ? order.assigned_names[0].split(' ')[0] + (order.assigned_names.length > 1 ? ` +${order.assigned_names.length - 1}` : '')
    : 'Unassigned'

  return (
    <TouchableOpacity
      style={[C.card, unreadCount > 0 && C.cardUnread]}
      onPress={onOpen}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.order_number}, ${order.order_description || order.title}, ${order.customer_name}, ${sm.label}`}
    >
      {/* Top row: Order ID + unread badge (left) | Status (right) */}
      <View style={C.rowTop}>
        <View style={C.orderNumWrap}>
          <Text style={C.orderNum} numberOfLines={1}>Order #{order.order_number}</Text>
          {unreadCount > 0 && (
            <View style={C.unreadPill}>
              <Ionicons name="notifications" size={12} color="#fff" />
              <Text style={C.unreadPillText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={[C.statusBadge, { backgroundColor: sm.bg }]}>
          <Text style={[C.statusText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {/* Middle row: Description (left) | Priority (right) */}
      <View style={C.rowMiddle}>
        <Text style={C.customerName} numberOfLines={1} ellipsizeMode="tail">
          {order.order_description || 'No description'}
        </Text>
        <View style={[C.priorityBadge, { backgroundColor: pm.bg }]}>
          <View style={[C.priorityDot, { backgroundColor: pm.color }]} />
          <Text style={[C.priorityText, { color: pm.color }]}>{pm.label}</Text>
        </View>
      </View>

      {/* Bottom row: Assignee (left) | Delivery date (right) */}
      <View style={C.rowBottom}>
        <View style={C.assigneeWrap}>
          <Ionicons name="person-outline" size={11} color="#9CA3AF" />
          <Text style={C.assignText} numberOfLines={1}>{assigneeText}</Text>
        </View>
        {due ? (
          <Text style={[C.dueText, due.overdue && C.dueOverdue]} numberOfLines={1}>{due.text}</Text>
        ) : (
          <Text style={C.dueEmpty}>No date</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ─── Active Filter Pills ──────────────────────────────────────────────────────

function ActiveFilterPills({ filters, onClear, userNameMap = {} }: {
  filters: FilterState
  onClear: (key: keyof FilterState) => void
  userNameMap?: Record<string, string>
}) {
  const pills: { label: string; key: keyof FilterState }[] = []
  if (filters.statuses.length > 0) {
    const label = filters.statuses.length === 1
      ? (STATUS_META[filters.statuses[0]]?.label ?? filters.statuses[0])
      : `${filters.statuses.length} statuses`
    pills.push({ label, key: 'statuses' })
  }
  if (filters.priorities.length > 0) {
    const label = filters.priorities.length === 1
      ? (PRIORITY_META[filters.priorities[0]]?.label ?? filters.priorities[0])
      : `${filters.priorities.length} priorities`
    pills.push({ label, key: 'priorities' })
  }
  if (filters.assigneeIds.length > 0) {
    const hasUnassigned = filters.assigneeIds.includes('unassigned')
    const parts: string[] = []
    if (hasUnassigned) parts.push('Unassigned')
    filters.assigneeIds.filter(id => id !== 'unassigned').forEach(id => {
      const name = userNameMap[id]
      if (name) parts.push(name.split(' ')[0])
    })
    const label = parts.length > 0
      ? (parts.length <= 2 ? parts.join(', ') : `${parts[0]} +${parts.length - 1}`)
      : filters.assigneeIds.length === 1 ? 'Assignee' : `${filters.assigneeIds.length} assignees`
    pills.push({ label, key: 'assigneeIds' })
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    const label = filters.dueDateFrom && filters.dueDateTo
      ? `${fmtDateShort(filters.dueDateFrom)} – ${fmtDateShort(filters.dueDateTo)}`
      : filters.dueDateFrom ? `From ${fmtDateShort(filters.dueDateFrom)}` : `Until ${fmtDateShort(filters.dueDateTo)}`
    pills.push({ label, key: 'dueDateFrom' })
  }
  if (filters.overdueOnly) pills.push({ label: 'Overdue', key: 'overdueOnly' })
  if (filters.dueTodayOnly) pills.push({ label: 'Today', key: 'dueTodayOnly' })
  if (filters.unreadOnly) pills.push({ label: 'Unread', key: 'unreadOnly' })
  if (filters.staleOnly) pills.push({ label: 'Stale', key: 'staleOnly' })

  if (pills.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
      {pills.map(pill => (
        <TouchableOpacity key={pill.key} style={AP.pill} onPress={() => onClear(pill.key)}>
          <Text style={AP.pillText}>{pill.label}</Text>
          <Ionicons name="close" size={12} color="#6366F1" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AllOrdersScreen({ myOrdersOnly = false }: { myOrdersOnly?: boolean }) {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { isOnline } = useNetworkStatus()
  const { unreadByOrder } = useNotifications(myOrdersOnly ? { mineOnly: true } : {})
  const params = useLocalSearchParams<{ status?: string; priority?: string; today?: string; overdue?: string; stale?: string; assignee?: string; unassigned?: string; _t?: string }>()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)

  // Apply navigation params whenever they change (dashboard KPI taps).
  // The ref prevents re-applying the same params after the user manually clears a filter.
  const lastParamsKey = useRef('')
  useEffect(() => {
    // _t is a nonce added by dashboard taps to force the effect to re-run even when
    // the filter value is the same as a previous navigation (e.g. tapping "Yet to Start" twice).
    const key = `${params.status ?? ''}|${params.overdue ?? ''}|${params.today ?? ''}|${params.stale ?? ''}|${params.assignee ?? ''}|${params.unassigned ?? ''}|${params._t ?? ''}`
    if (key === lastParamsKey.current) return
    lastParamsKey.current = key
    setFilters({
      ...emptyFilters,
      statuses:     params.status   ? params.status.split(',').filter(Boolean)   : [],
      priorities:   params.priority ? params.priority.split(',').filter(Boolean) : [],
      overdueOnly:  params.overdue === '1',
      dueTodayOnly: params.today === '1',
      staleOnly:    params.stale === '1',
      assigneeIds:  params.unassigned === '1' ? ['unassigned'] : (params.assignee ? [params.assignee] : []),
    })
  }, [params.status, params.overdue, params.today, params.stale, params.assignee, params.unassigned, params._t])
  const [showCreate, setShowCreate] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const currentPage = useRef(1)

  // Eagerly resolve user names when assignee filter is set (e.g. arriving from admin metrics)
  useEffect(() => {
    const ids = filters.assigneeIds.filter(id => id !== 'unassigned' && !userNameMap[id])
    if (ids.length === 0) return
    orderService.listUsersForAssignment()
      .then(users => setUserNameMap(m => {
        const next = { ...m }
        users.forEach(u => { next[u.id] = u.name })
        return next
      }))
      .catch(() => {})
  }, [filters.assigneeIds])

  const today = localDateStr(0)

  const queryParams = useMemo(() => ({
    search: search || undefined,
    status: filters.statuses.length ? filters.statuses.join(',') : undefined,
    priority: filters.priorities.length ? filters.priorities.join(',') : undefined,
    assigned_to: myOrdersOnly && user ? user.id : (filters.assigneeIds.length ? filters.assigneeIds.join(',') : undefined),
    overdue: filters.overdueOnly ? '1' : undefined,
    due_from: filters.overdueOnly ? undefined : filters.dueTodayOnly ? today : (filters.dueDateFrom || undefined),
    due_to: filters.overdueOnly ? undefined : filters.dueTodayOnly ? today : (filters.dueDateTo || undefined),
    stale: filters.staleOnly ? '1' : undefined,
  }), [search, filters, myOrdersOnly, user, today])

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    currentPage.current = 1
    try {
      const data = await orderService.listOrders({ ...queryParams, page: 1, limit: 50 })
      setOrders(data.orders)
      setTotal(data.total)
    } catch {
      // silently fail
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [queryParams])

  const loadMore = useCallback(async () => {
    if (loadingMore || filters.unreadOnly) return
    setLoadingMore(true)
    const nextPage = currentPage.current + 1
    try {
      const data = await orderService.listOrders({ ...queryParams, page: nextPage, limit: 50 })
      setOrders(prev => [...prev, ...data.orders])
      setTotal(data.total)
      currentPage.current = nextPage
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, queryParams, filters.unreadOnly])

  const displayedOrders = useMemo(
    () => filters.unreadOnly ? orders.filter(o => (unreadByOrder.get(o.id) ?? 0) > 0) : orders,
    [orders, filters.unreadOnly, unreadByOrder],
  )

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(false), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchOrders, search])

  const { socketStatus } = useOrderSocket(() => fetchOrders(true))

  useEffect(() => {
    const interval = setInterval(() => fetchOrders(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') fetchOrders(true)
    })
    return () => sub.remove()
  }, [fetchOrders])

  const onRefresh = () => { setRefreshing(true); fetchOrders(true) }

  const filterCount = activeCount(filters)
  const hasAnyFilter = filterCount > 0 || !!search

  const clearFilterKey = (key: keyof FilterState) => {
    setFilters(f => {
      const next = { ...f }
      if (key === 'dueDateFrom') { next.dueDateFrom = ''; next.dueDateTo = '' }
      else if (key === 'assigneeIds') { next.assigneeIds = [] }
      else if (key === 'statuses') { next.statuses = [] }
      else if (key === 'priorities') { next.priorities = [] }
      else (next as Record<keyof FilterState, string | boolean | string[]>)[key] = typeof f[key] === 'boolean' ? false : ''
      return next
    })
  }

  return (
    <View style={S.screen}>
      <OfflineBanner isOnline={isOnline} />
      {socketStatus === 'reconnecting' && isOnline && (
        <View style={S.socketBanner}>
          <Text style={S.socketBannerText}>Reconnecting · Live updates paused</Text>
        </View>
      )}

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
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter icon button */}
          <TouchableOpacity style={[S.filterBtn, filterCount > 0 && S.filterBtnActive]} onPress={() => setShowFilters(true)}>
            <Ionicons name="options-outline" size={20} color={filterCount > 0 ? '#6366F1' : '#475569'} />
            {filterCount > 0 && (
              <View style={S.filterBadge}>
                <Text style={S.filterBadgeText}>{filterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active filter pills */}
        <ActiveFilterPills filters={filters} onClear={clearFilterKey} userNameMap={userNameMap} />
      </View>

      <View style={S.countBar}>
        <View>
          <Text style={S.screenTitle}>{myOrdersOnly ? 'My Orders' : 'All Orders'}</Text>
          <Text style={S.countText}>
            {loading
              ? 'Loading…'
              : filters.unreadOnly
                ? `${displayedOrders.length} unread`
                : total === 0
                  ? (myOrdersOnly ? '0 orders assigned to you' : '0 orders')
                  : `${displayedOrders.length}${total > orders.length ? ` of ${total}` : ''} ${myOrdersOnly ? 'assigned ' : ''}order${displayedOrders.length !== 1 ? 's' : ''}${hasAnyFilter ? ' · filtered' : ''}`
            }
          </Text>
        </View>
        {hasAnyFilter && (
          <TouchableOpacity onPress={() => { setFilters(emptyFilters); setSearch('') }}>
            <Text style={S.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading && orders.length === 0 ? (
        <CardSkeleton count={6} />
      ) : displayedOrders.length === 0 ? (
        <ScrollView contentContainerStyle={S.centerList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}>
          <View style={S.emptyIconWrap}><Ionicons name="albums-outline" size={32} color="#94A3B8" /></View>
          <Text style={S.emptyTitle}>No orders found</Text>
          <Text style={S.emptySub}>{hasAnyFilter ? 'Try adjusting your filters.' : 'Create your first operation to get started.'}</Text>
          {!hasAnyFilter && user?.role === 'admin' && (
            <TouchableOpacity style={S.emptyBtn} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
              <Text style={S.emptyBtnText}>Create Order</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={displayedOrders}
          keyExtractor={o => o.id}
          renderItem={({ item: o }) => (
            <OrderCard order={o} onOpen={() => router.push(`/order/${o.id}`)} unreadCount={unreadByOrder.get(o.id) ?? 0} />
          )}
          style={S.list}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40), padding: 12, backgroundColor: '#F5F6FA' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
          onEndReached={() => { if (orders.length < total) loadMore() }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color="#6366F1" /> : null}
        />
      )}

      {user?.role === 'admin' && (
        <TouchableOpacity style={S.fab} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
        myOrdersOnly={myOrdersOnly}
      />
      <OrderFormModal visible={showCreate} order={editOrder} onClose={() => setShowCreate(false)} onRefresh={() => fetchOrders(false)} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  headerSurface: {
    backgroundColor: '#FFFFFF',
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginBottom: 8,
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

  socketBanner: { backgroundColor: '#FEF3C7', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#FCD34D' },
  socketBannerText: { fontSize: 12.5, fontWeight: '600', color: '#92400E' },

  countBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  countText: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  clearAllText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },

  list: { flex: 1 },
  centerList: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  emptyBtn: { marginTop: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  emptyBtnText: { color: '#111827', fontSize: 14, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6, zIndex: 100,
  },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
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
  helper: { fontSize: 13, lineHeight: 19, color: '#64748B', marginBottom: 12 },
  assigneeOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,.35)' },
  assigneePanel: { maxHeight: '80%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  assigneePanelHeader: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneButton: { minHeight: 44, minWidth: 60, borderRadius: 10, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  doneText: { fontSize: 15, fontWeight: '700', color: '#4338CA' },
  container: sheetUI.canvas,
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  clearBtn: { fontSize: 14, fontWeight: '600', color: '#4F46E5', paddingVertical: 10 },

  section: sheetUI.group,
  sectionLabel: sheetUI.sectionTitle,
  dimText: { fontSize: 14, color: '#9CA3AF' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 44, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: '#4B5563' },

  userList: { borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  userRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  userRowActive: { backgroundColor: '#EEF2FF' },
  userRowText: { flex: 1, fontSize: 15, color: '#374151', fontWeight: '500' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },

  assigneeTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#FFFFFF',
  },
  assigneeTriggerText: { flex: 1, fontSize: 15, color: '#0F172A', marginRight: 8 },
  assigneeList: {
    marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#FFFFFF', maxHeight: 360,
  },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  assigneeRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  assigneeRowActive: { backgroundColor: '#EEF2FF' },

  dateLabel: { fontSize: 13, fontWeight: '700', color: '#4B5563', marginBottom: 8 },
  dateInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827', backgroundColor: '#FFFFFF',
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  toggleRowActive: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  toggleRowToday: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  toggleRowUnread: { borderColor: '#C7D2FE', backgroundColor: '#EEF2FF' },
  toggleLabel: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  toggleSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  toggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: '#E5E7EB', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: '#EF4444' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
  toggleThumbOn: { alignSelf: 'flex-end' },

  footer: sheetUI.footer,
  applyBtn: sheetUI.primaryButton,
  applyText: sheetUI.primaryText,
})

const C = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardUnread: { borderColor: '#C7D2FE', borderWidth: 1.5 },

  // Top row: order ID + unread badge (left) | status (right)
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNumWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  orderNum: { fontSize: 15, fontWeight: '800', color: '#6366F1' },
  unreadPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EF4444', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 4, elevation: 4,
  },
  unreadPillText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, flexShrink: 0 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, flexShrink: 0 },
  statusText: { fontSize: 12, fontWeight: '700' },

  // Middle row: customer name + priority
  rowMiddle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customerName: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1, maxWidth: '60%' },

  // Bottom row
  rowBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10,
  },
  assigneeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  assignText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  dueText: { fontSize: 12.5, color: '#6B7280', fontWeight: '600', flexShrink: 0 },
  dueOverdue: { color: '#EF4444', fontWeight: '700' },
  dueEmpty: { fontSize: 12.5, color: '#9CA3AF', flexShrink: 0, fontWeight: '500' },
})

const F = StyleSheet.create({
  container: sheetUI.canvas,
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  body: { flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 20, color: '#64748B', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 4 },
  sectionDivider: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 24, marginTop: 24 },
  footer: sheetUI.footer,
  requiredNote: { fontSize: 12, color: '#64748B' },
  assignmentOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  assignmentPanel: { maxHeight: '75%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  assignmentHeader: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  doneButton: { minWidth: 60, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', borderRadius: 10 },
  doneText: { color: '#4338CA', fontSize: 15, fontWeight: '700' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
  label: sheetUI.label,
  input: sheetUI.input,
  chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#F3F4F6', backgroundColor: '#FFFFFF' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  assignList: { borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', flexDirection: 'column', marginTop: 10 },
  assignRow: { minHeight: 56, gap: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  assignRowActive: { backgroundColor: '#EEF2FF' },
  assignText: { flex: 1, fontSize: 15, color: '#374151', fontWeight: '500' },
  submitBtn: sheetUI.primaryButton,
  submitText: sheetUI.primaryText,
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, overflow: 'hidden' },
  portalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 16, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  portalLabel: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
})

