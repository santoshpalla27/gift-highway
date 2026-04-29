import { useEffect } from 'react'

interface Props {
  src: string
  filename: string
  fileSizeBytes?: number
  onClose: () => void
  onReply?: () => void
  onDelete?: () => void
  onDownload?: () => void
  onAnnotate?: () => void
  zIndex?: number
}

function formatSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const BTN: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  border: 'none',
  borderRadius: 8,
  padding: '7px 10px',
  cursor: 'pointer',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 500,
}

export function ImageLightboxModal({
  src, filename, fileSizeBytes, onClose, onReply, onDelete, onDownload, onAnnotate, zIndex = 900,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sizeLabel = formatSize(fileSizeBytes)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {filename}
        </span>

        {onReply && (
          <button style={BTN} onClick={onReply} title="Reply">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
            </svg>
            Reply
          </button>
        )}

        {onDelete && (
          <button style={{ ...BTN, color: '#FCA5A5' }} onClick={onDelete} title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
          </button>
        )}

        <button
          style={BTN}
          title="Download"
          onClick={() => {
            if (onDownload) { onDownload() } else { window.location.href = src }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Download
        </button>

        {onAnnotate && (
          <button
            style={BTN}
            title="Annotate"
            onClick={() => { onClose(); onAnnotate() }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Annotate
          </button>
        )}

        <button style={BTN} onClick={onClose} title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Image */}
      <img
        src={src}
        alt={filename}
        style={{
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 120px)',
          objectFit: 'contain',
          borderRadius: 8,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
        onClick={e => e.stopPropagation()}
      />

      {/* Footer info */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', padding: '16px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <span style={{
          fontSize: 12, color: 'rgba(255,255,255,0.6)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {filename}{sizeLabel ? ` · ${sizeLabel}` : ''}
        </span>
      </div>
    </div>
  )
}
