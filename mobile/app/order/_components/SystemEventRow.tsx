import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { OrderEvent } from '../../../services/orderService'
import { formatRelative } from '../../../utils/date'

const STATUS_META: Record<string, { label: string }> = {
  new:         { label: 'New' },
  in_progress: { label: 'Working' },
  completed:   { label: 'Done' },
}

const PRIORITY_META: Record<string, { label: string }> = {
  low:    { label: 'Low' },
  medium: { label: 'Medium' },
  high:   { label: 'High' },
  urgent: { label: 'Urgent' },
}

const EVENT_TYPE_META: Record<string, { icon: string; label: (p: Record<string, string>) => string }> = {
  order_created:     { icon: 'add-circle-outline',      label: () => 'Order created' },
  comment_added:     { icon: 'chatbubble-outline',      label: () => '' },
  status_changed:    { icon: 'swap-horizontal-outline', label: p => `Status changed from ${STATUS_META[p.from]?.label ?? p.from} to ${STATUS_META[p.to]?.label ?? p.to}` },
  assignees_changed: { icon: 'people-outline',          label: p => p.names ? `Assigned to ${p.names}` : 'Assignees updated' },
  due_date_changed:  { icon: 'calendar-outline',        label: p => p.to ? `Due date set to ${p.to}` : 'Due date removed' },
  priority_changed:  { icon: 'flag-outline',            label: p => `Priority changed to ${PRIORITY_META[p.to]?.label ?? p.to}` },
  order_updated:     { icon: 'pencil-outline',          label: () => 'Order details updated' },
}

export function SystemEventRow({ event }: { event: OrderEvent }) {
  const p = event.payload as Record<string, string>

  if (event.type === 'attachment_deleted') {
    return (
      <View style={[R.row, { opacity: 0.5 }]}>
        <View style={R.iconWrap}><Ionicons name="trash-outline" size={13} color="#9CA3AF" /></View>
        <Text style={[R.label, { fontStyle: 'italic' }]}>
          Attachment deleted{p.file_name ? ` · ${p.file_name}` : ''}
        </Text>
      </View>
    )
  }

  if (event.type === 'portal_message_deleted') {
    return (
      <View style={[R.row, { opacity: 0.5 }]}>
        <View style={R.iconWrap}><Ionicons name="trash-outline" size={13} color="#9CA3AF" /></View>
        <Text style={[R.label, { fontStyle: 'italic' }]}>Message deleted</Text>
      </View>
    )
  }

  const meta = EVENT_TYPE_META[event.type]
  const label = meta?.label(p) ?? event.type
  return (
    <View style={R.row}>
      <View style={R.iconWrap}>
        <Ionicons name={(meta?.icon ?? 'ellipse-outline') as any} size={13} color="#6B7280" />
      </View>
      <View style={R.content}>
        <Text style={R.label} numberOfLines={2}>
          <Text style={R.actor}>{event.actor_name}</Text>
          {label ? `  ·  ${label}` : ''}
        </Text>
        <Text style={R.meta}>{formatRelative(event.created_at)}</Text>
      </View>
    </View>
  )
}

const R = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  iconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1 },
  actor: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  label: { fontSize: 12.5, color: '#64748B', fontWeight: '400' },
  meta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
})
