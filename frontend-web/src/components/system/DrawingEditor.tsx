import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../store/authStore'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stroke {
  points: { x: number; y: number }[]
  color: string
  width: number
}

export interface DrawingEditorProps {
  src: string
  filename: string
  onSave: (blob: Blob, annotatedFilename: string) => void | Promise<void>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAnnotatedFilename(original: string): string {
  const dot = original.lastIndexOf('.')
  const base = dot > 0 ? original.slice(0, dot) : original
  return `${base}_annotated.png`
}

/** Draw a single stroke onto a canvas context using quadratic Bézier curves */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points, color, width } = stroke
  if (points.length < 2) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2
      const midY = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)
  }

  ctx.stroke()
  ctx.restore()
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DrawingEditor({ src, filename, onSave, onCancel }: DrawingEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Image dimensions
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // Drawing state
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[1].value) // Red default
  const [strokeWidth, setStrokeWidth] = useState(WIDTHS[1].value) // Medium default
  const [saving, setSaving] = useState(false)
  const [blobFetchFailed, setBlobFetchFailed] = useState(false)
  const drawingRef = useRef(false)

  // Zoom / pan state
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })

  // Pan mode (Space held)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const spaceHeldRef = useRef(false)
  const panningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOffsetStartRef = useRef({ x: 0, y: 0 })

  // ── Fetch image as blob URL to avoid CORS issues with canvas ────────────

  useEffect(() => {
    let cancelled = false
    const token = useAuthStore.getState().accessToken
    const proxyUrl = `/api/v1/attachments/proxy?url=${encodeURIComponent(src)}`
    fetch(proxyUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
        const img = new Image()
        img.onload = () => { if (!cancelled) setImgNatural({ w: img.naturalWidth, h: img.naturalHeight }) }
        img.onerror = () => { if (!cancelled) setImgNatural({ w: 800, h: 600 }) }
        img.src = url
      })
      .catch(() => {
        if (!cancelled) {
          setImgNatural({ w: 800, h: 600 })
          setBlobFetchFailed(true)
        }
      })
    return () => {
      cancelled = true
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    }
  }, [src])

  // ── Size canvas to fit container while keeping aspect ratio ─────────────
  // Use rAF so the container has had a chance to paint at full size

  useEffect(() => {
    if (!imgNatural) return
    const raf = requestAnimationFrame(() => {
      if (!containerRef.current) return
      const container = containerRef.current
      const maxW = container.clientWidth - 40
      const maxH = container.clientHeight - 40
      if (maxW <= 0 || maxH <= 0) return
      const ratio = imgNatural.w / imgNatural.h
      let w = maxW
      let h = w / ratio
      if (h > maxH) { h = maxH; w = h * ratio }
      setCanvasSize({ w: Math.round(w), h: Math.round(h) })
    })
    return () => cancelAnimationFrame(raf)
  }, [imgNatural])

  // ── Redraw all strokes whenever they change ─────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const s of strokes) drawStroke(ctx, s)
    if (currentStroke) drawStroke(ctx, currentStroke)
  }, [strokes, currentStroke])

  useEffect(() => { redraw() }, [redraw])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key === ' ' && !spaceHeldRef.current) {
        e.preventDefault()
        spaceHeldRef.current = true
        setSpaceHeld(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
        panningRef.current = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [strokes, redoStack]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wheel zoom (non-passive so we can preventDefault) ──────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = Math.min(Math.max(scaleRef.current * delta, 0.5), 8)
      const rect = el.getBoundingClientRect()
      // cursor position relative to container center
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      const ratio = newScale / scaleRef.current
      const newOffset = {
        x: cx - (cx - offsetRef.current.x) * ratio,
        y: cy - (cy - offsetRef.current.y) * ratio,
      }
      scaleRef.current = newScale
      offsetRef.current = newOffset
      setScale(newScale)
      setOffset(newOffset)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvasSize])

  function resetZoom() {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  // ── Pointer events (on container so they work across the full zoomed area) ─

  // Converts container-relative client coords → canvas pixel coords
  function getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    // position relative to container center
    const px = clientX - rect.left - rect.width / 2
    const py = clientY - rect.top - rect.height / 2
    // undo offset and scale to get inner-div local coords (origin = div center)
    const lx = (px - offsetRef.current.x) / scaleRef.current
    const ly = (py - offsetRef.current.y) / scaleRef.current
    // shift origin from div center to canvas top-left
    return { x: lx + canvasSize.w / 2, y: ly + canvasSize.h / 2 }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    containerRef.current?.setPointerCapture(e.pointerId)
    if (spaceHeldRef.current) {
      panningRef.current = true
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panOffsetStartRef.current = { ...offsetRef.current }
      return
    }
    drawingRef.current = true
    const pt = getCanvasPoint(e.clientX, e.clientY)
    setCurrentStroke({ points: [pt], color, width: strokeWidth })
    setRedoStack([])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    if (panningRef.current) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      const newOffset = { x: panOffsetStartRef.current.x + dx, y: panOffsetStartRef.current.y + dy }
      offsetRef.current = newOffset
      setOffset(newOffset)
      return
    }
    if (!drawingRef.current) return
    const pt = getCanvasPoint(e.clientX, e.clientY)
    setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, pt] } : null)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    containerRef.current?.releasePointerCapture(e.pointerId)
    if (panningRef.current) { panningRef.current = false; return }
    if (!drawingRef.current) return
    drawingRef.current = false
    if (currentStroke && currentStroke.points.length >= 2) {
      setStrokes(prev => [...prev, currentStroke])
    }
    setCurrentStroke(null)
  }

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

  async function handleSave() {
    if (!imgNatural || !blobUrl || strokes.length === 0) return
    setSaving(true)
    try {
      // Draw image + strokes at native resolution
      const offscreen = document.createElement('canvas')
      offscreen.width = imgNatural.w
      offscreen.height = imgNatural.h
      const ctx = offscreen.getContext('2d')!

      // Draw original image using blob URL (avoids CORS tainting the canvas)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = blobUrl
      })
      ctx.drawImage(img, 0, 0, imgNatural.w, imgNatural.h)

      // Scale strokes from display coords to native coords
      const scaleX = imgNatural.w / canvasSize.w
      const scaleY = imgNatural.h / canvasSize.h
      for (const stroke of strokes) {
        const scaled: Stroke = {
          ...stroke,
          width: stroke.width * scaleX,
          points: stroke.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })),
        }
        drawStroke(ctx, scaled)
      }

      // Export as PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob(b => b ? resolve(b) : reject(new Error('Failed to export')), 'image/png')
      })

      await onSave(blob, buildAnnotatedFilename(filename))
    } catch (err) {
      console.error('Failed to save annotated image:', err)
    } finally {
      setSaving(false)
    }
  }

  const loading = !imgNatural || canvasSize.w === 0

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={overlayRef} style={S.overlay}>
      <div style={S.modal}>
        {/* ── Top toolbar ─────────────────────────────────────────────── */}
        <div style={S.toolbar}>
          <button onClick={onCancel} style={S.cancelBtn}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Cancel
          </button>

          <div style={S.colorRow}>
            {COLORS.map(c => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                title={c.label}
                style={{
                  ...S.colorDot,
                  background: c.value,
                  boxShadow: color === c.value ? `0 0 0 2.5px #fff, 0 0 0 4.5px ${c.value === '#FFFFFF' ? '#94A3B8' : c.value}` : 'none',
                  border: c.value === '#FFFFFF' ? '1.5px solid #CBD5E1' : '1.5px solid transparent',
                }}
              />
            ))}
          </div>

          <div style={S.widthRow}>
            {WIDTHS.map(w => (
              <button
                key={w.value}
                onClick={() => setStrokeWidth(w.value)}
                title={w.label}
                style={{
                  ...S.widthBtn,
                  background: strokeWidth === w.value ? '#EEF2FF' : '#F8FAFC',
                  border: strokeWidth === w.value ? '1.5px solid #C7D2FE' : '1px solid #E2E8F0',
                }}
              >
                <div style={{ width: Math.max(w.value * 2.5, 6), height: Math.max(w.value * 2.5, 6), borderRadius: '50%', background: color }} />
              </button>
            ))}
          </div>

          <div style={S.actionRow}>
            {scale !== 1 && (
              <button onClick={resetZoom} style={{ ...S.actionBtn, color: '#6366F1', border: '1px solid #C7D2FE', background: '#EEF2FF', fontSize: 11, fontWeight: 700, width: 'auto', padding: '0 8px', gap: 4, display: 'flex', alignItems: 'center' }} title="Reset zoom">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>
                {scale.toFixed(1)}x
              </button>
            )}
            <button onClick={handleUndo} disabled={strokes.length === 0} style={{ ...S.actionBtn, opacity: strokes.length === 0 ? 0.35 : 1 }} title="Undo (Ctrl+Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            </button>
            <button onClick={handleRedo} disabled={redoStack.length === 0} style={{ ...S.actionBtn, opacity: redoStack.length === 0 ? 0.35 : 1 }} title="Redo (Ctrl+Shift+Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"/></svg>
            </button>
            <button onClick={handleClear} disabled={strokes.length === 0} style={{ ...S.actionBtn, opacity: strokes.length === 0 ? 0.35 : 1 }} title="Clear all">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || strokes.length === 0 || blobFetchFailed}
            title={blobFetchFailed ? 'Image failed to load — close and reopen to retry' : undefined}
            style={{
              ...S.saveBtn,
              opacity: (saving || strokes.length === 0 || blobFetchFailed) ? 0.5 : 1,
              cursor: (saving || strokes.length === 0 || blobFetchFailed) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? (
              <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            )}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* ── Drawing canvas ──────────────────────────────────────────── */}
        <div
          ref={containerRef}
          style={{ ...S.canvasContainer, cursor: loading ? 'default' : spaceHeld ? 'grab' : 'crosshair', touchAction: 'none', position: 'relative' }}
          onPointerDown={loading ? undefined : handlePointerDown}
          onPointerMove={loading ? undefined : handlePointerMove}
          onPointerUp={loading ? undefined : handlePointerUp}
          onPointerLeave={loading ? undefined : handlePointerUp}
        >
          {loading && !blobFetchFailed && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <div style={{ width: 24, height: 24, border: '2.5px solid #6366F1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {blobFetchFailed && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, flexDirection: 'column', gap: 8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 260 }}>
                Image could not be loaded for annotation.<br />Close and reopen the editor to retry.
              </span>
            </div>
          )}
          <div style={{
            position: 'relative', width: canvasSize.w, height: canvasSize.h,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
            visibility: loading ? 'hidden' : 'visible',
          }}>
            <img
              src={blobUrl ?? src}
              alt={filename}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6, userSelect: 'none' }}
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              style={{ position: 'absolute', inset: 0, borderRadius: 6 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 950,
    background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  modal: {
    background: '#FFFFFF', borderRadius: 20,
    width: '100%', maxWidth: 860, height: '92vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderBottom: '1px solid #F1F5F9',
    flexShrink: 0, flexWrap: 'wrap' as any,
  },
  cancelBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 8,
    background: 'none', border: '1px solid #E2E8F0',
    cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#64748B',
  },
  colorRow: {
    display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4,
  },
  colorDot: {
    width: 22, height: 22, borderRadius: '50%',
    cursor: 'pointer', padding: 0, flexShrink: 0,
  },
  widthRow: {
    display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6,
  },
  widthBtn: {
    width: 30, height: 30, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0,
  },
  actionRow: {
    display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
  },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: '#F8FAFC', border: '1px solid #E2E8F0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0, color: '#475569',
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 18px', borderRadius: 10,
    background: '#6366F1', border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
  },
  canvasContainer: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F1F5F9', padding: 20, overflow: 'auto', minHeight: 300,
  },
}
