import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'
const HEALTH_URL = API_BASE.replace(/\/api\/v1\/?$/, '') + '/health'

async function checkOnline(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(HEALTH_URL, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = async () => {
    const online = await checkOnline()
    setIsOnline(online)
  }

  useEffect(() => {
    refresh()

    timerRef.current = setInterval(refresh, 10_000)

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh()
    })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      sub.remove()
    }
  }, [])

  return { isOnline }
}
