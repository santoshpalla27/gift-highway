import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { refreshAccessToken } from '../services/tokenRefresh'

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

const SocketContext = createContext<{ status: SocketStatus }>({ status: 'connecting' })

export function useSocketStatus() {
  return useContext(SocketContext).status
}

// ─── Per-event subscriptions ──────────────────────────────────────────────────
type RawSocketEvent = { type: string; entity_id?: string; [key: string]: unknown }
type SocketEventHandler = (event: RawSocketEvent) => void
const socketEventCallbacks = new Set<SocketEventHandler>()

export function useSocketEvent(handler: SocketEventHandler) {
  useEffect(() => {
    socketEventCallbacks.add(handler)
    return () => { socketEventCallbacks.delete(handler) }
  }, [handler])
}

const BACKOFF_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]

const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() / 1000 >= payload.exp - 60
  } catch {
    return true
  }
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyedRef = useRef(false)
  const seenEvents = useRef<Map<string, number>>(new Map())

  // Deduplicate events; purge entries older than 2 min
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 120_000
      seenEvents.current.forEach((ts, k) => { if (ts < cutoff) seenEvents.current.delete(k) })
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    destroyedRef.current = false
    retryRef.current = 0
    setStatus('connecting')

    const connect = async () => {
      if (destroyedRef.current) return

      const store = useAuthStore.getState()
      if (!store.isAuthenticated || !store.accessToken) {
        // Not yet authenticated — stay silent, wait for login to re-trigger effect
        return
      }

      let token = store.accessToken

      // Refresh before connecting if token is expired (shared singleton — no race with apiClient)
      if (isTokenExpired(token)) {
        const fresh = await refreshAccessToken()
        if (!fresh) return  // clearAuth already called inside on 4xx; network error → retry later
        token = fresh
      }

      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
        setStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)

          // Deduplication
          if (event.event_id) {
            if (seenEvents.current.has(event.event_id)) return
            seenEvents.current.set(event.event_id, Date.now())
          }

          if (
            event.type === 'order.created' ||
            event.type === 'order.updated' ||
            event.type === 'order.status_changed'
          ) {
            qc.invalidateQueries({ queryKey: ['orders'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
          }

          if (event.type === 'order.event_added' && event.entity_id) {
            qc.invalidateQueries({ queryKey: ['orders', event.entity_id, 'events'] })
            qc.invalidateQueries({ queryKey: ['orders', event.entity_id] })
          }

          if (event.type === 'order.event_deleted' && event.entity_id) {
            qc.invalidateQueries({ queryKey: ['orders', event.entity_id] })
          }

          // Fan out to per-component subscribers
          socketEventCallbacks.forEach(cb => cb(event))
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = async (e) => {
        wsRef.current = null
        if (destroyedRef.current) return

        // Hard auth failure — refresh and reconnect (shared singleton avoids race with apiClient)
        if (e.code === 4001) {
          const fresh = await refreshAccessToken()
          if (!fresh) return  // clearAuth already called inside on 4xx
          retryRef.current = 0
        }

        scheduleReconnect()
      }

      ws.onerror = () => ws.close()
    }

    const scheduleReconnect = () => {
      if (destroyedRef.current) return
      const delay = BACKOFF_DELAYS[Math.min(retryRef.current, BACKOFF_DELAYS.length - 1)]
      retryRef.current++
      setStatus(retryRef.current > BACKOFF_DELAYS.length ? 'disconnected' : 'reconnecting')
      timerRef.current = setTimeout(connect, delay)
    }

    connect()

    return () => {
      destroyedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [qc, isAuthenticated])

  return (
    <SocketContext.Provider value={{ status }}>
      {children}
    </SocketContext.Provider>
  )
}
