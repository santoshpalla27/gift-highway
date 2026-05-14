import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

// Shared animation value so all bars shimmer in sync
function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return anim
}

function Bar({ anim, width, height = 12, style }: {
  anim: Animated.Value
  width: number | string
  height?: number
  style?: object
}) {
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] })
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

// Mirrors the actual OrderCard structure:
//  Row 1: order-num (left) + status badge (right)
//  Row 2: customer name
//  Row 3 (divider + bottom): assignee (left) + due date (right)
function SkeletonCard({ anim }: { anim: Animated.Value }) {
  return (
    <View style={styles.card}>
      {/* Row 1 */}
      <View style={styles.rowTop}>
        <Bar anim={anim} width={80} height={13} style={{ borderRadius: 4 }} />
        <Bar anim={anim} width={72} height={22} style={{ borderRadius: 10 }} />
      </View>
      {/* Row 2 */}
      <Bar anim={anim} width="60%" height={13} style={{ borderRadius: 4, marginTop: 2 }} />
      {/* Row 3 */}
      <View style={styles.rowBottom}>
        <Bar anim={anim} width={90} height={11} style={{ borderRadius: 4 }} />
        <Bar anim={anim} width={64} height={11} style={{ borderRadius: 4 }} />
      </View>
    </View>
  )
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  const anim = useShimmer()
  return (
    <View style={styles.wrapper}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} anim={anim} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { padding: 12, paddingBottom: 40, gap: 10 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  bar: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
})
