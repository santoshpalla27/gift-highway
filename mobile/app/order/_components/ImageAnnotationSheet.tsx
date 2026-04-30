import { useRef, useState, useEffect } from 'react'
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  PanResponder, Dimensions, ActivityIndicator, Alert, Platform, Image,
} from 'react-native'
import Svg, { Path, Ellipse, Rect as SvgRect } from 'react-native-svg'
import * as FileSystem from 'expo-file-system/legacy'
import { captureRef } from 'react-native-view-shot'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { attachmentService } from '../../../services/attachmentService'
import { staffPortalApi } from '../../../services/portalService'
import { apiClient } from '../../../services/apiClient'

type Tool = 'pen' | 'arrow' | 'circle' | 'rect'
interface Point { x: number; y: number }
interface Stroke { tool: Tool; color: string; points: Point[] }

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'pen', label: 'Pen' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'circle', label: 'Circle' },
  { id: 'rect', label: 'Rect' },
]
const COLORS = ['#EF4444', '#F97316', '#22C55E', '#3B82F6', '#8B5CF6', '#000000', '#FFFFFF']
const STROKE_W = 3

const { width: SW, height: SH } = Dimensions.get('window')
const CANVAS_W = SW
const CANVAS_H = SH * 0.62

interface Props {
  src: string
  filename: string
  orderId: string
  sourceAttachmentId?: string
  staffPortalOrderId?: string
  onSaved: () => void
  onCancel: () => void
}

