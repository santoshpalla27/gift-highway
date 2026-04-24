import { useState, useEffect, useCallback } from 'react'

export type NotifScope = 'my_orders' | 'all_orders'
export type TypePrefs = Record<string, boolean>

export interface NotifPrefs {
  scope: NotifScope
  types: Record<NotifScope, TypePrefs>
}

const STORAGE_KEY = 'gh-notif-prefs'
const SYNC_EVENT = 'gh-notif-scope-change'

export const DEFAULT_TYPE_PREFS: TypePrefs = {
  user_mentioned:      true,
  customer_message:    true,
  customer_attachment: true,
  assignees_changed:   true,
  status_changed:      true,
  due_date_changed:    true,
  comment_added:       true,
  attachment_added:    true,
  staff_portal_reply:  true,
  order_updated:       false,
  priority_changed:    false,
}

const DEFAULT_PREFS: NotifPrefs = {
  scope: 'my_orders',
  types: {
    my_orders:  { ...DEFAULT_TYPE_PREFS },
    all_orders: { ...DEFAULT_TYPE_PREFS },
  },
}

function read(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotifPrefs>
      return {
        scope: parsed.scope ?? DEFAULT_PREFS.scope,
        types: {
          my_orders:  { ...DEFAULT_TYPE_PREFS, ...parsed.types?.my_orders },
          all_orders: { ...DEFAULT_TYPE_PREFS, ...parsed.types?.all_orders },
        },
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_PREFS
}

function save(prefs: NotifPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(SYNC_EVENT))
}

export function useNotifPreference() {
  const [prefs, setPrefs] = useState<NotifPrefs>(read)

  useEffect(() => {
    const handler = () => setPrefs(read())
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [])

  const setScope = useCallback((scope: NotifScope) => {
    const next = { ...prefs, scope }
    save(next)
    setPrefs(next)
  }, [prefs])

  const toggleType = useCallback((scope: NotifScope, type: string, enabled: boolean) => {
    const next: NotifPrefs = {
      ...prefs,
      types: {
        ...prefs.types,
        [scope]: { ...prefs.types[scope], [type]: enabled },
      },
    }
    save(next)
    setPrefs(next)
  }, [prefs])

  const getEnabledTypes = useCallback((scope: NotifScope): string[] =>
    Object.entries(prefs.types[scope])
      .filter(([, v]) => v)
      .map(([k]) => k),
  [prefs])

  return { scope: prefs.scope, prefs, setScope, toggleType, getEnabledTypes }
}
