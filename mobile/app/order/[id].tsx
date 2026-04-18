import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Alert, RefreshControl, Modal
} from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { orderService, Order, OrderEvent, UserOption } from '../../services/orderService'
import { useAuthStore } from '../../store/authStore'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useOrderSocket } from '../../hooks/useOrderSocket'

// ─── Metadata ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',         color: '#334155', bg: '#F8FAFC' },
  in_progress: { label: 'In Progress', color: '#1E40AF', bg: '#EFF6FF' },
  completed:   { label: 'Completed',   color: '#166534', bg: '#F0FDF4' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#475569', bg: '#F1F5F9' },
  medium: { label: 'Medium', color: '#92400E', bg: '#FEF3C7' },
  high:   { label: 'High',   color: '#86198F', bg: '#FAE8FF' },
  urgent: { label: 'Urgent', color: '#991B1B', bg: '#FEE2E2' },
}

const EVENT_TYPE_META: Record<string, { icon: string; label: (p: Record<string, string>) => string }> = {
  order_created:     { icon: 'add-circle-outline',  label: () => 'Order created' },
  comment_added:     { icon: 'chatbubble-outline',  label: () => '' },
  status_changed:    { icon: 'swap-horizontal-outline', label: p => `Status changed from ${STATUS_META[p.from]?.label ?? p.from} to ${STATUS_META[p.to]?.label ?? p.to}` },
  assignees_changed: { icon: 'people-outline',      label: p => p.names ? `Assigned to ${p.names}` : 'Assignees updated' },
  due_date_changed:  { icon: 'calendar-outline',    label: p => p.to ? `Due date set to ${p.to}` : 'Due date removed' },
  priority_changed:  { icon: 'flag-outline',        label: p => `Priority changed to ${PRIORITY_META[p.to]?.label ?? p.to}` },
  order_updated:     { icon: 'pencil-outline',      label: () => 'Order details updated' },
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 7200) return `${Math.floor(diffSec / 3600)}h ago`
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return time
  if (dDay.getTime() === yesterday.getTime()) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return 'Today'
  if (dDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function groupByDate(events: OrderEvent[]): { label: string; events: OrderEvent[] }[] {
  const map = new Map<string, OrderEvent[]>()
  for (const ev of events) {
    const k = dayKey(ev.created_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(ev)
  }
  return Array.from(map.entries()).map(([k, evs]) => ({
    label: formatDateGroup(k + 'T12:00:00'),
    events: evs,
  }))
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

function TimelineItem({ event, isOptimistic, onRetry }: {
  event: OrderEvent & { failed?: boolean }
  isOptimistic?: boolean
  onRetry?: () => void
}) {
  const isComment = event.type === 'comment_added'
  const meta = EVENT_TYPE_META[event.type]

  if (isComment) {
    const text = typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, string>).text ?? ''
      : ''
    const isFailed = event.failed
    return (
      <View style={[T.commentRow, isOptimistic && !isFailed && { opacity: 0.6 }]}>
        <View style={T.avatar}>
          <Text style={T.avatarText}>{getInitials(event.actor_name || '?')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={T.bubbleHeader}>
            <Text style={T.actorName}>{event.actor_name}</Text>
            <Text style={[T.time, isFailed && { color: '#EF4444' }]}>
              {isFailed ? 'Failed to send' : formatTimestamp(event.created_at)}
            </Text>
          </View>
          <View style={[T.bubble, isFailed && { backgroundColor: '#FFF5F5', borderColor: '#FCA5A5' }]}>
            <Text style={T.commentText}>{text}</Text>
          </View>
          {isFailed && (
            <View style={T.retryRow}>
              <Text style={T.retryMsg}>Message not delivered.</Text>
              <TouchableOpacity onPress={onRetry}>
                <Text style={T.retryBtn}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    )
  }

  const label = meta?.label(event.payload as Record<string, string> ?? {}) ?? event.type
  return (
    <View style={T.systemRow}>
      <View style={T.systemIconWrap}>
        <Ionicons name={(meta?.icon ?? 'ellipse-outline') as any} size={13} color="#6B7280" />
      </View>
      <View style={T.systemContent}>
        <Text style={T.systemLabel} numberOfLines={2}>
          <Text style={T.systemActor}>{event.actor_name}</Text>
          {' · '}{label}
        </Text>
        <Text style={T.systemMeta}>{formatTimestamp(event.created_at)}</Text>
      </View>
    </View>
  )
}

// ─── Status Picker Sheet ──────────────────────────────────────────────────────

function StatusSheet({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const handlePick = async (status: string) => {
    try {
      await orderService.updateStatus(order.id, status)
      onChanged()
    } catch {
      Alert.alert('Error', 'Could not update status')
    }
    onClose()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={SS.overlay} activeOpacity={1} onPress={onClose}>
        <View style={SS.sheet}>
          <Text style={SS.title}>Change Status</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[SS.row, order.status === s && SS.rowActive]}
              onPress={() => handlePick(s)}
            >
              <View style={[SS.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[SS.rowText, order.status === s && { color: STATUS_META[s].color, fontWeight: '600' }]}>
                {STATUS_META[s].label}
              </Text>
              {order.status === s && <Ionicons name="checkmark" size={18} color={STATUS_META[s].color} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Edit Order Sheet ─────────────────────────────────────────────────────────

function EditOrderSheet({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const { isOnline } = useNetworkStatus()
  const [title, setTitle] = useState(order.title)
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [contactNumber, setContactNumber] = useState(order.contact_number ?? '')
  const [description, setDescription] = useState(order.description)
  const [priority, setPriority] = useState(order.priority)
  const [dueDate, setDueDate] = useState(order.due_date ?? '')
  const [assignedTo, setAssignedTo] = useState<string[]>(order.assigned_to ?? [])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!title.trim() || !customerName.trim()) { setError('Title and Customer Name are required.'); return }
    setLoading(true)
    setError('')
    try {
      await orderService.updateOrder(order.id, {
        title: title.trim(), customer_name: customerName.trim(),
        contact_number: contactNumber.trim(), description: description.trim(),
        priority, assigned_to: assignedTo, due_date: dueDate || null,
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not save.')
    } finally {
      setLoading(false)
    }
  }

  const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={E.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Edit Order</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {error ? <View style={E.errorBox}><Text style={E.errorText}>{error}</Text></View> : null}

          <Text style={E.label}>Title *</Text>
          <TextInput style={E.input} value={title} onChangeText={setTitle} autoCapitalize="words" />

          <Text style={E.label}>Customer Name *</Text>
          <TextInput style={E.input} value={customerName} onChangeText={setCustomerName} autoCapitalize="words" />

          <Text style={E.label}>Contact Number</Text>
          <TextInput style={E.input} value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />

          <Text style={E.label}>Description</Text>
          <TextInput style={[E.input, { minHeight: 80 }]} value={description} onChangeText={setDescription} multiline textAlignVertical="top" />

          <Text style={E.label}>Priority</Text>
          <View style={E.chipRow}>
            {PRIORITY_OPTIONS.map(p => (
              <TouchableOpacity
                key={p}
                style={[E.chip, priority === p && { backgroundColor: PRIORITY_META[p].bg }]}
                onPress={() => setPriority(p)}
              >
                <Text style={[E.chipText, priority === p && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>
                  {PRIORITY_META[p].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={E.label}>Due Date (YYYY-MM-DD)</Text>
          <TextInput style={E.input} value={dueDate} onChangeText={setDueDate} keyboardType="numbers-and-punctuation" placeholder="2026-05-01" />

          <Text style={E.label}>Assign To</Text>
          <View style={E.assignList}>
            <TouchableOpacity
              style={[E.assignRow, assignedTo.length === 0 && E.assignRowActive]}
              onPress={() => setAssignedTo([])}
            >
              <Text style={[E.assignText, assignedTo.length === 0 && { color: '#0F172A', fontWeight: '700' }]}>— Unassigned —</Text>
              {assignedTo.length === 0 && <Ionicons name="checkmark-circle" size={18} color="#0F172A" />}
            </TouchableOpacity>
            {users.map(u => {
              const selected = assignedTo.includes(u.id)
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[E.assignRow, selected && E.assignRowActive]}
                  onPress={() => setAssignedTo(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                >
                  <Text style={[E.assignText, selected && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                  {selected ? <Ionicons name="checkbox" size={20} color="#0F172A" /> : <Ionicons name="square-outline" size={20} color="#CBD5E1" />}
                </TouchableOpacity>
              )
            })}
          </View>

          <TouchableOpacity style={E.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={E.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()
  const { isOnline } = useNetworkStatus()

  const [order, setOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [optimisticEvents, setOptimisticEvents] = useState<(OrderEvent & { failed?: boolean; originalText?: string })[]>([])
  const [loadingOrder, setLoadingOrder] = useState(true)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const scrollRef = useRef<ScrollView>(null)

  const fetchOrder = useCallback(async () => {
    if (!id) return
    try {
      const data = await orderService.listOrders({ search: '', page: 1, limit: 200 })
      const found = data.orders.find(o => o.id === id)
      if (found) setOrder(found)
    } catch {
      // ignore
    } finally {
      setLoadingOrder(false)
    }
  }, [id])

  const fetchEvents = useCallback(async (silent = false) => {
    if (!id) return
    if (!silent) setLoadingEvents(true)
    try {
      const data = await orderService.listEvents(id)
      setEvents(data.events ?? [])
    } catch {
      // ignore
    } finally {
      setLoadingEvents(false)
    }
  }, [id])

  useEffect(() => {
    fetchOrder()
    fetchEvents()
  }, [fetchOrder, fetchEvents])

  useOrderSocket(() => {
    fetchOrder()
    fetchEvents(true)
  })

  useEffect(() => {
    if (!loadingEvents && events.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100)
    }
  }, [loadingEvents])

  useEffect(() => {
    if (events.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }, [events.length, optimisticEvents.length])

  const onRefresh = () => {
    setRefreshing(true)
    Promise.all([fetchOrder(), fetchEvents(true)]).finally(() => setRefreshing(false))
  }

  const sendComment = async (text: string, tempId?: string) => {
    if (!isOnline) { Alert.alert('Offline', "You're offline. Please reconnect to send."); return }
    const id_ = tempId ?? `temp-${Date.now()}`
    if (!tempId) {
      const tempEvent = {
        id: id_,
        order_id: id!,
        type: 'comment_added',
        actor_id: user?.id ?? null,
        actor_name: user?.name ?? 'You',
        payload: { text } as any,
        created_at: new Date().toISOString(),
        originalText: text,
      }
      setOptimisticEvents(prev => [...prev, tempEvent])
    }
    setSending(true)
    try {
      await orderService.addComment(id!, text)
      setOptimisticEvents(prev => prev.filter(e => e.id !== id_))
      await fetchEvents(true)
    } catch {
      setOptimisticEvents(prev =>
        prev.map(e => e.id === id_ ? { ...e, failed: true } : e)
      )
    } finally {
      setSending(false)
    }
  }

  const handleSendComment = async () => {
    const text = comment.trim()
    if (!text || sending) return
    setComment('')
    await sendComment(text)
  }

  const handleRetry = async (ev: OrderEvent & { failed?: boolean; originalText?: string }) => {
    const text = ev.originalText ?? (ev.payload as Record<string, string>).text
    if (!text) return
    setOptimisticEvents(prev => prev.map(e => e.id === ev.id ? { ...e, failed: false } : e))
    await sendComment(text, ev.id)
  }

  const allEvents = [...events, ...optimisticEvents]

  if (loadingOrder) {
    return (
      <View style={S.loadingScreen}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={S.loadingScreen}>
        <Ionicons name="alert-circle-outline" size={40} color="#94A3B8" />
        <Text style={{ color: '#64748B', marginTop: 12 }}>Order not found</Text>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
          <Text style={S.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={S.screen}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={S.headerCenter}>
            <Text style={S.headerOrderNum}>#{order.order_number}</Text>
            <Text style={S.headerTitle} numberOfLines={1}>{order.title}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowEdit(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="create-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Chip row */}
        <View style={S.chipRow}>
          <TouchableOpacity
            style={[S.chip, { backgroundColor: sm.bg }]}
            onPress={() => setShowStatus(true)}
          >
            <Text style={[S.chipText, { color: sm.color }]}>{sm.label}</Text>
            <Ionicons name="chevron-down" size={13} color={sm.color} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
          <View style={[S.chip, { backgroundColor: pm.bg }]}>
            <Text style={[S.chipText, { color: pm.color }]}>{pm.label}</Text>
          </View>
          <View style={[S.chip, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="person-outline" size={13} color="#64748B" />
            <Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>
              {order.assigned_names?.length > 0
                ? order.assigned_names[0].split(' ')[0] + (order.assigned_names.length > 1 ? ` +${order.assigned_names.length - 1}` : '')
                : 'Unassigned'}
            </Text>
          </View>
          {order.due_date && (
            <View style={[S.chip, { backgroundColor: '#F8FAFC' }]}>
              <Ionicons name="calendar-outline" size={13} color="#64748B" />
              <Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>
                {new Date(order.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          )}
        </View>

        {/* Timeline */}
        <ScrollView
          ref={scrollRef}
          style={S.timeline}
          contentContainerStyle={S.timelineContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
        >
          {loadingEvents ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color="#94A3B8" />
            </View>
          ) : allEvents.length === 0 ? (
            <View style={S.emptyTimeline}>
              <Ionicons name="chatbubbles-outline" size={28} color="#CBD5E1" />
              <Text style={S.emptyTimelineText}>No activity yet. Add a comment below.</Text>
            </View>
          ) : (
            groupByDate(allEvents).map(group => (
              <View key={group.label}>
                <View style={S.dateDivider}>
                  <View style={S.dateDividerLine} />
                  <Text style={S.dateDividerLabel}>{group.label}</Text>
                  <View style={S.dateDividerLine} />
                </View>
                {group.events.map(ev => (
                  <TimelineItem
                    key={ev.id}
                    event={ev}
                    isOptimistic={ev.id.startsWith('temp-')}
                    onRetry={() => handleRetry(ev as any)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>

        {/* Composer */}
        <View style={S.composer}>
          <TextInput
            style={S.composerInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment..."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[S.sendBtn, (!comment.trim() || sending) && S.sendBtnDisabled]}
            onPress={handleSendComment}
            disabled={!comment.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Ionicons name="send" size={18} color="#FFFFFF" />
            }
          </TouchableOpacity>
        </View>
      </View>

      {showStatus && order && (
        <StatusSheet
          order={order}
          onClose={() => setShowStatus(false)}
          onChanged={() => { fetchOrder(); fetchEvents(true) }}
        />
      )}
      {showEdit && order && (
        <EditOrderSheet
          order={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => { fetchOrder(); fetchEvents(true) }}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerOrderNum: { fontSize: 12, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },

  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  timeline: { flex: 1, backgroundColor: '#F8FAFC' },
  timelineContent: { padding: 16, paddingBottom: 8 },

  emptyTimeline: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTimelineText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dateDividerLabel: { fontSize: 11.5, fontWeight: '600', color: '#94A3B8' },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  composerInput: {
    flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#0F172A', maxHeight: 120, minHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },

  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnText: { color: '#0F172A', fontWeight: '700' },
})

const T = StyleSheet.create({
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  bubble: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  actorName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  time: { fontSize: 11, color: '#94A3B8' },
  commentText: { fontSize: 14, color: '#334155', lineHeight: 20 },

  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  retryMsg: { fontSize: 12, color: '#EF4444' },
  retryBtn: { fontSize: 12, fontWeight: '700', color: '#6366F1', textDecorationLine: 'underline' },

  systemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  systemIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  systemContent: { flex: 1 },
  systemActor: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  systemLabel: { fontSize: 12.5, color: '#64748B', fontWeight: '400' },
  systemMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
})

const SS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  rowActive: { backgroundColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
})

const E = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0F172A' },
  chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  assignList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  assignRowActive: { backgroundColor: '#F8FAFC' },
  assignText: { fontSize: 15, color: '#475569' },
  saveBtn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
