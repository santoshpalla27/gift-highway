import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Platform, Share,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useState, useEffect } from 'react'
import { orderService, type Order, type UserOption } from '../../../services/orderService'
import { staffPortalApi, getPortalURL, type PortalStatus } from '../../../services/portalService'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { formatDate, fmt12hrStr } from '../../../utils/date'

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

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

// ─── Info Sheet (read-only view + portal management) ─────────────────────────

export function InfoSheet({ order, portal, onClose, onPortalChange }: {
  order: Order
  portal: PortalStatus | null | undefined
  onClose: () => void
  onPortalChange: (p: PortalStatus | null) => void
}) {
  const insets = useSafeAreaInsets()
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.low
  const due = order.due_date ? new Date(order.due_date + 'T00:00:00') : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dueOverdue = due ? due < today && order.status !== 'completed' : false
  const [copied, setCopied] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const handleCopyLink = async () => {
    if (!portal?.token) return
    const url = getPortalURL(portal.token)
    try {
      await Share.share({ message: url })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* user dismissed */ }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={E.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Order Info</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom + 16, 48) }}>

          <View style={IN.section}>
            <Text style={IN.label}>CUSTOMER</Text>
            <Text style={IN.value}>{order.customer_name}</Text>
            {!!order.contact_number && <Text style={IN.sub}>{order.contact_number}</Text>}
          </View>

          <View style={IN.section}>
            <Text style={IN.label}>STATUS</Text>
            <View style={[IN.badge, { backgroundColor: sm.bg }]}>
              <Text style={[IN.badgeText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>

          <View style={IN.section}>
            <Text style={IN.label}>PRIORITY</Text>
            <View style={[IN.badge, { backgroundColor: pm.bg }]}>
              <Text style={[IN.badgeText, { color: pm.color }]}>{pm.label}</Text>
            </View>
          </View>

          {order.assigned_names && order.assigned_names.length > 0 && (
            <View style={IN.section}>
              <Text style={IN.label}>ASSIGNED TO</Text>
              <View style={{ gap: 8, marginTop: 2 }}>
                {order.assigned_names.map((name, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={IN.avatar}>
                      <Text style={IN.avatarText}>{getInitials(name)}</Text>
                    </View>
                    <Text style={IN.value}>{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {due && (
            <View style={IN.section}>
              <Text style={IN.label}>DUE DATE</Text>
              <Text style={[IN.value, dueOverdue && { color: '#EF4444' }]}>
                {formatDate(order.due_date)}
                {order.due_time ? `  ·  ${fmt12hrStr(order.due_time)}` : ''}
                {dueOverdue ? '  ·  Overdue' : ''}
              </Text>
            </View>
          )}

          <View style={IN.section}>
            <Text style={IN.label}>CREATED BY</Text>
            <Text style={IN.value}>{order.created_by_name}</Text>
            <Text style={IN.sub}>{formatDate(order.created_at)}</Text>
          </View>

          {!!order.description && (
            <View style={IN.section}>
              <Text style={IN.label}>DESCRIPTION</Text>
              <Text style={[IN.value, { lineHeight: 22 }]}>{order.description}</Text>
            </View>
          )}

          <View style={IN.section}>
            <Text style={IN.label}>CUSTOMER PORTAL</Text>
            {portal === undefined ? (
              <Text style={IN.sub}>Loading…</Text>
            ) : portal === null ? (
              <TouchableOpacity
                style={IN.portalBtn}
                disabled={portalLoading}
                onPress={async () => {
                  setPortalLoading(true)
                  try {
                    const p = await staffPortalApi.createPortal(order.id, order.customer_name)
                    onPortalChange(p)
                  } catch { Alert.alert('Error', 'Could not create portal') }
                  finally { setPortalLoading(false) }
                }}
              >
                {portalLoading
                  ? <ActivityIndicator size="small" color="#10B981" />
                  : <Text style={IN.portalBtnText}>+ Create portal link</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[IN.dot, { backgroundColor: portal.enabled ? '#10B981' : '#9CA3AF' }]} />
                  <Text style={[IN.value, { fontSize: 13 }]}>{portal.enabled ? 'Active' : 'Revoked'}</Text>
                </View>
                {portal.enabled && (
                  <TouchableOpacity style={IN.copyBtn} onPress={handleCopyLink}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#10B981' : '#64748B'} />
                    <Text style={[IN.copyBtnText, copied && { color: '#10B981' }]}>{copied ? 'Copied!' : 'Copy portal link'}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[IN.portalActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    disabled={portalLoading}
                    onPress={() => Alert.alert('Regenerate link?', 'The old link will stop working immediately.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Regenerate', onPress: async () => {
                        setPortalLoading(true)
                        try {
                          const p = await staffPortalApi.regenerateToken(order.id)
                          onPortalChange(p)
                        } catch { Alert.alert('Error', 'Could not regenerate') }
                        finally { setPortalLoading(false) }
                      }},
                    ])}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#3B82F6' }}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[IN.portalActionBtn, { backgroundColor: portal.enabled ? '#FEF2F2' : '#F3F4F6', borderColor: portal.enabled ? '#FECACA' : '#E5E7EB' }]}
                    disabled={!portal.enabled || portalLoading}
                    onPress={() => Alert.alert('Revoke portal?', 'The customer link will stop working.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Revoke', style: 'destructive', onPress: async () => {
                        setPortalLoading(true)
                        try {
                          await staffPortalApi.revokePortal(order.id)
                          onPortalChange({ ...portal, enabled: false })
                        } catch { Alert.alert('Error', 'Could not revoke') }
                        finally { setPortalLoading(false) }
                      }},
                    ])}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: portal.enabled ? '#EF4444' : '#9CA3AF' }}>
                      {portal.enabled ? 'Revoke' : 'Revoked'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Edit Order Sheet ─────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

export function EditOrderSheet({ order, onClose, onSaved }: {
  order: Order
  onClose: () => void
  onSaved: () => void
}) {
  const insets = useSafeAreaInsets()
  const { isOnline } = useNetworkStatus()
  const [title, setTitle] = useState(order.title)
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [contactNumber, setContactNumber] = useState(order.contact_number ?? '')
  const [description, setDescription] = useState(order.description)
  const [priority, setPriority] = useState(order.priority)
  const [dueDate, setDueDate] = useState(order.due_date ?? '')
  const [dueTime, setDueTime] = useState(order.due_time ?? '')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [assignedTo, setAssignedTo] = useState<string[]>(order.assigned_to ?? [])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!title.trim() || !customerName.trim()) { setError('Order ID and Customer Name are required.'); return }
    setLoading(true)
    setError('')
    try {
      await orderService.updateOrder(order.id, {
        title: title.trim(), customer_name: customerName.trim(),
        contact_number: contactNumber.trim(), description: description.trim(),
        priority, assigned_to: assignedTo, due_date: dueDate || null, due_time: dueTime || null,
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
        <ScrollView style={{ padding: 20 }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40) }} keyboardShouldPersistTaps="handled">
          {error ? <View style={E.errorBox}><Text style={E.errorText}>{error}</Text></View> : null}

          <Text style={E.label}>Order ID *</Text>
          <TextInput style={E.input} value={title} onChangeText={setTitle} autoCapitalize="characters" />

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

          <Text style={E.label}>Due Date & Time</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <TouchableOpacity
              style={[E.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }}>
                {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
              </Text>
              <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[E.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowTimePicker(true)}
            >
              <Text style={{ fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }}>
                {dueTime ? fmt12hrStr(dueTime) : 'Time'}
              </Text>
              <Ionicons name="time-outline" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 16, 32) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>Select Date</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#6366F1' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={dueDate ? new Date(dueDate + 'T00:00:00') : new Date()}
                    mode="date" display="spinner"
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
          )}

          {showTimePicker && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insets.bottom + 16, 32) }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>Select Time</Text>
                    <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#6366F1' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={(() => {
                      const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date()
                      if (dueTime) { const [h, min] = dueTime.split(':').map(Number); base.setHours(h, min, 0, 0) }
                      return base
                    })()}
                    mode="time" display="spinner"
                    onChange={(_, date) => {
                      if (date) setDueTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`)
                    }}
                    style={{ width: '100%', height: 216 }}
                  />
                </View>
              </View>
            </Modal>
          )}

          <Text style={E.label}>Assign To</Text>
          <View style={E.assignList}>
            <TouchableOpacity style={[E.assignRow, assignedTo.length === 0 && E.assignRowActive]} onPress={() => setAssignedTo([])}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const E = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
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

const IN = StyleSheet.create({
  section: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 6 },
  value: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', marginTop: 2 },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  portalBtn: { width: '100%', paddingVertical: 9, borderRadius: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#A7F3D0', alignItems: 'center', justifyContent: 'center' },
  portalBtnText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  portalActionBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})
