import { useState, useCallback } from 'react'

type NotifScope = 'my_orders' | 'all_orders'
const STORAGE_KEY = 'gh-notif-scope'

function read(): NotifScope {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'all_orders') return 'all_orders'
  } catch { /* ignore */ }
  return 'my_orders'
}

export function useNotifPreference() {
  const [scope, setScope] = useState<NotifScope>(read)

  const update = useCallback((next: NotifScope) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setScope(next)
  }, [])

  return { scope, setScope: update }
}
