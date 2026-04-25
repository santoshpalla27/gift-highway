import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { notificationService } from '../services/notificationService'
import type { NotificationGroup } from '../services/notificationService'
import { useAuthStore } from '../store/authStore'
import { useSocketEvent } from '../providers/SocketProvider'

export type DisplayGroup = NotificationGroup & { isRead: boolean }

const RETAIN_MS = 24 * 60 * 60 * 1_000
const STORAGE_KEY = 'gh-notif-rr'
const STALE_MS   = 30_000   // same as web staleTime
const POLL_MS    = 60_000   // same as web refetchInterval

// ── Persisted recently-read store ────────────────────────────────────────────
// Groups that were unread when the user navigated into them stay visible
// in a dimmed state for up to 24 h so the panel doesn't jump around.

const recentlyRead = new Map<string, { group: NotificationGroup; markedAt: number }>()
// Groups marked read locally but not yet gone from the API response (optimistic)
const locallyReadOrders = new Set<string>()
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
    _notifyAll()
  } catch { /* ignore */ }
}

function persistRecentlyRead() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...recentlyRead.entries()])).catch(() => {})
  _notifyAll()
}

export function purgeNotificationOrder(orderId: string) {
  recentlyRead.delete(orderId)
  persistRecentlyRead()
}

// ── Shared query cache ────────────────────────────────────────────────────────
// Mirrors react-query's per-key shared cache:
//   • One in-flight fetch per key — concurrent calls are deduplicated
//   • One background poller per key — not per hook instance
//   • _notifyAll() plays the role of qc.invalidateQueries({ queryKey: ['notifications'] })

type CacheKey = string  // `${mineOnly}:${othersOnly}`

interface CacheEntry {
  data: { groups: NotificationGroup[]; total_count: number } | null
  fetchedAt: number
  prevGroups: NotificationGroup[]
  inFlight: Promise<void> | null
  pollerRef: ReturnType<typeof setInterval> | null
  refCount: number
  setters: Set<React.Dispatch<React.SetStateAction<number>>>
}

const _cache = new Map<CacheKey, CacheEntry>()
let _version = 0

function _getEntry(key: CacheKey): CacheEntry {
  if (!_cache.has(key)) {
    _cache.set(key, {
      data: null, fetchedAt: 0, prevGroups: [], inFlight: null,
      pollerRef: null, refCount: 0, setters: new Set(),
    })
  }
  return _cache.get(key)!
}

function _notify(key: CacheKey) {
  _version++
  _cache.get(key)?.setters.forEach(s => s(_version))
}

function _notifyAll() {
  _version++
  _cache.forEach(e => e.setters.forEach(s => s(_version)))
}

async function _fetch(key: CacheKey, mineOnly: boolean, othersOnly: boolean, force = false) {
  const entry = _getEntry(key)
  if (entry.inFlight) return  // deduplicate concurrent calls
  if (!force && entry.data && Date.now() - entry.fetchedAt < STALE_MS) return  // still fresh

  const p: Promise<void> = (async () => {
    try {
      const result = await notificationService.getUnread(mineOnly, othersOnly)
      const newIds = new Set(result.groups.map((g: NotificationGroup) => g.order_id))
      const now = Date.now()
      let needsBump = false
      for (const g of entry.prevGroups) {
        if (!newIds.has(g.order_id) && !recentlyRead.has(g.order_id)) {
          recentlyRead.set(g.order_id, { group: g, markedAt: now })
          needsBump = true
        }
      }
      // Clean up locallyReadOrders entries confirmed gone from the API
      for (const id of locallyReadOrders) {
        if (!newIds.has(id)) locallyReadOrders.delete(id)
      }
      entry.prevGroups = result.groups
      entry.data = result
      entry.fetchedAt = Date.now()
      _notify(key)
      if (needsBump) persistRecentlyRead()  // also calls _notifyAll
    } catch (err) {
      console.warn('[useNotifications] fetch failed:', err)
    }
  })().finally(() => { entry.inFlight = null })

  entry.inFlight = p
}

// Mirrors qc.invalidateQueries({ queryKey: ['notifications'] }) — forces all
// cached keys to refetch immediately (used after any mutation succeeds).
// If a fetch is already in-flight for a key (e.g. from useFocusEffect firing
// before the cleanup effect), we chain a second fetch after it completes so
// the mutation result is never silently swallowed by an earlier stale request.
function _invalidateAll() {
  _cache.forEach((entry, key) => {
    const [m, o] = key.split(':')
    if (entry.inFlight) {
      entry.inFlight.then(() => _fetch(key, m === 'true', o === 'true', true))
    } else {
      _fetch(key, m === 'true', o === 'true', true)
    }
  })
}

