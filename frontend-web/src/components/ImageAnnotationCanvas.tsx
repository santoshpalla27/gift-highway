import { useState, useRef, useEffect, useCallback } from 'react'
import { attachmentService } from '../services/attachmentService'
import { apiClient } from '../services/apiClient'
import { publicPortalApi, staffPortalApi } from '../services/portalService'

type Tool = 'pen' | 'arrow' | 'circle' | 'rect'

interface Point { x: number; y: number }
interface Stroke { tool: Tool; color: string; width: number; points: Point[] }

const TOOLS: [Tool, string][] = [['pen', 'Pen'], ['arrow', 'Arrow'], ['circle', 'Circle'], ['rect', 'Rect']]
const COLORS = ['#EF4444', '#F97316', '#22C55E', '#3B82F6', '#8B5CF6', '#000000', '#FFFFFF']
const STROKE_WIDTH = 3

interface Props {
  src: string
  filename: string
  orderId: string
  fileKey?: string
  sourceAttachmentId?: string
  portalToken?: string
  portalAttId?: number
  staffPortalOrderId?: string
  onSaved: () => void
  onCancel: () => void
}

export function ImageAnnotationCanvas({ src, filename, orderId, fileKey, sourceAttachmentId, portalToken, portalAttId, staffPortalOrderId, onSaved, onCancel }: Props) {
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#EF4444')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [current, setCurrent] = useState<Stroke | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const drawing = useRef(false)
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  toolRef.current = tool
  colorRef.current = color
  // Blob URL fetched via backend proxy — avoids R2 CORS restriction when drawing onto canvas
  const imgBlobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const cleanup = () => {
      if (imgBlobUrlRef.current) {
        URL.revokeObjectURL(imgBlobUrlRef.current)
        imgBlobUrlRef.current = null
      }
    }
    if (portalToken && portalAttId != null) {
      fetch(`/api/portal/${portalToken}/proxy-image?id=${portalAttId}`)
        .then(r => r.blob())
        .then(blob => { imgBlobUrlRef.current = URL.createObjectURL(blob) })
        .catch(() => {})
    } else if (fileKey) {
      apiClient.get(`/orders/${orderId}/attachments/proxy-image`, {
        params: { key: fileKey },
        responseType: 'blob',
      }).then((res) => {
        imgBlobUrlRef.current = URL.createObjectURL(res.data as Blob)
      }).catch(() => {})
    }
    return cleanup
  }, [fileKey, orderId, portalToken, portalAttId])

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setCanvasSize({ w: img.clientWidth, h: img.clientHeight })
  }, [])

  // Set canvas pixel dimensions when size is known
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvasSize) return
    canvas.width = canvasSize.w
    canvas.height = canvasSize.h
  }, [canvasSize])

  // Redraw strokes on every change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvasSize) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
    const all = current ? [...strokes, current] : strokes
    all.forEach(s => drawStroke(ctx, s))
  }, [strokes, current, canvasSize])

  const canvasPoint = (e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    drawing.current = true
    const pt = canvasPoint(e)
    setCurrent({ tool: toolRef.current, color: colorRef.current, width: STROKE_WIDTH, points: [pt] })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing.current) return
    const pt = canvasPoint(e)
    setCurrent(prev => {
      if (!prev) return prev
      if (prev.tool === 'pen') return { ...prev, points: [...prev.points, pt] }
      return { ...prev, points: [prev.points[0], pt] }
    })
  }

  const onMouseUp = () => {
    if (!drawing.current) return
    drawing.current = false
    setCurrent(prev => {
      if (prev && prev.points.length > 0) setStrokes(s => [...s, prev])
      return null
    })
  }

  const handleSave = async () => {
    if (strokes.length === 0 || saving) return
    setSaving(true)
    try {
      const img = imgRef.current!
      const nw = img.naturalWidth || img.clientWidth
      const nh = img.naturalHeight || img.clientHeight
      const dw = img.clientWidth
      const dh = img.clientHeight
      const sx = nw / dw
      const sy = nh / dh

      const off = document.createElement('canvas')
      off.width = nw
      off.height = nh
      const ctx = off.getContext('2d')!

      // Fetch via backend proxy if not already done (avoids R2 CORS restriction on canvas)
      let blobUrl = imgBlobUrlRef.current
      if (!blobUrl) {
        if (portalToken && portalAttId != null) {
          try {
            const r = await fetch(`/api/portal/${portalToken}/proxy-image?id=${portalAttId}`)
            blobUrl = URL.createObjectURL(await r.blob())
            imgBlobUrlRef.current = blobUrl
          } catch { /* fall through */ }
        } else if (fileKey) {
          try {
            const res = await apiClient.get(`/orders/${orderId}/attachments/proxy-image`, {
              params: { key: fileKey },
              responseType: 'blob',
            })
            blobUrl = URL.createObjectURL(res.data as Blob)
            imgBlobUrlRef.current = blobUrl
          } catch { /* fall through */ }
        }
      }

      if (blobUrl) {
        const proxyImg = new Image()
        await new Promise<void>((res, rej) => {
          proxyImg.onload = () => res()
          proxyImg.onerror = rej
          proxyImg.src = blobUrl!
        })
        ctx.drawImage(proxyImg, 0, 0, nw, nh)
      } else {
        // Last resort: try crossOrigin (works if R2 has CORS configured)
        try {
          const crossImg = new Image()
          crossImg.crossOrigin = 'anonymous'
          await new Promise<void>((res, rej) => {
            crossImg.onload = () => res()
            crossImg.onerror = () => rej()
            crossImg.src = src
          })
          ctx.drawImage(crossImg, 0, 0, nw, nh)
        } catch {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, nw, nh)
        }
      }

      strokes.forEach(s => drawStroke(ctx, s, sx, sy))

      const isJpeg = /\.(jpe?g)$/i.test(filename)
      const outMime = isJpeg ? 'image/jpeg' : 'image/png'
      const outExt  = isJpeg ? 'jpg' : 'png'
      const blob = await new Promise<Blob>((res, rej) =>
        off.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), outMime),
      )

      const baseName = filename.replace(/\.[^.]+$/, '')
      const annotatedName = `annotated_${baseName}.${outExt}`

      if (portalToken) {
        // Customer portal: upload to portal bucket, then send a message linking to it
        const presign = await publicPortalApi.getUploadURL(portalToken, annotatedName)
        await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': presign.content_type }, body: blob })
        const confirmed = await publicPortalApi.confirmAttachment(portalToken, {
          s3_key: presign.s3_key, file_name: annotatedName,
          file_type: '.' + outExt, file_size: blob.size,
        })
        await publicPortalApi.sendMessage(portalToken, `[attachment:${confirmed.id}:${annotatedName}]`)
      } else if (staffPortalOrderId) {
        // Staff portal chat: upload to portal bucket via staff API
        // Backend StaffConfirmAttachment auto-creates the portal chat message
        const presign = await staffPortalApi.getAttachmentUploadURL(staffPortalOrderId, annotatedName)
        await fetch(presign.upload_url, { method: 'PUT', headers: { 'Content-Type': presign.content_type }, body: blob })
        await staffPortalApi.confirmAttachment(staffPortalOrderId, {
          s3_key: presign.s3_key, file_name: annotatedName,
          file_type: '.' + outExt, file_size: blob.size,
        })
      } else {
        // Regular order timeline attachment
        const file = new File([blob], annotatedName, { type: outMime })
        const presign = await attachmentService.getUploadURL(orderId, annotatedName, outMime, blob.size)
        await attachmentService.uploadToR2(presign.upload_url, file, () => {})
        await attachmentService.confirmUpload(orderId, {
          file_name: annotatedName,
          file_key: presign.file_key,
          file_url: presign.file_url,
          mime_type: outMime,
          size_bytes: blob.size,
          is_annotation: true,
          source_attachment_id: sourceAttachmentId,
        })
      }
      onSaved()
    } catch {
      alert('Failed to save annotation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const BTN: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'background 0.1s',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: '#000', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      {/* Header */}
      <div style={{
        flexShrink: 0, background: 'rgba(0,0,0,0.8)', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Annotating: {filename}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Draw on the image, then Save</span>
      </div>

      {/* Drawing area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '12px 0' }}>
        <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
          <img
            ref={imgRef}
            src={src}
            alt={filename}
            onLoad={handleImgLoad}
            draggable={false}
            style={{
              display: 'block',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 180px)',
              objectFit: 'contain',
              userSelect: 'none',
            }}
          />
          {canvasSize && (
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                cursor: 'crosshair', touchAction: 'none',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
          )}
        </div>
      </div>

      {/* Bottom toolbar */}
      <div style={{
        flexShrink: 0, background: 'rgba(10,10,10,0.97)', borderTop: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TOOLS.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              style={{ ...BTN, background: tool === t ? '#6366F1' : 'rgba(255,255,255,0.1)', color: tool === t ? '#fff' : 'rgba(255,255,255,0.65)' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

        {/* Color swatches */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer', flexShrink: 0,
                border: color === c ? '2px solid #fff' : c === '#FFFFFF' ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent',
                boxShadow: color === c ? '0 0 0 1px rgba(0,0,0,0.4)' : 'none',
              }}
            />
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

        {/* Undo / Clear */}
        <button
          onClick={() => setStrokes(s => s.slice(0, -1))}
          disabled={strokes.length === 0}
          style={{ ...BTN, background: 'rgba(255,255,255,0.08)', color: strokes.length === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)' }}
        >
          Undo
        </button>
        <button
          onClick={() => setStrokes([])}
          disabled={strokes.length === 0}
          style={{ ...BTN, background: 'rgba(255,255,255,0.08)', color: strokes.length === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)' }}
        >
          Clear
        </button>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

        {/* Cancel / Save */}
        <button
          onClick={onCancel}
          style={{ ...BTN, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || strokes.length === 0}
          style={{
            ...BTN,
            background: saving || strokes.length === 0 ? 'rgba(99,102,241,0.35)' : '#6366F1',
            color: '#fff',
            minWidth: 70,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, sx = 1, sy = 1) {
  if (s.points.length === 0) return
  const pts = s.points.map(p => ({ x: p.x * sx, y: p.y * sy }))
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.width * Math.max(sx, sy)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (s.tool) {
    case 'pen': {
      if (pts.length < 2) { ctx.restore(); return }
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.stroke()
      break
    }
    case 'arrow': {
      if (pts.length < 2) { ctx.restore(); return }
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(14, s.width * 4) * Math.max(sx, sy)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
      break
    }
    case 'circle': {
      if (pts.length < 2) { ctx.restore(); return }
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const rx = Math.abs(b.x - a.x) / 2
      const ry = Math.abs(b.y - a.y) / 2
      if (rx < 1 && ry < 1) { ctx.restore(); return }
      ctx.beginPath()
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI)
      ctx.stroke()
      break
    }
    case 'rect': {
      if (pts.length < 2) { ctx.restore(); return }
      const [a, b] = [pts[0], pts[pts.length - 1]]
      const w = Math.abs(b.x - a.x)
      const h = Math.abs(b.y - a.y)
      if (w < 1 && h < 1) { ctx.restore(); return }
      ctx.beginPath()
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(w, 1), Math.max(h, 1))
      break
    }
  }
  ctx.restore()
}
