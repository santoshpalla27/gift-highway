import { useState, useRef, useEffect, useCallback } from 'react'
import { notificationService } from '../../../services/notificationService'
import { useNotifications } from '../../notifications/hooks/useNotifications'
import { formatDate, formatRelative, formatDayGroup, fmt12hrStr } from '../../../utils/date'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService, OrderEvent, UserOption } from '../../../services/orderService'
import { attachmentService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE, isImage, formatBytes, resolveFileMime } from '../../../services/attachmentService'
import { useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import { useOrderPermissions } from '../hooks/useOrderPermissions'
import { Skeleton } from '../../../components/system/Skeleton'
import { useSocketEvent } from '../../../providers/SocketProvider'
import type { Order } from '../../../services/orderService'
import { staffPortalApi, getPortalURL, type PortalStatus, type PortalAttachment, type PortalMessage } from '../../../services/portalService'
import { StaffPortalChatModal } from '../components/StaffPortalChatModal'

// ─── Meta maps ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',          color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}
const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}
const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const

function chip(meta: { label: string; color: string; bg: string }) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: 12, fontWeight: 600,
    color: meta.color, background: meta.bg,
  } as React.CSSProperties
}

// ─── Timeline helpers ─────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatTimestamp(iso: string): string { return formatRelative(iso) }

function formatDateGroup(iso: string): string { return formatDayGroup(iso) }

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function groupByDate(events: OrderEvent[]): { label: string; events: OrderEvent[] }[] {
  const map = new Map<string, OrderEvent[]>()
  for (const ev of events) {
    const k = dayKey(ev.created_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(ev)
  }
  return Array.from(map.entries()).map(([k, evs]) => ({
    label: formatDateGroup(k + 'T12:00:00'),
    events: evs,
  }))
}

function DateDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
    </div>
  )
}

// ─── Extended event type for local optimistic state ──────────────────────────
type LocalOrderEvent = OrderEvent & { failed?: boolean; originalText?: string }

function parseCommentText(raw: string): { replyEventId: string | null; replyPreview: string | null; cleanText: string } {
  const match = raw.match(/^\[reply:([^:\]]+):(.+?)\]\n?([\s\S]*)$/)
  if (match) return { replyEventId: match[1], replyPreview: match[2], cleanText: match[3].trim() }
  return { replyEventId: null, replyPreview: null, cleanText: raw }
}

function stripMentionTokens(text: string): string {
  return text.replace(/@\[([^\]]+)\]/g, '@$1')
}

