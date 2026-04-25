import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orderService, type Order } from '../../../services/orderService'

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
}

export function StatusSheet({ order, onClose, onChanged }: {
  order: Order
  onClose: () => void
  onChanged: () => void
}) {
  const insets = useSafeAreaInsets()

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
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[S.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <Text style={S.title}>Change Status</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[S.row, order.status === s && S.rowActive]}
              onPress={() => handlePick(s)}
            >
              <View style={[S.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[S.rowText, order.status === s && { color: STATUS_META[s].color, fontWeight: '600' }]}>
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

const S = StyleSheet.create({
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
