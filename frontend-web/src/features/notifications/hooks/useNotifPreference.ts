import { useState, useEffect, useCallback } from 'react'

type NotifScope = 'my_orders' | 'all_orders'
const STORAGE_KEY = 'gh-notif-scope'
const SYNC_EVENT = 'gh-notif-scope-change'

function read(): NotifScope {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'all_orders') return 'all_orders'
  } catch { /* ignore */ }
  return 'my_orders'
}

export function useNotifPreference() {
  const [scope, setScope] = useState<NotifScope>(read)

  // Keep all hook instances in sync via a custom window event
  useEffect(() => {
    const handler = () => setScope(read())
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [])

  const update = useCallback((next: NotifScope) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setScope(next)
    window.dispatchEvent(new Event(SYNC_EVENT))
  }, [])

  return { scope, setScope: update }
}
