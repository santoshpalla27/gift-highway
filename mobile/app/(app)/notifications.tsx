import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar,
} from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNotifications } from '../../hooks/useNotifications'
import { useNotifPreference } from '../../hooks/useNotifPreference'
import type { DisplayGroup } from '../../hooks/useNotifications'
import type { NotificationEvent } from '../../services/notificationService'
import { formatRelative } from '../../utils/date'

type Tab = 'mine' | 'others'

// ── Event preview ─────────────────────────────────────────────────────────────

function eventPreview(e: NotificationEvent): string {
  const p = e.payload ?? {}
  switch (e.type) {
    case 'customer_message':
      return `${p.customer_name ?? 'Customer'}: ${String(p.text ?? '').slice(0, 60)}`
    case 'customer_attachment':
      return `${p.customer_name ?? 'Customer'} uploaded ${p.file_name ?? 'a file'}`
    case 'comment_added':
      return `${e.actor_name}: ${String(p.text ?? '').replace(/^\[reply:[^\]]+\]\n?/, '').slice(0, 60)}`
    case 'attachment_added':
      return `${e.actor_name} uploaded ${p.file_name ?? 'a file'}`
    case 'status_changed':
      return `${e.actor_name} changed status to ${p.to ?? ''}`
    case 'assignees_changed':
      return `${e.actor_name} updated assignees`
    case 'due_date_changed':
      return `${e.actor_name} changed due date`
    case 'staff_portal_reply':
      return `${e.actor_name}: ${String(p.text ?? '').slice(0, 60)}`
    case 'user_mentioned':
      return `${e.actor_name} mentioned you: ${String(p.text ?? '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 50)}`
    default:
      return `${e.actor_name} updated the order`
  }
}

function priorityColor(priority: string) {
  if (priority === 'high') return '#EF4444'
  if (priority === 'medium') return '#F59E0B'
  return '#9CA3AF'
}

// ── Group row ─────────────────────────────────────────────────────────────────

function GroupRow({ group, onOpen, onMarkRead }: { group: DisplayGroup; onOpen: () => void; onMarkRead?: () => void }) {
  const topPriority = group.events[0]?.priority ?? 'medium'
  const showCount = !group.isRead && group.unread_count > 2

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.7}
      style={[S.groupRow, group.isRead && { opacity: 0.45 }]}
    >
      <View style={S.groupHeader}>
        {!group.isRead && (
          <View style={[S.dot, { backgroundColor: priorityColor(topPriority) }]} />
        )}
        <Text
          style={[S.groupTitle, group.isRead && { fontWeight: '500', color: '#6B7280' }]}
          numberOfLines={1}
        >
          Order #{group.order_title}
        </Text>
        {!group.isRead && (
          <View style={S.badge}>
            <Text style={S.badgeText}>{group.unread_count}</Text>
          </View>
        )}
        {onMarkRead && (
          <TouchableOpacity
            onPress={onMarkRead}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={S.markReadBtn}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {showCount ? (
        <Text style={S.preview}>{group.unread_count} new updates</Text>
      ) : (
        group.events.slice(0, group.unread_count <= 2 ? group.unread_count : 1).map(e => (
          <View key={e.id} style={S.previewRow}>
            <Text style={S.preview} numberOfLines={1}>{eventPreview(e)}</Text>
            <Text style={S.time}>{formatRelative(e.created_at)}</Text>
          </View>
        ))
      )}
    </TouchableOpacity>
  )
}

// ── Filter helper ─────────────────────────────────────────────────────────────

function filterGroupsByTypes(groups: DisplayGroup[], enabledTypes: string[]): DisplayGroup[] {
  const typeSet = new Set(enabledTypes)
  return groups
    .map(g => ({
      ...g,
      events: g.events.filter(e => typeSet.has(e.type)),
    }))
    .filter(g => g.events.length > 0 || g.isRead)
    .map(g => ({
      ...g,
      unread_count: g.isRead ? g.unread_count : g.events.length,
    }))
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>('mine')

  const { scope, getEnabledTypes } = useNotifPreference()

  const { groups: myGroupsRaw, isLoading: myLoading, markAllRead: markMyAllRead, markOrderRead: markMyOrderRead, refreshNow: refreshMine } =
    useNotifications({ mineOnly: true })
  const { groups: otherGroupsRaw, isLoading: otherLoading, markAllRead: markOtherAllRead, markOrderRead: markOtherOrderRead, refreshNow: refreshOthers } =
    useNotifications({ othersOnly: true })

  // Re-fetch immediately every time this screen comes into focus
  useFocusEffect(useCallback(() => {
    refreshMine()
    refreshOthers()
  }, [refreshMine, refreshOthers]))

  const myGroups = filterGroupsByTypes(myGroupsRaw, getEnabledTypes('my_orders'))
  const otherGroups = filterGroupsByTypes(otherGroupsRaw, getEnabledTypes('all_orders'))

  const myCount = myGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)
  const otherCount = otherGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)

  const groups = tab === 'mine' ? myGroups : otherGroups
  const isLoading = tab === 'mine' ? myLoading : otherLoading
  const totalCount = tab === 'mine' ? myCount : otherCount
  const markAllRead = tab === 'mine' ? markMyAllRead : markOtherAllRead

  const markOrderRead = tab === 'mine' ? markMyOrderRead : markOtherOrderRead

  function openOrder(group: DisplayGroup) {
    router.push(`/order/${group.order_id}` as any)
  }

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>
          Notifications{totalCount > 0 ? ` (${totalCount})` : ''}
        </Text>
        <View style={S.headerActions}>
          {totalCount > 0 && (
            <TouchableOpacity onPress={() => markAllRead()} style={S.markAllBtn}>
              <Text style={S.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/notification-preferences' as any)}
            style={S.prefBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="options-outline" size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={S.tabs}>
        {(['mine', 'others'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[S.tab, tab === t && S.tabActive]}
          >
            <Text style={[S.tabLabel, tab === t && S.tabLabelActive]}>
              {t === 'mine' ? 'My Orders' : 'Other Orders'}
            </Text>
            {t === 'mine' && myCount > 0 && (
              <View style={S.tabBadge}><Text style={S.tabBadgeText}>{myCount}</Text></View>
            )}
            {t === 'others' && otherCount > 0 && (
              <View style={S.tabBadge}><Text style={S.tabBadgeText}>{otherCount}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading && groups.length === 0 ? (
        <View style={S.emptyWrap}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : groups.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons name="notifications-outline" size={40} color="#D1D5DB" />
          <Text style={S.emptyText}>
            {tab === 'mine' ? "You're all caught up" : 'No activity on other orders'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
          {groups.map(g => (
            <GroupRow
              key={g.order_id}
              group={g}
              onOpen={() => openOrder(g)}
              onMarkRead={!g.isRead ? () => markOrderRead(g.order_id) : undefined}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  markAllBtn: { paddingVertical: 4 },
  markAllText: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  prefBtn: { padding: 4 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#6366F1' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabLabelActive: { color: '#4F46E5' },
  tabBadge: {
    backgroundColor: '#6366F1', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  groupRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
    gap: 4,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  groupTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#6366F1', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  markReadBtn: { padding: 2, flexShrink: 0 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 15 },
  preview: { flex: 1, fontSize: 12, color: '#9CA3AF', lineHeight: 16 },
  time: { fontSize: 10, color: '#C4C9D4', flexShrink: 0 },
})