function renderTextWithMentions(text: string): React.ReactNode {
  const parts = text.split(/(@\[[^\]]+\])/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    const m = part.match(/^@\[([^\]]+)\]$/)
    if (m) {
      return (
        <span key={i} style={{
          display: 'inline', background: '#EEF2FF', color: '#6366F1',
          borderRadius: 4, padding: '1px 5px', fontSize: 13, fontWeight: 600,
        }}>
          @{m[1]}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function getEventPreview(event: LocalOrderEvent): string {
  if (event.type === 'attachment_added') {
    const p = event.payload as any
    return `📎 ${p.file_name || 'Attachment'}`
  }
  if (event.type === 'customer_attachment') {
    const p = event.payload as any
    return `📎 ${p.file_name || 'Attachment'}`
  }
  if (event.type === 'staff_portal_reply' || event.type === 'customer_message') {
    const p = event.payload as any
    const raw = p.text ?? ''
    const lines = raw.split('\n').filter((l: string) => !l.match(/^\[attachment:\d+:.+\]$/) && !l.match(/^\[reply:\d+\]$/))
    const clean = lines.join('\n').trim()
    if (clean) return clean.slice(0, 60)
    // attachment-only message
    const attMatch = raw.match(/\[attachment:\d+:(.+?)\]/)
    if (attMatch) return `📎 ${attMatch[1]}`
    return 'Message'
  }
  const text = (event.payload as any)?.text ?? ''
  const { cleanText } = parseCommentText(text)
  return stripMentionTokens(cleanText || text).slice(0, 60)
}

function getPortalMsgPreview(msg: PortalMessage): string {
  const textLines: string[] = []
  let attName = ''
  for (const line of msg.message.split('\n')) {
    if (line.match(/^\[reply:\d+\]$/)) continue
    const att = line.match(/^\[attachment:\d+:(.+?)\]$/)
    if (att) { attName = att[1]; continue }
    textLines.push(line)
  }
  const text = textLines.join('\n').trim()
  if (text) return text.slice(0, 60)
  if (attName) return `📎 ${attName}`
  return msg.message.slice(0, 60)
}

function getPortalMsgThumb(msg: PortalMessage, atts: PortalAttachment[]): string | null {
  const m = msg.message.match(/\[attachment:(\d+):.+?\]/)
  if (!m) return null
  const att = atts.find(a => a.id === parseInt(m[1]))
  const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.svg']
  if (att && imgExts.includes(att.file_type.toLowerCase()) && att.view_url) return att.view_url
  return null
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.svg']
function isImgExt(name: string) { return IMG_EXTS.includes(('.' + (name.split('.').pop() ?? '')).toLowerCase()) }

function getEventThumb(event: LocalOrderEvent, portalAttachments?: PortalAttachment[]): string | null {
  if (event.type === 'attachment_added') {
    const p = event.payload as any
    if (isImage(p.mime_type ?? '') && p.file_url) return p.file_url
    return null
  }
  if (event.type === 'customer_attachment') {
    const p = event.payload as any
    if (!isImgExt(p.file_name ?? '')) return null
    const attId = p.att_id ? parseInt(p.att_id) : null
    if (attId == null) return null
    const att = portalAttachments?.find(a => a.id === attId)
    return att?.view_url ?? null
  }
  if (event.type === 'staff_portal_reply' || event.type === 'customer_message') {
    const raw = (event.payload as any).text ?? ''
    const m = raw.match(/\[attachment:(\d+):(.+?)\]/)
    if (!m) return null
    const attId = parseInt(m[1])
    const attName: string = m[2]
    if (!isImgExt(attName)) return null
    const att = portalAttachments?.find(a => a.id === attId)
    return att?.view_url ?? null
  }
  return null
}

async function downloadFile(orderId: string, fileKey: string, fileName: string) {
  try {
    const url = await attachmentService.getDownloadUrl(orderId, fileKey, fileName)
    window.location.href = url
  } catch {
    window.open(`about:blank`, '_blank')
  }
}


// ─── Attachment image with signed-url refresh on 403/load-error ─────────────

function AttachmentImage({ orderId, fileKey, fileName, fileUrl }: {
  orderId: string; fileKey: string; fileName: string; fileUrl: string
}) {
  const [src, setSrc] = useState(fileUrl)
  const [failed, setFailed] = useState(false)
  const refreshing = useRef(false)

  const handleError = async () => {
    if (refreshing.current || failed) return
    refreshing.current = true
    try {
      const freshUrl = await attachmentService.getSignedUrl(orderId, fileKey)
      setSrc(freshUrl)
    } catch {
      setFailed(true)
    } finally {
      refreshing.current = false
    }
  }

  if (failed) {
    return <div style={{ padding: '10px 14px', fontSize: 12, color: '#9CA3AF' }}>Image unavailable</div>
  }
  return (
    <img
      src={src}
      alt={fileName}
      onError={handleError}
      style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
    />
  )
}

// ─── Portal attachment card that can fetch its own URL if needed ──────────────

function PortalAttachmentItem({ orderId, attId, fileName, fileType, isOwn, isStaff, caption, portalAttachments }: {
  orderId: string
  attId: number | null
  fileName: string
  fileType?: string
  isOwn?: boolean
  isStaff?: boolean
  caption?: string
  portalAttachments?: PortalAttachment[]
}) {
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const ext = ('.' + (fileName.split('.').pop() ?? '')).toLowerCase()
  const isImg = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(ext) ||
                ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes((fileType ?? '').toLowerCase())

  useEffect(() => {
    // If we have it in the list already, use that
    const existing = attId != null ? portalAttachments?.find(a => a.id === attId) : null
    if (existing?.view_url) {
      setViewUrl(existing.view_url)
      return
    }

    // Otherwise fetch it
    if (attId != null) {
      staffPortalApi.getAttachmentDownloadURL(orderId, attId, fileName)
        .then(setViewUrl)
        .catch(() => {})
    }
  }, [orderId, attId, fileName, portalAttachments])

  const handleDownload = () => {
    if (viewUrl) window.location.href = viewUrl
  }

  const bubbleBg = isStaff === undefined ? undefined : isStaff ? '#EFF6FF' : '#F0FDF4'
  const bubbleBorder = isStaff === undefined ? '1px solid #E5E7EB' : isStaff ? '1px solid #BFDBFE' : '1px solid #A7F3D0'
  const bubbleRadius = isOwn ? '12px 4px 12px 12px' : '4px 12px 12px 12px'

  if (isImg) {
    return (
      <div style={{
        marginTop: 6, overflow: 'hidden', width: 280, maxWidth: '100%',
        background: bubbleBg ?? '#FFFFFF', border: bubbleBorder,
        borderRadius: isStaff !== undefined ? bubbleRadius : 8,
      }}>
        <div
          onClick={handleDownload}
          style={{ cursor: 'pointer', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {viewUrl ? (
            <img src={viewUrl} alt={fileName} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <div style={{ width: 16, height: 16, border: '2px solid #94A3B8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>
        <div style={{ padding: '8px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fileName}</span>
            <button onClick={handleDownload} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', lineHeight: 1, flexShrink: 0, padding: 0 }} title="Download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
          </div>
          {caption && (
            <div style={{ fontSize: 13, color: '#374151', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{caption}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleDownload}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
        background: bubbleBg ?? '#F9FAFB', border: bubbleBorder,
        borderRadius: isStaff !== undefined ? bubbleRadius : 8,
        padding: '12px 20px', width: 'fit-content', minWidth: 240, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <span style={{ fontSize: 12, color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        <button onClick={(e) => { e.stopPropagation(); handleDownload() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', lineHeight: 1, flexShrink: 0, padding: 0 }} title="Download">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        </button>
      </div>
      {caption && (
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{caption}</div>
      )}
    </div>
  )
}

// ─── Timeline event renderer ─────────────────────────────────────────────────

function TimelineEvent({ event, isOptimistic, onRetry, onDelete, onEdit, onReply, onHighlightQuoted, onHighlightPortalMsg, orderId, portalAttachments, portalMessages, portalAttCaptions, quotedEvent, currentUserId }: {
  event: LocalOrderEvent
  isOptimistic?: boolean
  onRetry?: () => void
  onDelete?: () => void
  onEdit?: (newText: string) => void
  onReply?: () => void
  onHighlightQuoted?: () => void
  onHighlightPortalMsg?: (portalMsgId: number) => void
  orderId: string
  portalAttachments?: PortalAttachment[]
  portalMessages?: PortalMessage[]
  portalAttCaptions?: Map<number, string>
  quotedEvent?: LocalOrderEvent | null
  currentUserId?: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isComment = event.type === 'comment_added'
  const canMenu = (onDelete || onEdit || onReply) && !isOptimistic
  const isOwn = event.actor_id === currentUserId

  if (isComment) {
    const isFailed = event.failed
    const rawText = (event.payload as any).text ?? ''
    const { replyPreview, cleanText } = parseCommentText(rawText)
    return (
      <div style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        gap: 10,
        opacity: isOptimistic && !isFailed ? 0.6 : 1,
        alignItems: 'center'
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isOwn ? 'flex-end' : 'flex-start',
          maxWidth: '85%'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
            flexDirection: isOwn ? 'row-reverse' : 'row',
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{isOwn ? 'You' : event.actor_name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: isOwn ? 'row-reverse' : 'row', width: '100%' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#0F172A',
              color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {getInitials(event.actor_name)}
            </div>
            {editing ? (
              <div style={{ flex: 1 }}>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 13.5,
                    border: '1.5px solid #6366F1', borderRadius: '4px 12px 12px 12px',
                    outline: 'none', resize: 'none', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.6,
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editText.trim()) { onEdit!(editText.trim()); setEditing(false) } }
                    if (e.key === 'Escape') setEditing(false)
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => { if (editText.trim()) { onEdit!(editText.trim()); setEditing(false) } }} style={{ padding: '4px 12px', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditing(false)} style={{ padding: '4px 12px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#6B7280' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{
                background: isFailed ? '#FFF5F5' : '#FFFFFF',
                border: `1px solid ${isFailed ? '#FCA5A5' : '#E2E8F0'}`,
                borderRadius: isOwn ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                padding: '10px 14px', fontSize: 13.5, color: '#374151', lineHeight: 1.6,
                boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                width: 'fit-content'
              }}>
                {replyPreview && (
                  <div
                    onClick={onHighlightQuoted}
                    style={{
                      display: 'flex', alignItems: 'stretch', marginBottom: 8,
                      borderLeft: '3px solid #6366F1', background: '#EEF2FF',
                      borderRadius: '0 6px 6px 0', overflow: 'hidden',
                      cursor: onHighlightQuoted ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, padding: '4px 8px' }}>
                      {quotedEvent && (
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#6366F1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(quotedEvent.type === 'customer_message' || quotedEvent.type === 'customer_attachment')
                            ? ((quotedEvent.payload as any).customer_name ?? 'Customer')
                            : quotedEvent.actor_name}
                        </p>
                      )}
                      <p style={{ margin: 0, fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyPreview}
                      </p>
                    </div>
                    {quotedEvent && (() => {
                      const thumb = getEventThumb(quotedEvent, portalAttachments)
                      if (!thumb) return null
                      return (
                        <div style={{ width: 44, height: 44, flexShrink: 0, overflow: 'hidden' }}>
                          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      )
                    })()}
                  </div>
                )}
                {renderTextWithMentions(cleanText)}
              </div>
            )}
            {canMenu && !editing && (
              <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9CA3AF', lineHeight: 1, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>
                </button>
                {menuOpen && (
                  <div style={{
                    position: 'absolute', right: isOwn ? 'auto' : 0, left: isOwn ? 0 : 'auto', top: '100%', zIndex: 50, marginTop: 4,
                    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 130, overflow: 'hidden',
                  }}>
                    {onReply && (
                      <button
                        onClick={() => { setMenuOpen(false); onReply() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        Reply
                      </button>
                    )}
                    {onEdit && (
                      <button
                        onClick={() => { setEditText(cleanText); setEditing(true); setMenuOpen(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => { setMenuOpen(false); onDelete() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#EF4444', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FFF5F5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42,
            marginTop: 2, fontSize: 10, color: isFailed ? '#EF4444' : '#9CA3AF',
            textAlign: isOwn ? 'right' : 'left'
          }}>
            {isFailed ? 'Failed to send' : formatTimestamp(event.created_at)}
          </div>

          {isFailed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: '#EF4444' }}>Message not delivered.</span>
              <button
                onClick={onRetry}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#6366F1',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Attachment event — rendered as a file card bubble
  if (event.type === 'attachment_added') {
    const p = event.payload as Record<string, string>
    const fileIsImage = isImage(p.mime_type ?? '')
    return (
      <div style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'center'
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isOwn ? 'flex-end' : 'flex-start'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
            flexDirection: isOwn ? 'row-reverse' : 'row',
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{isOwn ? 'You' : event.actor_name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: isOwn ? 'row-reverse' : 'row', width: '100%' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#0F172A',
              color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {getInitials(event.actor_name)}
            </div>
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: isOwn ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
              overflow: 'hidden', maxWidth: '60%', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            }}>
              {fileIsImage ? (
                <AttachmentImage orderId={orderId} fileKey={p.file_key} fileName={p.file_name} fileUrl={p.file_url} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.file_name}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{formatBytes(Number(p.size_bytes))}</div>
                  </div>
                  <button onClick={() => downloadFile(orderId, p.file_key, p.file_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', flexShrink: 0, padding: 0, lineHeight: 1 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </div>
              )}
              {fileIsImage && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.file_name}</span>
                  <button onClick={() => downloadFile(orderId, p.file_key, p.file_name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', flexShrink: 0, marginLeft: 8, padding: 0, lineHeight: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </div>
              )}
            </div>
            {(onReply || onDelete) && (
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9CA3AF', lineHeight: 1, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>
                </button>
                {menuOpen && (
                  <div style={{ position: 'absolute', right: isOwn ? 'auto' : 0, left: isOwn ? 0 : 'auto', top: '100%', zIndex: 50, marginTop: 4, background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 130, overflow: 'hidden' }}>
                    {onReply && (
                      <button
                        onClick={() => { setMenuOpen(false); onReply() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        Reply
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => { setMenuOpen(false); onDelete() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#EF4444', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FFF5F5')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42,
            marginTop: 2, fontSize: 10, color: '#9CA3AF',
            textAlign: isOwn ? 'right' : 'left'
          }}>
            {formatTimestamp(event.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // Deleted attachment tombstone
  if (event.type === 'attachment_deleted') {
    const p = event.payload as Record<string, string>
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: 0.5 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
          Attachment deleted{p.file_name ? ` · ${p.file_name}` : ''}
        </span>
      </div>
    )
  }

  // Deleted portal message tombstone
  if (event.type === 'portal_message_deleted') {
    const p = event.payload as Record<string, any>
    const who = p.portal_sender ? ` · ${p.portal_sender}` : ''
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: 0.5 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
        <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
          Message deleted{who}
        </span>
      </div>
    )
  }

  // Customer portal message / attachment
  if (event.type === 'customer_message' || event.type === 'customer_attachment' || event.type === 'staff_portal_reply') {
    const p = event.payload as Record<string, string>
    const isStaff = event.type === 'staff_portal_reply'
    const senderName = isStaff ? event.actor_name : (p.customer_name ?? 'Customer')

    // For customer_message: parse attachment tokens out of the text.
    // If the entire message is just attachment tokens (no text), suppress it —
    // the customer_attachment event already covers it in the timeline.
    const rawText = p.text ?? ''
    let portalReplyMsgId: number | null = null
    const parsed = (() => {
      const tokens: { id: number; name: string }[] = []
      const textLines: string[] = []
      for (const line of rawText.split('\n')) {
        const att = line.match(/^\[attachment:(\d+):(.+?)\]$/)
        if (att) { tokens.push({ id: parseInt(att[1]), name: att[2] }); continue }
        const replyTok = line.match(/^\[reply:(\d+)\]$/)
        if (replyTok) { portalReplyMsgId = parseInt(replyTok[1]); continue }
        textLines.push(line)
      }
      return { text: textLines.join('\n').trim(), tokens }
    })()
    const quotedPortalMsg = portalReplyMsgId !== null
      ? (portalMessages ?? []).find(m => m.id === portalReplyMsgId) ?? null
      : null

    if (event.type === 'customer_message' && parsed.tokens.length > 0) {
      return null
    }

    return (
      <div style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'center'
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isOwn ? 'flex-end' : 'flex-start'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
            flexDirection: isOwn ? 'row-reverse' : 'row',
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: (isOwn || isStaff) ? '#3B82F6' : '#10B981' }}>{isOwn ? 'You' : senderName}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
              background: (isOwn || isStaff) ? '#DBEAFE' : '#D1FAE5',
              color: (isOwn || isStaff) ? '#2563EB' : '#059669',
            }}>
              {isOwn ? 'Staff reply' : (isStaff ? 'Staff reply' : 'Customer')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: isOwn ? 'row-reverse' : 'row', width: '100%' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isStaff ? '#DBEAFE' : '#D1FAE5',
              color: isStaff ? '#2563EB' : '#10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {getInitials(senderName)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '65%' }}>
              {(parsed.text || quotedPortalMsg) && (
                <div style={{
                  fontSize: 13.5, color: '#111827',
                  background: isStaff ? '#EFF6FF' : '#F0FDF4',
                  border: `1px solid ${isStaff ? '#BFDBFE' : '#A7F3D0'}`,
                  borderRadius: isOwn ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  padding: '8px 12px',
                  lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {quotedPortalMsg && (() => {
                    const qIsStaff = quotedPortalMsg.sender_type === 'staff'
                    const thumb = getPortalMsgThumb(quotedPortalMsg, portalAttachments ?? [])
                    return (
                      <div
                        onClick={() => portalReplyMsgId !== null && onHighlightPortalMsg?.(portalReplyMsgId)}
                        style={{
                          display: 'flex', alignItems: 'stretch', marginBottom: parsed.text ? 8 : 0,
                          borderLeft: `3px solid ${qIsStaff ? '#3B82F6' : '#10B981'}`,
                          background: 'rgba(0,0,0,0.05)', borderRadius: '0 6px 6px 0',
                          overflow: 'hidden',
                          cursor: onHighlightPortalMsg && portalReplyMsgId !== null ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, padding: '3px 8px' }}>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: qIsStaff ? '#3B82F6' : '#10B981', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {quotedPortalMsg.portal_sender}
                          </p>
                          <p style={{ margin: 0, fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getPortalMsgPreview(quotedPortalMsg)}
                          </p>
                        </div>
                        {thumb && (
                          <div style={{ width: 40, height: 40, flexShrink: 0, overflow: 'hidden' }}>
                            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {parsed.text}
                </div>
              )}
              {event.type === 'staff_portal_reply' && parsed.tokens.map(tok => (
                <PortalAttachmentItem
                  key={tok.id}
                  orderId={orderId}
                  attId={tok.id}
                  fileName={tok.name}
                  isOwn={isOwn}
                  isStaff={true}
                  portalAttachments={portalAttachments}
                />
              ))}
              {event.type === 'customer_attachment' && p.file_name && (() => {
                const attId = p.att_id ? parseInt(p.att_id) : null
                const caption = attId != null ? portalAttCaptions?.get(attId) : undefined
                return (
                  <PortalAttachmentItem
                    orderId={orderId}
                    attId={attId}
                    fileName={p.file_name}
                    fileType={p.file_type}
                    isOwn={isOwn}
                    isStaff={false}
                    caption={caption}
                    portalAttachments={portalAttachments}
                  />
                )
              })()}
            </div>
            {onReply && (
              <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9CA3AF', lineHeight: 1, borderRadius: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#374151')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9CA3AF')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="19" r="2.5"/></svg>
                </button>
                {menuOpen && (
                  <div style={{
                    position: 'absolute', right: isOwn ? 'auto' : 0, left: isOwn ? 0 : 'auto', top: '100%', zIndex: 50, marginTop: 4,
                    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 130, overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => { setMenuOpen(false); onReply() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                      Reply
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{
            marginRight: isOwn ? 42 : 0, marginLeft: isOwn ? 0 : 42,
            marginTop: 2, fontSize: 10, color: '#9CA3AF',
            textAlign: isOwn ? 'right' : 'left'
          }}>
            {formatTimestamp(event.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // System event
  let icon: React.ReactNode
  let text = ''

  switch (event.type) {
    case 'order_created':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      text = 'created this order'
      break
    case 'status_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      text = `Status changed: ${STATUS_META[event.payload.from]?.label ?? event.payload.from} → ${STATUS_META[event.payload.to]?.label ?? event.payload.to}`
      break
    case 'priority_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      text = `Priority changed: ${event.payload.from} → ${event.payload.to}`
      break
    case 'due_date_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      text = event.payload.to ? `Due date set to ${event.payload.to}` : 'Due date removed'
      break
    case 'assignees_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      text = event.payload.names ? `Assigned to ${event.payload.names}` : 'Assignees updated'
      break
    default:
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      text = 'Order details updated'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 10,
      padding: '8px 12px',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: '#E5E7EB', color: '#6B7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 12.5, color: '#6B7280', flex: 1 }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>{event.actor_name}</span>
        {' · '}{text}
      </span>
      <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {formatTimestamp(event.created_at)}
      </span>
    </div>
  )
}

// ─── Status dropdown for right panel ─────────────────────────────────────────

function StatusDropdown({ order, onUpdate }: { order: Order; onUpdate: (status: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sm = STATUS_META[order.status] ?? STATUS_META.new

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E4E6EF',
          background: sm.bg, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: sm.color,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.color, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{sm.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999,
          background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.08)', padding: 4,
        }}>
          {STATUS_OPTIONS.map(s => {
            const m = STATUS_META[s]
            const active = order.status === s
            return (
              <div
                key={s}
                onClick={() => { if (!active) onUpdate(s); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 7, cursor: active ? 'default' : 'pointer',
                  background: active ? m.bg : 'transparent',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? m.color : '#374151',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = '#F3F4F6' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? m.color : '#D1D5DB' }} />
                {m.label}
                {active && <svg style={{ marginLeft: 'auto' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Right panel section ──────────────────────────────────────────────────────

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const LIMIT = 30

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()

  // ── Order data ──────────────────────────────────────────────────────────────
  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ['orders', id],
    queryFn: () => orderService.getOrder(id!),
    enabled: !!id,
  })

  // ── Notifications: "New updates" divider ───────────────────────────────────
  // newSinceAt = last_seen_at from DB (null on first visit).
  // pageEnteredAt = fallback used only when newSinceAt is null, so the divider
  // still appears for real-time messages that arrive on a first-time visit.
  //
  // React StrictMode (dev) double-invokes effects: mount → cleanup → remount.
  // Without a guard, the cleanup fires markOrderRead during the simulated
  // unmount, writing last_seen_at=NOW before getLastSeen can read the old value.
  // The setTimeout(0) trick: StrictMode's simulated cleanup fires synchronously
  // (before any timer), so clearTimeout cancels the "really mounted" flag.
  // A real unmount only fires after the timer has already resolved.
  const { markOrderRead } = useNotifications()
  const markOrderReadRef = useRef(markOrderRead)
  markOrderReadRef.current = markOrderRead
  const reallyMountedRef = useRef(false)
  const pageEnteredAt = useRef(new Date().toISOString())
  const [newSinceAt, setNewSinceAt] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    reallyMountedRef.current = false
    setNewSinceAt(null)
    pageEnteredAt.current = new Date().toISOString()
    notificationService.getLastSeen(id).then(t => setNewSinceAt(t))
    const t = setTimeout(() => { reallyMountedRef.current = true }, 0)
    return () => {
      clearTimeout(t)
      if (reallyMountedRef.current) markOrderReadRef.current(id)
      reallyMountedRef.current = false
    }
  }, [id])

  // ── Staff users for @mention ────────────────────────────────────────────────
  const { data: mentionUsers = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-mention'],
    queryFn: orderService.listUsersForAssignment,
    staleTime: 5 * 60 * 1000,
  })

  // ── Events: state-based pagination ─────────────────────────────────────────
  const [evList, setEvList] = useState<OrderEvent[]>([])
  const [, setTotalEvents] = useState(0)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const olderPageRef = useRef(2)
  const evListRef = useRef<OrderEvent[]>([])
  useEffect(() => { evListRef.current = evList }, [evList])

  // ── Delete confirmation ─────────────────────────────────────────────────────
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // ── Optimistic / failed comments ────────────────────────────────────────────
  const [optimisticEvents, setOptimisticEvents] = useState<LocalOrderEvent[]>([])
  const allEvents = (() => {
    const raw = [...evList, ...optimisticEvents]

    // Collect msg_ids of deleted portal messages
    const deletedMsgIds = new Set<number>()
    for (const e of raw) {
      if (e.type === 'portal_message_deleted') {
        const p = e.payload as Record<string, any>
        if (p?.msg_id) deletedMsgIds.add(Number(p.msg_id))
      }
    }

    // From deleted customer_message events, collect the attachment IDs embedded in their text
    // so that the paired customer_attachment event (which has no msg_id) can also be hidden
    const deletedAttIds = new Set<number>()
    for (const e of raw) {
      if (e.type === 'customer_message' && deletedMsgIds.has(Number((e.payload as any)?.msg_id))) {
        const rawText = String((e.payload as any)?.text ?? '')
        for (const line of rawText.split('\n')) {
          const m = line.match(/^\[attachment:(\d+):/)
          if (m) deletedAttIds.add(parseInt(m[1]))
        }
      }
    }

    return raw
      .filter(e => {
        if (e.type === 'portal_message_deleted') return false
        if (e.type === 'user_mentioned') return false
        if (e.type === 'customer_attachment' && deletedAttIds.has(Number((e.payload as any)?.att_id))) return false
        return true
      })
      .map(e => {
        if (
          (e.type === 'customer_message' || e.type === 'staff_portal_reply') &&
          deletedMsgIds.has(Number((e.payload as any)?.msg_id))
        ) {
          return { ...e, type: 'portal_message_deleted' }
        }
        return e
      })
  })()

  // ── Scroll / new-events badge ───────────────────────────────────────────────
  const [newCount, setNewCount] = useState(0)
  const atBottomRef = useRef(true)
  const timelineRef = useRef<HTMLDivElement>(null)
  const feedEndRef = useRef<HTMLDivElement>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [commentText, setCommentText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [replyToEvent, setReplyToEvent] = useState<LocalOrderEvent | null>(null)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Portal management ───────────────────────────────────────────────────────
  const [portal, setPortal] = useState<PortalStatus | null | undefined>(undefined)
  const [portalAttachments, setPortalAttachments] = useState<PortalAttachment[]>([])
  const [portalMessages, setPortalMessages] = useState<PortalMessage[]>([])
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalCopied, setPortalCopied] = useState(false)
  const [showPortalChat, setShowPortalChat] = useState(false)

  const refreshPortalData = useCallback(async () => {
    if (!id) return
    try {
      const [atts, msgs] = await Promise.all([
        staffPortalApi.listAttachments(id),
        staffPortalApi.getMessages(id),
      ])
      setPortalAttachments(atts ?? [])
      setPortalMessages(msgs ?? [])
    } catch (_) {}
  }, [id])

  useEffect(() => {
    if (!id) return
    staffPortalApi.getPortal(id)
      .then(p => {
        setPortal(p)
        if (p) refreshPortalData()
      })
      .catch(() => setPortal(null))
  }, [id, refreshPortalData])

  // ── File uploads ────────────────────────────────────────────────────────────
  type UploadingFile = {
    id: string; name: string; mime: string; progress: number
    previewUrl?: string; done?: boolean; error?: string; file?: File
  }
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setEventsLoading(true)
    orderService.listEvents(id, 1, LIMIT, 'desc').then(data => {
      setEvList([...data.events].reverse())
      setTotalEvents(data.total)
      setHasOlder(data.total > LIMIT)
      olderPageRef.current = 2
      setEventsLoading(false)
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    })
  }, [id])

  // ── Load older ──────────────────────────────────────────────────────────────
  const loadOlder = async () => {
    if (loadingOlder || !id) return
    setLoadingOlder(true)
    const tl = timelineRef.current
    const prevScrollHeight = tl?.scrollHeight ?? 0
    try {
      const data = await orderService.listEvents(id, olderPageRef.current, LIMIT, 'desc')
      const older = [...data.events].reverse()
      setEvList(prev => [...older, ...prev])
      setTotalEvents(data.total)
      setHasOlder(olderPageRef.current * LIMIT < data.total)
      olderPageRef.current++
      requestAnimationFrame(() => {
        if (tl) tl.scrollTop = tl.scrollHeight - prevScrollHeight
      })
    } finally {
      setLoadingOlder(false)
    }
  }

  // ── Realtime: append new events ─────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!id) return
    const data = await orderService.listEvents(id, 1, LIMIT, 'desc')
    const latest = [...data.events].reverse()
    setEvList(prev => {
      const existingIds = new Set(prev.map(e => e.id))
      const newEvs = latest.filter(e => !existingIds.has(e.id))
      if (newEvs.length === 0) return prev
      if (atBottomRef.current) {
        setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      } else {
        setNewCount(n => n + newEvs.length)
      }
      return [...prev, ...newEvs]
    })
    setOptimisticEvents(prev => prev.filter(e => e.failed))
    setTotalEvents(data.total)
  }, [id])

  // ── Realtime: react to socket events for this order ────────────────────────
  useSocketEvent(useCallback((event) => {
    if (event.type === 'order.event_added' && event.entity_id === id) {
      const incoming = (event as any).payload
      if ((incoming?.type === 'customer_message' || incoming?.type === 'staff_portal_reply' || incoming?.type === 'portal_message_deleted') && id) {
        refreshPortalData()
      }
      if (incoming?.id) {
        setEvList(prev => {
          if (prev.some(e => e.id === incoming.id)) {
            return prev.map(e => e.id === incoming.id ? { ...e, ...incoming } : e)
          }
          fetchLatest()
          return prev
        })
      } else {
        fetchLatest()
      }
    }
    if (event.type === 'order.event_deleted' && event.entity_id === id) {
      const p = (event as unknown as { payload: { event_id: string; tombstone?: boolean; file_name?: string } }).payload
      if (!p?.event_id) return
      if (p.tombstone) {
        setEvList(prev => prev.map(e => e.id === p.event_id
          ? { ...e, type: 'attachment_deleted', payload: { file_name: p.file_name ?? '' } }
          : e
        ))
      } else {
        setEvList(prev => prev.filter(e => e.id !== p.event_id))
      }
    }
    if (
      (event.type === 'order.updated' || event.type === 'order.status_changed') &&
      event.entity_id === id
    ) {
      qc.invalidateQueries({ queryKey: ['orders', id] })
    }
  }, [id, fetchLatest, qc]))

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = atBottom
    if (atBottom && newCount > 0) setNewCount(0)
  }
  const scrollToBottom = () => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewCount(0)
    atBottomRef.current = true
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  const { mutate: updateStatus } = useUpdateOrderStatus()

  // ── Comment mutation ────────────────────────────────────────────────────────
  const { mutate: addComment, isPending: commenting } = useMutation({
    mutationFn: (text: string) => orderService.addComment(id!, text),
    onMutate: (text) => {
      const optId = `opt-${Date.now()}`
      const optimistic: LocalOrderEvent = {
        id: optId,
        order_id: id!,
        type: 'comment_added',
        actor_id: user?.id ?? null,
        actor_name: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim(),
        payload: { text },
        created_at: new Date().toISOString(),
        originalText: text,
      }
      setOptimisticEvents(prev => [...prev, optimistic])
      setCommentText('')
      setTimeout(() => textareaRef.current?.focus(), 0)
      atBottomRef.current = true
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return { optId }
    },
    onSuccess: () => {
      fetchLatest()
      qc.invalidateQueries({ queryKey: ['orders', id] })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.optId) {
        setOptimisticEvents(prev =>
          prev.map(e => e.id === ctx.optId ? { ...e, failed: true } : e)
        )
      }
    },
  })

  const highlightEvent = useCallback((eventId: string) => {
    const el = eventRefs.current[eventId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedEventId(eventId)
    highlightTimerRef.current = setTimeout(() => setHighlightedEventId(null), 5000)
  }, [])

  const handleSelectReplyEvent = useCallback((ev: LocalOrderEvent) => {
    setReplyToEvent(ev)
    const el = eventRefs.current[ev.id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 600)
    }
  }, [])

  // Find the timeline event that corresponds to a portal message, matched by timestamp proximity
  const highlightPortalMsg = useCallback((portalMsgId: number) => {
    const pm = portalMessages.find(m => m.id === portalMsgId)
    if (!pm) return
    const pmTime = new Date(pm.created_at).getTime()
    const matchTypes = pm.sender_type === 'staff' ? ['staff_portal_reply'] : ['customer_message', 'customer_attachment']
    let bestId: string | null = null
    let bestDiff = Infinity
    for (const ev of [...evList, ...optimisticEvents]) {
      if (!matchTypes.includes(ev.type)) continue
      const diff = Math.abs(new Date(ev.created_at).getTime() - pmTime)
      if (diff < bestDiff) { bestDiff = diff; bestId = ev.id }
    }
    if (bestId && bestDiff < 60000) highlightEvent(bestId)
  }, [portalMessages, evList, optimisticEvents, highlightEvent])

  const filteredMentionUsers = mentionQuery !== null
    ? mentionUsers.filter(u => u.name.toLowerCase().includes(mentionQuery)).slice(0, 8)
    : []

  const insertMention = useCallback((user: UserOption) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart ?? commentText.length
    const textBefore = commentText.slice(0, cursor)
    const atIdx = textBefore.lastIndexOf('@')
    const token = `@[${user.name}]`
    const newText = commentText.slice(0, atIdx) + token + ' ' + commentText.slice(cursor)
    setCommentText(newText)
    setMentionQuery(null)
    const newCursor = atIdx + token.length + 1
    setTimeout(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor) }, 0)
  }, [commentText])

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setCommentText(val)
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@([a-zA-Z0-9 ]*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase())
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const handleSend = (text?: string) => {
    const rawText = (text ?? commentText).trim()
    if (!rawText || commenting) return
    if (text !== undefined) {
      // Retry path — text already contains any reply prefix
      addComment(rawText)
      return
    }
    const replyPrefix = replyToEvent ? `[reply:${replyToEvent.id}:${getEventPreview(replyToEvent)}]\n` : ''
    setReplyToEvent(null)
    addComment(replyPrefix + rawText)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % filteredMentionUsers.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + filteredMentionUsers.length) % filteredMentionUsers.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionUsers[mentionIndex]); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') setReplyToEvent(null)
  }

  const handleRetry = (ev: LocalOrderEvent) => {
    const text = ev.originalText ?? (ev.payload as Record<string, string>).text
    setOptimisticEvents(prev => prev.filter(e => e.id !== ev.id))
    if (text) handleSend(text)
  }

  // ── File upload ─────────────────────────────────────────────────────────────
  const runUpload = async (uid: string, file: File) => {
    if (!id) return
    const mime = resolveFileMime(file)
    try {
      const { upload_url, file_key, file_url } = await attachmentService.getUploadURL(id, file.name, mime, file.size)
      await attachmentService.uploadToR2(upload_url, file, mime, pct => {
        setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, progress: pct } : f))
      })
      await attachmentService.confirmUpload(id, {
        file_name: file.name, file_key, file_url, mime_type: mime, size_bytes: file.size,
      })
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, done: true, progress: 100 } : f))
      setTimeout(() => {
        setUploadingFiles(prev => {
          const entry = prev.find(f => f.id === uid)
          if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
          return prev.filter(f => f.id !== uid)
        })
      }, 1500)
    } catch {
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: 'Upload failed' } : f))
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    if (!id) return
    for (const file of Array.from(files)) {
      const mime = resolveFileMime(file)
      if (!ALLOWED_MIME_TYPES.includes(mime)) {
        alert(`"${file.name}" has an unsupported file type.`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds the 50 MB limit.`)
        continue
      }
      const uid = `upload-${Date.now()}-${Math.random()}`
      const previewUrl = isImage(mime) ? URL.createObjectURL(file) : undefined
      setUploadingFiles(prev => [...prev, { id: uid, name: file.name, mime, progress: 0, previewUrl, file }])
      runUpload(uid, file)
    }
  }

  const retryUpload = (uid: string) => {
    const entry = uploadingFiles.find(f => f.id === uid)
    if (!entry?.file) return
    setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: undefined, progress: 0 } : f))
    runUpload(uid, entry.file)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
  }

  // Must be called unconditionally before any early returns
  const perms = useOrderPermissions(order ?? null)

  const handleDeleteComment = (eventId: string) => setDeleteConfirmId(eventId)

  const confirmDelete = async () => {
    if (!id || !deleteConfirmId) return
    const eventId = deleteConfirmId
    const ev = evList.find(e => e.id === eventId)
    setDeleteConfirmId(null)
    await orderService.deleteComment(id, eventId)
    if (ev?.type === 'attachment_added') {
      const fileName = (ev.payload as any)?.file_name ?? ''
      setEvList(prev => prev.map(e => e.id === eventId
        ? { ...e, type: 'attachment_deleted', payload: { file_name: fileName } as any }
        : e
      ))
    } else {
      setEvList(prev => prev.filter(e => e.id !== eventId))
    }
  }

  if (orderLoading) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <Skeleton height={28} width={300} />
        <Skeleton height={18} width={200} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Skeleton height={24} width={90} borderRadius={999} />
          <Skeleton height={24} width={70} borderRadius={999} />
        </div>
      </div>
    )
  }

  if (!order) return null

  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium
  const due = order.due_date ? new Date(order.due_date + 'T00:00:00') : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dueOverdue = due && due < today

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: '#F5F6FA', overflow: 'hidden' }}>
      <style>{`
        .composer-input {
          flex: 1; border: none; background: transparent; outline: none;
          font-size: 14px; color: #111827; resize: none; font-family: inherit;
          line-height: 1.5;
        }
        .composer-input::placeholder { color: #9CA3AF; }
        .panel-status-opt {
          padding: 8px 12px; border-radius: 8px; cursor: pointer;
          font-size: 13px; font-weight: 500; transition: background 0.1s;
        }
        .panel-status-opt:hover { background: #F3F4F6; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Top header bar */}
      <div style={{
        background: '#FFFFFF', borderBottom: '1px solid #E4E6EF',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '4px 0' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div style={{ width: 1, height: 20, background: '#E4E6EF' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>{order.title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {/* Customer portal button */}
          {portal !== undefined && (
            portal ? (
              <button
                onClick={() => { if (portal.enabled) setShowPortalChat(true) }}
                title={portal.enabled ? 'Open customer portal chat' : 'Portal is revoked'}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: portal.enabled ? 'pointer' : 'default',
                  border: `1.5px solid ${portal.enabled ? '#A7F3D0' : '#E5E7EB'}`,
                  background: portal.enabled ? '#F0FDF4' : '#F9FAFB',
                  color: portal.enabled ? '#059669' : '#9CA3AF',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                {portal.enabled ? 'Portal Chat' : 'Portal (revoked)'}
              </button>
            ) : (
              <button
                onClick={async () => {
                  setPortalLoading(true)
                  try {
                    const p = await staffPortalApi.createPortal(id!, order.customer_name)
                    setPortal(p)
                  } finally {
                    setPortalLoading(false)
                  }
                }}
                disabled={portalLoading}
                title="Create customer portal link"
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: portalLoading ? 'default' : 'pointer',
                  border: '1.5px solid #A7F3D0', background: '#F0FDF4', color: '#059669',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                {portalLoading ? '…' : 'Create Portal'}
              </button>
            )
          )}
          {perms.canEditOrder && (
            <button
              onClick={() => setShowEdit(true)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E4E6EF',
                background: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Body: two columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — timeline + composer */}
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Timeline scroll area */}
          <div
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 8px', position: 'relative' }}
          >
            {/* Load older button */}
            {!eventsLoading && hasOlder && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  style={{
                    background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 20,
                    padding: '6px 16px', fontSize: 12.5, fontWeight: 600, color: '#6B7280',
                    cursor: loadingOlder ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {loadingOlder
                    ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Loading…</>
                    : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>Load older updates</>
                  }
                </button>
              </div>
            )}

            {eventsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Skeleton width={32} height={32} borderRadius="50%" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Skeleton width={120} height={13} />
                      <Skeleton width="70%" height={36} borderRadius={8} />
                    </div>
                  </div>
                ))}
              </div>
            ) : allEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>
                No activity yet. Be the first to leave a note.
              </div>
            ) : (() => {
              // Build att_id → caption map from customer_message events that have attachment tokens
              const portalAttCaptions = new Map<number, string>()
              for (const ev of allEvents) {
                if (ev.type !== 'customer_message') continue
                const rawText = (ev.payload as any)?.text ?? ''
                const tokens: number[] = []
                const textLines: string[] = []
                for (const line of (rawText as string).split('\n')) {
                  const att = line.match(/^\[attachment:(\d+):/)
                  if (att) { tokens.push(parseInt(att[1])); continue }
                  if (!line.match(/^\[reply:\d+\]$/)) textLines.push(line)
                }
                const caption = textLines.join('\n').trim()
                if (tokens.length > 0 && caption) {
                  for (const id of tokens) portalAttCaptions.set(id, caption)
                }
              }
              let newDividerInserted = false
              return groupByDate(allEvents).map(group => (
                <div key={group.label}>
                  <DateDivider label={group.label} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {group.events.map(ev => {
                      // Insert "new updates" divider before the first event newer than last_seen_at
                      let divider: React.ReactNode = null
                      if (
                        !newDividerInserted &&
                        new Date(ev.created_at) > new Date(newSinceAt ?? pageEnteredAt.current) &&
                        !ev.id.startsWith('opt-') &&
                        ev.actor_id !== user?.id
                      ) {
                        newDividerInserted = true
                        divider = (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                            <div style={{ flex: 1, height: 1, background: '#6366F1', opacity: 0.3 }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#6366F1', whiteSpace: 'nowrap', background: '#EEF2FF', padding: '2px 10px', borderRadius: 99 }}>
                              New updates
                            </span>
                            <div style={{ flex: 1, height: 1, background: '#6366F1', opacity: 0.3 }} />
                          </div>
                        )
                      }
                      const rawText = ev.type === 'comment_added' ? ((ev as any).payload?.text ?? '') : ''
                      const { replyEventId } = rawText ? parseCommentText(rawText) : { replyEventId: null }
                      const quotedEv = replyEventId ? allEvents.find(e => e.id === replyEventId) as LocalOrderEvent | undefined : undefined
                      const isHighlighted = highlightedEventId === ev.id
                      return (
                        <div key={ev.id}>
                          {divider}
                          <div
                            ref={(el) => { eventRefs.current[ev.id] = el }}
                            style={{
                              animation: 'fadeSlideIn 0.2s ease',
                              borderRadius: 8, padding: '2px 0',
                              background: isHighlighted ? 'rgba(99,102,241,0.1)' : 'transparent',
                              transition: 'background 0.5s',
                            }}
                          >
                            <TimelineEvent
                              event={ev as LocalOrderEvent}
                              isOptimistic={ev.id.startsWith('opt-')}
                              onRetry={() => handleRetry(ev as LocalOrderEvent)}
                              onDelete={perms.canDeleteComment && (ev.type === 'comment_added' || ev.type === 'attachment_added') ? () => handleDeleteComment(ev.id) : undefined}
                              onEdit={perms.canDeleteComment && ev.type === 'comment_added' ? async (newText: string) => {
                                await orderService.editComment(id!, ev.id, newText)
                                setEvList(prev => prev.map(e => e.id === ev.id ? { ...e, payload: { ...(e.payload as object), text: newText } as any } : e))
                              } : undefined}
                              onReply={(ev.type === 'comment_added' || ev.type === 'attachment_added' || ev.type === 'customer_message' || ev.type === 'customer_attachment' || ev.type === 'staff_portal_reply') && !ev.id.startsWith('opt-') ? () => handleSelectReplyEvent(ev as LocalOrderEvent) : undefined}
                              onHighlightQuoted={replyEventId ? () => highlightEvent(replyEventId) : undefined}
                              onHighlightPortalMsg={highlightPortalMsg}
                              quotedEvent={quotedEv ?? null}
                              orderId={id!}
                              portalAttachments={portalAttachments}
                              portalMessages={portalMessages}
                              portalAttCaptions={portalAttCaptions}
                              currentUserId={user?.id}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
            <div ref={feedEndRef} style={{ height: 16 }} />
          </div>

          {/* New updates badge */}
          {newCount > 0 && (
            <div style={{ position: 'relative', height: 0, overflow: 'visible' }}>
              <button
                onClick={scrollToBottom}
                style={{
                  position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                  background: '#6366F1', color: '#FFFFFF', border: 'none', borderRadius: 20,
                  padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 4px 12px rgba(99,102,241,.35)',
                  animation: 'fadeSlideIn 0.2s ease',
                  zIndex: 10,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                {newCount} new update{newCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* Upload progress pills */}
          {uploadingFiles.length > 0 && (
            <div style={{ padding: '6px 16px', display: 'flex', flexDirection: 'column', gap: 5, borderTop: '1px solid #F3F4F6', background: '#FAFAFA' }}>
              {uploadingFiles.map(f => {
                const fileIconColor = f.mime === 'application/pdf' ? '#EF4444'
                  : f.mime.includes('word') ? '#3B82F6'
                  : f.mime.includes('sheet') || f.mime.includes('excel') ? '#10B981'
                  : '#6B7280'
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 8,
                    background: f.done ? '#F0FDF4' : f.error ? '#FFF5F5' : '#FFFFFF',
                    border: `1px solid ${f.done ? '#BBF7D0' : f.error ? '#FCA5A5' : '#E5E7EB'}`,
                    transition: 'background 0.3s, border-color 0.3s',
                  }}>
                    {/* Thumbnail or type icon */}
                    {f.previewUrl ? (
                      <img src={f.previewUrl} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: fileIconColor + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={fileIconColor} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                    )}
                    <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    {f.done ? (
                      <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        Done
                      </span>
                    ) : f.error ? (
                      <>
                        <span style={{ fontSize: 11, color: '#EF4444', flexShrink: 0 }}>Failed</span>
                        <button onClick={() => retryUpload(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6366F1', fontWeight: 600, padding: '0 2px', flexShrink: 0 }}>Retry</button>
                        <button onClick={() => setUploadingFiles(prev => prev.filter(x => x.id !== f.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{f.progress}%</span>
                        <div style={{ width: 64, height: 4, background: '#E5E7EB', borderRadius: 9999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${f.progress}%`, background: '#6366F1', transition: 'width 0.2s' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Reply bar */}
          {replyToEvent && (
            <div style={{ padding: '6px 20px', background: '#FFFFFF', borderTop: '1px solid #F3F4F6', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: '3px solid #6366F1', background: '#EEF2FF', borderRadius: '0 6px 6px 0', overflow: 'hidden' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" style={{ flexShrink: 0, alignSelf: 'center', margin: '0 0 0 8px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                <div style={{ flex: 1, minWidth: 0, padding: '6px 8px' }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#6366F1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Replying to {(replyToEvent.type === 'customer_message' || replyToEvent.type === 'customer_attachment')
                      ? ((replyToEvent.payload as any).customer_name ?? 'Customer')
                      : replyToEvent.actor_name}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getEventPreview(replyToEvent)}
                  </p>
                </div>
                {(() => {
                  const thumb = getEventThumb(replyToEvent, portalAttachments)
                  if (!thumb) return null
                  return (
                    <div style={{ width: 44, height: 44, flexShrink: 0, overflow: 'hidden' }}>
                      <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    </div>
                  )
                })()}
                <button
                  onClick={() => setReplyToEvent(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0 8px', lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Composer */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {/* @mention dropdown */}
            {mentionQuery !== null && filteredMentionUsers.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 20, right: 20, marginBottom: 4,
                background: '#FFFFFF', borderRadius: 10, border: '1px solid #E5E7EB',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.12)', zIndex: 200,
                maxHeight: 220, overflowY: 'auto',
              }}>
                {filteredMentionUsers.map((u, i) => (
                  <button
                    key={u.id}
                    onMouseDown={e => { e.preventDefault(); insertMention(u) }}
                    onMouseEnter={() => setMentionIndex(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '8px 14px',
                      background: i === mentionIndex ? '#F5F3FF' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: '#0F172A', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(u.name)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          <div
            style={{
              borderTop: '1px solid #E4E6EF', background: isDragging ? '#EEF2FF' : '#FFFFFF', padding: '14px 20px',
              display: 'flex', gap: 12, alignItems: 'center',
              transition: 'background 0.15s',
            }}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={[...ALLOWED_MIME_TYPES, '.cdr', '.dxf', '.psd', '.tiff', '.tif', '.svg', '.bmp', '.gif', '.zip'].join(',')}
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              style={{
                width: 38, height: 38, borderRadius: 10, border: '1.5px solid #E4E6EF',
                background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6B7280', flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366F1')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#E4E6EF')}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <div style={{
              flex: 1, background: '#F9FAFB', border: `1.5px solid ${isDragging ? '#6366F1' : '#E4E6EF'}`, borderRadius: 10,
              padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8,
              transition: 'border-color 0.15s',
            }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = '#6366F1')}
            onBlurCapture={e => { if (!isDragging) e.currentTarget.style.borderColor = '#E4E6EF' }}
            >
              {isDragging
                ? <div style={{ fontSize: 13, color: '#6366F1', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>Drop files here to upload</div>
                : <textarea
                    ref={textareaRef}
                    className="composer-input"
                    rows={2}
                    placeholder="Write an update… (@mention, Enter to send, Shift+Enter for new line)"
                    value={commentText}
                    onChange={handleCommentChange}
                    onKeyDown={handleKeyDown}
                  />
              }
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!commentText.trim() || commenting}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: commentText.trim() && !commenting ? '#6366F1' : '#E4E6EF',
                color: commentText.trim() && !commenting ? '#FFFFFF' : '#9CA3AF',
                fontSize: 13, fontWeight: 600,
                cursor: commentText.trim() && !commenting ? 'pointer' : 'default',
                transition: 'all 0.15s', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                minWidth: 90,
              }}
            >
              {commenting ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Send
                </>
              )}
            </button>
          </div>
          </div>
        </div>

        {/* RIGHT — metadata panel */}
        <div style={{
          width: 260, flexShrink: 0, borderLeft: '1px solid #E4E6EF', background: '#FFFFFF',
          overflowY: 'auto', padding: '24px 20px',
        }}>

          <PanelSection label="Customer">
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.customer_name}</div>
            {order.contact_number && (
              <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>{order.contact_number}</div>
            )}
          </PanelSection>

          <PanelSection label="Status">
            {perms.canChangeStatus
              ? <StatusDropdown order={order} onUpdate={s => updateStatus({ id: order.id, status: s })} />
              : <span style={chip(sm)}>{sm.label}</span>
            }
          </PanelSection>

          <PanelSection label="Priority">
            <span style={chip(pm)}>{pm.label}</span>
          </PanelSection>

          {order.assigned_names && order.assigned_names.length > 0 && (
            <PanelSection label="Assigned to">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {order.assigned_names.map((name, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(name)}
                    </div>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{name}</span>
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {due && (
            <PanelSection label="Due date">
              <span style={{ fontSize: 13, fontWeight: 600, color: dueOverdue ? '#EF4444' : '#111827' }}>
                {formatDate(order.due_date)}
                {order.due_time && ` · ${fmt12hrStr(order.due_time)}`}
                {dueOverdue && ' · Overdue'}
              </span>
            </PanelSection>
          )}

          <PanelSection label="Created by">
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{order.created_by_name}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              {formatDate(order.created_at)}
            </div>
          </PanelSection>

          {order.description && (
            <PanelSection label="Description">
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{order.description}</p>
            </PanelSection>
          )}

          <PanelSection label="Customer Portal">
            {portal === undefined ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>
            ) : portal === null ? (
              <button
                disabled={portalLoading}
                onClick={async () => {
                  setPortalLoading(true)
                  try {
                    const p = await staffPortalApi.createPortal(id!, order.customer_name)
                    setPortal(p)
                  } finally {
                    setPortalLoading(false)
                  }
                }}
                style={{
                  width: '100%', fontSize: 12, fontWeight: 600, padding: '7px 0', borderRadius: 6,
                  background: '#F0FDF4', color: '#10B981', border: '1px solid #A7F3D0', cursor: portalLoading ? 'default' : 'pointer',
                }}
              >
                {portalLoading ? '…' : '+ Create portal link'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: portal.enabled ? '#10B981' : '#9CA3AF',
                  }} />
                  <span style={{ fontSize: 12, color: portal.enabled ? '#10B981' : '#9CA3AF', fontWeight: 600 }}>
                    {portal.enabled ? 'Active' : 'Revoked'}
                  </span>
                </div>
                {portal.enabled && (
                  <button
                    onClick={() => {
                      const url = getPortalURL(portal.token)
                      navigator.clipboard.writeText(url).then(() => {
                        setPortalCopied(true)
                        setTimeout(() => setPortalCopied(false), 2000)
                      })
                    }}
                    style={{
                      fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 6,
                      background: portalCopied ? '#ECFDF5' : '#F9FAFB',
                      color: portalCopied ? '#10B981' : '#374151',
                      border: `1px solid ${portalCopied ? '#A7F3D0' : '#E5E7EB'}`,
                      cursor: 'pointer', width: '100%', textAlign: 'left' as const,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {portalCopied ? '✓ Copied!' : '📋 Copy portal link'}
                  </button>
                )}
<div style={{ display: 'flex', gap: 6 }}>
                  <button
                    disabled={portalLoading}
                    onClick={async () => {
                      setPortalLoading(true)
                      try {
                        const p = await staffPortalApi.regenerateToken(id!)
                        setPortal(p)
                      } finally {
                        setPortalLoading(false)
                      }
                    }}
                    style={{
                      flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6,
                      background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE', cursor: 'pointer',
                    }}
                  >
                    Regenerate
                  </button>
                  <button
                    disabled={portalLoading}
                    onClick={async () => {
                      if (!portal.enabled) return
                      setPortalLoading(true)
                      try {
                        await staffPortalApi.revokePortal(id!)
                        setPortal(p => p ? { ...p, enabled: false } : p)
                      } finally {
                        setPortalLoading(false)
                      }
                    }}
                    style={{
                      flex: 1, fontSize: 11, fontWeight: 600, padding: '5px 0', borderRadius: 6,
                      background: portal.enabled ? '#FEF2F2' : '#F3F4F6',
                      color: portal.enabled ? '#EF4444' : '#9CA3AF',
                      border: `1px solid ${portal.enabled ? '#FECACA' : '#E5E7EB'}`,
                      cursor: portal.enabled ? 'pointer' : 'default',
                    }}
                  >
                    {portal.enabled ? 'Revoke' : 'Revoked'}
                  </button>
                </div>
              </div>
            )}
          </PanelSection>

          {/* Archive */}
          {perms.canArchive && !order.is_archived && (
            <PanelSection label="Archive Order">
              <button
                onClick={() => setShowArchiveConfirm(true)}
                style={{
                  width: '100%', fontSize: 12, fontWeight: 600, padding: '7px 0', borderRadius: 6,
                  background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', cursor: 'pointer',
                }}
              >
                Archive Order
              </button>
            </PanelSection>
          )}

          {order.is_archived && (
            <PanelSection label="Archive Order">
              <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '4px 0' }}>
                Archived{order.archived_by_name ? ` by ${order.archived_by_name}` : ''}
              </div>
            </PanelSection>
          )}
        </div>
      </div>

      {showPortalChat && portal && (
        <StaffPortalChatModal
          orderId={order.id}
          portal={portal}
          onClose={() => setShowPortalChat(false)}
        />
      )}

      {showEdit && (
        <OrderModal
          key={order.id}
          order={order}
          canReassign={perms.canReassign}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['orders', id] })
            qc.invalidateQueries({ queryKey: ['orders'] })
          }}
        />
      )}

      {deleteConfirmId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 14, padding: '28px 28px 22px',
              width: 320, boxShadow: '0 8px 32px rgba(0,0,0,.14)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Delete comment?</div>
            <div style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
              This comment will be permanently removed and cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E4E6EF',
                  background: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#FFFFFF',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveConfirm && order && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => setShowArchiveConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 14, padding: '28px 28px 22px',
              width: 360, boxShadow: '0 8px 32px rgba(0,0,0,.14)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Archive this order?</div>
            <div style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6 }}>
              <strong>#{order.title}</strong> will be removed from active lists and the dashboard. Admins can restore it from Trash.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowArchiveConfirm(false)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E4E6EF',
                  background: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                disabled={archiving}
                onClick={async () => {
                  setArchiving(true)
                  try {
                    await orderService.archiveOrder(order.id)
                    navigate(-1)
                  } catch {
                    setArchiving(false)
                    setShowArchiveConfirm(false)
                  }
                }}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#EF4444', fontSize: 13, fontWeight: 600,
                  cursor: archiving ? 'default' : 'pointer', color: '#FFFFFF',
                  opacity: archiving ? 0.7 : 1,
                }}
              >
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
