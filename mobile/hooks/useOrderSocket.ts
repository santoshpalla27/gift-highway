import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'
const WS_BASE = API_BASE.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + '/ws'

export function useOrderSocket(onOrderEvent: () => void) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyedRef = useRef(false)
  const callbackRef = useRef(onOrderEvent)
  callbackRef.current = onOrderEvent

  useEffect(() => {
    if (!accessToken) return

    destroyedRef.current = false

    function connect() {
      if (destroyedRef.current) return
      const ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(accessToken!)}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (
            event.type === 'order.created' ||
            event.type === 'order.updated' ||
            event.type === 'order.status_changed'
          ) {
            callbackRef.current()
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (!destroyedRef.current) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      destroyedRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [accessToken])
}
