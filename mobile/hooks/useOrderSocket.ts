import { useCallback } from 'react'
import { useSocketEvent, useSocketStatus } from '../providers/SocketProvider'
import type { RawSocketEvent, SocketStatus } from '../providers/SocketProvider'

// Re-export SocketStatus so existing callers don't break
export type { SocketStatus }

const ORDER_EVENT_TYPES = new Set([
  'order.created',
  'order.updated',
  'order.status_changed',
  'order.event_added',
  'order.event_deleted',
])

export function useOrderSocket(
  onOrderEvent: () => void,
  onRawEvent?: (event: RawSocketEvent) => void,
): { socketStatus: SocketStatus } {
  const socketStatus = useSocketStatus()

  useSocketEvent(useCallback((event: RawSocketEvent) => {
    if (ORDER_EVENT_TYPES.has(event.type as string)) {
      onOrderEvent()
    }
    onRawEvent?.(event)
  }, [onOrderEvent, onRawEvent]))

  return { socketStatus }
}
