import { Stack, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { View, ActivityIndicator } from 'react-native'
import { SocketProvider } from '../providers/SocketProvider'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'

function AppNavigator() {
  const { loadAuth, isAuthenticated } = useAuthStore()
  // Read from the provider — does NOT trigger a second native getShareIntent call.
  const { hasShareIntent, isReady: shareReady } = useShareIntentContext()
  const [authReady, setAuthReady] = useState(false)
  // Guard so we only do the initial route once.
  const routed = useRef(false)

  useEffect(() => {
    loadAuth().finally(() => setAuthReady(true))
  }, [loadAuth])

  // Share intent takes priority — but the Stack must be rendered first (authReady + shareReady).
  useEffect(() => {
    if (!hasShareIntent || !authReady || !shareReady) return
    routed.current = true
    router.replace('/share' as any)
  }, [hasShareIntent, authReady, shareReady])

  // Initial auth routing — waits for share intent check to settle first.
  useEffect(() => {
    if (!authReady || !shareReady || hasShareIntent || routed.current) return
    routed.current = true
    if (isAuthenticated) {
      router.replace('/(app)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [authReady, shareReady, isAuthenticated, hasShareIntent])

  // Forced logout — fires when tokens expire while the app is already running.
  // routed.current blocks the initial effect above from re-running, so we need
  // this separate watch to redirect back to login.
  useEffect(() => {
    if (!routed.current || !authReady || isAuthenticated) return
    router.replace('/(auth)/login')
  }, [isAuthenticated, authReady])

  if (!authReady || !shareReady) {
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
