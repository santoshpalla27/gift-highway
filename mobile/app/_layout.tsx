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
  // Guard so we only route once.
  const routed = useRef(false)

  useEffect(() => {
    loadAuth().finally(() => setAuthReady(true))
  }, [loadAuth])

  // Share intent takes priority — route the moment it arrives, regardless of auth state.
  useEffect(() => {
    if (!hasShareIntent) return
    routed.current = true
    router.replace('/share' as any)
  }, [hasShareIntent])

  // Normal auth routing — waits for share intent check to settle first so we
  // don't route to the app in the brief window before the native onChange fires.
  useEffect(() => {
    if (!authReady || !shareReady || hasShareIntent || routed.current) return
    routed.current = true
    if (isAuthenticated) {
      router.replace('/(app)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [authReady, shareReady, isAuthenticated, hasShareIntent])

  // Wait for both auth AND share intent to resolve before rendering the Stack.
  // If we render the Stack while shareReady=false, the share routing effect fires
  // before we know there's an intent and gets lost (navigation has nowhere to go).
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
