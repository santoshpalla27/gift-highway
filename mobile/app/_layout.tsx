import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { View, ActivityIndicator } from 'react-native'
import { SocketProvider } from '../providers/SocketProvider'
import { ShareIntentProvider, useShareIntent } from 'expo-share-intent'

function AppNavigator() {
  const { loadAuth, isAuthenticated } = useAuthStore()
  const { hasShareIntent } = useShareIntent()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadAuth().finally(() => setReady(true))
  }, [loadAuth])

  useEffect(() => {
    if (!ready) return
    if (hasShareIntent) {
      // Files shared into the app — go straight to share picker.
      router.replace('/share' as any)
      return
    }
    if (isAuthenticated) {
      router.replace('/(app)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [ready, isAuthenticated, hasShareIntent])

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
      <Stack.Screen
        name="share"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <SocketProvider>
        <AppNavigator />
      </SocketProvider>
    </ShareIntentProvider>
  )
}
