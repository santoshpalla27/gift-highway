import { createContext, useContext, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'

const SocketContext = createContext<null>(null)

const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!accessToken) return

    let destroyed = false

    function connect() {
      if (destroyed) return
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
            qc.invalidateQueries({ queryKey: ['orders'] })
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [accessToken, qc])

  return <SocketContext.Provider value={null}>{children}</SocketContext.Provider>
}

export function useSocket() {
  return useContext(SocketContext)
}
