import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, TextInput, StatusBar,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orderService, type TrashOrder } from '../../services/orderService'
import { purgeNotificationOrder } from '../../hooks/useNotifications'
import { formatRelative } from '../../utils/date'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
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

function TrashCard({ order, busy, onRestore, onDelete }: {
  order: TrashOrder
  busy: boolean
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
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TrashScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [orders, setOrders] = useState<TrashOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrashOrder | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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
          {!loading && <Text style={S.headerSub}>{orders.length} archived order{orders.length !== 1 ? 's' : ''}</Text>}
        </View>
        <TouchableOpacity onPress={fetchTrash} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={S.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
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
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TrashCard
              order={item}
              busy={actionLoading === item.id}
              onRestore={() => handleRestore(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          )}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
        />
      )}

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
