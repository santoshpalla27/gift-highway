import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Platform, Alert, RefreshControl
} from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { orderService, Order, UserOption } from '../../services/orderService'
import { useAuthStore } from '../../store/authStore'
import { useOrderSocket } from '../../hooks/useOrderSocket'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { OfflineBanner } from '../../components/OfflineBanner'
import { CardSkeleton } from '../../components/CardSkeleton'

// ─── Metadata ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',          color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const overdue = d < now
  
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  
  let text = ''
  if (d.toDateString() === today.toDateString()) {
    text = 'Due Today'
  } else if (d.toDateString() === tomorrow.toDateString()) {
    text = 'Due Tomorrow'
  } else {
    text = `Due ${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`
  }
  
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
  const { isOnline } = useNetworkStatus()
  const [title, setTitle] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
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
      setAssignedTo(order.assigned_to ?? [])
      setDueDate(order.due_date ?? '')
    } else {
      setTitle(''); setCustomerName(''); setContactNumber(''); setDescription('')
      setPriority('medium'); setAssignedTo([]); setDueDate('')
    }
    setError('')
  }, [order, visible])

  const handleSubmit = async () => {
    if (!isOnline) {
      setError("You're offline. Please reconnect to save changes.")
      return
    }
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
        assigned_to: assignedTo,
        due_date: dueDate || null,
      }
      if (isEdit) {
        await orderService.updateOrder(order!.id, payload)
      } else {
        await orderService.createOrder(payload)
      }
      onRefresh()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not save order. Please try again.')
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

        <ScrollView style={F.body} keyboardShouldPersistTaps="handled">
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
              <TouchableOpacity
                key={p}
                style={[F.chip, priority === p && { backgroundColor: PRIORITY_META[p].bg, borderColor: PRIORITY_META[p].bg }]}
                onPress={() => setPriority(p)}
              >
                <Text style={[F.chipText, priority === p && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={F.label}>Due Date (YYYY-MM-DD)</Text>
          <TextInput style={F.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-05-01" keyboardType="numbers-and-punctuation" />

          <Text style={F.label}>Assign To</Text>
          <TouchableOpacity
            style={[F.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
            onPress={() => setAssignOpen(o => !o)}
          >
            <Text style={{ fontSize: 15, color: assignedTo.length > 0 ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
              {assignedTo.length === 0
                ? '— Unassigned —'
                : users.filter(u => assignedTo.includes(u.id)).map(u => u.name.split(' ')[0]).join(', ')}
            </Text>
            <Ionicons name={assignOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>
          {assignOpen && (
            <View style={F.assignList}>
              <TouchableOpacity
                style={[F.assignRow, assignedTo.length === 0 && F.assignRowActive]}
                onPress={() => setAssignedTo([])}
              >
                <Text style={[F.assignText, assignedTo.length === 0 && { color: '#0F172A', fontWeight: '700' }]}>— Unassigned —</Text>
                {assignedTo.length === 0 && <Ionicons name="checkmark-circle" size={18} color="#0F172A" />}
              </TouchableOpacity>
              {users.map(u => {
                const selected = assignedTo.includes(u.id)
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[F.assignRow, selected && F.assignRowActive]}
                    onPress={() => setAssignedTo(prev =>
                      prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                    )}
                  >
                    <Text style={[F.assignText, selected && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                    {selected
                      ? <Ionicons name="checkbox" size={20} color="#0F172A" />
                      : <Ionicons name="square-outline" size={20} color="#CBD5E1" />
                    }
                  </TouchableOpacity>
                )
              })}
            </View>
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
          <Text style={SP.sub}>Updating #{order?.order_number} — {order?.title}</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[SP.row, order?.status === s && SP.rowActive]}
              onPress={() => handlePick(s)}
            >
              <View style={[SP.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[SP.rowText, order?.status === s && { color: STATUS_META[s].color, fontWeight: '600' }]}>
                {STATUS_META[s].label}
              </Text>
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
        <Text style={C.orderNum} numberOfLines={1}>
          #{order.order_number} <Text style={C.title}>{order.title}</Text>
        </Text>
        <TouchableOpacity onPress={onStatusPress} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={[C.statusText, { color: sm.color }]}>{sm.label}</Text>
        </TouchableOpacity>
      </View>

      <View style={C.rowBottom}>
        <View style={C.bottomLeft}>
          <Text style={C.metaText} numberOfLines={1}>
            {order.assigned_names?.length > 0
              ? order.assigned_names[0].split(' ')[0] + (order.assigned_names.length > 1 ? ` +${order.assigned_names.length - 1}` : '')
              : 'Unassigned'}
          </Text>
        </View>

        <View style={C.bottomCenter}>
           <Text style={[C.priorityText, { color: pm.color }]}>{pm.label.replace(' priority', '')}</Text>
        </View>

        <View style={C.bottomRight}>
          {due && <Text style={[C.metaText, due.overdue && { color: '#EF4444', fontWeight: '600' }]}>{due.text}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface AllOrdersScreenProps {
  myOrdersOnly?: boolean
}

export default function AllOrdersScreen({ myOrdersOnly = false }: AllOrdersScreenProps) {
  const { user } = useAuthStore()
  const { isOnline } = useNetworkStatus()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showMyOrders, setShowMyOrders] = useState(myOrdersOnly)
  const [showCreate, setShowCreate] = useState(false)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [statusOrder, setStatusOrder] = useState<Order | null>(null)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    try {
      const data = await orderService.listOrders({
        search: search || undefined,
        status: statusFilter || undefined,
        assigned_to: showMyOrders && user ? user.id : undefined,
      })
      setOrders(data.orders)
      setTotal(data.total)
    } catch {
      // silently fail, show empty state
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [search, statusFilter, showMyOrders, user])

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(false), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchOrders, search])

  const { socketStatus } = useOrderSocket(() => fetchOrders(true))

  useEffect(() => {
    const interval = setInterval(() => fetchOrders(true), 60_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const onRefresh = () => {
    setRefreshing(true)
    fetchOrders(true)
  }

  return (
    <View style={S.screen}>
      <OfflineBanner isOnline={isOnline} />
      {!isOnline && socketStatus === 'reconnecting' ? null : socketStatus === 'reconnecting' ? (
        <View style={S.socketBanner}>
          <Text style={S.socketBannerText}>Reconnecting · Live updates paused</Text>
        </View>
      ) : null}

      {/* Search + Filter Header */}
      <View style={S.headerSurface}>
        <View style={[S.searchBox, isSearchFocused && S.searchFocused]}>
          <Ionicons name="search" size={16} color={isSearchFocused ? '#0F172A' : '#94A3B8'} />
          <TextInput
            style={S.searchInput}
            placeholder="Search tasks and operations..."
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.filterScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {/* Status Filters */}
          <TouchableOpacity
            style={[S.filterChip, !statusFilter && S.filterChipActive]}
            onPress={() => setStatusFilter('')}
          >
            <Text style={[S.filterChipText, !statusFilter && S.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[S.filterChip, statusFilter === s && S.filterChipActive]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[S.filterChipText, statusFilter === s && S.filterChipTextActive]}>
                {STATUS_META[s].label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={S.countBar}>
        <Text style={S.countText}>{total} order{total !== 1 ? 's' : ''}</Text>
      </View>

      {/* List */}
      {loading && orders.length === 0 ? (
        <CardSkeleton count={6} />
      ) : orders.length === 0 ? (
        <ScrollView contentContainerStyle={S.centerList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}>
          <View style={S.emptyIconWrap}>
            <Ionicons name="albums-outline" size={32} color="#94A3B8" />
          </View>
          <Text style={S.emptyTitle}>No orders found</Text>
          <Text style={S.emptySub}>
            {search || statusFilter ? 'Try adjusting your filters.' : 'Create your first operation to get started.'}
          </Text>
          <TouchableOpacity style={S.emptyBtn} onPress={() => { setEditOrder(null); setShowCreate(true) }}>
            <Text style={S.emptyBtnText}>Create Order</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView 
          style={S.list} 
          contentContainerStyle={{ paddingBottom: 40, padding: 12, backgroundColor: '#F8FAFC' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
        >
          {orders.map(o => (
            <OrderCard
              key={o.id}
              order={o}
              onOpen={() => router.push(`/order/${o.id}`)}
              onStatusPress={() => setStatusOrder(o)}
            />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity 
        style={S.fab} 
        onPress={() => { setEditOrder(null); setShowCreate(true) }}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <OrderFormModal
        visible={showCreate}
        order={editOrder}
        onClose={() => setShowCreate(false)}
        onRefresh={() => fetchOrders(false)}
      />
      <StatusPickerModal
        order={statusOrder}
        onClose={() => setStatusOrder(null)}
        onRefresh={() => fetchOrders(false)}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  headerSurface: { backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'ios' ? 48 : 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', zIndex: 10 },
  
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9',
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 20,
    marginHorizontal: 12, paddingHorizontal: 14, paddingVertical: 8, gap: 8,
  },
  searchFocused: { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, fontSize: 15, color: '#0F172A', ...Platform.select({ web: { outlineStyle: 'none' } as any, default: {} }) },
  
  filterScroll: { marginTop: 8, marginBottom: 4 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#0F172A', fontWeight: '800' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#E2E8F0', alignSelf: 'center', marginHorizontal: 4 },
  
  socketBanner: { backgroundColor: '#FEF3C7', paddingVertical: 7, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#FCD34D' },
  socketBannerText: { fontSize: 12.5, fontWeight: '600', color: '#92400E' },

  countBar: { paddingHorizontal: 16, paddingVertical: 12 },
  countText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  
  list: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

const C = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 8,
  },
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  body: { padding: 24 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0F172A',
  },
  chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  assignList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', flexDirection: 'column' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  assignRowActive: { backgroundColor: '#F8FAFC' },
  assignText: { fontSize: 15, color: '#475569' },
  submitBtn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})

const SP = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, shadowColor: '#000', shadowOffset: {width: 0, height: -4}, shadowRadius: 16, shadowOpacity: 0.1 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10,
    marginBottom: 4,
  },
  rowActive: { backgroundColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
  cancelBtn: { marginTop: 12, padding: 16, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
})
