import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'

type BannerState = 'offline' | 'back-online' | 'hidden'

interface Props {
  isOnline: boolean
}

export function OfflineBanner({ isOnline }: Props) {
  const [state, setState] = useState<BannerState>('hidden')
  const prevOnline = useRef(isOnline)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const wasOnline = prevOnline.current
    prevOnline.current = isOnline

    if (!isOnline) {
      setState('offline')
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start()
    } else if (!wasOnline && isOnline) {
      setState('back-online')
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setState('hidden'))
    }
  }, [isOnline])

  if (state === 'hidden') return null

  const isOffline = state === 'offline'

  return (
    <Animated.View style={[styles.banner, isOffline ? styles.offline : styles.online, { opacity }]}>
      <View style={styles.dot} />
      <Text style={[styles.text, { color: isOffline ? '#92400E' : '#065F46' }]}>
        {isOffline ? "You're offline · Changes may not sync" : 'Back online · Sync restored'}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  offline: { backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#FCD34D' },
  online:  { backgroundColor: '#D1FAE5', borderBottomWidth: 1, borderBottomColor: '#6EE7B7' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
  },
})
