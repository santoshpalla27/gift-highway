import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNotifPreference } from '../../hooks/useNotifPreference'
import type { NotifScope } from '../../hooks/useNotifPreference'

const GROUPS: { label: string; types: { key: string; label: string }[] }[] = [
  {
    label: 'Important Updates',
    types: [
      { key: 'customer_message',    label: 'Customer Messages' },
      { key: 'customer_attachment', label: 'Customer Attachments' },
      { key: 'assignees_changed',   label: 'Assignment Changes' },
    ],
  },
  {
    label: 'Workflow Updates',
    types: [
      { key: 'status_changed',   label: 'Status Changes' },
      { key: 'due_date_changed', label: 'Due Date Changes' },
    ],
  },
  {
    label: 'Team Activity',
    types: [
      { key: 'comment_added',      label: 'Staff Comments' },
      { key: 'attachment_added',   label: 'Staff Attachments' },
      { key: 'staff_portal_reply', label: 'Portal Replies' },
    ],
  },
  {
    label: 'Low Priority',
    types: [
      { key: 'order_updated',    label: 'Generic Updates' },
      { key: 'priority_changed', label: 'Priority Changes' },
    ],
  },
]

export default function NotificationPreferencesScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { scope, prefs, setScope, toggleType } = useNotifPreference()

  const activeScope: NotifScope = scope
  const typePrefs = prefs.types[activeScope]

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Notification Preferences</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* Scope selector */}
        <View style={S.card}>
          <Text style={S.cardTitle}>Notification Scope</Text>
          <Text style={S.cardDesc}>
            {scope === 'my_orders'
              ? 'Bell and badge show notifications only for orders assigned to you.'
              : 'Bell and badge show notifications for all orders in the workspace.'}
          </Text>
          <View style={S.scopeRow}>
            {(['my_orders', 'all_orders'] as const).map(v => (
              <TouchableOpacity
                key={v}
                onPress={() => setScope(v)}
                style={[S.scopeBtn, scope === v && S.scopeBtnActive]}
              >
                <Text style={[S.scopeLabel, scope === v && S.scopeLabelActive]}>
                  {v === 'my_orders' ? 'My Orders' : 'All Orders'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={S.divider} />

        {/* Scope label */}
        <Text style={S.sectionHeader}>
          NOTIFY ME ABOUT ({scope === 'my_orders' ? 'MY ORDERS' : 'ALL ORDERS'})
        </Text>

        {/* Mentions — always on */}
        <View style={S.mentionRow}>
          <Ionicons name="lock-closed" size={15} color="#6366F1" />
          <Text style={S.mentionLabel}>Mentions (@you)</Text>
          <Text style={S.alwaysOn}>Always on</Text>
        </View>

        {/* Type groups */}
        {GROUPS.map(group => (
          <View key={group.label} style={S.group}>
            <Text style={S.groupLabel}>{group.label}</Text>
            {group.types.map(({ key, label }) => {
              const enabled = typePrefs[key] ?? false
              return (
                <View key={key} style={[S.typeRow, enabled && S.typeRowActive]}>
                  <Text style={[S.typeLabel, enabled && S.typeLabelActive]}>{label}</Text>
                  <Switch
                    value={enabled}
                    onValueChange={v => toggleType(activeScope, key, v)}
                    trackColor={{ false: '#E5E7EB', true: '#C7D2FE' }}
                    thumbColor={enabled ? '#6366F1' : '#9CA3AF'}
                  />
                </View>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  scopeRow: {
    flexDirection: 'row', backgroundColor: '#F3F4F6',
    borderRadius: 10, padding: 3, gap: 2, marginTop: 4,
  },
  scopeBtn: {
    flex: 1, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 8, alignItems: 'center',
  },
  scopeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  scopeLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  scopeLabelActive: { color: '#4F46E5' },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: '#6B7280',
    letterSpacing: 0.5, marginBottom: 12,
  },

  mentionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE',
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  mentionLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: '#4F46E5' },
  alwaysOn: { fontSize: 11, color: '#7C3AED', fontWeight: '600' },

  group: { marginBottom: 20 },
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8 },
  typeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#F3F4F6',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 6,
  },
  typeRowActive: { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' },
  typeLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: '#374151' },
  typeLabelActive: { color: '#4F46E5' },
})
