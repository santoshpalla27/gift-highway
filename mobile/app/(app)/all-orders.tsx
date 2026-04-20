import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Platform, Alert, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useEffect, useCallback } from 'react'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { formatDate, fmt12hrStr } from '../../utils/date'
import { orderService, Order, UserOption } from '../../services/orderService'
import { staffPortalApi } from '../../services/portalService'
import { useAuthStore } from '../../store/authStore'
import { useOrderSocket } from '../../hooks/useOrderSocket'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import { CardSkeleton } from '../../components/CardSkeleton'

// ─── Metadata ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const overdue = d < now
  let text = ''
  if (d.getTime() === now.getTime()) text = 'Due Today'
  else if (d.getTime() === tomorrow.getTime()) text = 'Due Tomorrow'
  else text = `Due ${formatDate(dateStr)}`
  return { text, overdue }
}

function fmtDateShort(iso: string) {
  return formatDate(iso)
}

// ─── Filter Sheet ─────────────────────────────────────────────────────────────

interface FilterState {
  status: string
  priority: string
  assigneeId: string
  assigneeName: string
  dueDateFrom: string
  dueDateTo: string
  overdueOnly: boolean
  dueTodayOnly: boolean
}

const emptyFilters: FilterState = {
  status: '', priority: '', assigneeId: '', assigneeName: '',
  dueDateFrom: '', dueDateTo: '', overdueOnly: false, dueTodayOnly: false,
}

