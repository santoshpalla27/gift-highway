import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
  Alert, RefreshControl, Modal, Image, Linking, Share, Keyboard,
  Animated, PanResponder,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { orderService, Order, OrderEvent, UserOption } from '../../services/orderService'
import { attachmentService, isImage, formatBytes, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../../services/attachmentService'
import { staffPortalApi, getPortalURL, type PortalStatus, type PortalMessage, type PortalAttachment } from '../../services/portalService'
import { useAuthStore } from '../../store/authStore'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useOrderSocket } from '../../hooks/useOrderSocket'
import { formatDate, formatRelative, formatDayGroup, fmt12hrStr } from '../../utils/date'

// ─── Metadata ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const

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

const EVENT_TYPE_META: Record<string, { icon: string; label: (p: Record<string, string>) => string }> = {
  order_created:     { icon: 'add-circle-outline',  label: () => 'Order created' },
  comment_added:     { icon: 'chatbubble-outline',  label: () => '' },
  status_changed:    { icon: 'swap-horizontal-outline', label: p => `Status changed from ${STATUS_META[p.from]?.label ?? p.from} to ${STATUS_META[p.to]?.label ?? p.to}` },
  assignees_changed: { icon: 'people-outline',      label: p => p.names ? `Assigned to ${p.names}` : 'Assignees updated' },
  due_date_changed:  { icon: 'calendar-outline',    label: p => p.to ? `Due date set to ${p.to}` : 'Due date removed' },
  priority_changed:  { icon: 'flag-outline',        label: p => `Priority changed to ${PRIORITY_META[p.to]?.label ?? p.to}` },
  order_updated:     { icon: 'pencil-outline',      label: () => 'Order details updated' },
}

function parsePortalMsg(text: string): { text: string; tokens: { id: number; name: string }[]; replyToId: number | null } {
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

function parseCommentText(raw: string): { replyEventId: string | null; replyPreview: string | null; cleanText: string } {
  const match = raw.match(/^\[reply:([^:\]]+):(.+?)\]\n?([\s\S]*)$/)
  if (match) return { replyEventId: match[1], replyPreview: match[2], cleanText: match[3].trim() }
  return { replyEventId: null, replyPreview: null, cleanText: raw }
}

function getEventPreview(event: OrderEvent): string {
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
    const attMatch = raw.match(/\[attachment:\d+:(.+?)\]/)
    if (attMatch) return `📎 ${attMatch[1]}`
    return 'Message'
  }
  const text = (event.payload as any)?.text ?? ''
  const { cleanText } = parseCommentText(text)
  return (cleanText || text).slice(0, 60)
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']
function isImgExt(name: string) { return IMG_EXTS.includes(('.' + (name.split('.').pop() ?? '')).toLowerCase()) }

