import { View, Text, StyleSheet, Modal, StatusBar, Dimensions, Linking, TouchableOpacity } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

const { width: SW, height: SH } = Dimensions.get('window')

function formatSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface Props {
  uri: string
  filename: string
  fileSizeBytes?: number
  onClose: () => void
  onReply?: () => void
  onDelete?: () => void
  onDownload?: () => void
  onAnnotate?: () => void
}

export function ImageViewerModal({ uri, filename, fileSizeBytes, onClose, onReply, onDelete, onDownload, onAnnotate }: Props) {
  const insets = useSafeAreaInsets()

  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedX = useSharedValue(0)
  const savedY = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(0.5, Math.min(6, savedScale.value * e.scale))
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = 1
        savedX.value = 0
        savedY.value = 0
      } else {
        savedScale.value = scale.value
      }
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = 1
        savedX.value = 0
        savedY.value = 0
      } else {
        scale.value = withSpring(2.5)
        savedScale.value = 2.5
      }
    })

  const pan = Gesture.Pan()
    .onUpdate(e => {
      if (savedScale.value <= 1) {
        translateY.value = Math.max(0, e.translationY)
      } else {
        translateX.value = savedX.value + e.translationX
        translateY.value = savedY.value + e.translationY
      }
    })
    .onEnd(e => {
      if (savedScale.value <= 1 && e.translationY > 100) {
        runOnJS(onClose)()
      } else if (savedScale.value <= 1) {
        translateY.value = withSpring(0)
      } else {
        savedX.value = translateX.value
        savedY.value = translateY.value
      }
    })

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan))

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  const sizeLabel = formatSize(fileSizeBytes)

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

        {/* Header */}
        <View style={[V.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={V.headerTitle} numberOfLines={1}>{filename}</Text>
          <View style={V.actions}>
            {onReply && (
              <TouchableOpacity
                onPress={() => { onClose(); onReply() }}
                style={V.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Ionicons name="return-up-back-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                onPress={() => { onClose(); onDelete() }}
                style={V.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Ionicons name="trash-outline" size={20} color="#FCA5A5" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { if (onDownload) { onDownload() } else { Linking.openURL(uri) } }}
              style={V.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Ionicons name="download-outline" size={20} color="#fff" />
            </TouchableOpacity>
            {onAnnotate && (
              <TouchableOpacity
                onPress={() => { onClose(); onAnnotate() }}
                style={V.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Ionicons name="pencil-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Zoomable image */}
        <GestureDetector gesture={composed}>
          <Animated.View style={[V.imgWrap, animStyle]}>
            <Animated.Image source={{ uri }} style={V.img} resizeMode="contain" />
          </Animated.View>
        </GestureDetector>

        {/* Footer info */}
        <View style={[V.footer, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <Text style={V.footerText} numberOfLines={1}>
            {filename}{sizeLabel ? ` · ${sizeLabel}` : ''}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const V = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 10,
  },
  headerTitle: {
    flex: 1, fontSize: 14, fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  actionBtn: {
    padding: 7, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  imgWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  img: {
    width: SW,
    height: SH * 0.78,
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12, color: 'rgba(255,255,255,0.65)',
  },
})
