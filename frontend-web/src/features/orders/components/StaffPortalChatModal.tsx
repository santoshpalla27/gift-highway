import { useState, useRef, useEffect, useCallback } from 'react'
import { formatTime } from '../../../utils/date'
import { staffPortalApi, getPortalURL, type PortalMessage, type PortalAttachment, type PortalStatus } from '../../../services/portalService'
import { useSocketEvent } from '../../../providers/SocketProvider'

interface Props {
  orderId: string
  portal: PortalStatus
  onClose: () => void
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImageType = (ext: string) =>
  ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(ext.toLowerCase())

interface ParsedMsg {
  text: string
  replyToId: number | null
  attachmentTokens: { id: number; name: string }[]
}

function parseMsg(raw: string): ParsedMsg {
  const result: ParsedMsg = { text: '', replyToId: null, attachmentTokens: [] }
  const textLines: string[] = []
  for (const line of raw.split('\n')) {
    const att = line.match(/^\[attachment:(\d+):(.+?)\]$/)
    if (att) { result.attachmentTokens.push({ id: parseInt(att[1]), name: att[2] }); continue }
    const reply = line.match(/^\[reply:(\d+)\]$/)
    if (reply) { result.replyToId = parseInt(reply[1]); continue }
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

function getMsgThumbnail(msg: PortalMessage, atts: PortalAttachment[]): string | null {
  const parsed = parseMsg(msg.message)
  for (const tok of parsed.attachmentTokens) {
    const att = atts.find(a => a.id === tok.id)
    if (att && isImageType(att.file_type) && att.view_url) return att.view_url
  }
  return null
}

interface StagedFile {
  file: File
  preview: string | null
  uploading: boolean
  progress: number
  error: string | null
}

export function StaffPortalChatModal({ orderId, portal, onClose }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [attachments, setAttachments] = useState<PortalAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [lightbox, setLightbox] = useState<{ src: string; filename: string } | null>(null)
  const [replyTo, setReplyTo] = useState<PortalMessage | null>(null)
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null)

  const sendingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastMsgIdRef = useRef(0)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    Promise.all([
      staffPortalApi.getMessages(orderId),
      staffPortalApi.listAttachments(orderId),
    ]).then(([msgs, atts]) => {
      const safe = msgs ?? []
      setMessages(safe)
      setAttachments(atts ?? [])
      if (safe.length) lastMsgIdRef.current = safe[safe.length - 1].id
    }).finally(() => setLoading(false))
  }, [orderId])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { if (!loading) textareaRef.current?.focus() }, [loading])

  useEffect(() => {
    if (loading) return
    const interval = setInterval(async () => {
      try {
        const [msgs, atts] = await Promise.all([
          staffPortalApi.getMessages(orderId),
          staffPortalApi.listAttachments(orderId),
        ])
        const safe = msgs ?? []
        if (safe.length && safe[safe.length - 1].id > lastMsgIdRef.current) {
          lastMsgIdRef.current = safe[safe.length - 1].id
          setMessages(safe)
          setAttachments(atts ?? [])
        }
      } catch (_) {}
    }, 3000)
    return () => clearInterval(interval)
  }, [orderId, loading])

  useSocketEvent((event: any) => {
    if (event.type !== 'order.event_added' || event.entity_id !== orderId) return
    const payload = event.payload as any
    if (payload?.type === 'customer_message') {
      Promise.all([
        staffPortalApi.getMessages(orderId),
        staffPortalApi.listAttachments(orderId),
      ]).then(([msgs, atts]) => {
        const safe = msgs ?? []
        if (safe.length && safe[safe.length - 1].id > lastMsgIdRef.current) {
          lastMsgIdRef.current = safe[safe.length - 1].id
          setMessages(safe)
          setAttachments(atts ?? [])
        }
      }).catch(() => {})
    }
  })

  const QuotedBlock = ({ quotedMsg, onClick }: { quotedMsg: PortalMessage; onClick?: () => void }) => {
    const thumb = getMsgThumbnail(quotedMsg, attachments)
    const isQStaff = quotedMsg.sender_type === 'staff'
    return (
      <div
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden',
          borderLeft: `3px solid ${isQStaff ? '#3B82F6' : '#25d366'}`,
          background: 'rgba(0,0,0,0.06)',
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, padding: '4px 8px' }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isQStaff ? '#3B82F6' : '#25d366' }}>
            {quotedMsg.portal_sender}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {getMsgPreview(quotedMsg)}
          </p>
        </div>
        {thumb && (
          <div style={{ width: 44, height: 44, flexShrink: 0, overflow: 'hidden' }}>
            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
      </div>
    )
  }

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
    const valid = files.filter(f => allowed.includes('.' + (f.name.split('.').pop() ?? '').toLowerCase()))
    if (!valid.length) return
    setStagedFiles(prev => [...prev, ...valid.map(f => {
      const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
      return { file: f, preview: isImageType(ext) ? URL.createObjectURL(f) : null, uploading: false, progress: 0, error: null }
    })])
  }

  const removeStagedFile = (idx: number) => {
    setStagedFiles(prev => {
      const copy = [...prev]
      if (copy[idx].preview) URL.revokeObjectURL(copy[idx].preview!)
      copy.splice(idx, 1)
      return copy
    })
  }

  const uploadFile = async (sf: StagedFile, idx: number): Promise<PortalAttachment | null> => {
    setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true, progress: 0, error: null } : f))
    try {
      const presign = await staffPortalApi.getAttachmentUploadURL(orderId, sf.file.name)
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
      const ext = '.' + (sf.file.name.split('.').pop() ?? '').toLowerCase()
      const confirmed = await staffPortalApi.confirmAttachment(orderId, {
        s3_key: presign.s3_key,
        file_name: sf.file.name,
        file_type: ext,
        file_size: sf.file.size,
      })
      setAttachments(prev => [...prev, confirmed])
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, progress: 100 } : f))
      return confirmed
    } catch (err: any) {
      setStagedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: err.message || 'Upload failed' } : f))
      return null
    }
  }

  const handleSend = async () => {
    if (sendingRef.current) return
    if (!replyText.trim() && stagedFiles.length === 0) return
    sendingRef.current = true
    setSending(true)
    const replyPrefix = replyTo ? `[reply:${replyTo.id}]\n` : ''
    const hasFiles = stagedFiles.length > 0
    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        await uploadFile(stagedFiles[i], i)
      }
      stagedFiles.forEach(sf => { if (sf.preview) URL.revokeObjectURL(sf.preview) })
      setStagedFiles([])

      if (replyText.trim()) {
        const msg = await staffPortalApi.sendReply(orderId, replyPrefix + replyText.trim())
        setMessages(prev => {
          lastMsgIdRef.current = msg.id
          return [...prev, msg]
        })
        setReplyText('')
      }
      setReplyTo(null)

      if (hasFiles) {
        const [msgs, atts] = await Promise.all([
          staffPortalApi.getMessages(orderId),
          staffPortalApi.listAttachments(orderId),
        ])
        const safe = msgs ?? []
        if (safe.length) {
          lastMsgIdRef.current = safe[safe.length - 1].id
          setMessages(safe)
          setAttachments(atts ?? [])
        }
      }
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') setReplyTo(null)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 520, height: '80vh', maxHeight: 720, background: '#efeae2', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: '#075e54', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
            {getInitials(portal.customer_name || 'C')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{portal.customer_name || 'Customer'}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Customer portal chat</p>
          </div>
          <button onClick={() => window.open(getPortalURL(portal.token), '_blank')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            Customer view
          </button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(37,211,102,0.3)', borderTopColor: '#25d366', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1, color: '#667781', paddingTop: 40 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="1.5" opacity={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p style={{ fontSize: 13 }}>No messages yet</p>
            </div>
          )}

          {messages.map(msg => {
            const isStaff = msg.sender_type === 'staff'
            const parsed = parseMsg(msg.message)
            if (!parsed.text && parsed.attachmentTokens.length === 0) return null
            const quotedMsg = parsed.replyToId ? messages.find(m => m.id === parsed.replyToId) : null
            const isHighlighted = highlightedMsgId === msg.id

            return (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[msg.id] = el }}
                style={{ borderRadius: 8, padding: '2px 0', background: isHighlighted ? 'rgba(37,211,102,0.22)' : 'transparent', transition: 'background 0.5s' }}
              >
                <div style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start', alignItems: 'center', gap: 4 }}>
                  {/* Reply button for customer messages */}
                  {!isStaff && (
                    <button onClick={() => handleSelectReply(msg)} title="Reply" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: '50%', color: '#667781', flexShrink: 0, display: 'flex', lineHeight: 1 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    </button>
                  )}
                  {!isStaff && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2 }}>
                      {getInitials(msg.portal_sender || 'C')}
                    </div>
                  )}
                  <div style={{ maxWidth: '75%' }}>
                    {!isStaff && (
                      <p style={{ margin: '0 0 2px 4px', fontSize: 10, color: '#25d366', fontWeight: 600 }}>{msg.portal_sender}</p>
                    )}
                    <div style={{ padding: '8px 12px', borderRadius: isStaff ? '12px 12px 2px 12px' : '12px 12px 12px 2px', background: isStaff ? '#d9fdd3' : '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                      {quotedMsg && (
                        <div style={{ marginBottom: 6 }}>
                          <QuotedBlock quotedMsg={quotedMsg} onClick={() => highlightMessage(quotedMsg.id)} />
                        </div>
                      )}
                      {parsed.text && (
                        <p style={{ margin: 0, fontSize: 13, color: '#111b21', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{parsed.text}</p>
                      )}
                      {parsed.attachmentTokens.map(tok => {
                        const att = attachments.find(a => a.id === tok.id)
                        if (!att) return null
                        const isImg = isImageType(att.file_type)
                        return (
                          <div key={tok.id} style={{ marginTop: parsed.text ? 6 : 0 }}>
                            {isImg && att.view_url ? (
                              <div
                                onClick={() => setLightbox({ src: att.view_url, filename: att.file_name })}
                                style={{ width: 160, height: 160, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                              >
                                <img src={att.view_url} alt={att.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '6px 10px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                <span style={{ fontSize: 12, color: '#111b21', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.file_name}</span>
                                <span style={{ fontSize: 10, color: '#667781', flexShrink: 0 }}>{formatSize(att.file_size)}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <p style={{ margin: '4px 0 0', fontSize: 10, color: '#667781', textAlign: 'right' }}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                  {/* Reply button for staff messages */}
                  {isStaff && (
                    <button onClick={() => handleSelectReply(msg)} title="Reply" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: '50%', color: '#667781', flexShrink: 0, display: 'flex', lineHeight: 1 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
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
          <div style={{ borderTop: '1px solid #d1d7db', padding: '8px 12px', background: '#f0f2f5', display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto', flexShrink: 0 }}>
            {stagedFiles.map((sf, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #d1d7db', borderRadius: 8, padding: '4px 8px', minWidth: 0, maxWidth: 200 }}>
                {sf.preview
                  ? <img src={sf.preview} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#e9edef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#111b21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.file.name}</p>
                  {sf.uploading && (
                    <div style={{ height: 3, background: '#e9edef', borderRadius: 9999, marginTop: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${sf.progress}%`, background: '#25d366', transition: 'width 0.2s' }} />
                    </div>
                  )}
                  {sf.error && <p style={{ margin: 0, fontSize: 10, color: '#EF4444' }}>{sf.error}</p>}
                </div>
                {!sf.uploading && (
                  <button onClick={() => removeStagedFile(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667781', padding: 0, flexShrink: 0, display: 'flex' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reply preview bar */}
        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid #d1d7db', background: '#f0f2f5', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <QuotedBlock quotedMsg={replyTo} />
            </div>
            <button
              onClick={() => setReplyTo(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667781', padding: 4, flexShrink: 0, lineHeight: 1, display: 'flex' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Input bar */}
        <div style={{ background: '#f0f2f5', padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0, borderTop: '1px solid #d1d7db' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv,.zip"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) { stageFiles(Array.from(e.target.files)); e.target.value = '' } }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#667781', flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          </button>
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply as staff… (Enter to send)"
            rows={1}
            style={{ flex: 1, borderRadius: 20, padding: '10px 16px', fontSize: 13, border: 'none', outline: 'none', resize: 'none', background: '#fff', color: '#111b21', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 100, minHeight: 40 }}
            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 100)}px` }}
          />
          <button
            onClick={handleSend}
            disabled={sending || (!replyText.trim() && stagedFiles.length === 0)}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#25d366', color: '#fff', cursor: sending || (!replyText.trim() && stagedFiles.length === 0) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: sending || (!replyText.trim() && stagedFiles.length === 0) ? 0.5 : 1 }}
          >
            {sending
              ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>}
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.filename} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
            <a href={lightbox.src} download={lightbox.filename} style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: 8, display: 'flex', color: '#111' }} onClick={e => e.stopPropagation()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </a>
            <button style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: 8, border: 'none', cursor: 'pointer', display: 'flex', color: '#111' }} onClick={() => setLightbox(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
