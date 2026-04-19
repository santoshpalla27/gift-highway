import { useState, useRef, useEffect, useCallback } from 'react'
import { staffPortalApi, getPortalURL, type PortalMessage, type PortalStatus } from '../../../services/portalService'
import { useSocketEvent } from '../../../providers/SocketProvider'

interface Props {
  orderId: string
  portal: PortalStatus
  onClose: () => void
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export function StaffPortalChatModal({ orderId, portal, onClose }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastMsgIdRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Initial load
  useEffect(() => {
    staffPortalApi.getMessages(orderId)
      .then(msgs => {
        const safe = msgs ?? []
        setMessages(safe)
        if (safe.length) lastMsgIdRef.current = safe[safe.length - 1].id
      })
      .finally(() => setLoading(false))
  }, [orderId])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => { textareaRef.current?.focus() }, [loading])

  // Poll for new customer messages every 3s
  useEffect(() => {
    if (loading) return
    const interval = setInterval(async () => {
      try {
        const msgs = await staffPortalApi.getMessages(orderId)
        if (!msgs?.length) return
        const newest = msgs[msgs.length - 1]
        if (newest.id > lastMsgIdRef.current) {
          lastMsgIdRef.current = newest.id
          setMessages(msgs)
        }
      } catch (_) {}
    }, 3000)
    return () => clearInterval(interval)
  }, [orderId, loading])

  // Also pick up customer messages from WebSocket (order.event_added customer_message)
  useSocketEvent('order.event_added', (event: any) => {
    if (event.entity_id !== orderId) return
    const payload = event.payload as any
    if (payload?.type === 'customer_message') {
      // Refresh from server to get the portal_message representation
      staffPortalApi.getMessages(orderId).then(msgs => {
        const safe = msgs ?? []
        if (safe.length && safe[safe.length - 1].id > lastMsgIdRef.current) {
          lastMsgIdRef.current = safe[safe.length - 1].id
          setMessages(safe)
        }
      }).catch(() => {})
    }
  })

  const handleSend = async () => {
    if (!replyText.trim() || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    const text = replyText.trim()
    setReplyText('')
    try {
      const msg = await staffPortalApi.sendReply(orderId, text)
      setMessages(prev => {
        const updated = [...prev, msg]
        lastMsgIdRef.current = msg.id
        return updated
      })
    } catch (_) {
      setReplyText(text) // restore on error
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 520, height: '80vh', maxHeight: 720,
          background: '#efeae2', borderRadius: 16, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: '#075e54', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#25d366',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>
            {getInitials(portal.customer_name || 'C')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {portal.customer_name || 'Customer'}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              Customer portal chat
            </p>
          </div>
          {/* Open customer view button */}
          <button
            onClick={() => window.open(getPortalURL(portal.token), '_blank')}
            title="Open customer view in new tab"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
              padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: 11,
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Customer view
          </button>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#fff', display: 'flex' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(37,211,102,0.3)', borderTopColor: '#25d366', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1, color: '#667781', paddingTop: 40 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="1.5" opacity={0.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p style={{ fontSize: 13 }}>No messages yet</p>
              <p style={{ fontSize: 11, opacity: 0.7 }}>Customer hasn't sent anything yet</p>
            </div>
          )}

          {messages.map(msg => {
            const isStaff = msg.sender_type === 'staff'
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
                {!isStaff && (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: '#25d366',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0,
                    alignSelf: 'flex-end', marginRight: 6, marginBottom: 2,
                  }}>
                    {getInitials(msg.portal_sender || 'C')}
                  </div>
                )}
                <div style={{ maxWidth: '75%' }}>
                  {!isStaff && (
                    <p style={{ margin: '0 0 2px 4px', fontSize: 10, color: '#25d366', fontWeight: 600 }}>
                      {msg.portal_sender}
                    </p>
                  )}
                  <div style={{
                    padding: '8px 12px', borderRadius: isStaff ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: isStaff ? '#d9fdd3' : '#ffffff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#111b21', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                      {msg.message}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#667781', textAlign: 'right' }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{ background: '#f0f2f5', padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0, borderTop: '1px solid #d1d7db' }}>
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply as staff… (Enter to send)"
            rows={1}
            style={{
              flex: 1, borderRadius: 20, padding: '10px 16px', fontSize: 13,
              border: 'none', outline: 'none', resize: 'none', background: '#fff',
              color: '#111b21', fontFamily: 'inherit', lineHeight: 1.5,
              maxHeight: 100, minHeight: 40,
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 100)}px`
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !replyText.trim()}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: '#25d366', color: '#fff', cursor: sending || !replyText.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              opacity: sending || !replyText.trim() ? 0.5 : 1,
            }}
          >
            {sending
              ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
