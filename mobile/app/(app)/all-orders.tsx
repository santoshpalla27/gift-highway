import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Platform, Alert,
} from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { orderService, Order, UserOption } from '../../services/orderService'
import { useAuthStore } from '../../store/authStore'

// ─── Metadata ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',         color: '#3B82F6', bg: '#EFF6FF' },
  in_progress: { label: 'In Progress', color: '#D97706', bg: '#FFFBEB' },
  completed:   { label: 'Completed',   color: '#059669', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#2563EB', bg: '#EFF6FF' },
  high:   { label: 'High',   color: '#D97706', bg: '#FFFBEB' },
  urgent: { label: 'Urgent', color: '#DC2626', bg: '#FEF2F2' },
}

function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const overdue = d < now
  const text = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return { text, overdue }
}

// ─── Order Form Modal ─────────────────────────────────────────────────────────

interface OrderFormProps {
  visible: boolean
  order?: Order | null
  onClose: () => void
  onRefresh: () => void
}

function OrderFormModal({ visible, order, onClose, onRefresh }: OrderFormProps) {
  const isEdit = !!order
  const [title, setTitle] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (visible) {
      orderService.listUsersForAssignment().then(setUsers).catch(() => {})
    }
  }, [visible])

  useEffect(() => {
    if (order) {
      setTitle(order.title)
      setCustomerName(order.customer_name)
      setContactNumber(order.contact_number ?? '')
      setDescription(order.description)
      setPriority(order.priority)
      setAssignedTo(order.assigned_to ?? '')
      setDueDate(order.due_date ?? '')
    } else {
      setTitle(''); setCustomerName(''); setContactNumber(''); setDescription('')
      setPriority('medium'); setAssignedTo(''); setDueDate('')
    }
    setError('')
  }, [order, visible])

  const handleSubmit = async () => {
    if (!title.trim() || !customerName.trim()) {
      setError('Title and Customer Name are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = {
        title: title.trim(),
        customer_name: customerName.trim(),
        contact_number: contactNumber.trim(),
        description: description.trim(),
        priority,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
      }
      if (isEdit) {
        await orderService.updateOrder(order!.id, payload)
      } else {
        await orderService.createOrder(payload)
      }
      onRefresh()
      onClose()
    } catch {
      setError('Could not save order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={F.container}>
        <View style={F.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={F.title}>{isEdit ? `Edit #${order!.order_number}` : 'Create Order'}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={F.body} keyboardShouldPersistTaps="handled">
          {error ? <View style={F.errorBox}><Text style={F.errorText}>{error}</Text></View> : null}

          <Text style={F.label}>Title *</Text>
          <TextInput style={F.input} value={title} onChangeText={setTitle} placeholder="e.g. Wedding Banner" autoCapitalize="words" />

          <Text style={F.label}>Customer Name *</Text>
          <TextInput style={F.input} value={customerName} onChangeText={setCustomerName} placeholder="e.g. Rahul Sharma" autoCapitalize="words" />

          <Text style={F.label}>Contact Number</Text>
          <TextInput style={F.input} value={contactNumber} onChangeText={setContactNumber} placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" />

          <Text style={F.label}>Description</Text>
          <TextInput style={[F.input, { minHeight: 72 }]} value={description} onChangeText={setDescription} placeholder="Additional details…" multiline textAlignVertical="top" />

          <Text style={F.label}>Priority</Text>
          <View style={F.chipRow}>
            {PRIORITY_OPTIONS.map(p => (
              <TouchableOpacity
                key={p}
                style={[F.chip, priority === p && { backgroundColor: PRIORITY_META[p].bg, borderColor: PRIORITY_META[p].color }]}
                onPress={() => setPriority(p)}
              >
                <Text style={[F.chipText, priority === p && { color: PRIORITY_META[p].color }]}>
                  {PRIORITY_META[p].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={F.label}>Due Date (YYYY-MM-DD)</Text>
          <TextInput style={F.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-05-01" keyboardType="numbers-and-punctuation" />

          <Text style={F.label}>Assign To</Text>
          <View style={F.assignList}>
            <TouchableOpacity
              style={[F.assignRow, !assignedTo && F.assignRowActive]}
              onPress={() => setAssignedTo('')}
            >
              <Text style={[F.assignText, !assignedTo && { color: '#4F46E5', fontWeight: '600' }]}>— Unassigned —</Text>
            </TouchableOpacity>
            {users.map(u => (
              <TouchableOpacity
                key={u.id}
                style={[F.assignRow, assignedTo === u.id && F.assignRowActive]}
                onPress={() => setAssignedTo(u.id)}
              >
                <Text style={[F.assignText, assignedTo === u.id && { color: '#4F46E5', fontWeight: '600' }]}>{u.name}</Text>
                {assignedTo === u.id && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={F.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={F.submitText}>{isEdit ? 'Save Changes' : 'Create Order'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Status Picker Modal ──────────────────────────────────────────────────────

function StatusPickerModal({ order, onClose, onRefresh }: { order: Order | null; onClose: () => void; onRefresh: () => void }) {
  const handlePick = async (status: string) => {
    if (!order) return
    try {
      await orderService.updateStatus(order.id, status)
      onRefresh()
    } catch {
      Alert.alert('Error', 'Could not update status')
    }
    onClose()
  }

  return (
    <Modal visible={!!order} transparent animationType="fade" onRequestClose={onClose}>
      <View style={SP.overlay}>
        <View style={SP.sheet}>
          <Text style={SP.title}>Change Status</Text>
          <Text style={SP.sub}>{order?.title}</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[SP.row, order?.status === s && SP.rowActive]}
              onPress={() => handlePick(s)}
            >
              <View style={[SP.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[SP.rowText, order?.status === s && { color: '#4F46E5', fontWeight: '600' }]}>
                {STATUS_META[s].label}
              </Text>
              {order?.status === s && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
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

function OrderCard({ order, onEdit, onStatusPress }: { order: Order; onEdit: () => void; onStatusPress: () => void }) {
  const due = formatDueDate(order.due_date)
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium

  return (
    <View style={C.card}>
      <View style={C.cardTop}>
        <Text style={C.orderNum}>#{order.order_number}</Text>
        <TouchableOpacity onPress={onStatusPress}>
          <View style={[C.statusBadge, { backgroundColor: sm.bg }]}>
            <Text style={[C.statusText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={C.title} numberOfLines={2}>{order.title}</Text>
      <Text style={C.customer}>{order.customer_name}</Text>

      <View style={C.cardFooter}>
        <View style={[C.priorityBadge, { backgroundColor: pm.bg }]}>
          <Text style={[C.priorityText, { color: pm.color }]}>{pm.label}</Text>
        </View>
        {order.assigned_name && (
          <View style={C.assignedRow}>
            <Ionicons name="person-outline" size={12} color="#6B7280" />
            <Text style={C.assignedText}>{order.assigned_name}</Text>
          </View>
        )}
        {due && (
          <View style={C.dueRow}>
            <Ionicons name="calendar-outline" size={12} color={due.overdue ? '#DC2626' : '#6B7280'} />
            <Text style={[C.dueText, due.overdue && { color: '#DC2626' }]}>{due.text}</Text>
          </View>
        )}
        <TouchableOpacity style={C.editBtn} onPress={onEdit}>
          <Ionicons name="pencil" size={14} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface AllOrdersScreenProps {
  myOrdersOnly?: boolean
}

export default function AllOrdersScreen({ myOrdersOnly = false }: AllOrdersScreenProps) {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [statusOrder, setStatusOrder] = useState<Order | null>(null)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orderService.listOrders({
        search: search || undefined,
        status: statusFilter || undefined,
        assigned_to: myOrdersOnly && user ? user.id : undefined,
      })
      setOrders(data.orders)
      setTotal(data.total)
    } catch {
      // silently fail, show empty state
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, myOrdersOnly, user])

  useEffect(() => {
    const t = setTimeout(fetchOrders, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchOrders, search])

  return (
    <View style={S.screen}>
      {/* Search + Filter */}
      <View style={S.toolbar}>
        <View style={[S.searchBox, isSearchFocused && S.searchFocused]}>
          <Ionicons name="search" size={16} color={isSearchFocused ? '#4F46E5' : '#9CA3AF'} />
          <TextInput
            style={S.searchInput}
            placeholder="Search orders…"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filterRow} contentContainerStyle={{ gap: 8 }}>
          {[{ value: '', label: 'All' }, ...STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_META[s].label }))].map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[S.filterChip, statusFilter === opt.value && S.filterChipActive]}
              onPress={() => setStatusFilter(opt.value)}
            >
              <Text style={[S.filterChipText, statusFilter === opt.value && S.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Count + Create */}
      <View style={S.actionRow}>
        <Text style={S.countText}>{total} order{total !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={S.createBtn} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={S.createBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading && orders.length === 0 ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : orders.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="checkbox-outline" size={48} color="#D1D5DB" />
          <Text style={S.emptyTitle}>No orders found</Text>
          <Text style={S.emptySub}>
            {search || statusFilter ? 'Try adjusting your filters.' : 'Create your first order to get started.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={S.list} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          {orders.map(o => (
            <OrderCard
              key={o.id}
              order={o}
              onEdit={() => { setEditOrder(o); setShowCreate(true) }}
              onStatusPress={() => setStatusOrder(o)}
            />
          ))}
        </ScrollView>
      )}

      <OrderFormModal
        visible={showCreate}
        order={editOrder}
        onClose={() => setShowCreate(false)}
        onRefresh={fetchOrders}
      />
      <StatusPickerModal
        order={statusOrder}
        onClose={() => setStatusOrder(null)}
        onRefresh={fetchOrders}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  toolbar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  searchFocused: { borderColor: '#4F46E5', backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }) },
  filterRow: { marginTop: 10, marginBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#4F46E5' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  countText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4F46E5', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4 },
})

const C = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNum: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  customer: { fontSize: 13, color: '#6B7280', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assignedText: { fontSize: 12, color: '#6B7280' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  editBtn: { marginLeft: 'auto', padding: 4 },
})

const F = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  body: { padding: 16 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, color: '#DC2626' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827',
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  assignList: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  assignRowActive: { backgroundColor: '#EEF2FF' },
  assignText: { fontSize: 14, color: '#374151' },
  submitBtn: { backgroundColor: '#4F46E5', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24, marginBottom: 32 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})

const SP = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sub: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  rowActive: { backgroundColor: '#EEF2FF', marginHorizontal: -4, paddingHorizontal: 8, borderRadius: 8, borderBottomWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 15, color: '#374151' },
  cancelBtn: { marginTop: 16, padding: 14, alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8 },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
})
