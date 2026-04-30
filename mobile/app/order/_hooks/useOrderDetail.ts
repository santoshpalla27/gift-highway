import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ScrollView, Alert, Keyboard, Platform } from 'react-native'
import { orderService, type Order, type OrderEvent, type UserOption } from '../../../services/orderService'
import { attachmentService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE, resolveFileMime, isImage } from '../../../services/attachmentService'
import { staffPortalApi, type PortalStatus, type PortalMessage, type PortalAttachment } from '../../../services/portalService'
import { notificationService } from '../../../services/notificationService'
import { markNotificationOrderRead } from '../../../hooks/useNotifications'
import { useAuthStore } from '../../../store/authStore'
import { useNetworkStatus } from '../../../hooks/useNetworkStatus'
import { useOrderSocket } from '../../../hooks/useOrderSocket'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'

const LIMIT = 30

// ─── Types ────────────────────────────────────────────────────────────────────

export type OptimisticEvent = OrderEvent & {
  failed?: boolean
  originalText?: string
}

export type UploadingFile = {
  id: string
  name: string
  mime: string
  progress: number
  previewUri?: string
  done?: boolean
  error?: string
  retryArgs?: { uri: string; mimeType: string; size: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseCommentText(raw: string): { replyEventId: string | null; replyPreview: string | null; cleanText: string } {
  const match = raw.match(/^\[reply:([^:\]]+):(.+?)\]\n?([\s\S]*)$/)
  if (match) return { replyEventId: match[1], replyPreview: match[2], cleanText: match[3].trim() }
  return { replyEventId: null, replyPreview: null, cleanText: raw }
}

export function parsePortalMsg(text: string): { text: string; tokens: { id: number; name: string }[]; replyToId: number | null } {
  const tokens: { id: number; name: string }[] = []
  let replyToId: number | null = null
  const lines: string[] = []
  for (const line of text.split('\n')) {
    const att = line.match(/^\[attachment:(\d+):([^\]]+)\]$/)
    if (att) { tokens.push({ id: Number(att[1]), name: att[2] }); continue }
    const repl = line.match(/^\[reply:(\d+)\]$/)
    if (repl) { replyToId = Number(repl[1]); continue }
    lines.push(line)
  }
  return { text: lines.join('\n').trim(), tokens, replyToId }
}

export function getEventPreview(event: OrderEvent): string {
  if (event.type === 'attachment_added') return `📎 ${(event.payload as any)?.file_name || 'Attachment'}`
  if (event.type === 'customer_attachment') return `📎 ${(event.payload as any)?.file_name || 'Attachment'}`
  if (event.type === 'staff_portal_reply' || event.type === 'customer_message') {
    const raw = (event.payload as any)?.text ?? ''
    const lines = raw.split('\n').filter((l: string) => !l.match(/^\[attachment:\d+:.+\]$/) && !l.match(/^\[reply:\d+\]$/))
    const clean = lines.join('\n').trim()
    if (clean) return clean.slice(0, 60)
    const attMatch = raw.match(/\[attachment:\d+:(.+?)\]/)
    if (attMatch) return `📎 ${attMatch[1]}`
    return 'Message'
  }
  const text = (event.payload as any)?.text ?? ''
  const { cleanText } = parseCommentText(text)
  return (cleanText || text).slice(0, 60)
}

