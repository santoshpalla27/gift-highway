import { useState, useRef, useEffect, useCallback } from 'react'
import { formatTime } from '../../../utils/date'
import { useParams } from 'react-router-dom'
import {
  publicPortalApi,
  type PortalInfo,
  type PortalMessage,
  type PortalAttachment,
} from '../../../services/portalService'

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'Working',
  completed: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-600',
  completed: 'bg-emerald-100 text-emerald-700',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImageType = (ext: string) =>
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(ext.toLowerCase())

interface StagedFile {
  file: File
  preview: string | null
  caption: string
  uploading: boolean
  progress: number
  error: string | null
}

interface ParsedMsg {
  text: string
  replyToId: number | null
  attachmentTokens: { id: number; name: string }[]
}

function parseMsg(raw: string): ParsedMsg {
  const result: ParsedMsg = { text: '', replyToId: null, attachmentTokens: [] }
  const lines = raw.split('\n')
  const textLines: string[] = []
  for (const line of lines) {
    const att = line.match(/^\[attachment:(\d+):(.+?)\]$/)
    if (att) { result.attachmentTokens.push({ id: parseInt(att[1]), name: att[2] }); continue }
    const reply = line.match(/^\[reply:(\d+)\]$/)
    if (reply) { result.replyToId = parseInt(reply[1]); continue }
    if (!textLines.length && result.attachmentTokens.length === 0 && !line.trim()) continue
    textLines.push(line)
  }
  result.text = textLines.join('\n').trim()
  return result
}

function getMsgPreview(msg: PortalMessage): string {
  const parsed = parseMsg(msg.message)
  if (parsed.text) return parsed.text.slice(0, 80)
  if (parsed.attachmentTokens.length) return `📎 ${parsed.attachmentTokens[0].name}`
  return msg.message.slice(0, 80)
}

function getMsgThumbnail(msg: PortalMessage, attachments: PortalAttachment[]): string | null {
  const parsed = parseMsg(msg.message)
  for (const tok of parsed.attachmentTokens) {
    const att = attachments.find(a => a.id === tok.id)
    if (att && isImageType(att.file_type) && att.view_url) return att.view_url
  }
  return null
}