function activeCount(f: FilterState) {
  return [f.status, f.priority, f.assigneeId, f.dueDateFrom || f.dueDateTo, f.overdueOnly, f.dueTodayOnly].filter(Boolean).length
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
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)

  useEffect(() => {
    if (visible) {
      setDraft(filters)
      if (!usersLoaded && !myOrdersOnly) {
        orderService.listUsersForAssignment().then(u => { setUsers(u); setUsersLoaded(true) }).catch(() => {})
      }
    }
  }, [visible])

  const set = (patch: Partial<FilterState>) => setDraft(d => ({ ...d, ...patch }))
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(filters)
  const draftCount = activeCount(draft)

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
              {STATUS_OPTIONS.map(s => {
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

          {/* Priority */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>PRIORITY</Text>
            <View style={FS.optionRow}>
              {PRIORITY_OPTIONS.map(p => {
                const active = draft.priority === p
                return (
                  <TouchableOpacity key={p}
                    style={[FS.optionChip, active && { backgroundColor: PRIORITY_META[p].bg, borderColor: PRIORITY_META[p].color }]}
                    onPress={() => set({ priority: active ? '' : p })}
                  >
                    <View style={[FS.dot, { backgroundColor: PRIORITY_META[p].color }]} />
                    <Text style={[FS.optionText, active && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>
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
              <Text style={FS.sectionLabel}>ASSIGNEE</Text>
              {users.length === 0 ? (
                <Text style={FS.dimText}>Loading…</Text>
              ) : (
                <View style={FS.userList}>
                  {users.map((u, i) => {
                    const active = draft.assigneeId === u.id
                    const initials = u.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                    return (
                      <TouchableOpacity key={u.id}
                        style={[FS.userRow, active && FS.userRowActive, i < users.length - 1 && FS.userRowBorder]}
                        onPress={() => set({ assigneeId: active ? '' : u.id, assigneeName: active ? '' : u.name })}
                      >
                        <View style={FS.avatar}>
                          <Text style={FS.avatarText}>{initials}</Text>
                        </View>
                        <Text style={[FS.userRowText, active && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                        {active && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          {/* Due Date range */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>DELIVERY DATE RANGE</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={FS.dateLabel}>From</Text>
                {Platform.OS === 'web' ? (
                  <View style={FS.dateInput}>
                    <input type="date" value={draft.dueDateFrom || ''} onChange={(e: any) => set({ dueDateFrom: e.target.value })}
                      style={{ fontSize: 14, border: 'none', outline: 'none', background: 'transparent', color: draft.dueDateFrom ? '#0F172A' : '#94A3B8', cursor: 'pointer', width: '100%' }} />
                  </View>
                ) : (
                  <TouchableOpacity style={FS.dateInput} onPress={() => setShowFromPicker(true)}>
                    <Text style={{ color: draft.dueDateFrom ? '#0F172A' : '#94A3B8', fontSize: 14 }}>
                      {draft.dueDateFrom ? formatDate(draft.dueDateFrom) : 'DD/MM/YYYY'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={FS.dateLabel}>To</Text>
                {Platform.OS === 'web' ? (
                  <View style={FS.dateInput}>
                    <input type="date" value={draft.dueDateTo || ''} onChange={(e: any) => set({ dueDateTo: e.target.value })}
                      style={{ fontSize: 14, border: 'none', outline: 'none', background: 'transparent', color: draft.dueDateTo ? '#0F172A' : '#94A3B8', cursor: 'pointer', width: '100%' }} />
                  </View>
                ) : (
                  <TouchableOpacity style={FS.dateInput} onPress={() => setShowToPicker(true)}>
                    <Text style={{ color: draft.dueDateTo ? '#0F172A' : '#94A3B8', fontSize: 14 }}>
                      {draft.dueDateTo ? formatDate(draft.dueDateTo) : 'DD/MM/YYYY'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* From date picker (native only) */}
          {Platform.OS !== 'web' && (
            <Modal visible={showFromPicker} transparent animationType="fade" onRequestClose={() => setShowFromPicker(false)}>
              <View style={F.pickerOverlay}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowFromPicker(false)} />
                <View style={F.pickerSheet}>
                  <View style={F.pickerHeader}>
                    <Text style={F.pickerTitle}>From Date</Text>
                    <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                      <Text style={F.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={draft.dueDateFrom ? new Date(draft.dueDateFrom + 'T00:00:00') : new Date()}
                    mode="date"
                    display="spinner"
                    onChange={(_, d) => { if (d) { const iso = d.toISOString().split('T')[0]; set({ dueDateFrom: iso }) } }}
                    style={{ width: '100%', height: 216 }}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* To date picker (native only) */}
          {Platform.OS !== 'web' && (
            <Modal visible={showToPicker} transparent animationType="fade" onRequestClose={() => setShowToPicker(false)}>
              <View style={F.pickerOverlay}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowToPicker(false)} />
                <View style={F.pickerSheet}>
                  <View style={F.pickerHeader}>
                    <Text style={F.pickerTitle}>To Date</Text>
                    <TouchableOpacity onPress={() => setShowToPicker(false)}>
                      <Text style={F.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={draft.dueDateTo ? new Date(draft.dueDateTo + 'T00:00:00') : new Date()}
                    mode="date"
                    display="spinner"
                    onChange={(_, d) => { if (d) { const iso = d.toISOString().split('T')[0]; set({ dueDateTo: iso }) } }}
                    style={{ width: '100%', height: 216 }}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Quick filters */}
          <View style={FS.section}>
            <Text style={FS.sectionLabel}>QUICK FILTERS</Text>
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[FS.toggleRow, draft.overdueOnly && FS.toggleRowActive]}
                onPress={() => set({ overdueOnly: !draft.overdueOnly, dueTodayOnly: false })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.overdueOnly && { color: '#EF4444' }]}>Overdue only</Text>
                  <Text style={FS.toggleSub}>Orders past their due date</Text>
                </View>
                <View style={[FS.toggle, draft.overdueOnly && FS.toggleOn]}>
                  <View style={[FS.toggleThumb, draft.overdueOnly && FS.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[FS.toggleRow, draft.dueTodayOnly && FS.toggleRowToday]}
                onPress={() => set({ dueTodayOnly: !draft.dueTodayOnly, overdueOnly: false })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[FS.toggleLabel, draft.dueTodayOnly && { color: '#D97706' }]}>Due today</Text>
                  <Text style={FS.toggleSub}>Orders due on today's date</Text>
                </View>
                <View style={[FS.toggle, draft.dueTodayOnly && { backgroundColor: '#F59E0B' }]}>
                  <View style={[FS.toggleThumb, draft.dueTodayOnly && FS.toggleThumbOn]} />
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
  const [title, setTitle] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [createPortal, setCreatePortal] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (visible) orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [visible])

  useEffect(() => {
    if (order) {
      setTitle(order.title); setCustomerName(order.customer_name)
      setContactNumber(order.contact_number ?? ''); setDescription(order.description)
      setPriority(order.priority); setAssignedTo(order.assigned_to ?? []); setDueDate(order.due_date ?? ''); setDueTime(order.due_time ?? '')
    } else {
      setTitle(''); setCustomerName(''); setContactNumber(''); setDescription('')
      setPriority('medium'); setAssignedTo([]); setDueDate(''); setDueTime(''); setCreatePortal(false)
    }
    setError('')
  }, [order, visible])

  const handleSubmit = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!title.trim() || !customerName.trim()) { setError('Title and Customer Name are required.'); return }
    setLoading(true); setError('')
    try {
      const payload = { title: title.trim(), customer_name: customerName.trim(), contact_number: contactNumber.trim(), description: description.trim(), priority, assigned_to: assignedTo, due_date: dueDate || null, due_time: dueTime || null }
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={F.container}>
        <View style={F.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={F.title}>{isEdit ? 'Edit Order' : 'Create Order'}</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={F.body} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40) }} keyboardShouldPersistTaps="handled">
          {error ? <View style={F.errorBox}><Text style={F.errorText}>{error}</Text></View> : null}
          <Text style={F.label}>Title *</Text>
          <TextInput style={F.input} value={title} onChangeText={setTitle} placeholder="e.g. Wedding Banner" autoCapitalize="words" />
          <Text style={F.label}>Customer Name *</Text>
          <TextInput style={F.input} value={customerName} onChangeText={setCustomerName} placeholder="e.g. Rahul Sharma" autoCapitalize="words" />
          <Text style={F.label}>Contact Number</Text>
          <TextInput style={F.input} value={contactNumber} onChangeText={setContactNumber} placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" />
          <Text style={F.label}>Description</Text>
          <TextInput style={[F.input, { minHeight: 80 }]} value={description} onChangeText={setDescription} placeholder="Include operational details..." multiline textAlignVertical="top" />
          <Text style={F.label}>Priority</Text>
          <View style={F.chipRow}>
            {PRIORITY_OPTIONS.map(p => (
              <TouchableOpacity key={p} style={[F.chip, priority === p && { backgroundColor: PRIORITY_META[p].bg, borderColor: PRIORITY_META[p].bg }]} onPress={() => setPriority(p)}>
                <Text style={[F.chipText, priority === p && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={F.label}>Due Date & Time</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {Platform.OS === 'web' ? (
              <>
                <View style={[F.input, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
                  <input type="date" value={dueDate || ''} onChange={(e: any) => setDueDate(e.target.value)}
                    style={{ flex: 1, fontSize: 15, border: 'none', outline: 'none', background: 'transparent', color: dueDate ? '#0F172A' : '#94A3B8', cursor: 'pointer' }} />
                </View>
                <View style={[F.input, { width: 110, flexDirection: 'row', alignItems: 'center' }]}>
                  <input type="time" value={dueTime || ''} onChange={(e: any) => setDueTime(e.target.value)}
                    style={{ flex: 1, fontSize: 15, border: 'none', outline: 'none', background: 'transparent', color: dueTime ? '#0F172A' : '#94A3B8', cursor: 'pointer' }} />
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[F.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={{ fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }}>
                    {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[F.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={{ fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }}>
                    {dueTime ? fmt12hrStr(dueTime) : 'Time'}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                  <View style={F.pickerOverlay}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                    <View style={F.pickerSheet}>
                      <View style={F.pickerHeader}>
                        <Text style={F.pickerTitle}>Select Date</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={F.pickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={dueDate ? new Date(dueDate + 'T00:00:00') : new Date()}
                        mode="date"
                        display="spinner"
                        onChange={(_, date) => {
                          if (date) {
                            const y = date.getFullYear()
                            const m = String(date.getMonth() + 1).padStart(2, '0')
                            const d = String(date.getDate()).padStart(2, '0')
                            setDueDate(`${y}-${m}-${d}`)
                          }
                        }}
                        style={{ width: '100%', height: 216 }}
                      />
                    </View>
                  </View>
                </Modal>
                <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
                  <View style={F.pickerOverlay}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTimePicker(false)} />
                    <View style={F.pickerSheet}>
                      <View style={F.pickerHeader}>
                        <Text style={F.pickerTitle}>Select Time</Text>
                        <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                          <Text style={F.pickerDone}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={(() => {
                          const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date()
                          if (dueTime) { const [h, min] = dueTime.split(':').map(Number); base.setHours(h, min, 0, 0) }
                          return base
                        })()}
                        mode="time"
                        display="spinner"
                        onChange={(_, date) => {
                          if (date) {
                            setDueTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`)
                          }
                        }}
                        style={{ width: '100%', height: 216 }}
                      />
                    </View>
                  </View>
                </Modal>
              </>
            )}
          </View>
          <Text style={F.label}>Assign To</Text>
          <TouchableOpacity style={[F.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} onPress={() => setAssignOpen(o => !o)}>
            <Text style={{ fontSize: 15, color: assignedTo.length > 0 ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
              {assignedTo.length === 0 ? '— Unassigned —' : users.filter(u => assignedTo.includes(u.id)).map(u => u.name.split(' ')[0]).join(', ')}
            </Text>
            <Ionicons name={assignOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>
          {assignOpen && (
            <View style={F.assignList}>
              <TouchableOpacity style={[F.assignRow, assignedTo.length === 0 && F.assignRowActive]} onPress={() => setAssignedTo([])}>
                <Text style={[F.assignText, assignedTo.length === 0 && { color: '#0F172A', fontWeight: '700' }]}>— Unassigned —</Text>
                {assignedTo.length === 0 && <Ionicons name="checkmark-circle" size={18} color="#0F172A" />}
              </TouchableOpacity>
              {users.map(u => {
                const selected = assignedTo.includes(u.id)
                return (
                  <TouchableOpacity key={u.id} style={[F.assignRow, selected && F.assignRowActive]} onPress={() => setAssignedTo(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                    <Text style={[F.assignText, selected && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                    {selected ? <Ionicons name="checkbox" size={20} color="#0F172A" /> : <Ionicons name="square-outline" size={20} color="#CBD5E1" />}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
          {!isEdit && (
            <TouchableOpacity style={F.portalRow} onPress={() => setCreatePortal(v => !v)} activeOpacity={0.7}>
              <View style={[F.checkbox, createPortal && F.checkboxOn]}>
                {createPortal && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
              </View>
              <Text style={F.portalLabel}>Generate customer portal link after creation</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={F.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={F.submitText}>{isEdit ? 'Save Changes' : 'Create Order'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Status Picker Modal ──────────────────────────────────────────────────────

function StatusPickerModal({ order, onClose, onRefresh }: { order: Order | null; onClose: () => void; onRefresh: () => void }) {
  const insets = useSafeAreaInsets()
  const handlePick = async (status: string) => {
    if (!order) return
    try { await orderService.updateStatus(order.id, status); onRefresh() }
    catch { Alert.alert('Error', 'Could not update status') }
    onClose()
  }
  return (
    <Modal visible={!!order} transparent animationType="fade" onRequestClose={onClose}>
      <View style={SP.overlay}>
        <View style={[SP.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <Text style={SP.title}>Change Status</Text>
          <Text style={SP.sub}>Updating #{order?.order_number} — {order?.title}</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity key={s} style={[SP.row, order?.status === s && SP.rowActive]} onPress={() => handlePick(s)}>
              <View style={[SP.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[SP.rowText, order?.status === s && { color: STATUS_META[s].color, fontWeight: '600' }]}>{STATUS_META[s].label}</Text>
              {order?.status === s && <Ionicons name="checkmark" size={18} color={STATUS_META[s].color} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={SP.cancelBtn} onPress={onClose}>
            <Text style={SP.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onOpen, onStatusPress }: { order: Order; onOpen: () => void; onStatusPress: () => void }) {
  const due = formatDueDate(order.due_date)
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium
  return (
    <TouchableOpacity style={C.card} onPress={onOpen} activeOpacity={0.6}>
      <View style={C.rowTop}>
        <Text style={C.orderNum} numberOfLines={1}>#{order.order_number} <Text style={C.title}>{order.title}</Text></Text>
        <TouchableOpacity onPress={onStatusPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[C.statusText, { color: sm.color }]}>{sm.label}</Text>
        </TouchableOpacity>
      </View>
      <View style={C.rowBottom}>
        <View style={C.bottomLeft}>
          <Text style={C.metaText} numberOfLines={1}>
            {order.assigned_names?.length > 0 ? order.assigned_names[0].split(' ')[0] + (order.assigned_names.length > 1 ? ` +${order.assigned_names.length - 1}` : '') : 'Unassigned'}
          </Text>
        </View>
        <View style={C.bottomCenter}>
          <Text style={[C.priorityText, { color: pm.color }]}>{pm.label}</Text>
        </View>
        <View style={C.bottomRight}>
          {due && <Text style={[C.metaText, due.overdue && { color: '#EF4444', fontWeight: '600' }]}>{due.text}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Active Filter Pills ──────────────────────────────────────────────────────

function ActiveFilterPills({ filters, onClear }: { filters: FilterState; onClear: (key: keyof FilterState) => void }) {
  const pills: { label: string; key: keyof FilterState }[] = []
  if (filters.status) pills.push({ label: STATUS_META[filters.status]?.label ?? filters.status, key: 'status' })
  if (filters.priority) pills.push({ label: PRIORITY_META[filters.priority]?.label ?? filters.priority, key: 'priority' })
  if (filters.assigneeId) pills.push({ label: filters.assigneeName || 'Assignee', key: 'assigneeId' })
  if (filters.dueDateFrom || filters.dueDateTo) {
    const label = filters.dueDateFrom && filters.dueDateTo
      ? `${fmtDateShort(filters.dueDateFrom)} – ${fmtDateShort(filters.dueDateTo)}`
      : filters.dueDateFrom ? `From ${fmtDateShort(filters.dueDateFrom)}` : `Until ${fmtDateShort(filters.dueDateTo)}`
    pills.push({ label, key: 'dueDateFrom' })
  }
  if (filters.overdueOnly) pills.push({ label: 'Overdue', key: 'overdueOnly' })
  if (filters.dueTodayOnly) pills.push({ label: 'Due Today', key: 'dueTodayOnly' })

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
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [showCreate, setShowCreate] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [statusOrder, setStatusOrder] = useState<Order | null>(null)

  const d0 = new Date()
  const today = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`
  const d1 = new Date(d0); d1.setDate(d1.getDate() - 1)
  const yesterday = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    try {
      const data = await orderService.listOrders({
        search: search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        assigned_to: myOrdersOnly && user ? user.id : (filters.assigneeId || undefined),
        due_from: filters.overdueOnly ? undefined : filters.dueTodayOnly ? today : (filters.dueDateFrom || undefined),
        due_to: filters.overdueOnly ? yesterday : filters.dueTodayOnly ? today : (filters.dueDateTo || undefined),
      })
      setOrders(data.orders)
      setTotal(filters.overdueOnly || filters.dueTodayOnly ? data.orders.length : data.total)
    } catch {
      // silently fail
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [search, filters, myOrdersOnly, user])

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(false), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchOrders, search])

  const { socketStatus } = useOrderSocket(() => fetchOrders(true))

  useEffect(() => {
    const interval = setInterval(() => fetchOrders(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const onRefresh = () => { setRefreshing(true); fetchOrders(true) }

  const filterCount = activeCount(filters)
  const hasAnyFilter = filterCount > 0 || !!search

  const clearFilterKey = (key: keyof FilterState) => {
    setFilters(f => {
      const next = { ...f }
      if (key === 'dueDateFrom') { next.dueDateFrom = ''; next.dueDateTo = '' }
      else if (key === 'assigneeId') { next.assigneeId = ''; next.assigneeName = '' }
      else (next as Record<keyof FilterState, string | boolean>)[key] = typeof f[key] === 'boolean' ? false : ''
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
        <ActiveFilterPills filters={filters} onClear={clearFilterKey} />
      </View>

      <View style={S.countBar}>
        <Text style={S.countText}>{orders.length} order{orders.length !== 1 ? 's' : ''}{hasAnyFilter ? ' · filtered' : ''}</Text>
        {hasAnyFilter && (
          <TouchableOpacity onPress={() => { setFilters(emptyFilters); setSearch('') }}>
            <Text style={S.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading && orders.length === 0 ? (
        <CardSkeleton count={6} />
      ) : orders.length === 0 ? (
        <ScrollView contentContainerStyle={S.centerList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}>
          <View style={S.emptyIconWrap}><Ionicons name="albums-outline" size={32} color="#94A3B8" /></View>
          <Text style={S.emptyTitle}>No orders found</Text>
          <Text style={S.emptySub}>{hasAnyFilter ? 'Try adjusting your filters.' : 'Create your first operation to get started.'}</Text>
          {!hasAnyFilter && (
            <TouchableOpacity style={S.emptyBtn} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
              <Text style={S.emptyBtnText}>Create Order</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={S.list}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40), padding: 12, backgroundColor: '#F8FAFC' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
        >
          {orders.map(o => (
            <OrderCard key={o.id} order={o} onOpen={() => router.push(`/order/${o.id}`)} onStatusPress={() => setStatusOrder(o)} />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={S.fab} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
        myOrdersOnly={myOrdersOnly}
      />
      <OrderFormModal visible={showCreate} order={editOrder} onClose={() => setShowCreate(false)} onRefresh={() => fetchOrders(false)} />
      <StatusPickerModal order={statusOrder} onClose={() => setStatusOrder(null)} onRefresh={() => fetchOrders(false)} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  headerSurface: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, marginBottom: 4,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8,
  },
  searchFocused: { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A', ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }) },
  filterBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 17, height: 17, borderRadius: 9,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  socketBanner: { backgroundColor: '#FEF3C7', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#FCD34D' },
  socketBannerText: { fontSize: 12.5, fontWeight: '600', color: '#92400E' },

  countBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  countText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  clearAllText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },

  list: { flex: 1 },
  centerList: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  emptyBtn: { marginTop: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, zIndex: 100,
  },
})

const AP = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: '#EEF2FF',
    borderWidth: 1, borderColor: '#C7D2FE',
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
})

const FS = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  clearBtn: { fontSize: 14, fontWeight: '600', color: '#EF4444' },

  section: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 12 },
  dimText: { fontSize: 13, color: '#94A3B8' },

  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { fontSize: 13, fontWeight: '600', color: '#475569' },

  userList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  userRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  userRowActive: { backgroundColor: '#F8FAFC' },
  userRowText: { flex: 1, fontSize: 14, color: '#475569' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },

  dateLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  dateInput: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0F172A',
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  toggleRowActive: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  toggleRowToday: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  toggleSub: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: '#EF4444' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleThumbOn: { alignSelf: 'flex-end' },

  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  applyBtn: { backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  applyText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
})

const C = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNum: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  title: { fontWeight: '400', color: '#475569', fontSize: 15 },
  statusText: { fontSize: 13, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomLeft: { flex: 1, alignItems: 'flex-start' },
  bottomCenter: { flex: 1, alignItems: 'center' },
  bottomRight: { flex: 1, alignItems: 'flex-end' },
  metaText: { fontSize: 13, color: '#64748B' },
  priorityText: { fontSize: 13, fontWeight: '500' },
})

const F = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  body: { padding: 24 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0F172A' },
  chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  assignList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', flexDirection: 'column' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  assignRowActive: { backgroundColor: '#F8FAFC' },
  assignText: { fontSize: 15, color: '#475569' },
  submitBtn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32, overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pickerTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  pickerDone: { fontSize: 15, fontWeight: '700', color: '#6366F1' },
  portalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  portalLabel: { flex: 1, fontSize: 14, color: '#475569' },
})

const SP = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  rowActive: { backgroundColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
  cancelBtn: { marginTop: 12, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
})
