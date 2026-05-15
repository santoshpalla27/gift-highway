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
  if (priority === 'high')   return '#EF4444'
  if (priority === 'medium') return '#F59E0B'
  return '#9CA3AF'
}

// ── Group row ─────────────────────────────────────────────────────────────────

function GroupRow({ group, onOpen, onMarkRead }: {
  group: DisplayGroup
  onOpen: () => void
  onMarkRead?: () => void
}) {
  const topPriority = group.events[0]?.priority ?? 'medium'
  const isRead = group.isRead

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.7}
      style={[S.groupRow, isRead && S.groupRowRead]}
      accessibilityRole="button"
      accessibilityLabel={`Order ${group.order_title}${!isRead ? `, ${group.unread_count} unread` : ', read'}`}
    >
      <View style={S.groupHeader}>
        {!isRead && (
          <View style={[S.dot, { backgroundColor: priorityColor(topPriority) }]} />
        )}
        <Text style={[S.groupTitle, isRead && S.groupTitleRead]} numberOfLines={1}>
          Order #{group.order_title}
        </Text>
        {!isRead && (
          <View style={S.badge}>
            <Text style={S.badgeText}>{group.unread_count}</Text>
          </View>
        )}
        {onMarkRead && (
          <TouchableOpacity
            onPress={onMarkRead}
            style={S.markReadBtn}
            accessibilityRole="button"
            accessibilityLabel="Mark as read"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {!isRead && group.unread_count >= 2 ? (
        <Text style={S.preview}>{group.unread_count} new messages</Text>
      ) : (
        group.events.slice(0, 1).map(e => (
          <View key={e.id} style={S.previewRow}>
            <Text style={[S.preview, isRead && S.previewRead]} numberOfLines={1}>
              {eventPreview(e)}
            </Text>
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

  useFocusEffect(useCallback(() => {
    refreshMine()
    refreshOthers()
  }, [refreshMine, refreshOthers]))

  const myGroups    = filterGroupsByTypes(myGroupsRaw, getEnabledTypes('my_orders'))
  const otherGroups = filterGroupsByTypes(otherGroupsRaw, getEnabledTypes('all_orders'))

  const myCount    = myGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)
  const otherCount = otherGroups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0)

  const groups      = tab === 'mine' ? myGroups : otherGroups
  const isLoading   = tab === 'mine' ? myLoading : otherLoading
  const totalCount  = tab === 'mine' ? myCount : otherCount
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={S.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>Notifications</Text>
          {totalCount > 0 && (
            <View style={S.headerBadge}>
              <Text style={S.headerBadgeText}>{totalCount > 99 ? '99+' : totalCount}</Text>
            </View>
          )}
        </View>

        <View style={S.headerActions}>
          {totalCount > 0 && (
            <TouchableOpacity
              onPress={() => markAllRead()}
              style={S.markAllBtn}
              accessibilityRole="button"
              accessibilityLabel="Mark all notifications as read"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            >
              <Text style={S.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push('/notifications/notification-preferences' as any)}
            style={S.prefBtn}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Notification preferences"
          >
            <Ionicons name="options-outline" size={22} color="#6366F1" />
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
            accessibilityRole="tab"
            accessibilityLabel={t === 'mine' ? 'My Orders tab' : 'Other Orders tab'}
            accessibilityState={{ selected: tab === t }}
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
          <View style={S.emptyIconWrap}>
            <Ionicons name="notifications-outline" size={28} color="#9CA3AF" />
          </View>
          <Text style={S.emptyTitle}>
            {tab === 'mine' ? "You're all caught up" : 'No activity on other orders'}
          </Text>
          <Text style={S.emptySubtitle}>
            {tab === 'mine' ? 'New activity on your orders will appear here.' : 'Updates on all workspace orders will appear here.'}
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
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
    minHeight: 56,
  },
  backBtn: { padding: 4 },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  headerBadgeText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F5F3FF' },
  markAllText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  prefBtn: { padding: 6 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#6366F1' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabLabelActive: { color: '#4F46E5' },
  tabBadge: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },

  groupRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
    gap: 5,
    backgroundColor: '#FFFFFF',
  },
  // Read rows: subtle background shift instead of opacity (preserves contrast)
  groupRowRead: {
    backgroundColor: '#FAFAFA',
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  groupTitleRead: { color: '#6B7280', fontWeight: '500' },
  badge: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  markReadBtn: { padding: 2, flexShrink: 0 },

  previewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 16 },
  preview: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 18 },
  previewRead: { color: '#9CA3AF' },
  time: { fontSize: 11, color: '#C4C9D4', flexShrink: 0, marginTop: 1 },
})