export function ImageAnnotationSheet({ src, filename, orderId, sourceAttachmentId, staffPortalOrderId, onSaved, onCancel }: Props) {
  const insets = useSafeAreaInsets()
  // base64 data URI embedded inline — SvgImage renders it synchronously with no async layer issues
  const [imgDataUri, setImgDataUri] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#EF4444')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [saving, setSaving] = useState(false)
  const viewRef = useRef<View>(null)
  const tempPathRef = useRef<string | null>(null)
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  toolRef.current = tool
  colorRef.current = color

  useEffect(() => {
    if (Platform.OS === 'web') {
      // On web, fetch as data URI to avoid R2 CORS restrictions when drawing on canvas.
      // Portal attachments: use the staff proxy endpoint (auth'd, no CORS issues).
      // Regular attachments: fetch the presigned URL directly (works if R2 CORS allows it).
      const load = staffPortalOrderId && sourceAttachmentId
        ? apiClient.get(`/orders/${staffPortalOrderId}/portal/attachments/${sourceAttachmentId}/proxy-image`, { responseType: 'blob' })
            .then(r => r.data as Blob)
        : fetch(src).then(r => r.blob())
      load
        .then(blob => new Promise<string>((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result as string)
          reader.onerror = rej
          reader.readAsDataURL(blob)
        }))
        .then(setImgDataUri)
        .catch(() => setImgDataUri(src))
      return
    }
    const ext = src.split('?')[0].split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    const localPath = `${FileSystem.cacheDirectory}annot_src_${Date.now()}.${ext}`
    tempPathRef.current = localPath
    FileSystem.downloadAsync(src, localPath)
      .then(({ uri }) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }))
      .then(b64 => setImgDataUri(`data:${mime};base64,${b64}`))
      .catch(() => {
        // Fallback: use remote URL directly (toDataURL may not capture it, but at least the UI works)
        setImgDataUri(src)
      })
    return () => {
      if (tempPathRef.current) {
        FileSystem.deleteAsync(tempPathRef.current, { idempotent: true }).catch(() => {})
      }
    }
  }, [src])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent
        setCurrent({ tool: toolRef.current, color: colorRef.current, points: [{ x, y }] })
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent
        setCurrent(prev => {
          if (!prev) return prev
          if (prev.tool === 'pen') return { ...prev, points: [...prev.points, { x, y }] }
          return { ...prev, points: [prev.points[0], { x, y }] }
        })
      },
      onPanResponderRelease: () => {
        setCurrent(prev => {
          if (prev && prev.points.length > 0) setStrokes(s => [...s, prev])
          return null
        })
      },
    })
  ).current

  const handleSave = async () => {
    if (strokes.length === 0 || saving) return
    setSaving(true)
    try {
      const isJpeg = /\.(jpe?g)$/i.test(filename)
      const outMime = isJpeg ? 'image/jpeg' : 'image/png'
      const outExt  = isJpeg ? 'jpg' : 'png'
      const baseName = filename.replace(/\.[^.]+$/, '')
      const annotatedName = `annotated_${baseName}.${outExt}`

      if (Platform.OS === 'web') {
        // Load image element to get natural dimensions (imgDataUri is a data URI — no CORS issue)
        const img = document.createElement('img')
        await new Promise<void>(res => {
          img.onload = () => res()
          img.onerror = () => res()
          img.src = imgDataUri!
          if (img.complete) res()
        })

        const nw = img.naturalWidth || CANVAS_W
        const nh = img.naturalHeight || CANVAS_H

        // Contain-mode layout: how the image fits inside CANVAS_W × CANVAS_H
        const scale = Math.min(CANVAS_W / nw, CANVAS_H / nh)
        const dispW = nw * scale
        const dispH = nh * scale
        const offsetX = (CANVAS_W - dispW) / 2
        const offsetY = (CANVAS_H - dispH) / 2
        // inv transforms a View-space coord to natural-image-space coord
        const inv = 1 / scale
        const tp = (p: Point) => ({ x: (p.x - offsetX) * inv, y: (p.y - offsetY) * inv })

        // Export at natural image resolution — no stretching, no letterbox bars
        const canvas = document.createElement('canvas')
        canvas.width = nw
        canvas.height = nh
        const ctx = canvas.getContext('2d')!

        if (img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, nw, nh)
        } else {
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, nw, nh)
        }

        // Re-draw strokes with coordinate transform: View space → natural image space
        const sw = STROKE_W * inv
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const s of strokes) {
          const pts = s.points.map(tp)
          if (pts.length < 2) continue
          ctx.strokeStyle = s.color
          ctx.lineWidth = sw
          if (s.tool === 'pen') {
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
            ctx.stroke()
          } else if (s.tool === 'arrow') {
            const [a, b] = [pts[0], pts[pts.length - 1]]
            const angle = Math.atan2(b.y - a.y, b.x - a.x)
            const head = Math.max(14, STROKE_W * 4) * inv
            ctx.beginPath()
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
            ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6))
            ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6))
            ctx.stroke()
          } else if (s.tool === 'circle') {
            const [a, b] = [pts[0], pts[pts.length - 1]]
            const rx = Math.max(Math.abs(b.x - a.x) / 2, 1)
            const ry = Math.max(Math.abs(b.y - a.y) / 2, 1)
            ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke()
          } else if (s.tool === 'rect') {
            const [a, b] = [pts[0], pts[pts.length - 1]]
            ctx.beginPath(); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
          }
        }

        const blob = await new Promise<Blob>((res, rej) =>
          canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), outMime)
        )
        const sizeBytes = blob.size
        if (staffPortalOrderId) {
          const presign = await staffPortalApi.getAttachmentUploadURL(staffPortalOrderId, annotatedName)
          const uploadRes = await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': presign.content_type }, body: blob })
          if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
          await staffPortalApi.confirmAttachment(staffPortalOrderId, {
            s3_key: presign.s3_key, file_name: annotatedName,
            file_type: '.' + outExt, file_size: sizeBytes,
          })
        } else {
          const presign = await attachmentService.getUploadURL(orderId, annotatedName, outMime, sizeBytes)
          const uploadRes = await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': outMime }, body: blob })
          if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
          await attachmentService.confirmUpload(orderId, {
            file_name: annotatedName, file_key: presign.file_key, file_url: presign.file_url,
            mime_type: outMime, size_bytes: sizeBytes, is_annotation: true, source_attachment_id: sourceAttachmentId,
          })
        }
        onSaved()
        return
      }

      // Native (iOS / Android): screenshot the rendered view
      const outFmt: 'png' | 'jpg' = isJpeg ? 'jpg' : 'png'
      const tmpUri = await captureRef(viewRef, { format: outFmt, quality: 1 })
      const info = await FileSystem.getInfoAsync(tmpUri)
      const sizeBytes = (info.exists && info.size) ? info.size : 1

      if (staffPortalOrderId) {
        // Staff portal chat: save as portal attachment so it appears in the chat thread
        // Backend StaffConfirmAttachment auto-creates the [attachment:id:name] chat message
        const presign = await staffPortalApi.getAttachmentUploadURL(staffPortalOrderId, annotatedName)
        await attachmentService.uploadToR2(presign.upload_url, tmpUri, presign.content_type, () => {})
        await staffPortalApi.confirmAttachment(staffPortalOrderId, {
          s3_key: presign.s3_key, file_name: annotatedName,
          file_type: '.' + outExt, file_size: sizeBytes,
        })
      } else {
        const presign = await attachmentService.getUploadURL(orderId, annotatedName, outMime, sizeBytes)
        await attachmentService.uploadToR2(presign.upload_url, tmpUri, outMime, () => {})
        await attachmentService.confirmUpload(orderId, {
          file_name: annotatedName, file_key: presign.file_key, file_url: presign.file_url,
          mime_type: outMime, size_bytes: sizeBytes, is_annotation: true, source_attachment_id: sourceAttachmentId,
        })
      }
      FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {})
      onSaved()
    } catch {
      Alert.alert('Error', 'Failed to save annotation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const renderStroke = (s: Stroke, key: number) => {
    const { points: pts, color: sc } = s
    if (pts.length === 0) return null
    const sp = { stroke: sc, strokeWidth: STROKE_W, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

    if (s.tool === 'pen') {
      if (pts.length < 2) return null
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      return <Path key={key} d={d} {...sp} />
    }
    if (s.tool === 'arrow') {
      if (pts.length < 2) return null
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(14, STROKE_W * 4)
      const ax1 = b.x - head * Math.cos(angle - Math.PI / 6)
      const ay1 = b.y - head * Math.sin(angle - Math.PI / 6)
      const ax2 = b.x - head * Math.cos(angle + Math.PI / 6)
      const ay2 = b.y - head * Math.sin(angle + Math.PI / 6)
      const d = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} M ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${ax1.toFixed(1)} ${ay1.toFixed(1)} M ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${ax2.toFixed(1)} ${ay2.toFixed(1)}`
      return <Path key={key} d={d} {...sp} />
    }
    if (s.tool === 'circle') {
      if (pts.length < 2) return null
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const rx = Math.max(Math.abs(b.x - a.x) / 2, 1)
      const ry = Math.max(Math.abs(b.y - a.y) / 2, 1)
      return <Ellipse key={key} cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} rx={rx} ry={ry} {...sp} />
    }
    if (s.tool === 'rect') {
      if (pts.length < 2) return null
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const w = Math.max(Math.abs(b.x - a.x), 1)
      const h = Math.max(Math.abs(b.y - a.y), 1)
      return <SvgRect key={key} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={w} height={h} {...sp} />
    }
    return null
  }

  const allStrokes = current ? [...strokes, current] : strokes

  if (!imgDataUri) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading image…</Text>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Header */}
        <View style={[A.header, { paddingTop: insets.top + 10 }]}>
          <Text style={A.headerTitle} numberOfLines={1}>Annotating: {filename}</Text>
          <Text style={A.headerHint}>Draw, then Save</Text>
        </View>

        {/* Drawing area */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {/* collapsable={false} ensures Android doesn't elide this layer for captureRef */}
          <View ref={viewRef} collapsable={false} style={{ width: CANVAS_W, height: CANVAS_H, backgroundColor: '#000' }}>
            {/* RN Image as background — captureRef captures it reliably unlike SvgImage */}
            <Image
              source={{ uri: imgDataUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="contain"
            />
            {/* SVG overlay for strokes only; pan handlers here so coords stay in canvas space */}
            <View style={StyleSheet.absoluteFillObject} {...panResponder.panHandlers}>
              <Svg width={CANVAS_W} height={CANVAS_H}>
                {allStrokes.map((s, i) => renderStroke(s, i))}
              </Svg>
            </View>
          </View>
        </View>

        {/* Toolbar */}
        <View style={[A.toolbar, { paddingBottom: Math.max(insets.bottom + 8, 16) }]}>
          <View style={A.row}>
            {TOOLS.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setTool(t.id)} style={[A.toolBtn, tool === t.id && A.toolBtnActive]}>
                <Text style={[A.toolLabel, tool === t.id && { color: '#fff' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={A.sep} />
          <View style={A.row}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[A.dot, { backgroundColor: c }, color === c && { borderColor: '#fff' }, c === '#FFFFFF' && { borderColor: 'rgba(255,255,255,0.35)' }]}
              />
            ))}
          </View>
          <View style={A.sep} />
          <View style={[A.row, { justifyContent: 'space-between' }]}>
            <View style={A.row}>
              <TouchableOpacity onPress={() => setStrokes(s => s.slice(0, -1))} disabled={strokes.length === 0} style={[A.altBtn, strokes.length === 0 && { opacity: 0.3 }]}>
                <Text style={A.altText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStrokes([])} disabled={strokes.length === 0} style={[A.altBtn, strokes.length === 0 && { opacity: 0.3 }]}>
                <Text style={A.altText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <View style={A.row}>
              <TouchableOpacity onPress={onCancel} style={A.cancelBtn}>
                <Text style={A.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving || strokes.length === 0} style={[A.saveBtn, (saving || strokes.length === 0) && { opacity: 0.4 }]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={A.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const A = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  headerTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  headerHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  toolbar: {
    flexShrink: 0,
    backgroundColor: 'rgba(10,10,10,0.97)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12, paddingTop: 10, gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  toolBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  toolBtnActive: { backgroundColor: '#6366F1' },
  toolLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  altBtn: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  altText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  cancelBtn: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  cancelText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  saveBtn: {
    paddingVertical: 7, paddingHorizontal: 18, borderRadius: 6,
    backgroundColor: '#6366F1', minWidth: 70, alignItems: 'center',
  },
  saveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
})
