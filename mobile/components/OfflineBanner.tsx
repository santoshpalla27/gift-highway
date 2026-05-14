import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { COLORS } from '../constants/theme'

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
      <View style={[styles.dot, { backgroundColor: isOffline ? COLORS.offlineDot : COLORS.onlineDot }]} />
      <Text style={[styles.text, { color: isOffline ? COLORS.offlineText : COLORS.onlineText }]}>
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
  offline: {
    backgroundColor: COLORS.offlineBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.offlineBorder,
  },
  online: {
    backgroundColor: COLORS.onlineBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.onlineBorder,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    // backgroundColor applied inline from theme — was missing in original
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
  },
})