// ── Icons ────────────────────────────────────────────────────────────────────
function SendIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
}
function PaperclipIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
}
function XIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
function ReplyIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
}
function InfoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" /></svg>
}
function ChevronDown({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
}
function ChevronUp({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [portal, setPortal] = useState<PortalInfo | null>(null)
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [attachments, setAttachments] = useState<PortalAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [textInput, setTextInput] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [lightbox, setLightbox] = useState<{ src: string; filename: string; attId: number } | null>(null)
  const [deletingAttId, setDeletingAttId] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [replyTo, setReplyTo] = useState<PortalMessage | null>(null)
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const msgSwipeRef = useRef<{ id: number; startX: number; startY: number } | null>(null)
  const [swipeState, setSwipeState] = useState<{ id: number; offset: number } | null>(null)
  const wasSwipedRef = useRef(false)
  const swipeCapturedRef = useRef(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragCounter = useRef(0)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!token) return
    Promise.all([
      publicPortalApi.getPortal(token),
      publicPortalApi.getMessages(token),
      publicPortalApi.getAttachments(token),
    ]).then(([p, msgs, atts]) => {
      const safeMsgs = msgs ?? []
      const safeAtts = atts ?? []
      setPortal(p)
      setMessages(safeMsgs)
      setAttachments(safeAtts)
      if (safeMsgs.length) lastMsgIdRef.current = safeMsgs[safeMsgs.length - 1].id
    }).catch((err) => {
      const msg = err?.response?.data?.error || 'Failed to load order information.'
      setError(msg)
    }).finally(() => setLoading(false))
  }, [token])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { if (replyTo) textareaRef.current?.focus() }, [replyTo])

  // Poll for new messages every 3s (catches staff replies in real-time)
  const lastMsgIdRef = useRef<number>(0)
  useEffect(() => {
    if (!token || loading) return
    const interval = setInterval(async () => {
      try {
        const msgs = await publicPortalApi.getMessages(token)
        if (!msgs?.length) return
        const newest = msgs[msgs.length - 1]
        if (newest.id > lastMsgIdRef.current) {
          lastMsgIdRef.current = newest.id
          setMessages(msgs)
        }
      } catch (_) {}
    }, 3000)
    return () => clearInterval(interval)
  }, [token, loading])

  const highlightMessage = useCallback((msgId: number) => {
    const el = messageRefs.current[msgId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    setHighlightedMsgId(msgId)
    highlightTimer.current = setTimeout(() => setHighlightedMsgId(null), 5000)
  }, [])

  const handleSelectReply = useCallback((msg: PortalMessage) => {
    setReplyTo(msg)
    const el = messageRefs.current[msg.id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 800)
    }
    setTimeout(() => textareaRef.current?.focus(), 900)
  }, [])

  const stageFiles = (files: File[]) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.docx', '.doc', '.xlsx', '.txt', '.csv', '.zip']
    const valid = files.filter(f => allowed.includes('.' + f.name.split('.').pop()?.toLowerCase()))
    if (!valid.length) return
    const newStaged: StagedFile[] = valid.map(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return { file: f, preview: isImageType(ext) ? URL.createObjectURL(f) : null, caption: '', uploading: false, progress: 0, error: null }
    })
    setStagedFiles(prev => [...prev, ...newStaged])
  }

  const removeStagedFile = (idx: number) => {
    setStagedFiles(prev => {
      const copy = [...prev]
      if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!)
      copy.splice(idx, 1)
      return copy
    })
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++ }
  const handleDragLeave = () => { dragCounter.current-- }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0
    stageFiles(Array.from(e.dataTransfer.files))
  }

  const captionSwipe = useRef<{ x: number; idx: number } | null>(null)
  const handleCaptionTouchStart = (e: React.TouchEvent, idx: number) => {
    captionSwipe.current = { x: e.touches[0].clientX, idx }
  }
  const handleCaptionTouchEnd = (e: React.TouchEvent, idx: number) => {
    if (!captionSwipe.current || captionSwipe.current.idx !== idx) return
    if (Math.abs(e.changedTouches[0].clientX - captionSwipe.current.x) > 60)
      document.getElementById(`caption-${idx}`)?.focus()
    captionSwipe.current = null
  }

  const handleMsgPointerDown = (e: React.PointerEvent, msg: PortalMessage) => {
    if ((e.target as HTMLElement).closest('button')) return
    wasSwipedRef.current = false
    swipeCapturedRef.current = false
    msgSwipeRef.current = { id: msg.id, startX: e.clientX, startY: e.clientY }
  }
  const handleMsgPointerMove = (e: React.PointerEvent, msg: PortalMessage) => {
    if (!msgSwipeRef.current || msgSwipeRef.current.id !== msg.id) return
    const dx = e.clientX - msgSwipeRef.current.startX
    const dy = e.clientY - msgSwipeRef.current.startY
    if (Math.abs(dy) > Math.abs(dx) + 10) { msgSwipeRef.current = null; setSwipeState(null); return }
    if (Math.abs(dx) > 8) {
      if (!swipeCapturedRef.current) {
        swipeCapturedRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }
      e.preventDefault()
      setSwipeState({ id: msg.id, offset: Math.max(-80, Math.min(80, dx)) })
    }
  }
  const handleMsgPointerUp = (msg: PortalMessage) => {
    if (swipeState && Math.abs(swipeState.offset) > 50) {
      wasSwipedRef.current = true
      handleSelectReply(msg)
    }
    setSwipeState(null)
    msgSwipeRef.current = null
  }

  const uploadFile = async (sf: StagedFile, idx: number): Promise<number | null> => {
    if (!token) return null
    setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true, progress: 0, error: null } : f))
    try {
      const presign = await publicPortalApi.getUploadURL(token, sf.file.name)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', presign.upload_url)
        xhr.setRequestHeader('Content-Type', presign.content_type)
        xhr.upload.onprogress = (e) => {
          if (e.total) setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, progress: Math.round(e.loaded / e.total * 100) } : f))
        }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(sf.file)
      })
      const ext = '.' + sf.file.name.split('.').pop()?.toLowerCase()
      const confirmed = await publicPortalApi.confirmAttachment(token, {
        s3_key: presign.s3_key, file_name: sf.file.name, file_size: sf.file.size, file_type: ext,
      })
      setAttachments(prev => [...prev, confirmed])
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, progress: 100 } : f))
      return confirmed.id
    } catch (err: any) {
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: err.message || 'Upload failed' } : f))
      return null
    }
  }

  const handleSend = async () => {
    if (!token || sendingRef.current) return
    if (stagedFiles.length === 0 && !textInput.trim()) return
    sendingRef.current = true
    setSending(true)
    const replyPrefix = replyTo ? `[reply:${replyTo.id}]\n` : ''
    try {
      if (textInput.trim()) {
        const sent = await publicPortalApi.sendMessage(token, replyPrefix + textInput.trim())
        setMessages(prev => [...prev, sent])
      }
      for (let i = 0; i < stagedFiles.length; i++) {
        const id = await uploadFile(stagedFiles[i], i)
        if (id) {
          const captionLine = stagedFiles[i].caption.trim() ? `${stagedFiles[i].caption.trim()}\n` : ''
          const sent = await publicPortalApi.sendMessage(token, replyPrefix + captionLine + `[attachment:${id}:${stagedFiles[i].file.name}]`)
          setMessages(prev => [...prev, sent])
        }
      }
      stagedFiles.forEach(sf => { if (sf.preview) URL.revokeObjectURL(sf.preview) })
      setStagedFiles([])
      setTextInput('')
      setReplyTo(null)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') setReplyTo(null)
  }

  const QuotedBlock = ({ quotedMsg, onClick }: { quotedMsg: PortalMessage; onClick?: () => void }) => {
    const thumb = getMsgThumbnail(quotedMsg, attachments)
    const isStaff = quotedMsg.sender_type === 'staff'
    return (
      <div
        className={`flex items-stretch gap-0 rounded-lg overflow-hidden border-l-4 ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}
        style={{ background: 'rgba(0,0,0,0.06)', borderColor: isStaff ? '#3B82F6' : '#25d366' }}
        onClick={onClick}
      >
        <div className="flex-1 min-w-0 px-2.5 py-1.5">
          <p className="text-[10px] font-semibold truncate" style={{ color: isStaff ? '#3B82F6' : '#25d366' }}>{quotedMsg.portal_sender}</p>
          <p className="text-xs truncate" style={{ color: '#667781' }}>{getMsgPreview(quotedMsg)}</p>
        </div>
        {thumb && (
          <div className="w-12 h-12 flex-shrink-0 overflow-hidden">
            <img src={thumb} alt="preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#efeae2' }}>
        <div className="w-8 h-8 border-2 border-[#25d366]/30 border-t-[#25d366] rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !portal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: '#efeae2' }}>
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <XIcon className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800">Link Unavailable</h1>
        <p className="text-gray-500 text-sm text-center max-w-sm">
          {error || 'This customer link is invalid or has been revoked.'}
        </p>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col max-w-2xl mx-auto" style={{ background: '#efeae2' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-sm bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#25d366] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {(portal.customer_name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{portal.customer_name || 'Customer'}</p>
              <p className="text-xs text-gray-500">Order support chat</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setInfoOpen(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="How to use"
            >
              <InfoIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDetailsOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100"
            >
              {detailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Details
            </button>
          </div>
        </div>
        {detailsOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-gray-200 space-y-2 shadow-inner bg-gray-50">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Customer</p>
                <p className="text-sm text-gray-900 font-medium">{portal.customer_name || 'Customer'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Status</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                  Active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 sm:py-3 space-y-1 overflow-x-hidden"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ color: '#667781' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(37,211,102,0.1)' }}>
              <svg className="w-8 h-8 opacity-60" style={{ color: '#25d366' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm">Send a message or upload files</p>
            <p className="text-xs opacity-60">You can also drag & drop files here</p>
          </div>
        )}

        {messages.map((msg) => {
          const parsed = parseMsg(msg.message)
          const quotedMsg = parsed.replyToId ? messages.find(m => m.id === parsed.replyToId) : null
          const swipeOffset = swipeState?.id === msg.id ? swipeState.offset : 0
          const isHighlighted = highlightedMsgId === msg.id
          const isStaff = msg.sender_type === 'staff'

          const hasVisibleContent = parsed.text ||
            parsed.attachmentTokens.some(tok => attachments.find(a => a.id === tok.id))
          if (!hasVisibleContent) return null

          return (
            <div
              key={msg.id}
              ref={(el) => { messageRefs.current[msg.id] = el }}
              className="rounded-lg transition-colors duration-500"
              style={{ background: isHighlighted ? 'rgba(37,211,102,0.22)' : 'transparent' }}
            >
              <div
                className={`flex ${isStaff ? 'justify-start' : 'justify-end'} items-center gap-1.5 group py-0.5 select-none`}
                onPointerDown={(e) => handleMsgPointerDown(e, msg)}
                onPointerMove={(e) => handleMsgPointerMove(e, msg)}
                onPointerUp={() => handleMsgPointerUp(msg)}
                onPointerCancel={() => { setSwipeState(null); msgSwipeRef.current = null }}
                onDragStart={(e) => e.preventDefault()}
                style={{ touchAction: 'pan-y' }}
              >
                {/* Staff avatar */}
                {isStaff && (
                  <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 self-end mb-1">
                    {msg.portal_sender.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Reply button (left side for customer, right for staff) */}
                {!isStaff && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleSelectReply(msg)}
                    className="opacity-100 transition-opacity p-1.5 rounded-full flex-shrink-0 hover:bg-black/10"
                    title="Reply"
                  >
                    <ReplyIcon className="w-4 h-4 text-[#667781]" />
                  </button>
                )}

                <div
                  className="max-w-[88%] sm:max-w-[80%]"
                  style={{
                    transform: `translateX(${swipeOffset}px)`,
                    transition: swipeState?.id === msg.id ? 'none' : 'transform 0.2s ease',
                  }}
                >
                  {isStaff && (
                    <p className="text-[10px] text-gray-500 mb-0.5 ml-1">{msg.portal_sender}</p>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 shadow-sm ${isStaff ? 'rounded-tl-sm' : 'rounded-tr-sm'}`}
                    style={{ background: isStaff ? '#ffffff' : '#d9fdd3' }}
                  >
                    {quotedMsg && (
                      <div className="mb-2">
                        <QuotedBlock quotedMsg={quotedMsg} onClick={() => highlightMessage(quotedMsg.id)} />
                      </div>
                    )}
                    {parsed.text && (
                      <p className="text-sm whitespace-pre-wrap" style={{ color: '#111b21' }}>{parsed.text}</p>
                    )}
                    {parsed.attachmentTokens.map((tok) => {
                      const att = attachments.find(a => a.id === tok.id)
                      const attIsImage = att ? isImageType(att.file_type) : false
                      const attUrl = att?.view_url || ''
                      return (
                        <div key={tok.id}>
                          {att && attIsImage && attUrl && (
                            <div
                              className="mt-2 rounded-xl overflow-hidden cursor-pointer w-full max-w-[180px] aspect-square"
                              onClick={() => !wasSwipedRef.current && setLightbox({ src: attUrl, filename: att.file_name, attId: att.id })}
                            >
                              <img src={attUrl} alt={att.file_name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          {att && !attIsImage && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(0,0,0,0.06)' }}>
                              <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#667781' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="text-xs truncate" style={{ color: '#111b21' }}>{att.file_name}</span>
                              <span className="text-[10px] flex-shrink-0" style={{ color: '#667781' }}>{formatSize(att.file_size)}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-[10px] text-right mt-0.5" style={{ color: '#667781' }}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>

                {/* Reply button for staff messages */}
                {isStaff && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleSelectReply(msg)}
                    className="opacity-100 transition-opacity p-1.5 rounded-full flex-shrink-0 hover:bg-black/10"
                    title="Reply"
                  >
                    <ReplyIcon className="w-4 h-4 text-[#667781]" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Staged files */}
      {stagedFiles.length > 0 && (
        <div className="border-t px-3 py-2 space-y-2 max-h-48 overflow-y-auto flex-shrink-0" style={{ background: '#f0f2f5', borderColor: '#d1d7db' }}>
          <p className="text-xs mb-1" style={{ color: '#667781' }}>Files to send</p>
          {stagedFiles.map((sf, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-xl p-2.5 border"
              style={{ background: '#ffffff', borderColor: '#d1d7db' }}
              onTouchStart={(e) => handleCaptionTouchStart(e, idx)}
              onTouchEnd={(e) => handleCaptionTouchEnd(e, idx)}
            >
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: '#e9edef' }}>
                {sf.preview
                  ? <img src={sf.preview} alt={sf.file.name} className="w-full h-full object-cover" />
                  : <svg className="w-6 h-6" style={{ color: '#667781' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs truncate" style={{ color: '#111b21' }}>{sf.file.name}</p>
                <p className="text-[10px]" style={{ color: '#667781' }}>{formatSize(sf.file.size)}</p>
                <input
                  id={`caption-${idx}`}
                  type="text"
                  value={sf.caption}
                  onChange={(e) => setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, caption: e.target.value } : f))}
                  placeholder="Add a caption… (optional)"
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                  style={{ background: '#f0f2f5', border: '1px solid #d1d7db', color: '#111b21' }}
                />
                {sf.uploading && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#d1d7db' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${sf.progress}%`, background: '#25d366' }} />
                  </div>
                )}
                {sf.error && <p className="text-[10px] text-red-500">{sf.error}</p>}
              </div>
              <button onClick={() => removeStagedFile(idx)} className="p-1 rounded-full transition-colors flex-shrink-0 hover:bg-gray-100">
                <XIcon className="w-4 h-4 text-[#667781]" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t flex-shrink-0" style={{ background: '#f0f2f5', borderColor: '#d1d7db' }}>
          <ReplyIcon className="w-4 h-4 flex-shrink-0 text-[#25d366]" />
          <div className="flex-1 min-w-0">
            <QuotedBlock quotedMsg={replyTo} />
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-gray-200 flex-shrink-0 ml-1">
            <XIcon className="w-4 h-4 text-[#667781]" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="px-2 sm:px-3 py-2 sm:py-2.5 flex items-end gap-1.5 sm:gap-2 flex-shrink-0" style={{ background: '#f0f2f5' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv,.zip"
          className="hidden"
          onChange={(e) => { if (e.target.files) { stageFiles(Array.from(e.target.files)); e.target.value = '' } }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-full transition-colors flex-shrink-0 hover:bg-gray-200"
          style={{ color: '#667781' }}
          title="Attach files"
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm focus:outline-none resize-none overflow-hidden"
          style={{ minHeight: 44, maxHeight: 120, background: '#ffffff', color: '#111b21', border: 'none' }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`
          }}
        />

        <button
          onClick={handleSend}
          disabled={sending || (stagedFiles.length === 0 && !textInput.trim())}
          className="p-2.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0"
          style={{ background: '#25d366' }}
          title="Send"
        >
          {sending
            ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <SendIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Info popup */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setInfoOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#25d366]/10 flex items-center justify-center">
                  <InfoIcon className="w-4 h-4 text-[#25d366]" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">How to use this chat</h3>
              </div>
              <button onClick={() => setInfoOpen(false)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                <XIcon className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3.5">
              {[
                { icon: '💬', title: 'Send messages', desc: 'Type in the box at the bottom and press Send or hit Enter.' },
                { icon: '📎', title: 'Attach files', desc: 'Tap the paperclip icon to attach images, PDFs, or documents. You can also drag & drop files.' },
                { icon: '↩️', title: 'Reply to a message', desc: 'Swipe a message left or right, or tap the reply arrow, to quote it in your response.' },
                { icon: '🖼️', title: 'View images', desc: 'Tap any image thumbnail to open a full-screen viewer with download options.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5 flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setInfoOpen(false)} className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors" style={{ background: '#25d366' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setLightbox(null); setConfirmingDelete(false) } }}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.filename} className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <a href={lightbox.src} download={lightbox.filename} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Download" onClick={(e) => e.stopPropagation()}>
                <svg className="w-5 h-5 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </a>
              <a href={lightbox.src} target="_blank" rel="noreferrer" className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Open in new tab" onClick={(e) => e.stopPropagation()}>
                <svg className="w-5 h-5 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <button onClick={() => { setLightbox(null); setConfirmingDelete(false) }} className="bg-white/90 backdrop-blur-sm p-2 rounded-lg hover:bg-white transition-colors shadow-lg" title="Close">
                <XIcon className="w-5 h-5 text-gray-800" />
              </button>
            </div>
          </div>

          {confirmingDelete && (
            <div className="absolute inset-0 flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-full max-w-xs">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Delete this file?</h3>
                <p className="text-sm text-gray-500 mb-5">This can't be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmingDelete(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                  <button
                    disabled={!!deletingAttId}
                    onClick={async () => {
                      if (!token || !lightbox) return
                      setDeletingAttId(lightbox.attId)
                      try {
                        // Customer can delete their own attachments via portal API
                        // This uses the public portal token; backend deletes by attachment ID
                        await fetch(`/api/portal/${token}/attachments/${lightbox.attId}`, { method: 'DELETE' })
                        setAttachments(prev => prev.filter(a => a.id !== lightbox.attId))
                        setLightbox(null)
                        setConfirmingDelete(false)
                      } finally {
                        setDeletingAttId(null)
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-medium text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {deletingAttId ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

