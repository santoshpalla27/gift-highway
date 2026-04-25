import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notificationService } from '../services/notificationService'
import type { NotificationGroup } from '../services/notificationService'
import { useAuthStore } from '../store/authStore'

export type DisplayGroup = NotificationGroup & { isRead: boolean }

const RETAIN_MS = 24 * 60 * 60 * 1_000
const STORAGE_KEY = 'gh-notif-rr'
const POLL_INTERVAL = 60_000

// Module-level — shared across all hook instances, survives re-renders
const recentlyRead = new Map<string, { group: NotificationGroup; markedAt: number }>()
let rrLoaded = false

async function loadRecentlyRead() {
  if (rrLoaded) return
  rrLoaded = true
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const now = Date.now()
    const saved: [string, { group: NotificationGroup; markedAt: number }][] =
      JSON.parse(raw ?? '[]')
    for (const [id, e] of saved) {
      if (now - e.markedAt <= RETAIN_MS) recentlyRead.set(id, e)
    }
  } catch { /* ignore */ }
}

function persistRecentlyRead() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...recentlyRead.entries()])).catch(() => {})
}

export function purgeNotificationOrder(orderId: string) {
  recentlyRead.delete(orderId)
  persistRecentlyRead()
}

export function useNotifications({
  mineOnly = false,
  othersOnly = false,
}: { mineOnly?: boolean; othersOnly?: boolean } = {}) {
  const { isAuthenticated } = useAuthStore()
  const [data, setData] = useState<{ groups: NotificationGroup[]; total_count: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [rrVersion, setRrVersion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const result = await notificationService.getUnread(mineOnly, othersOnly)
      setData(result)
    } catch { /* ignore */ }
  }, [isAuthenticated, mineOnly, othersOnly])

  useEffect(() => {
    loadRecentlyRead().then(() => setRrVersion(v => v + 1))
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    setIsLoading(true)
    fetchData().finally(() => setIsLoading(false))
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isAuthenticated, fetchData])

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchData, 2000)
  }, [fetchData])

  const markOrderRead = useCallback(async (orderId: string) => {
    const group = data?.groups.find(g => g.order_id === orderId)
    if (group) {
      recentlyRead.set(orderId, { group, markedAt: Date.now() })
      persistRecentlyRead()
      setRrVersion(v => v + 1)
    }
    try {
      await notificationService.markOrderRead(orderId)
      fetchData()
    } catch { /* ignore */ }
  }, [data, fetchData])

  const markAllRead = useCallback(async () => {
    const now = Date.now()
    for (const g of data?.groups ?? []) {
      recentlyRead.set(g.order_id, { group: g, markedAt: now })
    }
    persistRecentlyRead()
    setRrVersion(v => v + 1)
    try {
      await notificationService.markAllRead()
      fetchData()
    } catch { /* ignore */ }
  }, [data, fetchData])

  const groups = useMemo((): DisplayGroup[] => {
    const apiGroups = data?.groups ?? []
    const now = Date.now()

    for (const [id, e] of recentlyRead) {
      if (now - e.markedAt > RETAIN_MS) recentlyRead.delete(id)
    }

    const apiIds = new Set(apiGroups.map(g => g.order_id))
    const retained = [...recentlyRead.values()]
      .filter(e => !apiIds.has(e.group.order_id))
      .map(e => e.group)

    return [
      ...apiGroups.map(g => ({ ...g, isRead: false })),
      ...retained.map(g => ({ ...g, isRead: true })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.groups, rrVersion])

  const totalCount = useMemo(
    () => (data?.groups ?? []).reduce((s, g) => s + g.unread_count, 0),
    [data?.groups],
  )

  const unreadByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of data?.groups ?? []) m.set(g.order_id, g.unread_count)
    return m
  }, [data?.groups])

  return { groups, totalCount, unreadByOrder, isLoading, markOrderRead, markAllRead, refresh }
}
