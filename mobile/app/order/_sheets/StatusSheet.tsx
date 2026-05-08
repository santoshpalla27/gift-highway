import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orderService, type Order } from '../../../services/orderService'

const STATUS_OPTIONS = ['yet_to_start', 'working', 'waiting_for_client', 'making', 'done', 'delivered'] as const

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
}

export function StatusSheet({ order, onClose, onChanged, isAdmin }: {
  order: Order
  onClose: () => void
  onChanged: () => void
  isAdmin: boolean
}) {
  const insets = useSafeAreaInsets()
  const visibleOptions = isAdmin ? STATUS_OPTIONS : STATUS_OPTIONS.filter(s => s !== 'delivered')

  const handlePick = async (status: string) => {
    if (status === order.status) { onClose(); return }
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
          {visibleOptions.map(s => (
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6 },
  rowActive: { backgroundColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
})