// ── Standalone mark-read (for useOrderDetail — no hook instance needed) ──────
// Web's OrderDetailPage calls useNotifications().markOrderRead on unmount;
// this exported function replicates that without mounting a hook instance.
export async function markNotificationOrderRead(orderId: string) {
  let group: NotificationGroup | undefined
  _cache.forEach(e => { if (!group) group = e.data?.groups.find(g => g.order_id === orderId) })
  if (group) {
    recentlyRead.set(orderId, { group, markedAt: Date.now() })
    locallyReadOrders.add(orderId)
    persistRecentlyRead()
  }
  try {
    await notificationService.markOrderRead(orderId)
    _invalidateAll()
  } catch { /* ignore */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications({
  mineOnly = false,
  othersOnly = false,
}: { mineOnly?: boolean; othersOnly?: boolean } = {}) {
  const { isAuthenticated } = useAuthStore()
  const key: CacheKey = `${mineOnly}:${othersOnly}`
  const entry = _getEntry(key)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Version counter — bumped by _notify/_notifyAll to trigger re-renders
  const [version, setVersion] = useState(_version)

  useEffect(() => {
    entry.setters.add(setVersion)
    entry.refCount++

    if (isAuthenticated) {
      _fetch(key, mineOnly, othersOnly)
      if (!entry.pollerRef) {
        entry.pollerRef = setInterval(() => _fetch(key, mineOnly, othersOnly), POLL_MS)
      }
    }

    // Sync: if data was fetched while this instance was unmounted (e.g. StrictMode
    // double-invoke where fetch completed between cleanup and remount), our local
    // version counter is behind _version — bump it so we render the existing data.
    if (entry.data) setVersion(_version)

    loadRecentlyRead()

    return () => {
      entry.setters.delete(setVersion)
      entry.refCount--
      if (entry.refCount === 0 && entry.pollerRef) {
        clearInterval(entry.pollerRef)
        entry.pollerRef = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isAuthenticated])

  // Debounced — socket events trigger this, same 2 s delay as web
  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(_invalidateAll, 2000)
  }, [])

  // Immediate — for useFocusEffect on the notifications screen.
  // Uses the same chaining logic as _invalidateAll so a racing in-flight
  // fetch (from a concurrent focus event) doesn't swallow a pending mark-read.
  const refreshNow = useCallback(() => {
    if (entry.inFlight) {
      entry.inFlight.then(() => _fetch(key, mineOnly, othersOnly, true))
    } else {
      _fetch(key, mineOnly, othersOnly, true)
    }
  }, [key, mineOnly, othersOnly, entry])

  useSocketEvent(useCallback((event) => {
    if (typeof event.type === 'string' && event.type.startsWith('order.')) refresh()
  }, [refresh]))

  const data = entry.data

  // Mirrors web's onMutate (optimistic) + onSuccess (invalidate)
  const markOrderRead = useCallback(async (orderId: string) => {
    let group: NotificationGroup | undefined
    _cache.forEach(e => { if (!group) group = e.data?.groups.find(g => g.order_id === orderId) })
    if (group) {
      recentlyRead.set(orderId, { group, markedAt: Date.now() })
      locallyReadOrders.add(orderId)
      persistRecentlyRead()  // optimistic: all instances see isRead=true instantly
    }
    try {
      await notificationService.markOrderRead(orderId)
      _invalidateAll()  // mirrors onSuccess: qc.invalidateQueries(['notifications'])
    } catch { /* ignore */ }
  }, [])

  const markAllRead = useCallback(async () => {
    const now = Date.now()
    _cache.forEach(e => {
      for (const g of e.data?.groups ?? []) {
        recentlyRead.set(g.order_id, { group: g, markedAt: now })
        locallyReadOrders.add(g.order_id)
      }
    })
    persistRecentlyRead()  // optimistic clear
    try {
      await notificationService.markAllRead()
      _invalidateAll()
    } catch { /* ignore */ }
  }, [])

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
      ...apiGroups.map(g => ({ ...g, isRead: locallyReadOrders.has(g.order_id) })),
      ...retained.map(g => ({ ...g, isRead: true })),
    ]
  }, [data?.groups, version])

  // Badge count: unread (not locally-marked-read) groups only
  const totalCount = useMemo(
    () => groups.filter(g => !g.isRead).reduce((s, g) => s + g.unread_count, 0),
    [groups],
  )

  // Per-order unread count for card badges — also respects locallyReadOrders
  const unreadByOrder = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of data?.groups ?? []) {
      if (!locallyReadOrders.has(g.order_id)) m.set(g.order_id, g.unread_count)
    }
    return m
  }, [data?.groups, version])

  const isLoading = !data

  return { groups, totalCount, unreadByOrder, isLoading, markOrderRead, markAllRead, refresh, refreshNow }
}
