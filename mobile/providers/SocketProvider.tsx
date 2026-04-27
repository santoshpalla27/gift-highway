import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { refreshAccessToken } from '../services/tokenRefresh'

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

const SocketContext = createContext<{ status: SocketStatus }>({ status: 'connecting' })

export function useSocketStatus() {
  return useContext(SocketContext).status
}

// ── Per-component event subscriptions ────────────────────────────────────────
export type RawSocketEvent = { type: string; entity_id?: string; [key: string]: unknown }
type SocketEventHandler = (event: RawSocketEvent) => void

// Module-level set — survives re-renders, shared across all subscribers
const socketEventCallbacks = new Set<SocketEventHandler>()

export function useSocketEvent(handler: SocketEventHandler) {
  // Stable wrapper so subscribers don't need to memoize their callbacks
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    const stable: SocketEventHandler = (e) => handlerRef.current(e)
    socketEventCallbacks.add(stable)
    return () => { socketEventCallbacks.delete(stable) }
  }, [])
}

// ── Connection ────────────────────────────────────────────────────────────────
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

// ── Provider ──────────────────────────────────────────────────────────────────
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyedRef = useRef(false)
  const seenEvents = useRef(new Map<string, number>())

  useEffect(() => {
    destroyedRef.current = false
    retryRef.current = 0

    const connect = async () => {
      if (destroyedRef.current) return
      const store = useAuthStore.getState()
      if (!store.isAuthenticated || !store.accessToken) return

      let token = store.accessToken
      if (isTokenExpired(token)) {
        const fresh = await refreshAccessToken()
        if (!fresh) return  // clearAuth already called inside on 4xx; network error → retry later
        token = fresh
      }

      const cutoff = Date.now() - 120_000
      seenEvents.current.forEach((ts, k) => { if (ts < cutoff) seenEvents.current.delete(k) })

      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws

      ws.onopen = () => {
        retryRef.current = 0
        setStatus('connected')
      }

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.event_id) {
            if (seenEvents.current.has(event.event_id)) return
            seenEvents.current.set(event.event_id, Date.now())
          }
          socketEventCallbacks.forEach(cb => cb(event))
        } catch { /* ignore malformed frames */ }
      }

      ws.onclose = async (e) => {
        wsRef.current = null
        if (destroyedRef.current) return
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

    if (isAuthenticated) {
      setStatus('connecting')
      connect()
    } else {
      setStatus('disconnected')
    }

    return () => {
      destroyedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [isAuthenticated])

  return (
    <SocketContext.Provider value={{ status }}>
      {children}
    </SocketContext.Provider>
  )
}
