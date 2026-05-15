import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Dimensions, ActivityIndicator, Platform,
  Image as RNImage,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Svg, { Path } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { captureRef } from 'react-native-view-shot'

// ─── Types ───────────────────────────────────────────────────────────────────

interface StrokeData {
  path: string
  color: string
  width: number
}

export interface DrawingEditorProps {
  visible: boolean
  imageUrl: string
  filename: string
  onSave: (uri: string, annotatedFilename: string) => void | Promise<void>
  onCancel: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = [
  { value: '#0F172A', label: 'Black' },
  { value: '#EF4444', label: 'Red' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#22C55E', label: 'Green' },
  { value: '#F97316', label: 'Orange' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#EAB308', label: 'Yellow' },
]

const WIDTHS = [
  { value: 2, label: 'Thin' },
  { value: 4, label: 'Medium' },
  { value: 8, label: 'Thick' },
]

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

function buildAnnotatedFilename(original: string): string {
  const dot = original.lastIndexOf('.')
  const base = dot > 0 ? original.slice(0, dot) : original
  return `${base}_annotated.jpg`
}

/** Convert an array of {x,y} points to an SVG path string with smooth curves */
function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    d += ` L ${points[1].x} ${points[1].y}`
    return d
  }
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DrawingEditor({ visible, imageUrl, filename, onSave, onCancel }: DrawingEditorProps) {
  const insets = useSafeAreaInsets()
  const captureViewRef = useRef<View>(null)

  // Drawing state
  const [strokes, setStrokes] = useState<StrokeData[]>([])
  const [redoStack, setRedoStack] = useState<StrokeData[]>([])
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([])
  const [color, setColor] = useState(COLORS[1].value) // Red default
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1].value) // Medium default
  const [saving, setSaving] = useState(false)

  // Image sizing
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Zoom / pan state (visual transform only — does not affect capture)
  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const savedScale = useRef(1)
  const savedOffsetX = useRef(0)
  const savedOffsetY = useRef(0)

  // ── Image sizing ────────────────────────────────────────────────────────

  const applyDimensions = useCallback((natW: number, natH: number) => {
    const w = natW > 0 ? natW : 800
    const h = natH > 0 ? natH : 600
    setImageSize({ w, h })
    const toolbarH = 120
    const bottomH = 100
    const maxW = SCREEN_W - 24
    const maxH = SCREEN_H - insets.top - insets.bottom - toolbarH - bottomH - 40
    const ratio = w / h
    let fitW = maxW
    let fitH = fitW / ratio
    if (fitH > maxH) { fitH = maxH; fitW = fitH * ratio }
    setCanvasSize({ w: Math.round(fitW), h: Math.round(fitH) })
  }, [insets.top, insets.bottom])

  // Use platform-appropriate APIs to reliably get image dimensions.
  // RN Image.getSize works better than onLoad in native production builds;
  // browser Image API works better than onLoad events on Expo Web.
  useEffect(() => {
    if (canvasSize.w > 0) return
    if (Platform.OS === 'web') {
      const img = new window.Image()
      img.onload = () => applyDimensions(img.naturalWidth, img.naturalHeight)
      img.onerror = () => applyDimensions(800, 600)
      img.src = imageUrl
    } else {
      RNImage.getSize(
        imageUrl,
        (w: number, h: number) => applyDimensions(w, h),
        () => applyDimensions(800, 600),
      )
    }
  }, [imageUrl, canvasSize.w, applyDimensions])

  // ── Convert touch point from viewport space to canvas space ──────────────
  function toCanvasCoords(touchX: number, touchY: number) {
    return {
      x: (touchX - savedOffsetX.current) / savedScale.current,
      y: (touchY - savedOffsetY.current) / savedScale.current,
    }
  }

  // ── 1-finger Pan gesture for drawing ────────────────────────────────────

  const drawGesture = Gesture.Pan()
    .runOnJS(true)
    .minPointers(1)
    .maxPointers(1)
    .onBegin((e) => {
      const pt = toCanvasCoords(e.x, e.y)
      setCurrentPoints([pt])
      setRedoStack([])
    })
    .onUpdate((e) => {
      const pt = toCanvasCoords(e.x, e.y)
      setCurrentPoints(prev => [...prev, pt])
    })
    .onEnd(() => {
      setCurrentPoints(prev => {
        if (prev.length >= 2) {
          const path = pointsToSvgPath(prev)
          setStrokes(s => [...s, { path, color, width: strokeWidth }])
        }
        return []
      })
    })
    .onFinalize(() => {
      setCurrentPoints([])
    })

