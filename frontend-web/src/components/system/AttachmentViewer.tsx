import { useState, useEffect, useRef } from 'react'
import { DrawingEditor } from './DrawingEditor'
import { attachmentService } from '../../services/attachmentService'

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'avif', 'svg']

function resolveIsImage(mimeType?: string, filename?: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  const ext = ('.' + (filename?.split('.').pop() ?? '')).toLowerCase()
  return IMG_EXTS.some(e => ext === '.' + e)
}

interface FileIconInfo { emoji: string; color: string; bg: string }

function getFileIconInfo(mimeType?: string, filename?: string): FileIconInfo {
  const ext = (filename?.split('.').pop() ?? '').toLowerCase()
  const mime = mimeType ?? ''
  if (mime === 'application/pdf' || ext === 'pdf')
    return { emoji: '📄', color: '#EF4444', bg: '#FEF2F2' }
  if (mime.includes('word') || mime.includes('document') || ext === 'doc' || ext === 'docx')
    return { emoji: '📝', color: '#3B82F6', bg: '#EFF6FF' }
  if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext))
    return { emoji: '📊', color: '#22C55E', bg: '#F0FDF4' }
  if (mime.includes('powerpoint') || mime.includes('presentation') || ['ppt', 'pptx'].includes(ext))
    return { emoji: '📋', color: '#F97316', bg: '#FFF7ED' }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext))
    return { emoji: '🎬', color: '#8B5CF6', bg: '#F5F3FF' }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'm4a'].includes(ext))
    return { emoji: '🎵', color: '#EC4899', bg: '#FDF2F8' }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { emoji: '📦', color: '#6B7280', bg: '#F9FAFB' }
  return { emoji: '📎', color: '#6366F1', bg: '#EEF2FF' }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const btn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10,
  background: '#F8FAFC', border: '1px solid #E2E8F0',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, textDecoration: 'none', color: 'inherit',
}

export interface AttachmentViewerProps {
  src: string
  filename: string
  mimeType?: string
  sizeBytes?: number
  onClose: () => void
  onDelete?: () => Promise<void>
  onReply?: () => void
  onDownload?: () => void
  orderId?: string
  onAnnotationSaved?: () => void
}

export function AttachmentViewer({
  src, filename, mimeType, sizeBytes, onClose, onDelete, onReply, onDownload,
  orderId, onAnnotationSaved,
}: AttachmentViewerProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [drawingMode, setDrawingMode] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  function handleDownload() {
    if (onDownload) {
      onDownload()
    } else {
      window.location.href = src
    }
  }

  const isImg = resolveIsImage(mimeType, filename)
  const fileIcon = isImg ? null : getFileIconInfo(mimeType, filename)
  const ext = (filename.split('.').pop() ?? '').toUpperCase()
  const _dot = filename.lastIndexOf('.')
  const baseName = _dot > 0 ? filename.slice(0, _dot) : filename
  const extName  = _dot > 0 ? filename.slice(_dot)  : ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
      onClose()
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={e => { e.stopPropagation(); if (e.target === overlayRef.current) onClose() }}
    >
      <div style={{
        background: '#FFFFFF', borderRadius: 20,
        width: '100%', maxWidth: 860, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
      }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: fileIcon?.bg ?? '#F1F5F9',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>
            {isImg ? '🖼️' : fileIcon?.emoji}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {baseName}
              </span>
              {extName && (
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {extName}
                </span>
              )}
            </div>
            {!!sizeBytes && (
              <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {formatFileSize(sizeBytes)}
              </span>
            )}
          </div>

          {onReply && (
            <button
              onClick={() => { onClose(); onReply() }}
              style={{ ...btn, background: '#EEF2FF', border: '1px solid #C7D2FE' }}
              title="Reply"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M2 8l5-4v2.5c4 0 7 2 7 6-1.5-2.5-4-3.5-7-3.5V11L2 8z" fill="#6366F1" />
              </svg>
            </button>
          )}
          {isImg && orderId && (
            <button onClick={() => setDrawingMode(true)} style={btn} title="Draw / Annotate">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.5 1.5 0 012.121 2.121l-8 8L3 13.5l.879-2.621 8-8z" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 4l2 2" stroke="#475569" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button onClick={handleDownload} style={btn} title="Download">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {onDelete && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ ...btn, background: '#FEF2F2', border: '1px solid #FECACA' }}
              title="Delete"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {onDelete && confirmDelete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Delete?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '5px 12px', borderRadius: 8, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? '…' : 'Yes'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '5px 12px', borderRadius: 8, background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                No
              </button>
            </div>
          )}

          <button onClick={onClose} style={btn} title="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {isImg ? (
          <div style={{
            flex: 1, overflow: 'auto', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: '#F8FAFC', padding: 20, minHeight: 200,
          }}>
            {imgError ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>🖼️</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#64748B', marginBottom: 12 }}>
                  Image could not be loaded
                </div>
                <a href={src} target="_blank" rel="noreferrer" style={{
                  display: 'inline-block', padding: '10px 22px', borderRadius: 10,
                  background: '#EEF2FF', color: '#6366F1', fontWeight: 600, fontSize: 13, textDecoration: 'none',
                }}>
                  Open in browser
                </a>
              </div>
            ) : (
              <img
                src={src}
                alt={filename}
                onError={() => setImgError(true)}
                style={{
                  maxWidth: '100%', maxHeight: 'calc(92vh - 72px)',
                  objectFit: 'contain', borderRadius: 10,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                }}
              />
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '48px 40px', gap: 14,
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: 30,
              background: fileIcon!.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 56,
            }}>
              {fileIcon!.emoji}
            </div>
            <div style={{ padding: '4px 16px', borderRadius: 20, background: fileIcon!.bg }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: fileIcon!.color, letterSpacing: '0.06em' }}>
                {ext}
              </span>
            </div>
            <div style={{
              fontSize: 18, fontWeight: 600, color: '#0F172A',
              textAlign: 'center', maxWidth: 420, wordBreak: 'break-all', lineHeight: 1.4,
            }}>
              {filename}
            </div>
            {!!sizeBytes && (
              <div style={{ fontSize: 13, color: '#94A3B8', marginTop: -6 }}>
                {formatFileSize(sizeBytes)}
              </div>
            )}
            <button onClick={handleDownload} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
              padding: '14px 36px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: '#6366F1', color: '#fff',
              fontWeight: 700, fontSize: 15,
              boxShadow: '0 4px 14px rgba(99,102,241,0.28)',
            }}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Download
            </button>
          </div>
        )}
      </div>

      {/* Drawing editor overlay */}
      {drawingMode && orderId && (
        <DrawingEditor
          src={src}
          filename={filename}
          onCancel={() => setDrawingMode(false)}
          onSave={async (blob, annotatedFilename) => {
            // Upload annotated image as a new attachment
            const mimeType = 'image/jpeg'
            const sizeBytes = blob.size
            const { upload_url, file_key, file_url } = await attachmentService.getUploadURL(orderId, annotatedFilename, mimeType, sizeBytes)
            await attachmentService.uploadToR2(upload_url, new File([blob], annotatedFilename, { type: mimeType }), mimeType, () => {})
            await attachmentService.confirmUpload(orderId, { file_name: annotatedFilename, file_key, file_url, mime_type: mimeType, size_bytes: sizeBytes })
            setDrawingMode(false)
            onAnnotationSaved?.()
            onClose()
          }}
        />
      )}
    </div>
  )
}
