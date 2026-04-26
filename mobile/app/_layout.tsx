import { Stack, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { View, ActivityIndicator, Platform } from 'react-native'
import { SocketProvider } from '../providers/SocketProvider'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'

function AppNavigator() {
  const { loadAuth, isAuthenticated } = useAuthStore()
  const { hasShareIntent, isReady: shareIntentReady } = useShareIntentContext()
  // expo-share-intent's native module is unavailable on web — the provider's
  // setIsReady() is never called, so isReady stays false forever.
  // Treat web as always ready so the spinner doesn't block indefinitely.
  const shareReady = shareIntentReady || Platform.OS === 'web'
  const [authReady, setAuthReady] = useState(false)
  // useState (not useRef) so effects that depend on it re-run after it flips true.
  const [routed, setRouted] = useState(false)

  useEffect(() => {
    loadAuth().finally(() => setAuthReady(true))
  }, [loadAuth])

  // Step 1 — navigate to the base screen once auth + share-intent initial check are done.
  // Does NOT check hasShareIntent: the share routing in Step 2 handles that separately.
  useEffect(() => {
    if (!authReady || !shareReady || routed) return
    setRouted(true)
    if (isAuthenticated) {
      router.replace('/(app)')
    } else {
      router.replace('/(auth)/login')
    }
  }, [authReady, shareReady, isAuthenticated, routed])

  // Step 2 — push the share modal on top of the base screen whenever an intent arrives.
  // Using push (not replace) so the modal has a base screen to present over.
  // Fires both on cold start (after Step 1 sets routed=true) and background resume.
  useEffect(() => {
    if (!hasShareIntent || !routed || !authReady) return
    router.push('/share' as any)
  }, [hasShareIntent, routed, authReady])

  // Step 3 — forced logout when the token expires while the app is running.
  useEffect(() => {
    if (!routed || !authReady || isAuthenticated) return
    router.replace('/(auth)/login')
  }, [isAuthenticated, authReady, routed])

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
