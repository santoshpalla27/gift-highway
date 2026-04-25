import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type NotifScope = 'my_orders' | 'all_orders'
export type TypePrefs = Record<string, boolean>

export interface NotifPrefs {
  scope: NotifScope
  types: Record<NotifScope, TypePrefs>
}

const STORAGE_KEY = 'gh-notif-prefs'

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

function mergePrefs(parsed: Partial<NotifPrefs>): NotifPrefs {
  return {
    scope: parsed.scope ?? DEFAULT_PREFS.scope,
    types: {
      my_orders:  { ...DEFAULT_TYPE_PREFS, ...parsed.types?.my_orders },
      all_orders: { ...DEFAULT_TYPE_PREFS, ...parsed.types?.all_orders },
    },
  }
}

export function useNotifPreference() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setPrefs(mergePrefs(JSON.parse(raw) as Partial<NotifPrefs>)) } catch { /* ignore */ }
      }
    })
  }, [])

  const save = useCallback(async (next: NotifPrefs) => {
    setPrefs(next)
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  const setScope = useCallback((scope: NotifScope) => {
    save({ ...prefs, scope })
  }, [prefs, save])

  const toggleType = useCallback((scope: NotifScope, type: string, enabled: boolean) => {
    save({
      ...prefs,
      types: { ...prefs.types, [scope]: { ...prefs.types[scope], [type]: enabled } },
    })
  }, [prefs, save])

  const getEnabledTypes = useCallback((scope: NotifScope): string[] =>
    Object.entries(prefs.types[scope]).filter(([, v]) => v).map(([k]) => k),
  [prefs])

  return { scope: prefs.scope, prefs, setScope, toggleType, getEnabledTypes }
}
