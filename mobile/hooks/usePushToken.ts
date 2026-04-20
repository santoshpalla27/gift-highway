import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { useAuthStore } from '../store/authStore'
import { apiClient } from '../services/apiClient'

// When the app is in foreground, suppress the system alert (WS toasts handle it).
// Sound still plays so the user knows something arrived.
// expo-notifications APIs are not available on web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

async function registerDeviceToken(token: string) {
  try {
    await apiClient.post('/push/register', {
      token,
      platform: Platform.OS,
    })
  } catch {
    // Non-fatal — push won't work but app continues
  }
}

async function unregisterDeviceToken(token: string) {
  try {
    await apiClient.delete('/push/unregister', { data: { token } })
  } catch {}
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null // Expo push doesn't work in simulator

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    })
  }

  const tokenData = await Notifications.getExpoPushTokenAsync()
  return tokenData.data
}

export function usePushToken() {
  const token = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const pushTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token || !user) {
      if (pushTokenRef.current) {
        unregisterDeviceToken(pushTokenRef.current)
        pushTokenRef.current = null
      }
      return
    }

    getExpoPushToken().then((pushToken) => {
      if (!pushToken) return
      pushTokenRef.current = pushToken
      registerDeviceToken(pushToken)
    })
  }, [token, user?.id])
}
