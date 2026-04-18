import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

function ShimmerBar({ width, height = 13, style }: { width: number | string; height?: number; style?: object }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] })

  return (
    <Animated.View
      style={[
        styles.bar,
        { width: width as number, height, opacity },
        style,
      ]}
    />
  )
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <ShimmerBar width={80} height={13} />
        <ShimmerBar width={72} height={22} style={{ borderRadius: 999 }} />
      </View>
      <ShimmerBar width="55%" height={13} style={{ marginTop: 10 }} />
      <View style={styles.bottom}>
        <ShimmerBar width={90} height={11} />
        <ShimmerBar width={70} height={11} />
      </View>
    </View>
  )
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.wrapper}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { padding: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  bar: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
})