function getEventThumb(event: OrderEvent, portalAttachments?: PortalAttachment[]): string | null {
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

function getEventSenderName(event: OrderEvent): string {
  if (event.type === 'customer_message' || event.type === 'customer_attachment') {
    return (event.payload as any).customer_name ?? 'Customer'
  }
  return event.actor_name
}

function getPortalMsgPreview(msg: PortalMessage): string {
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

function getPortalMsgThumb(msg: PortalMessage, atts: PortalAttachment[]): string | null {
  const m = msg.message.match(/\[attachment:(\d+):/)
  if (!m) return null
  const att = atts.find(a => a.id === parseInt(m[1]))
  const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']
  if (att && imgExts.includes(att.file_type.toLowerCase()) && att.view_url) return att.view_url
  return null
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

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Attachment image with signed-url refresh on load error ──────────────────

function AttachmentCard({ orderId, payload, onDelete, isOwn }: {
  orderId: string
  payload: Record<string, string>
  onDelete?: () => void
  isOwn?: boolean
}) {
  const [imgUri, setImgUri] = useState(payload.file_url)
  const [imgFailed, setImgFailed] = useState(false)
  const refreshingRef = useRef(false)
  const imgFile = isImage(payload.mime_type ?? '')

  const handleImgError = async () => {
    if (refreshingRef.current || imgFailed) return
    refreshingRef.current = true
    try {
      const fresh = await attachmentService.getSignedUrl(orderId, payload.file_key)
      setImgUri(fresh)
    } catch {
      setImgFailed(true)
    } finally {
      refreshingRef.current = false
    }
  }

  const handleDownload = async () => {
    try {
      const url = await attachmentService.getDownloadUrl(orderId, payload.file_key, payload.file_name)
      Linking.openURL(url)
    } catch {
      Linking.openURL(payload.file_url)
    }
  }

  return (
    <View style={[
      T.bubble,
      { padding: 0, overflow: 'hidden' },
      isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }
    ]}>
      {imgFile ? (
        <>
          <TouchableOpacity onPress={handleDownload} activeOpacity={0.85}>
            {imgFailed ? (
              <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Image unavailable</Text>
              </View>
            ) : (
              <Image
                source={{ uri: imgUri }}
                style={{ width: '100%', height: 180 }}
                resizeMode="cover"
                onError={handleImgError}
              />
            )}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text style={{ fontSize: 11, color: '#9CA3AF', flex: 1 }} numberOfLines={1}>{payload.file_name}</Text>
            <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="download-outline" size={14} color="#6366F1" />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={handleDownload} activeOpacity={0.85}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16 }}>
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="document-outline" size={20} color="#6B7280" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>{payload.file_name}</Text>
              <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{formatBytes(Number(payload.size_bytes))}</Text>
            </View>
            <Ionicons name="download-outline" size={16} color="#6366F1" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Portal Attachment Card ───────────────────────────────────────────────────
// Fetches its own view URL so it doesn't depend on parent portalAttachments state

function PortalAttachmentCard({ orderId, attId, fileName, fileType, isOwn, isStaff, caption }: {
  orderId: string
  attId: number | null
  fileName: string
  fileType?: string
  isOwn?: boolean
  isStaff?: boolean
  caption?: string
}) {
  const ext = ('.' + (fileName.split('.').pop() ?? '')).toLowerCase()
  const isImg = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'].includes(ext)
  const [viewUrl, setViewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (attId == null) return
    staffPortalApi.getAttachmentDownloadURL(orderId, attId, fileName)
      .then(setViewUrl)
      .catch(() => {})
  }, [orderId, attId, fileName])

  const handleDownload = async () => {
    if (!viewUrl) return
    Linking.openURL(viewUrl)
  }

  const hasBubble = isStaff !== undefined
  const bubbleBg = isStaff ? '#EFF6FF' : '#F0FDF4'
  const bubbleBorder = isStaff ? '#BFDBFE' : '#A7F3D0'
  const trr = isOwn ? 4 : 14
  const tlr = isOwn ? 14 : 4

  if (isImg) {
    return (
      <View style={{
        marginTop: 6, overflow: 'hidden', maxWidth: 260,
        backgroundColor: hasBubble ? bubbleBg : '#FFFFFF',
        borderWidth: 1, borderColor: hasBubble ? bubbleBorder : '#E5E7EB',
        borderRadius: 14, borderTopRightRadius: trr, borderTopLeftRadius: tlr,
      }}>
        <TouchableOpacity onPress={handleDownload} activeOpacity={0.85}>
          {viewUrl
            ? <Image source={{ uri: viewUrl }} style={{ width: 258, height: 160 }} resizeMode="cover" />
            : <View style={{ width: 258, height: 90, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
                <ActivityIndicator size="small" color="#94A3B8" />
              </View>
          }
        </TouchableOpacity>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, color: '#6B7280', flex: 1 }} numberOfLines={1}>{fileName}</Text>
            {viewUrl && (
              <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="download-outline" size={14} color="#6366F1" />
              </TouchableOpacity>
            )}
          </View>
          {caption ? <Text style={{ fontSize: 13, color: '#374151', marginTop: 4, lineHeight: 18 }}>{caption}</Text> : null}
        </View>
      </View>
    )
  }

  return (
    <TouchableOpacity onPress={handleDownload} activeOpacity={0.85}
      style={{
        flexDirection: 'column', gap: 6, marginTop: 4,
        backgroundColor: hasBubble ? bubbleBg : '#F9FAFB',
        borderWidth: 1, borderColor: hasBubble ? bubbleBorder : '#E5E7EB',
        borderRadius: 14, borderTopRightRadius: trr, borderTopLeftRadius: tlr,
        paddingHorizontal: 18, paddingVertical: 14, minWidth: 220,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="document-outline" size={16} color="#6B7280" />
        <Text style={{ fontSize: 12, color: '#374151', flex: 1 }} numberOfLines={1}>{fileName}</Text>
        <Ionicons name="download-outline" size={14} color="#6366F1" />
      </View>
      {caption ? <Text style={{ fontSize: 13, color: '#374151', lineHeight: 18 }}>{caption}</Text> : null}
    </TouchableOpacity>
  )
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

function TimelineItem({ event, isOptimistic, onRetry, onDelete, onEdit, onReply, onHighlightQuoted, onHighlightPortalMsg, orderId, portalMessages, portalAttachments, quotedEvent, highlighted, attCaption }: {
  event: OrderEvent & { failed?: boolean }
  isOptimistic?: boolean
  onRetry?: () => void
  onDelete?: () => void
  onEdit?: (newText: string) => void
  onReply?: () => void
  onHighlightQuoted?: () => void
  onHighlightPortalMsg?: (id: number) => void
  orderId: string
  portalMessages?: PortalMessage[]
  portalAttachments?: PortalAttachment[]
  quotedEvent?: (OrderEvent & { failed?: boolean }) | null
  highlighted?: boolean
  attCaption?: string
}) {
  const { user } = useAuthStore()
  const currentUserId = user?.id
  const [menuFor, setMenuFor] = useState<'comment' | 'attachment' | null>(null)
  const isOwn = String(event.actor_id) === String(currentUserId)
  const isOwnRef = useRef(isOwn)
  useEffect(() => { isOwnRef.current = isOwn }, [isOwn])
  const translateX = useRef(new Animated.Value(0)).current
  const replyTriggered = useRef(false)
  const onReplyRef = useRef(onReply)
  useEffect(() => { onReplyRef.current = onReply }, [onReply])

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => {
      if (!onReplyRef.current || Math.abs(gs.dx) <= 5) return false
      const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2
      if (!isHorizontal) return false
      // Only capture if swiping "into" the screen
      return isOwnRef.current ? gs.dx < 0 : gs.dx > 0
    },
    onPanResponderGrant: () => { replyTriggered.current = false },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gs) => {
      const clamp = isOwnRef.current ? Math.max(-80, Math.min(0, gs.dx)) : Math.max(0, Math.min(80, gs.dx))
      translateX.setValue(clamp)
      if (Math.abs(clamp) > 40 && !replyTriggered.current) {
        replyTriggered.current = true
      }
      if (Math.abs(clamp) < 20 && replyTriggered.current) {
        replyTriggered.current = false
      }
    },
    onPanResponderRelease: () => {
      if (replyTriggered.current && !isOptimistic) onReplyRef.current?.()
      replyTriggered.current = false
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 40, friction: 7 }).start()
    },
    onPanResponderTerminate: () => {
      replyTriggered.current = false
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
    },
  })).current
  const isComment = event.type === 'comment_added'
  const meta = EVENT_TYPE_META[event.type]

  const menuSheet = menuFor !== null && (
    <Modal visible transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
      <TouchableOpacity style={TM.overlay} activeOpacity={1} onPress={() => setMenuFor(null)}>
        <TouchableOpacity activeOpacity={1} style={TM.sheet}>
          {onReply && (
            <TouchableOpacity style={TM.row} onPress={() => { setMenuFor(null); onReply() }}>
              <Ionicons name="return-up-back-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Reply</Text>
            </TouchableOpacity>
          )}
          {menuFor === 'comment' && onEdit && (
            <TouchableOpacity style={TM.row} onPress={() => {
              setMenuFor(null)
              const currentText = typeof event.payload === 'object' && event.payload !== null
                ? (event.payload as Record<string, string>).text ?? '' : ''
              onEdit(currentText)
            }}>
              <Ionicons name="pencil-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Edit</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={TM.row} onPress={() => { setMenuFor(null); onDelete() }}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[TM.rowText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setMenuFor(null)}>
            <Text style={TM.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )

  if (isComment) {
    const rawText = typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, string>).text ?? '' : ''
    const { replyPreview, cleanText } = parseCommentText(rawText)
    const isFailed = event.failed
    const canMenu = (onDelete || onEdit || onReply) && !isOptimistic
    return (
      <View style={[{ marginBottom: 16 }, isOptimistic && !isFailed && { opacity: 0.6 }, highlighted && { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8 }]}>
        {menuSheet}
        <View style={{ paddingLeft: isOwn ? 0 : 44, paddingRight: isOwn ? 44 : 0, marginBottom: 2, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <Text style={T.actorName}>{isOwn ? 'You' : event.actor_name}</Text>
        </View>
        <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={T.avatar}>
          <Text style={T.avatarText}>{getInitials(event.actor_name || '?')}</Text>
        </View>
        <View style={{ flex: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }}>
            {/* Visual Indicator for Reply */}
            <Animated.View style={{
              position: 'absolute',
              [isOwn ? 'right' : 'left']: -40,
              opacity: translateX.interpolate({
                inputRange: isOwn ? [-40, -20] : [20, 40],
                outputRange: isOwn ? [1, 0] : [0, 1],
                extrapolate: 'clamp'
              }),
              transform: [{
                scale: translateX.interpolate({
                  inputRange: isOwn ? [-40, 0] : [0, 40],
                  outputRange: [1, 0.5],
                  extrapolate: 'clamp'
                })
              }]
            }}>
              <Ionicons name="return-up-back-outline" size={20} color="#6366F1" />
            </Animated.View>

            <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
              <View style={[
                T.bubble,
                isFailed && { backgroundColor: '#FFF5F5', borderColor: '#FCA5A5' },
                isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }
              ]}>
                {replyPreview && (
                  <TouchableOpacity
                    onPress={onHighlightQuoted}
                    activeOpacity={onHighlightQuoted ? 0.7 : 1}
                    style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#6366F1', backgroundColor: '#EEF2FF', borderRadius: 4, overflow: 'hidden' }}
                  >
                    <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4 }}>
                      {quotedEvent && (
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1', marginBottom: 1 }} numberOfLines={1}>{getEventSenderName(quotedEvent)}</Text>
                      )}
                      <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={2}>{replyPreview}</Text>
                    </View>
                    {quotedEvent && (() => {
                      const thumb = getEventThumb(quotedEvent, portalAttachments)
                      if (!thumb) return null
                      return <Image source={{ uri: thumb }} style={{ width: 44, height: 44 }} resizeMode="cover" />
                    })()}
                  </TouchableOpacity>
                )}
                <Text style={T.commentText}>{cleanText}</Text>
              </View>
            </Animated.View>
            {canMenu && (
              <TouchableOpacity onPress={() => setMenuFor('comment')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={[T.time, { marginTop: 4 }, isFailed && { color: '#EF4444' }]}>
            {isFailed ? 'Failed to send' : formatTimestamp(event.created_at)}
          </Text>
          {isFailed && (
            <View style={T.retryRow}>
              <Text style={T.retryMsg}>Message not delivered.</Text>
              <TouchableOpacity onPress={onRetry}>
                <Text style={T.retryBtn}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </View>
      </View>
    )
  }

  if (event.type === 'attachment_added') {
    const p = event.payload as Record<string, string>
    const canMenu = (onReply || onDelete) && !isOptimistic
    return (
      <View style={[{ marginBottom: 16 }, highlighted && { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8 }]}>
        {menuSheet}
        <View style={{ paddingLeft: isOwn ? 0 : 44, paddingRight: isOwn ? 44 : 0, marginBottom: 2, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <Text style={T.actorName}>{isOwn ? 'You' : event.actor_name}</Text>
        </View>
        <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={T.avatar}>
            <Text style={T.avatarText}>{getInitials(event.actor_name || '?')}</Text>
          </View>
          <View style={{ flex: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }}>
              <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
                <AttachmentCard orderId={orderId} payload={p} isOwn={isOwn} />
              </Animated.View>
              {canMenu && (
                <TouchableOpacity onPress={() => setMenuFor('attachment')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[T.time, { marginTop: 4 }]}>{formatTimestamp(event.created_at)}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (event.type === 'customer_message' || event.type === 'customer_attachment' || event.type === 'staff_portal_reply') {
    const p = event.payload as Record<string, string>
    const isStaff = event.type === 'staff_portal_reply'
    const senderName = isStaff ? (event.actor_name || 'Staff') : (p.customer_name || 'Customer')
    const avatarBg = isStaff ? '#DBEAFE' : '#D1FAE5'
    const avatarColor = isStaff ? '#3B82F6' : '#10B981'

    if (event.type === 'customer_attachment') {
      const attIdRaw = p.att_id != null ? Number(p.att_id) : null
      const fileName = p.file_name ?? ''
      if (!fileName) return null
      const canMenuAtt = !!onReply && !isOptimistic
      return (
        <View style={[{ marginBottom: 16 }, highlighted && { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8 }]}>
          {menuSheet}
          <View style={{ paddingLeft: isOwn ? 0 : 44, paddingRight: isOwn ? 44 : 0, marginBottom: 2, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <Text style={[T.actorName, { color: avatarColor }]}>{isOwn ? 'You' : senderName}</Text>
          </View>
          <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 10 }}>
            <View style={[T.avatar, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[T.avatarText, { color: '#10B981' }]}>{getInitials(senderName)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
              <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }}>
                <Animated.View style={{
                  position: 'absolute',
                  [isOwn ? 'right' : 'left']: -40,
                  opacity: translateX.interpolate({ inputRange: isOwn ? [-40, -20] : [20, 40], outputRange: isOwn ? [1, 0] : [0, 1], extrapolate: 'clamp' }),
                  transform: [{ scale: translateX.interpolate({ inputRange: isOwn ? [-40, 0] : [0, 40], outputRange: [1, 0.5], extrapolate: 'clamp' }) }]
                }}>
                  <Ionicons name="return-up-back-outline" size={20} color="#6366F1" />
                </Animated.View>
                <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
                  <PortalAttachmentCard orderId={orderId} attId={attIdRaw} fileName={fileName} fileType={p.file_type} isOwn={isOwn} isStaff={false} caption={attCaption} />
                </Animated.View>
                {canMenuAtt && (
                  <TouchableOpacity onPress={() => setMenuFor('attachment')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[T.time, { marginTop: 4 }]}>{formatTimestamp(event.created_at)}</Text>
            </View>
          </View>
        </View>
      )
    }

    const parsed = parsePortalMsg(p.text ?? '')
    if (event.type === 'customer_message' && parsed.tokens.length > 0) return null

    const quotedPortalMsg = parsed.replyToId !== null
      ? (portalMessages ?? []).find(m => m.id === parsed.replyToId) ?? null
      : null

    const canMenuPortal = !!onReply && !isOptimistic

    return (
      <View style={[{ marginBottom: 16 }, highlighted && { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8 }]}>
        {menuSheet}
        <View style={{ paddingLeft: isOwn ? 0 : 44, paddingRight: isOwn ? 44 : 0, marginBottom: 2, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <Text style={[T.actorName, { color: avatarColor }]}>{isOwn ? 'You' : senderName}</Text>
        </View>
        <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={[T.avatar, isStaff ? { backgroundColor: '#DBEAFE' } : { backgroundColor: '#D1FAE5' }]}>
            <Text style={[T.avatarText, { color: isStaff ? '#2563EB' : '#10B981' }]}>{getInitials(senderName)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: 12, justifyContent: 'flex-start' }}>
              <Animated.View style={{
                position: 'absolute',
                [isOwn ? 'right' : 'left']: -40,
                opacity: translateX.interpolate({ inputRange: isOwn ? [-40, -20] : [20, 40], outputRange: isOwn ? [1, 0] : [0, 1], extrapolate: 'clamp' }),
                transform: [{ scale: translateX.interpolate({ inputRange: isOwn ? [-40, 0] : [0, 40], outputRange: [1, 0.5], extrapolate: 'clamp' }) }]
              }}>
                <Ionicons name="return-up-back-outline" size={20} color="#6366F1" />
              </Animated.View>
              <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
                <View style={[T.bubble, { borderColor: isStaff ? '#BFDBFE' : '#A7F3D0', backgroundColor: isStaff ? '#EFF6FF' : '#F0FDF4', borderTopRightRadius: isOwn ? 4 : 14, borderTopLeftRadius: isOwn ? 14 : 4 }]}>
                  {quotedPortalMsg && (() => {
                    const qIsStaff = quotedPortalMsg.sender_type === 'staff'
                    const preview = getPortalMsgPreview(quotedPortalMsg)
                    const thumb = getPortalMsgThumb(quotedPortalMsg, portalAttachments ?? [])
                    return (
                      <TouchableOpacity
                        onPress={() => parsed.replyToId !== null && onHighlightPortalMsg?.(parsed.replyToId)}
                        activeOpacity={onHighlightPortalMsg ? 0.7 : 1}
                        style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 8, borderLeftWidth: 3, borderLeftColor: qIsStaff ? '#3B82F6' : '#10B981', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' }}
                      >
                        <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: qIsStaff ? '#3B82F6' : '#10B981', marginBottom: 1 }} numberOfLines={1}>{quotedPortalMsg.portal_sender}</Text>
                          <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={2}>{preview}</Text>
                        </View>
                        {thumb && (
                          <Image source={{ uri: thumb }} style={{ width: 44, height: 44, flexShrink: 0 }} resizeMode="cover" />
                        )}
                      </TouchableOpacity>
                    )
                  })()}
                  {parsed.text !== '' && <Text style={T.commentText}>{parsed.text}</Text>}
                  {event.type === 'staff_portal_reply' && parsed.tokens.map(tok =>
                    <PortalAttachmentCard key={tok.id} orderId={orderId} attId={tok.id} fileName={tok.name} isOwn={isOwn} isStaff={true} />
                  )}
                </View>
              </Animated.View>
              {canMenuPortal && (
                <TouchableOpacity onPress={() => setMenuFor('comment')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[T.time, { marginTop: 4 }]}>{formatTimestamp(event.created_at)}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (event.type === 'attachment_deleted') {
    const p = event.payload as Record<string, string>
    return (
      <View style={[T.systemRow, { opacity: 0.5 }]}>
        <View style={T.systemIconWrap}>
          <Ionicons name="trash-outline" size={13} color="#9CA3AF" />
        </View>
        <Text style={[T.systemLabel, { fontStyle: 'italic' }]}>
          Attachment deleted{p.file_name ? ` · ${p.file_name}` : ''}
        </Text>
      </View>
    )
  }

  if (event.type === 'portal_message_deleted') {
    return (
      <View style={[T.systemRow, { opacity: 0.5 }]}>
        <View style={T.systemIconWrap}>
          <Ionicons name="trash-outline" size={13} color="#9CA3AF" />
        </View>
        <Text style={[T.systemLabel, { fontStyle: 'italic' }]}>Message deleted</Text>
      </View>
    )
  }

  const label = meta?.label(event.payload as Record<string, string> ?? {}) ?? event.type
  return (
    <View style={T.systemRow}>
      <View style={T.systemIconWrap}>
        <Ionicons name={(meta?.icon ?? 'ellipse-outline') as any} size={13} color="#6B7280" />
      </View>
      <View style={T.systemContent}>
        <Text style={T.systemLabel} numberOfLines={2}>
          <Text style={T.systemActor}>{event.actor_name}</Text>
          {' · '}{label}
        </Text>
        <Text style={T.systemMeta}>{formatTimestamp(event.created_at)}</Text>
      </View>
    </View>
  )
}

// ─── Status Picker Sheet ──────────────────────────────────────────────────────

function StatusSheet({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const insets = useSafeAreaInsets()
  const handlePick = async (status: string) => {
    try {
      await orderService.updateStatus(order.id, status)
      onChanged()
    } catch {
      Alert.alert('Error', 'Could not update status')
    }
    onClose()
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={SS.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[SS.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <Text style={SS.title}>Change Status</Text>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[SS.row, order.status === s && SS.rowActive]}
              onPress={() => handlePick(s)}
            >
              <View style={[SS.dot, { backgroundColor: STATUS_META[s].color }]} />
              <Text style={[SS.rowText, order.status === s && { color: STATUS_META[s].color, fontWeight: '600' }]}>
                {STATUS_META[s].label}
              </Text>
              {order.status === s && <Ionicons name="checkmark" size={18} color={STATUS_META[s].color} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Info Sheet ───────────────────────────────────────────────────────────────

function InfoSheet({ order, portal, onClose, onPortalChange }: {
  order: Order
  portal: PortalStatus | null | undefined
  onClose: () => void
  onPortalChange: (p: PortalStatus | null) => void
}) {
  const insets = useSafeAreaInsets()
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.low
  const due = order.due_date ? new Date(order.due_date + 'T00:00:00') : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dueOverdue = due ? due < today && order.status !== 'completed' : false
  const [copied, setCopied] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleCopyLink = async () => {
    if (!portal?.token) return
    const url = getPortalURL(portal.token)
    try {
      await Share.share({ message: url })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // user dismissed share sheet
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={E.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Order Info</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom + 16, 48) }}>

          {/* Customer */}
          <View style={IN.section}>
            <Text style={IN.label}>CUSTOMER</Text>
            <Text style={IN.value}>{order.customer_name}</Text>
            {!!order.contact_number && <Text style={IN.sub}>{order.contact_number}</Text>}
          </View>

          {/* Status */}
          <View style={IN.section}>
            <Text style={IN.label}>STATUS</Text>
            <View style={[IN.badge, { backgroundColor: sm.bg }]}>
              <Text style={[IN.badgeText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>

          {/* Priority */}
          <View style={IN.section}>
            <Text style={IN.label}>PRIORITY</Text>
            <View style={[IN.badge, { backgroundColor: pm.bg }]}>
              <Text style={[IN.badgeText, { color: pm.color }]}>{pm.label}</Text>
            </View>
          </View>

          {/* Assigned to */}
          {order.assigned_names && order.assigned_names.length > 0 && (
            <View style={IN.section}>
              <Text style={IN.label}>ASSIGNED TO</Text>
              <View style={{ gap: 8, marginTop: 2 }}>
                {order.assigned_names.map((name, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={IN.avatar}>
                      <Text style={IN.avatarText}>{getInitials(name)}</Text>
                    </View>
                    <Text style={IN.value}>{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Due date */}
          {due && (
            <View style={IN.section}>
              <Text style={IN.label}>DUE DATE</Text>
              <Text style={[IN.value, dueOverdue && { color: '#EF4444' }]}>
                {formatDate(order.due_date)}
                {order.due_time ? `  ·  ${fmt12hrStr(order.due_time)}` : ''}
                {dueOverdue ? '  ·  Overdue' : ''}
              </Text>
            </View>
          )}

          {/* Created by */}
          <View style={IN.section}>
            <Text style={IN.label}>CREATED BY</Text>
            <Text style={IN.value}>{order.created_by_name}</Text>
            <Text style={IN.sub}>{formatDate(order.created_at)}</Text>
          </View>

          {/* Description */}
          {!!order.description && (
            <View style={IN.section}>
              <Text style={IN.label}>DESCRIPTION</Text>
              <Text style={[IN.value, { lineHeight: 22 }]}>{order.description}</Text>
            </View>
          )}

          {/* Customer Portal */}
          <View style={IN.section}>
            <Text style={IN.label}>CUSTOMER PORTAL</Text>
            {portal === undefined ? (
              <Text style={IN.sub}>Loading…</Text>
            ) : portal === null ? (
              <TouchableOpacity
                style={IN.portalBtn}
                disabled={portalLoading}
                onPress={async () => {
                  setPortalLoading(true)
                  try {
                    const p = await staffPortalApi.createPortal(order.id, order.customer_name)
                    onPortalChange(p)
                  } catch { Alert.alert('Error', 'Could not create portal') }
                  finally { setPortalLoading(false) }
                }}
              >
                {portalLoading
                  ? <ActivityIndicator size="small" color="#10B981" />
                  : <Text style={IN.portalBtnText}>+ Create portal link</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[IN.dot, { backgroundColor: portal.enabled ? '#10B981' : '#9CA3AF' }]} />
                  <Text style={[IN.value, { fontSize: 13 }]}>{portal.enabled ? 'Active' : 'Revoked'}</Text>
                </View>
                {portal.enabled && (
                  <TouchableOpacity style={IN.copyBtn} onPress={handleCopyLink}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#10B981' : '#64748B'} />
                    <Text style={[IN.copyBtnText, copied && { color: '#10B981' }]}>{copied ? 'Copied!' : 'Copy portal link'}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[IN.portalActionBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                    disabled={portalLoading}
                    onPress={() => Alert.alert('Regenerate link?', 'The old link will stop working immediately.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Regenerate', onPress: async () => {
                        setPortalLoading(true)
                        try {
                          const p = await staffPortalApi.regenerateToken(order.id)
                          onPortalChange(p)
                        } catch { Alert.alert('Error', 'Could not regenerate') }
                        finally { setPortalLoading(false) }
                      }},
                    ])}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#3B82F6' }}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[IN.portalActionBtn, {
                      backgroundColor: portal.enabled ? '#FEF2F2' : '#F3F4F6',
                      borderColor: portal.enabled ? '#FECACA' : '#E5E7EB',
                    }]}
                    disabled={!portal.enabled || portalLoading}
                    onPress={() => Alert.alert('Revoke portal?', 'The customer link will stop working.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Revoke', style: 'destructive', onPress: async () => {
                        setPortalLoading(true)
                        try {
                          await staffPortalApi.revokePortal(order.id)
                          onPortalChange({ ...portal, enabled: false })
                        } catch { Alert.alert('Error', 'Could not revoke') }
                        finally { setPortalLoading(false) }
                      }},
                    ])}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: portal.enabled ? '#EF4444' : '#9CA3AF' }}>
                      {portal.enabled ? 'Revoke' : 'Revoked'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Edit Order Sheet ─────────────────────────────────────────────────────────

function EditOrderSheet({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets()
  const { isOnline } = useNetworkStatus()
  const [title, setTitle] = useState(order.title)
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [contactNumber, setContactNumber] = useState(order.contact_number ?? '')
  const [description, setDescription] = useState(order.description)
  const [priority, setPriority] = useState(order.priority)
  const [dueDate, setDueDate] = useState(order.due_date ?? '')
  const [dueTime, setDueTime] = useState(order.due_time ?? '')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [assignedTo, setAssignedTo] = useState<string[]>(order.assigned_to ?? [])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const editDatePickerRef = useRef<any>(null)
  const editTimePickerRef = useRef<any>(null)

  useEffect(() => {
    orderService.listUsersForAssignment().then(setUsers).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!isOnline) { setError("You're offline."); return }
    if (!title.trim() || !customerName.trim()) { setError('Order ID and Customer Name are required.'); return }
    setLoading(true)
    setError('')
    try {
      await orderService.updateOrder(order.id, {
        title: title.trim(), customer_name: customerName.trim(),
        contact_number: contactNumber.trim(), description: description.trim(),
        priority, assigned_to: assignedTo, due_date: dueDate || null, due_time: dueTime || null,
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Could not save.')
    } finally {
      setLoading(false)
    }
  }

  const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={E.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={E.headerTitle}>Edit Order</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={{ padding: 20 }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 40) }} keyboardShouldPersistTaps="handled">
          {error ? <View style={E.errorBox}><Text style={E.errorText}>{error}</Text></View> : null}

          <Text style={E.label}>Order ID *</Text>
          <TextInput style={E.input} value={title} onChangeText={setTitle} autoCapitalize="characters" />

          <Text style={E.label}>Customer Name *</Text>
          <TextInput style={E.input} value={customerName} onChangeText={setCustomerName} autoCapitalize="words" />

          <Text style={E.label}>Contact Number</Text>
          <TextInput style={E.input} value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />

          <Text style={E.label}>Description</Text>
          <TextInput style={[E.input, { minHeight: 80 }]} value={description} onChangeText={setDescription} multiline textAlignVertical="top" />

          <Text style={E.label}>Priority</Text>
          <View style={E.chipRow}>
            {PRIORITY_OPTIONS.map(p => (
              <TouchableOpacity
                key={p}
                style={[E.chip, priority === p && { backgroundColor: PRIORITY_META[p].bg }]}
                onPress={() => setPriority(p)}
              >
                <Text style={[E.chipText, priority === p && { color: PRIORITY_META[p].color, fontWeight: '700' }]}>
                  {PRIORITY_META[p].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={E.label}>Due Date & Time</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {Platform.OS === 'web' ? (
              <>
                <TouchableOpacity
                  style={[E.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => editDatePickerRef.current?.showPicker?.()}
                  activeOpacity={0.7}
                >
                  <Text style={{ flex: 1, fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                    {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                  <input ref={editDatePickerRef} type="date" value={dueDate || ''}
                    onChange={(e: any) => setDueDate(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[E.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => editTimePickerRef.current?.showPicker?.()}
                  activeOpacity={0.7}
                >
                  <Text style={{ flex: 1, fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
                    {dueTime ? fmt12hrStr(dueTime) : 'Time'}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                  <input ref={editTimePickerRef} type="time" value={dueTime || ''}
                    onChange={(e: any) => setDueTime(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[E.input, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={{ fontSize: 15, color: dueDate ? '#0F172A' : '#94A3B8' }}>
                    {dueDate ? formatDate(dueDate) : 'DD/MM/YYYY'}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[E.input, { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={{ fontSize: 15, color: dueTime ? '#0F172A' : '#94A3B8' }}>
                    {dueTime ? fmt12hrStr(dueTime) : 'Time'}
                  </Text>
                  <Ionicons name="time-outline" size={18} color="#94A3B8" />
                </TouchableOpacity>
                <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                  <View style={PK.overlay}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
                    <View style={[PK.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
                      <View style={PK.header}>
                        <Text style={PK.title}>Select Date</Text>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={PK.done}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={dueDate ? new Date(dueDate + 'T00:00:00') : new Date()}
                        mode="date"
                        display="spinner"
                        onChange={(_, date) => {
                          if (date) {
                            const y = date.getFullYear()
                            const m = String(date.getMonth() + 1).padStart(2, '0')
                            const d = String(date.getDate()).padStart(2, '0')
                            setDueDate(`${y}-${m}-${d}`)
                          }
                        }}
                        style={{ width: '100%', height: 216 }}
                      />
                    </View>
                  </View>
                </Modal>
                <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
                  <View style={PK.overlay}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTimePicker(false)} />
                    <View style={[PK.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
                      <View style={PK.header}>
                        <Text style={PK.title}>Select Time</Text>
                        <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                          <Text style={PK.done}>Done</Text>
                        </TouchableOpacity>
                      </View>
                      <DateTimePicker
                        value={(() => {
                          const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date()
                          if (dueTime) { const [h, min] = dueTime.split(':').map(Number); base.setHours(h, min, 0, 0) }
                          return base
                        })()}
                        mode="time"
                        display="spinner"
                        onChange={(_, date) => {
                          if (date) {
                            setDueTime(`${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`)
                          }
                        }}
                        style={{ width: '100%', height: 216 }}
                      />
                    </View>
                  </View>
                </Modal>
              </>
            )}
          </View>

          <Text style={E.label}>Assign To</Text>
          <View style={E.assignList}>
            <TouchableOpacity
              style={[E.assignRow, assignedTo.length === 0 && E.assignRowActive]}
              onPress={() => setAssignedTo([])}
            >
              <Text style={[E.assignText, assignedTo.length === 0 && { color: '#0F172A', fontWeight: '700' }]}>— Unassigned —</Text>
              {assignedTo.length === 0 && <Ionicons name="checkmark-circle" size={18} color="#0F172A" />}
            </TouchableOpacity>
            {users.map(u => {
              const selected = assignedTo.includes(u.id)
              return (
                <TouchableOpacity
                  key={u.id}
                  style={[E.assignRow, selected && E.assignRowActive]}
                  onPress={() => setAssignedTo(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                >
                  <Text style={[E.assignText, selected && { color: '#0F172A', fontWeight: '700' }]}>{u.name}</Text>
                  {selected ? <Ionicons name="checkbox" size={20} color="#0F172A" /> : <Ionicons name="square-outline" size={20} color="#CBD5E1" />}
                </TouchableOpacity>
              )
            })}
          </View>

          <TouchableOpacity style={E.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={E.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Portal Message Item (swipe-to-reply + long-press action sheet) ──────────

function PortalMessageItem({ msg, messages, portalAttachments, orderId, highlighted, onReply, onHighlight, onLayout }: {
  msg: PortalMessage
  messages: PortalMessage[]
  portalAttachments: PortalAttachment[]
  orderId: string
  highlighted: boolean
  onReply: (msg: PortalMessage) => void
  onHighlight: (msgId: number) => void
  onLayout: (y: number) => void
}) {
  const [actionOpen, setActionOpen] = useState(false)
  const translateX = useRef(new Animated.Value(0)).current
  const replyTriggered = useRef(false)
  const isCustomer = msg.sender_type === 'customer'
  const isStaff = msg.sender_type === 'staff'
  const parsed = parsePortalMsg(msg.message)

  // Keep latest callbacks in refs so PanResponder closure stays fresh
  const onReplyRef = useRef(onReply)
  const msgRef = useRef(msg)
  const isStaffRef = useRef(isStaff)
  useEffect(() => { onReplyRef.current = onReply }, [onReply])
  useEffect(() => { msgRef.current = msg }, [msg])
  useEffect(() => { isStaffRef.current = isStaff }, [isStaff])

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => {
      if (!onReplyRef.current || Math.abs(gs.dx) <= 5) return false
      const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2
      if (!isHorizontal) return false
      // Only capture if swiping "into" the screen
      return isStaffRef.current ? gs.dx < 0 : gs.dx > 0
    },
    onPanResponderGrant: () => { replyTriggered.current = false },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gs) => {
      const clamp = isStaffRef.current ? Math.max(-80, Math.min(0, gs.dx)) : Math.max(0, Math.min(80, gs.dx))
      translateX.setValue(clamp)
      if (Math.abs(clamp) > 40 && !replyTriggered.current) {
        replyTriggered.current = true
      }
      if (Math.abs(clamp) < 20 && replyTriggered.current) {
        replyTriggered.current = false
      }
    },
    onPanResponderRelease: () => {
      if (replyTriggered.current) onReplyRef.current(msgRef.current)
      replyTriggered.current = false
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 40, friction: 7 }).start()
    },
    onPanResponderTerminate: () => {
      replyTriggered.current = false
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
    },
  })).current

  const hasText = parsed.text !== ''
  const hasTokens = parsed.tokens.length > 0
  const quotedMsg = parsed.replyToId !== null ? messages.find(m => m.id === parsed.replyToId) ?? null : null

  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[PC.msgRow, isStaff ? PC.msgRight : PC.msgLeft, highlighted && { backgroundColor: 'rgba(37,211,102,0.15)', borderRadius: 8 }]}
    >
      {/* Long-press action sheet */}
      <Modal visible={actionOpen} transparent animationType="fade" onRequestClose={() => setActionOpen(false)}>
        <TouchableOpacity style={TM.overlay} activeOpacity={1} onPress={() => setActionOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={TM.sheet}>
            <TouchableOpacity style={TM.row} onPress={() => { setActionOpen(false); onReplyRef.current(msgRef.current) }}>
              <Ionicons name="return-up-back-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setActionOpen(false)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {isCustomer && (
        <View style={[PC.msgAvatar, { backgroundColor: '#25d366' }]}>
          <Text style={[PC.msgAvatarText, { color: '#ffffff' }]}>{getInitials(msg.portal_sender || 'C')}</Text>
        </View>
      )}
      <View style={{ maxWidth: '75%', alignItems: isStaff ? 'flex-end' : 'flex-start' }}>
        {isCustomer && (
          <Text style={[PC.msgSender, { color: '#25d366' }]}>{msg.portal_sender}</Text>
        )}

        {/* Swipeable area */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Visual Indicator for Reply */}
          <Animated.View style={{
            position: 'absolute',
            [isStaff ? 'right' : 'left']: -40,
            opacity: translateX.interpolate({
              inputRange: isStaff ? [-40, -20] : [20, 40],
              outputRange: isStaff ? [1, 0] : [0, 1],
              extrapolate: 'clamp'
            }),
            transform: [{
              scale: translateX.interpolate({
                inputRange: isStaff ? [-40, 0] : [0, 40],
                outputRange: [1, 0.5],
                extrapolate: 'clamp'
              })
            }]
          }}>
            <Ionicons name="return-up-back-outline" size={20} color={isStaff ? '#10B981' : '#6B7280'} />
          </Animated.View>

          <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
            {/* Single bubble: quoted + text + attachments all together */}
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={() => setActionOpen(true)}
              style={[
                PC.msgBubble,
                isCustomer ? PC.bubbleCustomer : PC.bubbleStaff,
                isStaff ? { borderTopRightRadius: 2 } : { borderTopLeftRadius: 2 }
              ]}
            >
              {quotedMsg && (() => {
                const qIsCustomer = quotedMsg.sender_type === 'customer'
                const qPreview = getPortalMsgPreview(quotedMsg)
                const qThumb = getPortalMsgThumb(quotedMsg, portalAttachments)
                return (
                  <TouchableOpacity
                    onPress={() => onHighlight(quotedMsg.id)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 6, borderLeftWidth: 3, borderLeftColor: qIsCustomer ? '#10B981' : '#25D366', backgroundColor: isCustomer ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}
                  >
                    <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: qIsCustomer ? '#10B981' : '#25D366', marginBottom: 1 }} numberOfLines={1}>{quotedMsg.portal_sender}</Text>
                      <Text style={{ fontSize: 11, color: isCustomer ? '#6B7280' : 'rgba(255,255,255,0.8)' }} numberOfLines={2}>{qPreview}</Text>
                    </View>
                    {qThumb && (
                      <Image source={{ uri: qThumb }} style={{ width: 44, height: 44, flexShrink: 0 }} resizeMode="cover" />
                    )}
                  </TouchableOpacity>
                )
              })()}
              {hasText && <Text style={[PC.msgText, !isCustomer && { color: '#334155' }]}>{parsed.text}</Text>}
              {hasTokens && parsed.tokens.map((tok, idx) => {
                const att = portalAttachments.find(a => a.id === tok.id)
                const isImg = isImgExt(att?.file_name ?? tok.name)
                return (
                  <View key={tok.id} style={{ marginTop: idx === 0 && (hasText || quotedMsg) ? 6 : idx > 0 ? 4 : 0 }}>
                    {isImg && att?.view_url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(att.view_url)} activeOpacity={0.85}>
                        <Image source={{ uri: att.view_url }} style={{ width: 160, height: 160, borderRadius: 8 }} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => att?.view_url && Linking.openURL(att.view_url)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        <Ionicons name="document-outline" size={14} color="#667781" />
                        <Text style={{ fontSize: 12, color: '#111b21', flex: 1 }} numberOfLines={1}>{att?.file_name ?? tok.name}</Text>
                        {att != null && <Text style={{ fontSize: 10, color: '#667781', flexShrink: 0 }}>{formatBytes(att.file_size)}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
              <Text style={[PC.msgTime, { textAlign: 'right', marginTop: 4 }]}>{formatTimestamp(msg.created_at)}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
      {isStaff && (
        <View style={[PC.msgAvatar, { backgroundColor: '#DBEAFE' }]}>
          <Text style={[PC.msgAvatarText, { color: '#2563EB' }]}>{getInitials(msg.portal_sender || 'S')}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Portal Chat Modal ────────────────────────────────────────────────────────

function PortalChatModal({
  orderId, portal, portalAttachments, onClose, onPortalChange, onAttachmentsChange, refreshRef,
}: {
  orderId: string
  portal: PortalStatus
  portalAttachments: PortalAttachment[]
  onClose: () => void
  onPortalChange: (p: PortalStatus | null) => void
  onAttachmentsChange: (atts: PortalAttachment[]) => void
  refreshRef: React.MutableRefObject<(() => void) | null>
}) {
  const portalInsets = useSafeAreaInsets()
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [reply, setReply] = useState('')
  const [replyTo, setReplyTo] = useState<PortalMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [showAttachSheet, setShowAttachSheet] = useState(false)
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgYPos = useRef<Record<number, number>>({})
  const scrollRef = useRef<ScrollView>(null)

  type UploadingFile = { id: string; name: string; mime: string; progress: number; previewUri?: string; done?: boolean; error?: string }
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])

  const reload = useCallback(async () => {
    const [msgs, atts] = await Promise.all([
      staffPortalApi.getMessages(orderId).catch(() => messages),
      staffPortalApi.listAttachments(orderId).catch(() => portalAttachments),
    ])
    setMessages(msgs)
    onAttachmentsChange(atts)
  }, [orderId, messages, portalAttachments, onAttachmentsChange])

  useEffect(() => {
    refreshRef.current = () => {
      staffPortalApi.getMessages(orderId).then(setMessages).catch(() => {})
      staffPortalApi.listAttachments(orderId).then(onAttachmentsChange).catch(() => {})
    }
    return () => { refreshRef.current = null }
  }, [orderId, refreshRef, onAttachmentsChange])

  useEffect(() => {
    staffPortalApi.getMessages(orderId)
      .then(msgs => { setMessages(msgs); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120) })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false))
  }, [orderId])

  const highlightMsg = (msgId: number) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedMsgId(msgId)
    const yPos = msgYPos.current[msgId]
    if (yPos != null) scrollRef.current?.scrollTo({ y: Math.max(0, yPos - 80), animated: true })
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 5000)
  }

  const handleSend = async () => {
    const text = reply.trim()
    if (!text || sending) return
    const replyPrefix = replyTo ? `[reply:${replyTo.id}]\n` : ''
    setReply('')
    setReplyTo(null)
    setSending(true)
    try {
      const msg = await staffPortalApi.sendReply(orderId, replyPrefix + text)
      setMessages(prev => [...prev, msg])
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    } catch {
      Alert.alert('Error', 'Could not send message')
      setReply(text)
    } finally {
      setSending(false)
    }
  }

  const runPortalUpload = async (uid: string, uri: string, name: string, _mimeType: string, size: number) => {
    try {
      const { upload_url, content_type, s3_key } = await staffPortalApi.getAttachmentUploadURL(orderId, name)
      await attachmentService.uploadToR2(upload_url, uri, content_type, pct =>
        setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, progress: pct } : f))
      )
      const fileExt = '.' + (name.split('.').pop() ?? '').toLowerCase()
      await staffPortalApi.confirmAttachment(orderId, { s3_key, file_name: name, file_type: fileExt, file_size: size })
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, done: true, progress: 100 } : f))
      await reload()
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
      setTimeout(() => setUploadingFiles(prev => prev.filter(f => f.id !== uid)), 1500)
    } catch {
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: 'Upload failed' } : f))
    }
  }

  const uploadPortalFile = async (uri: string, name: string, mimeType: string, size: number) => {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) { Alert.alert('Error', `"${name}" has an unsupported file type.`); return }
    if (size > MAX_FILE_SIZE) { Alert.alert('Error', `"${name}" exceeds the 50 MB limit.`); return }
    const uid = `portal-${Date.now()}`
    setUploadingFiles(prev => [...prev, { id: uid, name, mime: mimeType, progress: 0, previewUri: mimeType.startsWith('image/') ? uri : undefined }])
    runPortalUpload(uid, uri, name, mimeType, size)
  }

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to upload images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.85 })
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadPortalFile(asset.uri, asset.fileName ?? `photo-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0)
      }
    }
  }

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadPortalFile(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0)
      }
    }
  }

  const handleShareLink = () => {
    const url = getPortalURL(portal.token)
    Share.share({ message: `Customer portal link:\n${url}`, url })
  }

  const handleRevoke = () => {
    Alert.alert('Revoke portal?', 'The customer link will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          try {
            await staffPortalApi.revokePortal(orderId)
            const p = await staffPortalApi.getPortal(orderId)
            onPortalChange(p)
          } catch { Alert.alert('Error', 'Could not revoke portal') }
        },
      },
    ])
  }

  const handleRegenerate = () => {
    Alert.alert('Regenerate link?', 'The old link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          try {
            const p = await staffPortalApi.regenerateToken(orderId)
            onPortalChange(p)
          } catch { Alert.alert('Error', 'Could not regenerate link') }
        },
      },
    ])
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={PC.screen}>
          {/* Header */}
          <View style={PC.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={PC.headerTitle}>{portal.customer_name || 'Customer'}</Text>
              <Text style={PC.headerSub} numberOfLines={1}>Customer portal chat</Text>
            </View>
            <TouchableOpacity onPress={handleShareLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 12 }}>
              <Ionicons name="share-outline" size={22} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowOptions(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="ellipsis-vertical" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Status banner if revoked */}
          {!portal.enabled && (
            <View style={PC.revokedBanner}>
              <Ionicons name="ban-outline" size={14} color="#DC2626" />
              <Text style={PC.revokedText}>Portal link is revoked — customer cannot send messages</Text>
            </View>
          )}

          {/* Messages */}
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={PC.msgList}>
            {loadingMsgs ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#94A3B8" />
            ) : messages.length === 0 ? (
              <View style={PC.empty}>
                <Ionicons name="chatbubbles-outline" size={36} color="#CBD5E1" />
                <Text style={PC.emptyText}>No messages yet</Text>
              </View>
            ) : messages.map(msg => (
              <PortalMessageItem
                key={msg.id}
                msg={msg}
                messages={messages}
                portalAttachments={portalAttachments}
                orderId={orderId}
                highlighted={highlightedMsgId === msg.id}
                onReply={setReplyTo}
                onHighlight={highlightMsg}
                onLayout={(y) => { msgYPos.current[msg.id] = y }}
              />
            ))}
          </ScrollView>

          {/* Upload progress */}
          {uploadingFiles.length > 0 && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 5, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              {uploadingFiles.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, backgroundColor: f.done ? '#F0FDF4' : f.error ? '#FFF5F5' : '#FFFFFF', borderWidth: 1, borderColor: f.done ? '#BBF7D0' : f.error ? '#FCA5A5' : '#E5E7EB' }}>
                  {f.previewUri ? (
                    <Image source={{ uri: f.previewUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                  ) : (
                    <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-outline" size={14} color="#6B7280" />
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: '#374151', flex: 1 }} numberOfLines={1}>{f.name}</Text>
                  {f.done ? (
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  ) : f.error ? (
                    <Text style={{ fontSize: 11, color: '#EF4444' }}>Failed</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{f.progress}%</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Reply bar */}
          {replyTo && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderTopWidth: 1, borderTopColor: '#A7F3D0', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
              <Ionicons name="return-up-back-outline" size={16} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981', marginBottom: 1 }}>{replyTo.portal_sender}</Text>
                <Text style={{ fontSize: 12, color: '#374151' }} numberOfLines={1}>{getPortalMsgPreview(replyTo)}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}

          {/* Composer */}
          {portal.enabled && (
            <View style={[S.composer, { paddingBottom: Math.max(portalInsets.bottom + 4, 16) }]}>
              <TouchableOpacity onPress={() => setShowAttachSheet(true)} style={S.attachBtn}>
                <Ionicons name="attach-outline" size={22} color="#64748B" />
              </TouchableOpacity>
              <TextInput
                style={S.composerInput}
                value={reply}
                onChangeText={setReply}
                placeholder="Reply to customer..."
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                style={[S.sendBtn, (!reply.trim() || sending) && S.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!reply.trim() || sending}
              >
                {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Options sheet */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={TM.overlay} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <TouchableOpacity activeOpacity={1} style={TM.sheet}>
            <TouchableOpacity style={TM.row} onPress={() => { setShowOptions(false); handleShareLink() }}>
              <Ionicons name="share-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Share portal link</Text>
            </TouchableOpacity>
            {portal.enabled && (
              <TouchableOpacity style={TM.row} onPress={() => { setShowOptions(false); handleRegenerate() }}>
                <Ionicons name="refresh-outline" size={20} color="#374151" />
                <Text style={TM.rowText}>Regenerate link</Text>
              </TouchableOpacity>
            )}
            {portal.enabled && (
              <TouchableOpacity style={TM.row} onPress={() => { setShowOptions(false); handleRevoke() }}>
                <Ionicons name="ban-outline" size={20} color="#EF4444" />
                <Text style={[TM.rowText, { color: '#EF4444' }]}>Revoke portal</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setShowOptions(false)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={showAttachSheet} transparent animationType="slide" onRequestClose={() => setShowAttachSheet(false)}>
        <TouchableOpacity style={SS.overlay} activeOpacity={1} onPress={() => setShowAttachSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[SS.sheet, { paddingBottom: Math.max(portalInsets.bottom + 16, 24) }]}>
            <Text style={SS.title}>Attach File</Text>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(handlePickImage, 100) }}>
              <Ionicons name="image-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(handlePickDocument, 100) }}>
              <Ionicons name="document-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Files</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setShowAttachSheet(false)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  )
}


// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuthStore()
  const { isOnline } = useNetworkStatus()
  const insets = useSafeAreaInsets()
  const keyboardOffset = insets.top + 56

  const LIMIT = 30

  // ── Permissions (derived after order loads) ──────────────────────────��───────
  const isAdmin = user?.role === 'admin'
  const isAssigned = (o: Order | null) => !!o && (isAdmin || o.assigned_to.includes(user?.id ?? ''))
  const canChangeStatus = (o: Order | null) => isAssigned(o)
  const canDeleteComment = (o: Order | null) => isAssigned(o)

  // ── Order ────────────────────────────────────────────────────────────────────
  const [order, setOrder] = useState<Order | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)

  // ── Events: paginated ────────────────────────────────────────────────────────
  const [evList, setEvList] = useState<OrderEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const olderPageRef = useRef(2)
  const evListRef = useRef<OrderEvent[]>([])
  useEffect(() => { evListRef.current = evList }, [evList])

  // ── Optimistic ───────────────────────────────────────────────────────────────
  const [optimisticEvents, setOptimisticEvents] = useState<(OrderEvent & { failed?: boolean; originalText?: string })[]>([])
  const allEvents = (() => {
    const raw = [...evList, ...optimisticEvents]
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
  })()

  // ── Scroll + new-events badge ────────────────────────────────────────────────
  const [newCount, setNewCount] = useState(0)
  const atBottomRef = useRef(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Portal ───────────────────────────────────────────────────────────────────
  const [portal, setPortal] = useState<PortalStatus | null | undefined>(undefined)
  const [portalAttachments, setPortalAttachments] = useState<PortalAttachment[]>([])
  const [portalMessages, setPortalMessages] = useState<PortalMessage[]>([])
  const [showPortalChat, setShowPortalChat] = useState(false)
  const [portalCreating, setPortalCreating] = useState(false)
  const portalChatRefreshRef = useRef<(() => void) | null>(null)

  // ── Reply-to ─────────────────────────────────────────────────────────────────
  const [replyToEvent, setReplyToEvent] = useState<(OrderEvent & { failed?: boolean }) | null>(null)
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventYPos = useRef<Record<string, number>>({})

  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showAttachSheet, setShowAttachSheet] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingComment, setEditingComment] = useState<{ eventId: string; text: string } | null>(null)
  const [editCommentText, setEditCommentText] = useState('')

  // ── File uploads ─────────────────────────────────────────────────────────────
  type UploadingFile = {
    id: string; name: string; mime: string; progress: number
    previewUri?: string; done?: boolean; error?: string
    retryArgs?: { uri: string; mimeType: string; size: number }
  }
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])

  const scrollRef = useRef<ScrollView>(null)

  // Scroll to bottom when keyboard opens so latest message stays visible
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    })
    return () => sub.remove()
  }, [])

  // ── Fetch order ──────────────────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    if (!id) return
    try {
      const data = await orderService.listOrders({ search: '', page: 1, limit: 200 })
      const found = data.orders.find(o => o.id === id)
      if (found) setOrder(found)
    } catch { /* ignore */ } finally {
      setLoadingOrder(false)
    }
  }, [id])

  // ── Initial events load (newest LIMIT, desc) ─────────────────────────────────
  const loadInitialEvents = useCallback(async () => {
    if (!id) return
    setLoadingEvents(true)
    try {
      const data = await orderService.listEvents(id, 1, LIMIT, 'desc')
      const sorted = [...data.events].reverse()
      setEvList(sorted)
      setTotalEvents(data.total)
      setHasOlder(data.total > LIMIT)
      olderPageRef.current = 2
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120)
    } catch { /* ignore */ } finally {
      setLoadingEvents(false)
    }
  }, [id])

  const refreshPortalData = useCallback(async () => {
    if (!id) return
    const [atts, msgs] = await Promise.all([
      staffPortalApi.listAttachments(id).catch(() => portalAttachments),
      staffPortalApi.getMessages(id).catch(() => portalMessages),
    ])
    setPortalAttachments(atts)
    setPortalMessages(msgs)
  }, [id])

  const highlightEvent = useCallback((eventId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedEventId(eventId)
    const y = eventYPos.current[eventId]
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true })
    highlightTimerRef.current = setTimeout(() => setHighlightedEventId(null), 5000)
  }, [])

  const handleSelectReplyEvent = useCallback((ev: OrderEvent & { failed?: boolean }) => {
    setReplyToEvent(ev)
    scrollRef.current?.scrollToEnd({ animated: true })
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

  useEffect(() => {
    fetchOrder()
    loadInitialEvents()
    if (id) {
      staffPortalApi.getPortal(id).then(setPortal).catch(() => setPortal(null))
      refreshPortalData()
    }
  }, [fetchOrder, loadInitialEvents, id])

  // ── Load older ───────────────────────────────────────────────────────────────
  const loadOlder = async () => {
    if (loadingOlder || !id) return
    setLoadingOlder(true)
    try {
      const data = await orderService.listEvents(id, olderPageRef.current, LIMIT, 'desc')
      const older = [...data.events].reverse()
      setEvList(prev => [...older, ...prev])
      setTotalEvents(data.total)
      setHasOlder(olderPageRef.current * LIMIT < data.total)
      olderPageRef.current++
    } catch { /* ignore */ } finally {
      setLoadingOlder(false)
    }
  }

  // ── Realtime append ──────────────────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!id) return
    try {
      const data = await orderService.listEvents(id, 1, LIMIT, 'desc')
      const latest = [...data.events].reverse()
      let added = 0
      setEvList(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEvs = latest.filter(e => !existingIds.has(e.id))
        added = newEvs.length
        return newEvs.length === 0 ? prev : [...prev, ...newEvs]
      })
      // Always clear non-failed optimistic events: socket may have inserted the
      // real event before this fetch ran, so added===0 but the dimmed copy is still visible
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
  }, [id])

  useOrderSocket(
    () => { fetchOrder(); fetchLatest() },
    (event) => {
      if (event.type === 'order.event_added') {
        const incoming = event.payload as any
        if ((incoming?.type === 'customer_message' || incoming?.type === 'staff_portal_reply') && id) {
          portalChatRefreshRef.current?.()
          refreshPortalData()
        }
        if (incoming?.id) {
          setEvList(prev => {
            if (prev.some(e => e.id === incoming.id)) {
              return prev.map(e => e.id === incoming.id ? { ...e, ...incoming } : e)
            }
            return prev // new events are handled by fetchLatest via callbackRef
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

  // ── File upload ──────────────────────────────────────────────────────────────
  const runUpload = async (uid: string, uri: string, name: string, mimeType: string, size: number) => {
    if (!id) return
    try {
      const { upload_url, file_key, file_url } = await attachmentService.getUploadURL(id, name, mimeType, size)
      await attachmentService.uploadToR2(upload_url, uri, mimeType, pct => {
        setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, progress: pct } : f))
      })
      await attachmentService.confirmUpload(id, { file_name: name, file_key, file_url, mime_type: mimeType, size_bytes: size })
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, done: true, progress: 100 } : f))
      setTimeout(() => setUploadingFiles(prev => prev.filter(f => f.id !== uid)), 1500)
    } catch {
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: 'Upload failed' } : f))
    }
  }

  const uploadFile = async (uri: string, name: string, mimeType: string, size: number) => {
    if (!id) return
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) { Alert.alert('Error', `"${name}" has an unsupported file type.`); return }
    if (size > MAX_FILE_SIZE) { Alert.alert('Error', `"${name}" exceeds the 50 MB limit.`); return }
    const uid = `upload-${Date.now()}`
    const previewUri = mimeType.startsWith('image/') ? uri : undefined
    setUploadingFiles(prev => [...prev, { id: uid, name, mime: mimeType, progress: 0, previewUri, retryArgs: { uri, mimeType, size } }])
    runUpload(uid, uri, name, mimeType, size)
  }

  const retryUpload = (uid: string) => {
    const entry = uploadingFiles.find(f => f.id === uid)
    if (!entry?.retryArgs) return
    setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: undefined, progress: 0 } : f))
    runUpload(uid, entry.retryArgs.uri, entry.name, entry.retryArgs.mimeType, entry.retryArgs.size)
  }

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to upload images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.85 })
    if (!result.canceled) {
      for (const asset of result.assets) {
        const name = asset.fileName ?? `photo-${Date.now()}.jpg`
        const mime = asset.mimeType ?? 'image/jpeg'
        await uploadFile(asset.uri, name, mime, asset.fileSize ?? 0)
      }
    }
  }

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadFile(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0)
      }
    }
  }

  const handleAttachPress = () => setShowAttachSheet(true)

  const onRefresh = () => {
    setRefreshing(true)
    Promise.all([fetchOrder(), loadInitialEvents()]).finally(() => setRefreshing(false))
  }

  // ── Send comment ─────────────────────────────────────────────────────────────
  const sendComment = async (text: string, tempId?: string) => {
    if (!isOnline) { Alert.alert('Offline', "You're offline. Please reconnect to send."); return }
    const id_ = tempId ?? `temp-${Date.now()}`
    if (!tempId) {
      setOptimisticEvents(prev => [...prev, {
        id: id_, order_id: id!, type: 'comment_added',
        actor_id: user?.id ?? null, actor_name: user ? `${user.first_name} ${user.last_name}`.trim() : 'You',
        payload: { text } as any, created_at: new Date().toISOString(),
        originalText: text,
      }])
      atBottomRef.current = true
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    }
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      await orderService.addComment(id!, text)
      await fetchLatest()
    } catch {
      setOptimisticEvents(prev => prev.map(e => e.id === id_ ? { ...e, failed: true } : e))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const handleSendComment = async () => {
    const text = comment.trim()
    if (!text || sendingRef.current) return
    const replyPrefix = replyToEvent ? `[reply:${replyToEvent.id}:${getEventPreview(replyToEvent)}]\n` : ''
    setComment('')
    setReplyToEvent(null)
    await sendComment(replyPrefix + text)
  }

  const handleRetry = async (ev: OrderEvent & { failed?: boolean; originalText?: string }) => {
    const text = ev.originalText ?? (ev.payload as Record<string, string>).text
    if (!text) return
    setOptimisticEvents(prev => prev.map(e => e.id === ev.id ? { ...e, failed: false } : e))
    await sendComment(text, ev.id)
  }

  const handleDeleteComment = (eventId: string) => setDeleteConfirmId(eventId)

  const confirmDelete = async () => {
    if (!deleteConfirmId) return
    const eventId = deleteConfirmId
    const ev = evListRef.current.find(e => e.id === eventId)
    setDeleteConfirmId(null)
    try {
      await orderService.deleteComment(id!, eventId)
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
  }

  if (loadingOrder) {
    return (
      <View style={S.loadingScreen}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={S.loadingScreen}>
        <Ionicons name="alert-circle-outline" size={40} color="#94A3B8" />
        <Text style={{ color: '#64748B', marginTop: 12 }}>Order not found</Text>
        <TouchableOpacity style={S.backBtn} onPress={() => router.back()}>
          <Text style={S.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset : 0}>
      <View style={S.screen}>
        {/* Header */}
        <View style={[S.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={S.headerCenter}>
            <Text style={S.headerTitle} numberOfLines={1}>#{order.title}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="information-circle-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowEdit(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="create-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Chip row */}
        <View style={S.chipRow}>
          <TouchableOpacity
            style={[S.chip, { backgroundColor: sm.bg }]}
            onPress={canChangeStatus(order) ? () => setShowStatus(true) : undefined}
            activeOpacity={canChangeStatus(order) ? 0.7 : 1}
          >
            <Text style={[S.chipText, { color: sm.color }]}>{sm.label}</Text>
            <Ionicons name="chevron-down" size={13} color={sm.color} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
          <View style={[S.chip, { backgroundColor: pm.bg }]}>
            <Text style={[S.chipText, { color: pm.color }]}>{pm.label}</Text>
          </View>
          <View style={[S.chip, { backgroundColor: '#F8FAFC' }]}>
            <Ionicons name="person-outline" size={13} color="#64748B" />
            <Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>
              {order.assigned_names?.length > 0
                ? order.assigned_names[0].split(' ')[0] + (order.assigned_names.length > 1 ? ` +${order.assigned_names.length - 1}` : '')
                : 'Unassigned'}
            </Text>
          </View>
          {order.due_date && (
            <View style={[S.chip, { backgroundColor: '#F8FAFC' }]}>
              <Ionicons name="calendar-outline" size={13} color="#64748B" />
              <Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>
                {formatDate(order.due_date)}
              </Text>
            </View>
          )}
          {portal !== undefined && (
            portal ? (
              <TouchableOpacity
                style={[S.chip, { backgroundColor: portal.enabled ? '#F0FDF4' : '#F9FAFB', borderWidth: 1, borderColor: portal.enabled ? '#A7F3D0' : '#E5E7EB' }]}
                onPress={portal.enabled ? () => setShowPortalChat(true) : undefined}
                activeOpacity={portal.enabled ? 0.7 : 1}
              >
                <Ionicons name="chatbubbles-outline" size={13} color={portal.enabled ? '#059669' : '#9CA3AF'} />
                <Text style={[S.chipText, { color: portal.enabled ? '#059669' : '#9CA3AF', marginLeft: 4 }]}>
                  {portal.enabled ? 'Portal Chat' : 'Revoked'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[S.chip, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }]}
                onPress={async () => {
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
                }}
                activeOpacity={0.7}
                disabled={portalCreating}
              >
                {portalCreating
                  ? <ActivityIndicator size="small" color="#64748B" />
                  : <><Ionicons name="add-outline" size={13} color="#64748B" /><Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>Create Portal</Text></>
                }
              </TouchableOpacity>
            )
          )}
        </View>

        {/* Timeline */}
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={S.timeline}
            contentContainerStyle={S.timelineContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0F172A" />}
            onScroll={e => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
              atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40
              if (atBottomRef.current && newCount > 0) setNewCount(0)
            }}
            scrollEventThrottle={100}
            keyboardShouldPersistTaps="handled"
          >
            {hasOlder && (
              <TouchableOpacity style={S.loadOlderBtn} onPress={loadOlder} disabled={loadingOlder}>
                {loadingOlder
                  ? <ActivityIndicator size="small" color="#64748B" />
                  : <Text style={S.loadOlderText}>Load older messages</Text>
                }
              </TouchableOpacity>
            )}
            {loadingEvents ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color="#94A3B8" />
              </View>
            ) : allEvents.length === 0 ? (
              <View style={S.emptyTimeline}>
                <Ionicons name="chatbubbles-outline" size={28} color="#CBD5E1" />
                <Text style={S.emptyTimelineText}>No activity yet. Add a comment below.</Text>
              </View>
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
                  for (const attId of tokens) portalAttCaptions.set(attId, caption)
                }
              }
              const groups = groupByDate(allEvents)
              const flatItems: React.ReactNode[] = []
              
              groups.forEach(group => {
                // Add Divider
                flatItems.push(
                  <View key={`divider-${group.label}`} style={S.dateDivider}>
                    <View style={S.dateDividerLine} />
                    <Text style={S.dateDividerLabel}>{group.label}</Text>
                    <View style={S.dateDividerLine} />
                  </View>
                )
                
                // Add Events
                group.events.forEach(ev => {
                  const rawText = ev.type === 'comment_added' ? ((ev as any).payload?.text ?? '') : ''
                  const { replyEventId } = rawText ? parseCommentText(rawText) : { replyEventId: null }
                  const quotedEv = replyEventId ? allEvents.find(e => e.id === replyEventId) as (OrderEvent & { failed?: boolean }) | undefined : undefined
                  
                  const attCaption = ev.type === 'customer_attachment' && (ev.payload as any)?.att_id
                    ? portalAttCaptions.get(Number((ev.payload as any).att_id))
                    : undefined

                  flatItems.push(
                    <View
                      key={ev.id}
                      onLayout={(e) => { eventYPos.current[ev.id] = e.nativeEvent.layout.y }}
                    >
                      <TimelineItem
                        event={ev as any}
                        orderId={id!}
                        isOptimistic={ev.id.startsWith('temp-')}
                        onRetry={() => handleRetry(ev as any)}
                        onDelete={canDeleteComment(order) && (ev.type === 'comment_added' || ev.type === 'attachment_added') ? () => handleDeleteComment(ev.id) : undefined}
                        onEdit={canDeleteComment(order) && ev.type === 'comment_added' ? (currentText: string) => {
                          setEditingComment({ eventId: ev.id, text: currentText })
                          setEditCommentText(currentText)
                        } : undefined}
                        onReply={(!ev.id.startsWith('temp-') && (
                          ev.type === 'comment_added' || 
                          ev.type === 'attachment_added' || 
                          ev.type === 'staff_portal_reply' || 
                          ev.type === 'customer_message' || 
                          ev.type === 'customer_attachment'
                        )) ? () => handleSelectReplyEvent(ev as any) : undefined}
                        onHighlightQuoted={replyEventId ? () => highlightEvent(replyEventId) : undefined}
                        onHighlightPortalMsg={highlightPortalMsg}
                        quotedEvent={quotedEv ?? null}
                        portalMessages={portalMessages}
                        portalAttachments={portalAttachments}
                        highlighted={highlightedEventId === ev.id}
                        attCaption={attCaption}
                      />
                    </View>
                  )
                })
              })
              
              return flatItems
            })()}
          </ScrollView>
          {newCount > 0 && (
            <TouchableOpacity
              style={S.newBadge}
              onPress={() => { scrollRef.current?.scrollToEnd({ animated: true }); setNewCount(0) }}
            >
              <Text style={S.newBadgeText}>{newCount} new update{newCount > 1 ? 's' : ''} ↓</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upload progress */}
        {uploadingFiles.length > 0 && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 5, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
            {uploadingFiles.map(f => {
              const iconColor = f.mime === 'application/pdf' ? '#EF4444'
                : f.mime.includes('word') ? '#3B82F6'
                : f.mime.includes('sheet') || f.mime.includes('excel') ? '#10B981'
                : '#6B7280'
              return (
                <View key={f.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8,
                  backgroundColor: f.done ? '#F0FDF4' : f.error ? '#FFF5F5' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: f.done ? '#BBF7D0' : f.error ? '#FCA5A5' : '#E5E7EB',
                }}>
                  {f.previewUri ? (
                    <Image source={{ uri: f.previewUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                  ) : (
                    <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: iconColor + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-outline" size={14} color={iconColor} />
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: '#374151', flex: 1 }} numberOfLines={1}>{f.name}</Text>
                  {f.done ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="checkmark" size={13} color="#10B981" />
                      <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>Done</Text>
                    </View>
                  ) : f.error ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, color: '#EF4444' }}>Failed</Text>
                      <TouchableOpacity onPress={() => retryUpload(f.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: 11, color: '#6366F1', fontWeight: '600' }}>Retry</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setUploadingFiles(prev => prev.filter(x => x.id !== f.id))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close" size={13} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{f.progress}%</Text>
                      <View style={{ width: 50, height: 4, backgroundColor: '#E2E8F0', borderRadius: 9999, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${f.progress}%`, backgroundColor: '#6366F1' }} />
                      </View>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* Reply bar */}
        {replyToEvent && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', borderTopWidth: 1, borderTopColor: '#C7D2FE', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
            <Ionicons name="return-up-back-outline" size={16} color="#6366F1" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#6366F1', marginBottom: 1 }}>{getEventSenderName(replyToEvent)}</Text>
              <Text style={{ fontSize: 12, color: '#374151' }} numberOfLines={1}>{getEventPreview(replyToEvent)}</Text>
            </View>
            {(() => {
              const thumb = getEventThumb(replyToEvent, portalAttachments)
              if (!thumb) return null
              return <Image source={{ uri: thumb }} style={{ width: 36, height: 36, borderRadius: 4 }} resizeMode="cover" />
            })()}
            <TouchableOpacity onPress={() => setReplyToEvent(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={[S.composer, { paddingBottom: Math.max(insets.bottom + 4, 16) }]}>
          <TouchableOpacity onPress={handleAttachPress} style={S.attachBtn}>
            <Ionicons name="attach-outline" size={22} color="#64748B" />
          </TouchableOpacity>
          <TextInput
            style={S.composerInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment..."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[S.sendBtn, (!comment.trim() || sending) && S.sendBtnDisabled]}
            onPress={handleSendComment}
            disabled={!comment.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Ionicons name="send" size={18} color="#FFFFFF" />
            }
          </TouchableOpacity>
        </View>
      </View>

      {showStatus && order && (
        <StatusSheet
          order={order}
          onClose={() => setShowStatus(false)}
          onChanged={() => { fetchOrder(); fetchLatest() }}
        />
      )}
      {showInfo && order && (
        <InfoSheet
          order={order}
          portal={portal}
          onClose={() => setShowInfo(false)}
          onPortalChange={setPortal}
        />
      )}
      {showEdit && order && (
        <EditOrderSheet
          order={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => { fetchOrder(); fetchLatest() }}
        />
      )}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <TouchableOpacity style={EC.overlay} activeOpacity={1} onPress={() => setDeleteConfirmId(null)}>
          <TouchableOpacity activeOpacity={1} style={EC.sheet}>
            <Text style={EC.title}>Delete?</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>This action cannot be undone.</Text>
            <View style={EC.actions}>
              <TouchableOpacity style={EC.cancelBtn} onPress={() => setDeleteConfirmId(null)}>
                <Text style={EC.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[EC.saveBtn, { backgroundColor: '#EF4444' }]} onPress={confirmDelete}>
                <Text style={EC.saveText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <Modal visible={showAttachSheet} transparent animationType="slide" onRequestClose={() => setShowAttachSheet(false)}>
        <TouchableOpacity style={SS.overlay} activeOpacity={1} onPress={() => setShowAttachSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[SS.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <Text style={SS.title}>Attach File</Text>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(handlePickImage, 100) }}>
              <Ionicons name="image-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(handlePickDocument, 100) }}>
              <Ionicons name="document-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Files</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setShowAttachSheet(false)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <Modal visible={!!editingComment} transparent animationType="fade" onRequestClose={() => setEditingComment(null)}>
        <TouchableOpacity style={EC.overlay} activeOpacity={1} onPress={() => setEditingComment(null)}>
          <TouchableOpacity activeOpacity={1} style={EC.sheet}>
            <Text style={EC.title}>Edit comment</Text>
            <TextInput
              style={EC.input}
              value={editCommentText}
              onChangeText={setEditCommentText}
              multiline
              autoFocus
              placeholder="Edit your comment..."
              placeholderTextColor="#9CA3AF"
            />
            <View style={EC.actions}>
              <TouchableOpacity style={EC.cancelBtn} onPress={() => setEditingComment(null)}>
                <Text style={EC.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[EC.saveBtn, !editCommentText.trim() && { opacity: 0.4 }]}
                disabled={!editCommentText.trim()}
                onPress={async () => {
                  if (!editingComment || !editCommentText.trim()) return
                  const { eventId } = editingComment
                  const newText = editCommentText.trim()
                  setEditingComment(null)
                  try {
                    await orderService.editComment(id!, eventId, newText)
                    setEvList(prev => prev.map(e => e.id === eventId ? { ...e, payload: { ...(e.payload as object), text: newText } as any } : e))
                  } catch {
                    Alert.alert('Error', 'Could not edit comment')
                  }
                }}
              >
                <Text style={EC.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {showPortalChat && portal && (
        <PortalChatModal
          orderId={id!}
          portal={portal}
          portalAttachments={portalAttachments}
          onClose={() => setShowPortalChat(false)}
          onPortalChange={p => { if (p) setPortal(p); else setPortal(null) }}
          onAttachmentsChange={setPortalAttachments}
          refreshRef={portalChatRefreshRef}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerOrderNum: { fontSize: 12, fontWeight: '600', color: '#94A3B8', letterSpacing: 0.5 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },

  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  timeline: { flex: 1, backgroundColor: '#F8FAFC' },
  timelineContent: { padding: 16, paddingBottom: 8 },

  emptyTimeline: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTimelineText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dateDividerLabel: { fontSize: 11.5, fontWeight: '600', color: '#94A3B8' },

  attachBtn: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  composerInput: {
    flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#0F172A', maxHeight: 120, minHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },

  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnText: { color: '#0F172A', fontWeight: '700' },

  loadOlderBtn: { alignItems: 'center', paddingVertical: 12 },
  loadOlderText: { fontSize: 13, color: '#64748B', fontWeight: '600' },

  newBadge: {
    position: 'absolute', bottom: 10, alignSelf: 'center',
    backgroundColor: '#0F172A', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  newBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
})

const T = StyleSheet.create({
  commentRow: { gap: 10, marginBottom: 16, alignItems: 'flex-start' },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  bubble: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', maxWidth: '75%', minWidth: 60 },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  actorName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  time: { fontSize: 11, color: '#94A3B8' },
  commentText: { fontSize: 14, color: '#334155', lineHeight: 20 },

  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  retryMsg: { fontSize: 12, color: '#EF4444' },
  retryBtn: { fontSize: 12, fontWeight: '700', color: '#6366F1', textDecorationLine: 'underline' },

  systemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  systemIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  systemContent: { flex: 1 },
  systemActor: { fontSize: 12.5, color: '#374151', fontWeight: '600' },
  systemLabel: { fontSize: 12.5, color: '#64748B', fontWeight: '400' },
  systemMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
})

const TM = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 36 : 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 24,
  },
  rowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '500', flex: 1, textAlign: 'center' },
})

const PK = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  done: { fontSize: 15, fontWeight: '700', color: '#6366F1' },
})

const EC = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111827', minHeight: 80,
    textAlignVertical: 'top', fontFamily: 'System',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#6366F1' },
  saveText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
})

const SS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  rowActive: { backgroundColor: '#F8FAFC' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
})

const E = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#FEE2E2' },
  errorText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0F172A' },
  chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  assignList: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  assignRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  assignRowActive: { backgroundColor: '#F8FAFC' },
  assignText: { fontSize: 15, color: '#475569' },
  saveBtn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})

const PC = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 16,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  revokedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FEE2E2',
  },
  revokedText: { fontSize: 13, color: '#DC2626', flex: 1 },
  msgList: { padding: 16, paddingBottom: 8, gap: 4 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#94A3B8' },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  msgAvatarText: { fontSize: 11, fontWeight: '700' },
  msgSender: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 3 },
  msgBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, minWidth: 60 },
  bubbleCustomer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleStaff: { backgroundColor: '#D9FDD3' },
  msgText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  msgTime: { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
})

const IN = StyleSheet.create({
  section: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 6 },
  value: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#6366F1' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    marginTop: 2,
  },
  copyBtnText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  portalBtn: {
    width: '100%', paddingVertical: 9, borderRadius: 8,
    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#A7F3D0',
    alignItems: 'center', justifyContent: 'center',
  },
  portalBtnText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  portalActionBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
})
