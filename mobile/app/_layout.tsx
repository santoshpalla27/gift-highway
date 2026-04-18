import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { View, ActivityIndicator } from 'react-native'

export default function RootLayout() {
  const { loadAuth, isAuthenticated } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadAuth().finally(() => {
      setReady(true)
    })
  }, [loadAuth])

  useEffect(() => {
    if (ready) {
      if (isAuthenticated) {
        router.replace('/(app)')
      } else {
        router.replace('/(auth)/login')
      }
    }
  }, [ready, isAuthenticated])

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="order/[id]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  )
}