export function getEventSenderName(event: OrderEvent): string {
  if (event.type === 'customer_message' || event.type === 'customer_attachment') {
    return (event.payload as any)?.customer_name ?? 'Customer'
  }
  return event.actor_name
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']
function isImgExt(name: string) { return IMG_EXTS.includes(('.' + (name.split('.').pop() ?? '')).toLowerCase()) }

export function getEventThumb(event: OrderEvent, portalAttachments?: PortalAttachment[]): string | null {
  if (event.type === 'attachment_added') {
    const p = event.payload as any
    if (p.file_url && isImgExt(p.file_name ?? '')) return p.file_url
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

const PORTAL_IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']
export function getPortalMsgThumb(msg: PortalMessage, atts: PortalAttachment[]): string | null {
  const m = msg.message.match(/\[attachment:(\d+):/)
  if (!m) return null
  const att = atts.find(a => a.id === parseInt(m[1]))
  if (!att) return null
  if (!PORTAL_IMG_EXTS.some(e => att.file_type.toLowerCase().endsWith(e))) return null
  return att.view_url ?? null
}

export function getPortalMsgPreview(msg: PortalMessage): string {
  const lines: string[] = []
  let attName = ''
  for (const line of msg.message.split('\n')) {
    if (line.match(/^\[reply:\d+\]$/)) continue
    const att = line.match(/^\[attachment:\d+:(.+?)\]$/)
    if (att) { attName = att[1]; continue }
    lines.push(line)
  }
  const text = lines.join('\n').trim()
  if (text) return text.slice(0, 60)
  if (attName) return `📎 ${attName}`
  return msg.message.slice(0, 60)
}

export function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function dayKey(iso: string) { return new Date(iso).toISOString().slice(0, 10) }

export type DateGroup = { label: string; events: (OrderEvent & { failed?: boolean })[] }

export function groupByDate(events: (OrderEvent & { failed?: boolean })[]): DateGroup[] {
  const map = new Map<string, (OrderEvent & { failed?: boolean })[]>()
  for (const ev of events) {
    const k = dayKey(ev.created_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(ev)
  }
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const today = new Date(); today.setHours(0,0,0,0)
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const date = new Date(d); date.setHours(0,0,0,0)
    if (date.getTime() === today.getTime()) return 'Today'
    if (date.getTime() === yesterday.getTime()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return Array.from(map.entries()).map(([k, evs]) => ({
    label: fmt(k + 'T12:00:00'),
    events: evs,
  }))
}

function mergeAndFilter(evList: OrderEvent[], optimistic: OptimisticEvent[]): (OrderEvent & { failed?: boolean })[] {
  const raw = [...evList, ...optimistic]
  const deletedMsgIds = new Set<number>()
  for (const e of raw) {
    if (e.type === 'portal_message_deleted') {
      const p = e.payload as Record<string, any>
      if (p?.msg_id) deletedMsgIds.add(Number(p.msg_id))
    }
  }
  const deletedAttIds = new Set<number>()
  for (const e of raw) {
    if (e.type === 'customer_message' && deletedMsgIds.has(Number((e.payload as any)?.msg_id))) {
      for (const line of String((e.payload as any)?.text ?? '').split('\n')) {
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
        return { ...e, type: 'portal_message_deleted' as const }
      }
      return e
    })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrderDetail(orderId: string | undefined) {
  const { user } = useAuthStore()
  const { isOnline } = useNetworkStatus()

  // ── Order ─────────────────────────────────────────────────────────────────
  const [order, setOrder] = useState<Order | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)

  // ── Events ────────────────────────────────────────────────────────────────
  const [evList, setEvList] = useState<OrderEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const olderPageRef = useRef(2)
  const evListRef = useRef<OrderEvent[]>([])
  useEffect(() => { evListRef.current = evList }, [evList])

  // ── Optimistic ────────────────────────────────────────────────────────────
  const [optimisticEvents, setOptimisticEvents] = useState<OptimisticEvent[]>([])

  const allEvents = useMemo(
    () => mergeAndFilter(evList, optimisticEvents),
    [evList, optimisticEvents],
  )

  // ── Scroll ────────────────────────────────────────────────────────────────
  const [newCount, setNewCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const atBottomRef = useRef(true)
  const scrollRef = useRef<ScrollView>(null)
  const eventYPos = useRef<Record<string, number>>({})

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    })
    return () => sub.remove()
  }, [])

  // ── New-updates divider ───────────────────────────────────────────────────
  const [newSinceAt, setNewSinceAt] = useState<string | null>(null)
  const pageEnteredAt = useRef(new Date().toISOString())

  // ── Portal ────────────────────────────────────────────────────────────────
  const [portal, setPortal] = useState<PortalStatus | null | undefined>(undefined)
  const [portalAttachments, setPortalAttachments] = useState<PortalAttachment[]>([])
  const [portalMessages, setPortalMessages] = useState<PortalMessage[]>([])
  const [showPortalChat, setShowPortalChat] = useState(false)
  const [portalCreating, setPortalCreating] = useState(false)
  const portalChatRefreshRef = useRef<(() => void) | null>(null)

  // ── Reply / Highlight ─────────────────────────────────────────────────────
  const [replyToEvent, setReplyToEvent] = useState<(OrderEvent & { failed?: boolean }) | null>(null)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Comment input ─────────────────────────────────────────────────────────
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [editingComment, setEditingComment] = useState<{ eventId: string; text: string } | null>(null)
  const [editCommentText, setEditCommentText] = useState('')

  // ── Sheet visibility ──────────────────────────────────────────────────────
  const [showStatus, setShowStatus] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showAttachSheet, setShowAttachSheet] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // ── File uploads ──────────────────────────────────────────────────────────
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])

  // ── Permissions ───────────────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin'
  const canEdit = (o: Order | null) => !!o && (isAdmin || (o.assigned_to ?? []).includes(user?.id ?? ''))

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const data = await orderService.listOrders({ search: '', page: 1, limit: 200 })
      const found = data.orders.find(o => o.id === orderId)
      if (found) setOrder(found)
    } catch { /* ignore */ } finally {
      setLoadingOrder(false)
    }
  }, [orderId])

  const loadInitialEvents = useCallback(async () => {
    if (!orderId) return
    setLoadingEvents(true)
    try {
      const data = await orderService.listEvents(orderId, 1, LIMIT, 'desc')
      const sorted = [...data.events].reverse()
      setEvList(sorted)
      setTotalEvents(data.total)
      setHasOlder(data.total > LIMIT)
      olderPageRef.current = 2
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120)
    } catch { /* ignore */ } finally {
      setLoadingEvents(false)
    }
  }, [orderId])

  const refreshPortalData = useCallback(async () => {
    if (!orderId) return
    try {
      const [atts, msgs] = await Promise.all([
        staffPortalApi.listAttachments(orderId).catch(() => portalAttachments),
        staffPortalApi.getMessages(orderId).catch(() => portalMessages),
      ])
      setPortalAttachments(atts)
      setPortalMessages(msgs)
    } catch { /* ignore */ }
  }, [orderId])

  const fetchLatest = useCallback(async () => {
    if (!orderId) return
    try {
      const data = await orderService.listEvents(orderId, 1, LIMIT, 'desc')
      const latest = [...data.events].reverse()
      let added = 0
      setEvList(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEvs = latest.filter(e => !existingIds.has(e.id))
        added = newEvs.length
        return newEvs.length === 0 ? prev : [...prev, ...newEvs]
      })
      setOptimisticEvents(prev => prev.filter(e => e.failed))
      setTotalEvents(data.total)
      if (added > 0) {
        if (atBottomRef.current) {
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
        } else {
          setNewCount(n => n + added)
        }
      }
    } catch { /* ignore */ }
  }, [orderId])

  const loadOlderEvents = useCallback(async () => {
    if (loadingOlder || !orderId) return
    setLoadingOlder(true)
    try {
      const data = await orderService.listEvents(orderId, olderPageRef.current, LIMIT, 'desc')
      const older = [...data.events].reverse()
      setEvList(prev => [...older, ...prev])
      setTotalEvents(data.total)
      setHasOlder(olderPageRef.current * LIMIT < data.total)
      olderPageRef.current++
    } catch { /* ignore */ } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, orderId])

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchOrder()
    loadInitialEvents()
    if (orderId) {
      staffPortalApi.getPortal(orderId).then(setPortal).catch(() => setPortal(null))
      refreshPortalData()
    }
  }, [fetchOrder, loadInitialEvents, orderId])

  // ── Notification tracking (isolated so markOrderRead isn't triggered by data-fetch deps) ──
  // Mirrors web's StrictMode guard: setTimeout(0) fires AFTER the simulated cleanup,
  // so a real unmount is distinguishable from a StrictMode double-invoke.
  useEffect(() => {
    if (!orderId) return
    const reallyMountedRef = { current: false }
    pageEnteredAt.current = new Date().toISOString()
    setNewSinceAt(null)
    notificationService.getLastSeen(orderId).then(setNewSinceAt).catch(() => {})
    const t = setTimeout(() => { reallyMountedRef.current = true }, 0)
    return () => {
      clearTimeout(t)
      if (reallyMountedRef.current) markNotificationOrderRead(orderId)
    }
  }, [orderId])

  // ── Socket ────────────────────────────────────────────────────────────────

  useOrderSocket(
    () => { fetchOrder(); fetchLatest() },
    (event) => {
      if (event.type === 'order.event_added') {
        const incoming = event.payload as any
        if ((incoming?.type === 'customer_message' || incoming?.type === 'staff_portal_reply') && orderId) {
          portalChatRefreshRef.current?.()
          refreshPortalData()
        }
        if (incoming?.id) {
          setEvList(prev => {
            if (prev.some(e => e.id === incoming.id)) {
              return prev.map(e => e.id === incoming.id ? { ...e, ...incoming } : e)
            }
            return prev
          })
        }
      }
      if (event.type === 'order.event_deleted') {
        const p = event.payload as Record<string, string> | undefined
        if (!p?.event_id) return
        if (p.tombstone === 'true' || (p as any).tombstone === true) {
          setEvList(prev => prev.map(e => e.id === p.event_id
            ? { ...e, type: 'attachment_deleted', payload: { file_name: p.file_name ?? '' } as any }
            : e
          ))
        } else {
          setEvList(prev => prev.filter(e => e.id !== p.event_id))
        }
      }
    },
  )

  // ── Highlight / scroll-to ─────────────────────────────────────────────────

  const highlightEvent = useCallback((eventId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedEventId(eventId)
    const y = eventYPos.current[eventId]
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true })
    highlightTimerRef.current = setTimeout(() => setHighlightedEventId(null), 5000)
  }, [])

  const highlightPortalMsg = useCallback((portalMsgId: number) => {
    const pm = portalMessages.find(m => m.id === portalMsgId)
    if (!pm) return
    const pmTime = new Date(pm.created_at).getTime()
    const matchTypes = pm.sender_type === 'staff' ? ['staff_portal_reply'] : ['customer_message', 'customer_attachment']
    let bestId: string | null = null
    let bestDiff = Infinity
    for (const ev of allEvents) {
      if (!matchTypes.includes(ev.type)) continue
      const diff = Math.abs(new Date(ev.created_at).getTime() - pmTime)
      if (diff < bestDiff) { bestDiff = diff; bestId = ev.id }
    }
    if (bestId && bestDiff < 60000) highlightEvent(bestId)
  }, [portalMessages, allEvents, highlightEvent])

  const handleSelectReplyEvent = useCallback((ev: OrderEvent & { failed?: boolean }) => {
    setReplyToEvent(ev)
    scrollRef.current?.scrollToEnd({ animated: true })
  }, [])

  // ── Send / Edit / Delete comments ─────────────────────────────────────────

  const sendComment = useCallback(async (text: string, tempId?: string) => {
    if (!isOnline) { Alert.alert('Offline', "You're offline. Please reconnect to send."); return }
    if (!orderId) return
    const id_ = tempId ?? `temp-${Date.now()}`
    if (!tempId) {
      setOptimisticEvents(prev => [...prev, {
        id: id_, order_id: orderId, type: 'comment_added',
        actor_id: user?.id ?? null, actor_name: user ? `${user.first_name} ${user.last_name}`.trim() : 'You',
        payload: { text } as any, created_at: new Date().toISOString(), originalText: text,
      }])
      atBottomRef.current = true
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    }
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      await orderService.addComment(orderId, text)
      await fetchLatest()
    } catch {
      setOptimisticEvents(prev => prev.map(e => e.id === id_ ? { ...e, failed: true } : e))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }, [isOnline, orderId, user, fetchLatest])

  const handleSendComment = useCallback(async () => {
    const text = comment.trim()
    if (!text || sendingRef.current) return
    const replyPrefix = replyToEvent ? `[reply:${replyToEvent.id}:${getEventPreview(replyToEvent)}]\n` : ''
    setComment('')
    setReplyToEvent(null)
    await sendComment(replyPrefix + text)
  }, [comment, replyToEvent, sendComment])

  const handleRetry = useCallback(async (ev: OptimisticEvent) => {
    const text = ev.originalText ?? (ev.payload as Record<string, string>).text
    if (!text) return
    setOptimisticEvents(prev => prev.map(e => e.id === ev.id ? { ...e, failed: false } : e))
    await sendComment(text, ev.id)
  }, [sendComment])

  const handleDeleteComment = useCallback((eventId: string) => {
    setDeleteConfirmId(eventId)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId || !orderId) return
    const eventId = deleteConfirmId
    const ev = evListRef.current.find(e => e.id === eventId)
    setDeleteConfirmId(null)
    try {
      await orderService.deleteComment(orderId, eventId)
      if (ev?.type === 'attachment_added') {
        const fileName = (ev.payload as any)?.file_name ?? ''
        setEvList(prev => prev.map(e => e.id === eventId
          ? { ...e, type: 'attachment_deleted', payload: { ...e.payload, file_name: fileName } as any }
          : e
        ))
      } else {
        setEvList(prev => prev.filter(e => e.id !== eventId))
      }
    } catch { Alert.alert('Error', 'Could not delete.') }
  }, [deleteConfirmId, orderId])

  const saveEditComment = useCallback(async () => {
    if (!editingComment || !editCommentText.trim() || !orderId) return
    const { eventId } = editingComment
    const newText = editCommentText.trim()
    setEditingComment(null)
    try {
      await orderService.editComment(orderId, eventId, newText)
      setEvList(prev => prev.map(e => e.id === eventId ? { ...e, payload: { ...(e.payload as object), text: newText } as any } : e))
    } catch { Alert.alert('Error', 'Could not edit comment') }
  }, [editingComment, editCommentText, orderId])

  // ── File uploads ──────────────────────────────────────────────────────────

  const runUpload = useCallback(async (uid: string, uri: string, name: string, mimeType: string, size: number) => {
    if (!orderId) return
    try {
      const { upload_url, file_key, file_url } = await attachmentService.getUploadURL(orderId, name, mimeType, size)
      await attachmentService.uploadToR2(upload_url, uri, mimeType, pct => {
        setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, progress: pct } : f))
      })
      await attachmentService.confirmUpload(orderId, { file_name: name, file_key, file_url, mime_type: mimeType, size_bytes: size })
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, done: true, progress: 100 } : f))
      setTimeout(() => setUploadingFiles(prev => prev.filter(f => f.id !== uid)), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: msg } : f))
    }
  }, [orderId])

  const uploadFile = useCallback(async (uri: string, name: string, rawMime: string, size: number) => {
    if (!orderId) return
    const mimeType = resolveFileMime(name, rawMime)
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) { Alert.alert('Error', `"${name}" has an unsupported file type.`); return }
    if (size > MAX_FILE_SIZE) { Alert.alert('Error', `"${name}" exceeds the 50 MB limit.`); return }
    const uid = `upload-${Date.now()}`
    setUploadingFiles(prev => [...prev, { id: uid, name, mime: mimeType, progress: 0, previewUri: isImage(mimeType) ? uri : undefined, retryArgs: { uri, mimeType, size } }])
    runUpload(uid, uri, name, mimeType, size)
  }, [orderId, runUpload])

  const retryUpload = useCallback((uid: string) => {
    const entry = uploadingFiles.find(f => f.id === uid)
    if (!entry?.retryArgs) return
    setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: undefined, progress: 0 } : f))
    runUpload(uid, entry.retryArgs.uri, entry.name, entry.retryArgs.mimeType, entry.retryArgs.size)
  }, [uploadingFiles, runUpload])

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to upload images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      quality: 0.85,
    })
    if (!result.canceled) {
      for (const asset of result.assets) {
        // Normalize URI — expo-file-system requires file:// prefix on native
        const uri = (Platform.OS !== 'web' && !asset.uri.startsWith('file://')) ? `file://${asset.uri}` : asset.uri

        // Infer MIME type from extension when the picker doesn't provide it
        let mimeType = asset.mimeType
        if (!mimeType) {
          const ext = (asset.uri.split('.').pop() ?? '').toLowerCase()
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            webp: 'image/webp', heic: 'image/jpeg', heif: 'image/jpeg',
          }
          mimeType = mimeMap[ext] ?? 'image/jpeg'
        }

        // Get reliable file size via FileSystem — asset.fileSize is often 0/undefined
        let size = asset.fileSize ?? 0
        if ((!size || size === 0) && Platform.OS !== 'web') {
          try {
            const info = await FileSystem.getInfoAsync(uri)
            if (info.exists && info.size) size = info.size
          } catch { /* use fallback */ }
        }

        // Build a sensible filename
        const fileExt = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase()
        const fileName = asset.fileName ?? `photo-${Date.now()}.${fileExt}`

        await uploadFile(uri, fileName, mimeType, size)
      }
    }
  }, [uploadFile])

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (!result.canceled) {
      for (const asset of result.assets) {
        // Normalize URI for native platforms
        const uri = (Platform.OS !== 'web' && !asset.uri.startsWith('file://')) ? `file://${asset.uri}` : asset.uri

        // Get reliable file size via FileSystem when document picker returns 0
        let size = asset.size ?? 0
        if ((!size || size === 0) && Platform.OS !== 'web') {
          try {
            const info = await FileSystem.getInfoAsync(uri)
            if (info.exists && info.size) size = info.size
          } catch { /* use fallback */ }
        }

        await uploadFile(uri, asset.name, asset.mimeType ?? 'application/octet-stream', size)
      }
    }
  }, [uploadFile])

  // ── Portal portal chat ─────────────────────────────────────────────────────

  const openPortalChat = useCallback(() => setShowPortalChat(true), [])

  const createPortal = useCallback(async () => {
    if (portalCreating || !order) return
    setPortalCreating(true)
    try {
      const p = await staffPortalApi.createPortal(order.id, order.customer_name)
      setPortal(p)
      setShowPortalChat(true)
    } catch {
      Alert.alert('Error', 'Could not create portal')
    } finally {
      setPortalCreating(false)
    }
  }, [portalCreating, order])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    Promise.all([fetchOrder(), loadInitialEvents()]).finally(() => setRefreshing(false))
  }, [fetchOrder, loadInitialEvents])

  return {
    // order
    order, loadingOrder, fetchOrder,
    // events
    allEvents, loadingEvents, hasOlder, loadingOlder, loadOlderEvents, totalEvents, refreshing, onRefresh,
    // scroll
    scrollRef, atBottomRef, newCount, setNewCount, eventYPos,
    // new-updates divider
    newSinceAt, pageEnteredAt,
    // portal
    portal, setPortal, portalAttachments, setPortalAttachments, portalMessages, showPortalChat,
    setShowPortalChat, portalCreating, portalChatRefreshRef, openPortalChat, createPortal, refreshPortalData,
    // reply / highlight
    replyToEvent, setReplyToEvent, handleSelectReplyEvent, highlightedEventId, highlightEvent, highlightPortalMsg,
    // comment input
    comment, setComment, sending, handleSendComment, handleRetry,
    handleDeleteComment, confirmDelete, deleteConfirmId, setDeleteConfirmId,
    editingComment, setEditingComment, editCommentText, setEditCommentText, saveEditComment,
    // sheets
    showStatus, setShowStatus, showInfo, setShowInfo, showEdit, setShowEdit,
    showAttachSheet, setShowAttachSheet,
    // uploads
    uploadingFiles, setUploadingFiles, retryUpload, handlePickImage, handlePickDocument,
    // permissions
    canEdit, user,
    // utils
    getEventPreview, getEventSenderName, getEventThumb,
  }
}