  // ── Pinch gesture for zooming ───────────────────────────────────────────

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      savedScale.current = scale
    })
    .onUpdate((e) => {
      const newScale = Math.min(Math.max(savedScale.current * e.scale, 0.5), 5)
      setScale(newScale)
    })

  // ── 2-finger Pan gesture for moving the canvas ──────────────────────────

  const moveGesture = Gesture.Pan()
    .runOnJS(true)
    .minPointers(2)
    .onStart(() => {
      savedOffsetX.current = offsetX
      savedOffsetY.current = offsetY
    })
    .onUpdate((e) => {
      setOffsetX(savedOffsetX.current + e.translationX)
      setOffsetY(savedOffsetY.current + e.translationY)
    })
    .onEnd(() => {
      savedOffsetX.current = offsetX
      savedOffsetY.current = offsetY
    })

  // ── Double tap to reset zoom ────────────────────────────────────────────

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      setScale(1)
      setOffsetX(0)
      setOffsetY(0)
      savedScale.current = 1
      savedOffsetX.current = 0
      savedOffsetY.current = 0
    })

  // Compose: 2-finger zoom+pan run simultaneously, then race with 1-finger draw
  // DoubleTap is exclusive (wins over draw on quick double-tap)
  const zoomPanGesture = Gesture.Simultaneous(pinchGesture, moveGesture)
  const composedGesture = Gesture.Simultaneous(drawGesture, zoomPanGesture, doubleTap)

  // ── Actions ─────────────────────────────────────────────────────────────

  function handleUndo() {
    setStrokes(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack(r => [...r, last])
      return prev.slice(0, -1)
    })
  }

  function handleRedo() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setStrokes(s => [...s, last])
      return prev.slice(0, -1)
    })
  }

  function handleClear() {
    setRedoStack([...redoStack, ...strokes])
    setStrokes([])
  }

  function resetZoom() {
    setScale(1)
    setOffsetX(0)
    setOffsetY(0)
    savedScale.current = 1
    savedOffsetX.current = 0
    savedOffsetY.current = 0
  }

  async function handleSave() {
    if (strokes.length === 0 || !captureViewRef.current) return
    setSaving(true)
    try {
      if (Platform.OS === 'web') {
        // Web fallback: use canvas API
        const uri = await exportViaCanvas()
        await onSave(uri, buildAnnotatedFilename(filename))
      } else {
        // Native: use react-native-view-shot
        const uri = await captureRef(captureViewRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        })
        await onSave(uri, buildAnnotatedFilename(filename))
      }
    } catch (err) {
      console.error('Failed to save annotated image:', err)
    } finally {
      setSaving(false)
    }
  }

  /** Web fallback: draw image + SVG strokes onto an HTML5 canvas */
  async function exportViaCanvas(): Promise<string> {
    const natW = imageSize?.w ?? 800
    const natH = imageSize?.h ?? 600
    const canvas = document.createElement('canvas')
    canvas.width = natW
    canvas.height = natH
    const ctx = canvas.getContext('2d')!

    // Draw original image
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load'))
      img.src = imageUrl
    })
    ctx.drawImage(img, 0, 0, natW, natH)

    // Replay strokes at native resolution
    const scaleX = natW / canvasSize.w
    const scaleY = natH / canvasSize.h
    for (const s of strokes) {
      // Parse SVG path back to points (re-derive from the path data)
      ctx.save()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width * scaleX
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Create a Path2D from the scaled SVG path
      const scaledPath = scaleSvgPath(s.path, scaleX, scaleY)
      const path2d = new Path2D(scaledPath)
      ctx.stroke(path2d)
      ctx.restore()
    }

    return canvas.toDataURL('image/png')
  }

  const currentPath = currentPoints.length >= 2 ? pointsToSvgPath(currentPoints) : null

  function handleReset() {
    setStrokes([])
    setRedoStack([])
    setCurrentPoints([])
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[S.root, { paddingTop: insets.top }]}>
          {/* ── Top toolbar ──────────────────────────────────────────── */}
          <View style={S.topBar}>
            <TouchableOpacity onPress={onCancel} style={S.cancelBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#64748B" />
              <Text style={S.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {scale !== 1 && (
              <TouchableOpacity
                onPress={resetZoom}
                style={[S.iconBtn, { flexDirection: 'row', width: 'auto' as any, paddingHorizontal: 8, gap: 4 }]}
                hitSlop={6}
                activeOpacity={0.6}
              >
                <Ionicons name="expand-outline" size={14} color="#6366F1" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6366F1' }}>Reset</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleUndo}
              disabled={strokes.length === 0}
              style={[S.iconBtn, strokes.length === 0 && { opacity: 0.35 }]}
              hitSlop={8}
              activeOpacity={0.6}
            >
              <Ionicons name="arrow-undo" size={18} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRedo}
              disabled={redoStack.length === 0}
              style={[S.iconBtn, redoStack.length === 0 && { opacity: 0.35 }]}
              hitSlop={8}
              activeOpacity={0.6}
            >
              <Ionicons name="arrow-redo" size={18} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClear}
              disabled={strokes.length === 0}
              style={[S.iconBtn, strokes.length === 0 && { opacity: 0.35 }]}
              hitSlop={8}
              activeOpacity={0.6}
            >
              <Ionicons name="trash-outline" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* ── Drawing area ─────────────────────────────────────────── */}
          <View style={S.canvasContainer}>
            {canvasSize.w > 0 ? (
              <GestureDetector gesture={composedGesture}>
                <View style={{ width: canvasSize.w, height: canvasSize.h, overflow: 'visible' }}>
                  <View
                    style={{
                      width: canvasSize.w,
                      height: canvasSize.h,
                      transform: [
                        { translateX: offsetX },
                        { translateY: offsetY },
                        { scale },
                      ],
                    }}
                  >
                    <View
                      ref={captureViewRef}
                      collapsable={false}
                      style={{
                        width: canvasSize.w,
                        height: canvasSize.h,
                        position: 'relative',
                      }}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={{ width: canvasSize.w, height: canvasSize.h, position: 'absolute' }}
                        contentFit="contain"
                      />
                      <Svg
                        width={canvasSize.w}
                        height={canvasSize.h}
                        style={{ position: 'absolute' }}
                      >
                        {strokes.map((s, i) => (
                          <Path
                            key={i}
                            d={s.path}
                            stroke={s.color}
                            strokeWidth={s.width}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                        {currentPath && (
                          <Path
                            d={currentPath}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </Svg>
                    </View>
                  </View>
                </View>
              </GestureDetector>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#6366F1" />
              </View>
            )}
          </View>

          {/* ── Bottom toolbar ────────────────────────────────────────── */}
          <View style={[S.bottomBar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
            {/* Color row */}
            <View style={S.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setColor(c.value)}
                  style={[
                    S.colorDot,
                    { backgroundColor: c.value },
                    c.value === '#FFFFFF' && { borderWidth: 1.5, borderColor: '#CBD5E1' },
                    color === c.value && {
                      borderWidth: 2.5,
                      borderColor: '#6366F1',
                      shadowColor: '#6366F1',
                      shadowOpacity: 0.3,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 4,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Width + Save row */}
            <View style={S.widthSaveRow}>
              <View style={S.widthRow}>
                {WIDTHS.map(w => (
                  <TouchableOpacity
                    key={w.value}
                    onPress={() => setStrokeWidth(w.value)}
                    style={[
                      S.widthBtn,
                      strokeWidth === w.value && { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
                    ]}
                  >
                    <View style={{
                      width: Math.max(w.value * 2.5, 6),
                      height: Math.max(w.value * 2.5, 6),
                      borderRadius: 50,
                      backgroundColor: color,
                    }} />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || strokes.length === 0}
                style={[S.saveBtn, (saving || strokes.length === 0) && { opacity: 0.5 }]}
                activeOpacity={0.65}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="save" size={18} color="#FFFFFF" />
                )}
                <Text style={S.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

// ─── SVG path scaling helper ─────────────────────────────────────────────────

function scaleSvgPath(d: string, sx: number, sy: number): string {
  return d.replace(/([0-9]*\.?[0-9]+)/g, (match, _num, offset) => {
    const num = parseFloat(match)
    // Determine if this is an x or y coordinate by counting preceding numbers
    const preceding = d.slice(0, offset)
    const numCount = (preceding.match(/[0-9]*\.?[0-9]+/g) ?? []).length
    // M, L, Q commands: alternating x,y pairs; first=x
    return String(numCount % 2 === 0 ? num * sx : num * sy)
  })
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelText: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  widthSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  widthRow: {
    flexDirection: 'row',
    gap: 6,
  },
  widthBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#6366F1',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
})
