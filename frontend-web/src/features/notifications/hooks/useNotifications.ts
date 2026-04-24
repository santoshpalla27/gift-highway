import { useCallback, useMemo } from 'react'
import { useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '../../../providers/SocketProvider'
import { useAuthStore } from '../../../store/authStore'
import { notificationService } from '../../../services/notificationService'
import type { NotificationGroup } from '../../../services/notificationService'

export type DisplayGroup = NotificationGroup & { isRead: boolean }

const RETAIN_MS = 10 * 60 * 1_000
const STORAGE_KEY = 'gh-notif-rr'

// Module-level store — shared across every useNotifications instance and survives
// query invalidation / re-renders. Populated from localStorage on load.
const recentlyRead = new Map<string, { group: NotificationGroup; markedAt: number }>()
try {
  const now = Date.now()
  const saved: [string, { group: NotificationGroup; markedAt: number }][] =
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  for (const [id, e] of saved) {
    if (now - e.markedAt <= RETAIN_MS) recentlyRead.set(id, e)
  }
} catch { /* ignore */ }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...recentlyRead.entries()])) } catch { /* ignore */ }
}

export function useNotifications({ mineOnly = false, othersOnly = false }: { mineOnly?: boolean; othersOnly?: boolean } = {}) {
  const { isAuthenticated } = useAuthStore()
  const qc = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { mine: mineOnly, others: othersOnly }],
    queryFn: () => notificationService.getUnread(mineOnly, othersOnly),
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }, 2000)
  }, [qc])

  const handleSocketEvent = useCallback((event: { type: string }) => {
    if (typeof event.type === 'string' && event.type.startsWith('order.')) {
      refresh()
    }
  }, [refresh])

  useSocketEvent(handleSocketEvent)

  const { mutate: markOrderRead } = useMutation({
    mutationFn: notificationService.markOrderRead,
    onMutate: (orderId: string) => {
      // Capture the group while it's still in the live data so it can stay
      // visible in the bell as a dimmed "recently read" item.
      const group = data?.groups.find(g => g.order_id === orderId)
      if (group) {
        recentlyRead.set(orderId, { group, markedAt: Date.now() })
        persist()
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const { mutate: markAllRead } = useMutation({
    mutationFn: notificationService.markAllRead,
    onMutate: () => {
      const now = Date.now()
      for (const g of data?.groups ?? []) {
        recentlyRead.set(g.order_id, { group: g, markedAt: now })
      }
      persist()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const groups = useMemo((): DisplayGroup[] => {
    const apiGroups = data?.groups ?? []
    const now = Date.now()

    // Evict expired entries
    for (const [id, e] of recentlyRead) {
      if (now - e.markedAt > RETAIN_MS) recentlyRead.delete(id)
    }

    // Append retained groups (marked read) no longer in the live API response
    const apiIds = new Set(apiGroups.map(g => g.order_id))
    const retained = [...recentlyRead.values()]
      .filter(e => !apiIds.has(e.group.order_id))
      .map(e => e.group)

    return [
      ...apiGroups.map(g => ({ ...g, isRead: false })),
      ...retained.map(g => ({ ...g, isRead: true })),
    ]
  }, [data?.groups])

  // Badge count: only live unread groups contribute
  const totalCount = useMemo(
    () => (data?.groups ?? []).reduce((s, g) => s + g.unread_count, 0),
    [data?.groups],
  )

  const unreadByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of data?.groups ?? []) m.set(g.order_id, g.unread_count)
    return m
  }, [data?.groups])

  return { groups, totalCount, unreadByOrder, isLoading, markOrderRead, markAllRead }
}
