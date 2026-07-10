import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Platform, Share, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useState, useEffect } from 'react'
import { orderService, type Order, type UserOption } from '../../../services/orderService'
import { staffPortalApi, getPortalURL, type PortalStatus } from '../../../services/portalService'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { formatDate, fmt12hrStr, localDateStr, datePickerToIST, timePickerToIST } from '../../../utils/date'
import { useAuthStore } from '../../../store/authStore'

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',   color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',          color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting',          color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',            color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',              color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',         color: '#0D9488', bg: '#F0FDFA' },
  cancelled:          { label: 'Cancelled',         color: '#EF4444', bg: '#FEF2F2' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Info Sheet (read-only view + portal management) ─────────────────────────

export function InfoSheet({ order, portal, onClose, onPortalChange, onArchived }: {
  order: Order
  portal: PortalStatus | null | undefined
  onClose: () => void
  onPortalChange: (p: PortalStatus | null) => void
  onArchived?: () => void
}) {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.low
  const dueOverdue = order.due_date ? order.due_date < localDateStr(0) && order.status !== 'done' && order.status !== 'delivered' : false
  const [copied, setCopied] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)

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
      <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
        <View style={[E.header, { paddingTop: insets.top + 16, backgroundColor: '#FFFFFF' }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Order Info</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 16, 48) }}>

          {/* Card 1: Order ID + Order Description + Customer */}
          <View style={IN.card}>
            <View style={IN.row}>
              <View style={IN.rowLabel}>
                <Ionicons name="receipt-outline" size={13} color="#9CA3AF" />
                <Text style={IN.label}>ORDER ID</Text>
              </View>
              <Text style={IN.value}>Order #{order.order_number}</Text>
            </View>
            {!!order.order_description && (
              <>
                <View style={IN.divider} />
                <View style={IN.row}>
                  <View style={IN.rowLabel}>
                    <Ionicons name="document-outline" size={13} color="#9CA3AF" />
                    <Text style={IN.label}>ORDER DESCRIPTION</Text>
                  </View>
                  <Text style={[IN.value, { maxWidth: '60%' }]} numberOfLines={2}>{order.order_description}</Text>
                </View>
              </>
            )}
            {!!order.order_source && (
              <>
                <View style={IN.divider} />
                <View style={IN.row}>
                  <View style={IN.rowLabel}>
                    <Ionicons name="pricetag-outline" size={13} color="#9CA3AF" />
                    <Text style={IN.label}>ORDER SOURCE</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    {order.order_source === 'amazon' && <Ionicons name="logo-amazon" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'b2b' && <Ionicons name="business-outline" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'store' && <Ionicons name="storefront-outline" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'whatsapp' && <Ionicons name="logo-whatsapp" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'online' && <Ionicons name="globe-outline" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'google_ads' && <Ionicons name="megaphone-outline" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    {order.order_source === 'insta_ads' && <Ionicons name="logo-instagram" size={14} color="#475569" style={{ marginRight: 6 }} />}
                    <Text style={[IN.value, { fontSize: 13, textTransform: 'capitalize' }]}>{order.order_source}</Text>
                  </View>
                </View>
              </>
            )}
            <View style={IN.divider} />
            <View style={IN.row}>
              <View style={IN.rowLabel}>
                <Ionicons name="person-outline" size={13} color="#9CA3AF" />
                <Text style={IN.label}>CUSTOMER</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={IN.value}>{order.customer_name}</Text>
                {!!order.contact_number && (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.contact_number}`)}>
                    <Text style={IN.contactLink}>{order.contact_number}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Card 2: Status + Priority side by side */}
          <View style={[IN.card, { flexDirection: 'row' }]}>
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
              <View style={IN.rowLabel}>
                <Ionicons name="ellipse-outline" size={12} color="#9CA3AF" />
                <Text style={IN.label}>STATUS</Text>
              </View>
              <View style={[IN.badge, { backgroundColor: sm.bg, marginTop: 8 }]}>
                <Text style={[IN.badgeText, { color: sm.color }]}>{sm.label}</Text>
              </View>
            </View>
            <View style={IN.vDivider} />
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
              <View style={IN.rowLabel}>
                <Ionicons name="flag-outline" size={12} color="#9CA3AF" />
                <Text style={IN.label}>PRIORITY</Text>
              </View>
              <View style={[IN.badge, { backgroundColor: pm.bg, marginTop: 8 }]}>
                <Text style={[IN.badgeText, { color: pm.color }]}>{pm.label}</Text>
              </View>
            </View>
          </View>

          {/* Card 3: Assignment + Dates + Created By */}
          <View style={IN.card}>
            {order.assigned_names && order.assigned_names.length > 0 && (
              <>
                <View style={IN.row}>
                  <View style={IN.rowLabel}>
                    <Ionicons name="people-outline" size={13} color="#9CA3AF" />
                    <Text style={IN.label}>ASSIGNED TO</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {order.assigned_names.map((name, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={IN.value}>{name}</Text>
                        <View style={IN.avatar}>
                          <Text style={IN.avatarText}>{getInitials(name)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={IN.divider} />
              </>
            )}
            {order.due_date && (
              <>
                <View style={IN.row}>
                  <View style={IN.rowLabel}>
                    <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
                    <Text style={IN.label}>DUE DATE</Text>
                  </View>
                  <Text style={[IN.value, dueOverdue && { color: '#EF4444' }]}>
                    {formatDate(order.due_date)}
                    {order.due_time ? `  ·  ${fmt12hrStr(order.due_time)}` : ''}
                    {dueOverdue ? '  ·  Overdue' : ''}
                  </Text>
                </View>
                <View style={IN.divider} />
              </>
            )}
            <View style={IN.row}>
              <View style={IN.rowLabel}>
                <Ionicons name="time-outline" size={13} color="#9CA3AF" />
                <Text style={IN.label}>CREATED BY</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={IN.value}>{order.created_by_name}</Text>
                <Text style={IN.sub}>{formatDate(order.created_at)}</Text>
              </View>
            </View>
          </View>

          {/* Card 4: Description */}
          {!!order.description && (
            <View style={IN.card}>
              <View style={[IN.row, { paddingBottom: 6 }]}>
                <View style={IN.rowLabel}>
                  <Ionicons name="document-text-outline" size={13} color="#9CA3AF" />
                  <Text style={IN.label}>DESCRIPTION</Text>
                </View>
              </View>
              <Text selectable style={IN.descText}>{order.description}</Text>
            </View>
          )}

          {isAdmin && order.order_value != null && (
            <View style={IN.card}>
              <View style={IN.row}>
                <View style={IN.rowLabel}>
                  <Ionicons name="cash-outline" size={13} color="#9CA3AF" />
                  <Text style={IN.label}>ORDER VALUE</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[IN.value, { fontSize: 16, fontWeight: '700', color: '#0F172A' }]}>
                    ₹{order.order_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <View style={{ backgroundColor: '#EDE9FE', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>Admin</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* PORTAL HIDDEN: CUSTOMER PORTAL section removed — see docs/portal-hidden.md to restore */}

          {isAdmin && (
            <View style={IN.archiveSection}>
              <TouchableOpacity
                style={IN.archiveBtn}
                disabled={archiveLoading}
                onPress={() => Alert.alert(
                  'Archive order?',
                  'The order will be moved to Trash. You can restore it later.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Archive', style: 'destructive', onPress: async () => {
                      setArchiveLoading(true)
                      try {
                        await orderService.archiveOrder(order.id)
                        onClose()
                        onArchived?.()
                      } catch { Alert.alert('Error', 'Could not archive order') }
                      finally { setArchiveLoading(false) }
                    }},
                  ],
                )}
              >
                {archiveLoading
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <>
                      <Ionicons name="archive-outline" size={16} color="#EF4444" />
                      <Text style={IN.archiveBtnText}>Archive Order</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
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
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [orderDescription, setOrderDescription] = useState(order.order_description ?? '')
  const [orderSource, setOrderSource] = useState(order.order_source ?? '')
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [contactNumber, setContactNumber] = useState(order.contact_number ?? '')
  const [description, setDescription] = useState(order.description)
  const [priority, setPriority] = useState(order.priority)
  const [dueDate, setDueDate] = useState(order.due_date ?? '')
  const [dueTime, setDueTime] = useState(order.due_time ?? '')
  const [orderValue, setOrderValue] = useState(order.order_value != null ? String(order.order_value) : '')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  // iOS: temp state so changes only commit when Done is pressed
  const [tempDateObj, setTempDateObj] = useState(new Date())
  const [tempTimeObj, setTempTimeObj] = useState(new Date())
  const [assignedTo, setAssignedTo] = useState<string[]>(order.assigned_to ?? [])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  useEffect(() => {
    orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!orderDescription.trim() || !customerName.trim()) { setError('Order Description and Customer Name are required.'); return }
    setLoading(true)
    setError('')
    try {
      const parsedOrderValue = isAdmin && orderValue.trim() !== '' ? parseFloat(orderValue) : null
      await orderService.updateOrder(order.id, {
        order_description: orderDescription.trim(), order_source: orderSource || undefined, customer_name: customerName.trim(),
        contact_number: contactNumber.trim(), description: description.trim(),
        priority, assigned_to: assignedTo, due_date: dueDate || null, due_time: dueTime || null,
        order_value: isAdmin ? parsedOrderValue : undefined,
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
        <View style={[E.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Edit Order</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView style={{ padding: 20 }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40) }} keyboardShouldPersistTaps="handled">
          {error ? <View style={E.errorBox}><Text style={E.errorText}>{error}</Text></View> : null}

           {/* Auto-generated Order ID notice */}
          <Text style={E.label}>Order ID</Text>
          <View style={[E.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="lock-closed-outline" size={14} color="#9CA3AF" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 15, color: '#6B7280' }}>Order #{order.order_number} (auto-generated)</Text>
          </View>

          <Text style={E.label}>Order Description *</Text>
          <TextInput
            style={[E.input, focusedField === 'orderDescription' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            value={orderDescription}
            onChangeText={setOrderDescription}
            placeholder="e.g. Wedding Cake - John"
            placeholderTextColor="#94A3B8"
            onFocus={() => setFocusedField('orderDescription')}
            onBlur={() => setFocusedField(null)}
          />

          <Text style={E.label}>Order Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
            {['', 'amazon', 'b2b', 'store', 'whatsapp', 'online', 'google_ads', 'insta_ads'].map(src => {
              const isActive = orderSource === src
              const label = src === '' ? 'None' : src === 'google_ads' ? 'Google Ads' : src === 'insta_ads' ? 'Insta Ads' : src.charAt(0).toUpperCase() + src.slice(1)
              return (
                <TouchableOpacity
                  key={src}
                  style={[E.chip, { minWidth: 60, justifyContent: 'center' }, isActive && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}
                  onPress={() => setOrderSource(src)}
                >
                  <Text style={[E.chipText, isActive && { color: '#0F172A', fontWeight: '600' }]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={E.label}>Customer Name *</Text>
          <TextInput
            style={[E.input, focusedField === 'customerName' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            value={customerName}
            onChangeText={setCustomerName}
            autoCapitalize="words"
            onFocus={() => setFocusedField('customerName')}
            onBlur={() => setFocusedField(null)}
          />

          <Text style={E.label}>Contact Number</Text>
          <TextInput
            style={[E.input, focusedField === 'contactNumber' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            onFocus={() => setFocusedField('contactNumber')}
            onBlur={() => setFocusedField(null)}
          />

          <Text style={E.label}>Description</Text>
          <TextInput
            style={[E.input, { minHeight: 80 }, focusedField === 'description' && { borderColor: '#6366F1', borderWidth: 1.5 }]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            onFocus={() => setFocusedField('description')}
            onBlur={() => setFocusedField(null)}
          />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 8 }}>
            <View style={{ flex: isAdmin ? 1.3 : 1 }}>
              <Text style={[E.label, { marginTop: 0 }]}>Priority</Text>
              <View style={[E.chipRow, { gap: 6 }]}>
                {PRIORITY_OPTIONS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[E.chip, { paddingHorizontal: 10, paddingVertical: 10 }, priority === p && { backgroundColor: PRIORITY_META[p].bg }]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[E.chipText, { fontSize: 13 }, priority === p && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>
                      {PRIORITY_META[p].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {isAdmin && (
              <View style={{ flex: 0.7 }}>
                <Text style={[E.label, { marginTop: 0 }]}>Order Value</Text>
                <View style={[E.input, { flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 12, paddingVertical: 0, marginTop: 8 }, focusedField === 'orderValue' && { borderColor: '#6366F1', borderWidth: 1.5 }]}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#475569', marginRight: 4 }}>₹</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: '#0F172A', padding: 0 }}
                    value={orderValue}
                    onChangeText={setOrderValue}
                    keyboardType="numeric"
                    placeholder="e.g. 5000"
                    placeholderTextColor="#94A3B8"
                    onFocus={() => setFocusedField('orderValue')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            )}
          </View>

          <Text style={E.label}>Due Date & Time</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <TouchableOpacity
              style={[E.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
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
              style={[E.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
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
          </View>

          {/* Date picker */}
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
                  <DateTimePicker
                    value={tempDateObj}
                    mode="date" display="spinner"
                    onChange={(_, date) => { if (date) setTempDateObj(date) }}
                    style={{ width: '100%', height: 216 }}
                  />
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

          {/* Time picker */}
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
                  <DateTimePicker
                    value={tempTimeObj}
                    mode="time" display="spinner"
                    onChange={(_, date) => { if (date) setTempTimeObj(date) }}
                    style={{ width: '100%', height: 216 }}
                  />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
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
  saveBtn: { backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})

const IN = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, marginBottom: 12, paddingHorizontal: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F1F5F9' },
  vDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#E2E8F0', alignSelf: 'stretch', marginVertical: 12 },
  label: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  value: { fontSize: 14, fontWeight: '600', color: '#0F172A', textAlign: 'right', flexShrink: 1 },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2, textAlign: 'right' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  contactLink: { fontSize: 13, fontWeight: '600', color: '#6366F1', marginTop: 3 },
  descText: { fontSize: 14, color: '#374151', lineHeight: 21, paddingBottom: 14 },
  archiveSection: { marginTop: 4, marginBottom: 8 },
  archiveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  archiveBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
})
