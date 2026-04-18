import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useAuthStore } from '../store/authStore'

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'
const WS_BASE = API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '') + '/ws'

const BACKOFF_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() / 1000 >= payload.exp - 60
  } catch {
    return true
  }
}

async function getStoredRefreshToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem('refresh_token')
    const SecureStore = await import('expo-secure-store')
    return SecureStore.getItemAsync('refresh_token')
  } catch {
    return null
  }
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.tokens?.access_token ?? null
  } catch {
    return null
  }
}

export function useOrderSocket(onOrderEvent: () => void): { socketStatus: SocketStatus } {
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyedRef = useRef(false)
  const callbackRef = useRef(onOrderEvent)
  callbackRef.current = onOrderEvent
  const seenEvents = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    destroyedRef.current = false

    const connect = async () => {
      if (destroyedRef.current) return

      const store = useAuthStore.getState()
      if (!store.isAuthenticated || !store.accessToken) {
        setSocketStatus('disconnected')
        return
      }

      let token = store.accessToken

      // Refresh if expired before attempting connection
      if (isTokenExpired(token)) {
        const rt = await getStoredRefreshToken()
        if (!rt) { store.clearAuth(); return }
        const fresh = await refreshAccessToken(rt)
        if (!fresh) { store.clearAuth(); return }
        store.setAccessToken(fresh)
        token = fresh
      }

      // Purge stale dedup entries
      const cutoff = Date.now() - 120_000
      seenEvents.current.forEach((ts, k) => { if (ts < cutoff) seenEvents.current.delete(k) })

      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
        setSocketStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.event_id) {
            if (seenEvents.current.has(event.event_id)) return
            seenEvents.current.set(event.event_id, Date.now())
          }
          if (
            event.type === 'order.created' ||
            event.type === 'order.updated' ||
            event.type === 'order.status_changed' ||
            event.type === 'order.event_added'
          ) {
            callbackRef.current()
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = (e) => {
        wsRef.current = null
        if (destroyedRef.current) return
        if (e.code === 4001) { useAuthStore.getState().clearAuth(); return }
        scheduleReconnect()
      }

      ws.onerror = () => ws.close()
    }

    const scheduleReconnect = () => {
      if (destroyedRef.current) return
      const delay = BACKOFF_DELAYS[Math.min(retryRef.current, BACKOFF_DELAYS.length - 1)]
      retryRef.current++
      setSocketStatus(retryRef.current > BACKOFF_DELAYS.length ? 'disconnected' : 'reconnecting')
      timerRef.current = setTimeout(connect, delay)
    }

    connect()

    return () => {
      destroyedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { socketStatus }
}
