import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import type { OrderEvent } from '../../../services/orderService'
import type { PortalMessage, PortalAttachment } from '../../../services/portalService'
import { useAuthStore } from '../../../store/authStore'
import { AttachmentCard } from './AttachmentCard'
import { PortalAttachmentCard } from './PortalAttachmentCard'
import { SystemEventRow } from './SystemEventRow'
import { parseCommentText, parsePortalMsg, getEventSenderName, getEventThumb, getInitials, getPortalMsgPreview, getPortalMsgThumb } from '../_hooks/useOrderDetail'
import { AVATAR_SIZE, BUBBLE_MAX_W, GAP, C } from '../_styles/theme'
import { formatRelative } from '../../../utils/date'

const CHAT_TYPES = new Set([
  'comment_added', 'attachment_added',
  'customer_message', 'customer_attachment', 'staff_portal_reply',
])

function formatTimestamp(iso: string) { return formatRelative(iso) }

// ─── Reply-quote block ────────────────────────────────────────────────────────

function ReplyQuote({ senderName, previewText, thumb, borderColor, onPress }: {
  senderName?: string
  previewText: string
  thumb?: string | null
  borderColor: string
  onPress?: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 8, borderLeftWidth: 3, borderLeftColor: borderColor, backgroundColor: '#EEF2FF', borderRadius: 4, overflow: 'hidden' }}
    >
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4 }}>
        {senderName && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: borderColor, marginBottom: 1 }} numberOfLines={1}>{senderName}</Text>
        )}
        <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={2}>{previewText}</Text>
      </View>
      {thumb && (
        <Image source={{ uri: thumb }} style={{ width: 44, height: 44 }} resizeMode="cover" />
      )}
    </TouchableOpacity>
  )
}

// ─── Menu sheet ───────────────────────────────────────────────────────────────

function MenuSheet({ visible, onClose, onReply, onEdit, onDelete, forAttachment }: {
  visible: boolean
  onClose: () => void
  onReply?: () => void
  onEdit?: () => void
  onDelete?: () => void
  forAttachment?: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={TM.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={TM.sheet}>
          {onReply && (
            <TouchableOpacity style={TM.row} onPress={() => { onClose(); onReply() }}>
              <Ionicons name="return-up-back-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Reply</Text>
            </TouchableOpacity>
          )}
          {onEdit && !forAttachment && (
            <TouchableOpacity style={TM.row} onPress={() => { onClose(); onEdit() }}>
              <Ionicons name="pencil-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Edit</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={TM.row} onPress={() => { onClose(); onDelete() }}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[TM.rowText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={onClose}>
            <Text style={TM.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── TimelineItem ─────────────────────────────────────────────────────────────

export function TimelineItem({
  event, isOptimistic, onRetry, onDelete, onEdit, onReply,
  onHighlightQuoted, onHighlightPortalMsg,
  orderId, portalMessages, portalAttachments, quotedEvent, highlighted, attCaption,
  onPreviewImage,
}: {
  event: OrderEvent & { failed?: boolean }
  isOptimistic?: boolean
  onRetry?: () => void
  onDelete?: () => void
  onEdit?: (text: string) => void
  onReply?: () => void
  onHighlightQuoted?: () => void
  onHighlightPortalMsg?: (id: number) => void
  orderId: string
  portalMessages?: PortalMessage[]
  portalAttachments?: PortalAttachment[]
  quotedEvent?: (OrderEvent & { failed?: boolean }) | null
  highlighted?: boolean
  attCaption?: string
  onPreviewImage?: (uri: string, filename: string, fileSizeBytes?: number, onReply?: () => void, onDelete?: () => void, onDownload?: () => void, sourceAttachmentId?: string) => void
}) {
  const { user } = useAuthStore()
  const isOwn = String(event.actor_id) === String(user?.id)
  const [menuOpen, setMenuOpen] = useState(false)

  // ── System events ────────────────────────────────────────────────────────

  if (!CHAT_TYPES.has(event.type)) {
    return <SystemEventRow event={event} />
  }

  // ── Shared helpers ───────────────────────────────────────────────────────

  const highlightStyle = highlighted ? { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 8 } : {}

  // Avatar+bubble wrapper
  // alignSelf shrink-wraps the row so avatar bottom = bubble bottom
  function BubbleRow({ avatarBg, avatarTextColor, senderInitials, children, canMenu, forAttachment }: {
    avatarBg: string
    avatarTextColor: string
    senderInitials: string
    children: React.ReactNode
    canMenu: boolean
    forAttachment?: boolean
  }) {
    return (
      <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: GAP, alignSelf: isOwn ? 'flex-end' : 'flex-start' }}>
        <View style={[T.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[T.avatarText, { color: avatarTextColor }]}>{senderInitials}</Text>
        </View>
        {/* No flex:1 — shrink-wraps to bubble height exactly */}
        <View style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <View style={{ flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
            <View>{children}</View>
            {canMenu && (
              <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )
  }

  function NameRow({ name, color }: { name: string; color?: string }) {
    return (
      <View style={{ paddingLeft: isOwn ? 0 : AVATAR_SIZE + GAP, paddingRight: isOwn ? AVATAR_SIZE + GAP : 0, marginBottom: 2, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        <Text style={[T.actorName, color ? { color } : {}]}>{name}</Text>
      </View>
    )
  }

  function TimeRow({ time, failed }: { time: string; failed?: boolean }) {
    return (
      <View style={{ paddingLeft: isOwn ? 0 : AVATAR_SIZE + GAP, paddingRight: isOwn ? AVATAR_SIZE + GAP : 0, marginTop: 3, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        <Text style={[T.time, failed ? { color: '#EF4444' } : {}]}>{time}</Text>
      </View>
    )
  }

  // ── comment_added ────────────────────────────────────────────────────────

  if (event.type === 'comment_added') {
    const rawText = (event.payload as Record<string, string>).text ?? ''
    const { replyPreview, cleanText } = parseCommentText(rawText)
    const isFailed = event.failed
    const canMenu = !!(onDelete || onEdit || onReply) && !isOptimistic

    return (
      <View style={[{ marginBottom: 16 }, isOptimistic && !isFailed && { opacity: 0.6 }, highlightStyle]}>
        <MenuSheet
          visible={menuOpen} onClose={() => setMenuOpen(false)}
          onReply={onReply} onEdit={onEdit ? () => onEdit(rawText) : undefined} onDelete={onDelete}
        />
        <NameRow name={isOwn ? 'You' : event.actor_name} />
        <BubbleRow
          avatarBg={C.avatarStaffBg} avatarTextColor={C.avatarStaffText}
          senderInitials={getInitials(event.actor_name || '?')}
          canMenu={canMenu}
        >
          <View style={[T.bubble, isFailed && { backgroundColor: C.failBubbleBg, borderColor: C.failBubbleBorder }, isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }]}>
            {replyPreview && (
              <ReplyQuote
                senderName={quotedEvent ? getEventSenderName(quotedEvent) : undefined}
                previewText={replyPreview}
                thumb={quotedEvent ? getEventThumb(quotedEvent, portalAttachments) : null}
                borderColor={C.indigo}
                onPress={onHighlightQuoted}
              />
            )}
            <Text style={T.commentText}>{cleanText}</Text>
          </View>
        </BubbleRow>
        <TimeRow time={isFailed ? 'Failed to send' : formatTimestamp(event.created_at)} failed={isFailed} />
        {isFailed && (
          <View style={{ paddingLeft: isOwn ? 0 : AVATAR_SIZE + GAP, paddingRight: isOwn ? AVATAR_SIZE + GAP : 0, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <View style={T.retryRow}>
              <Text style={T.retryMsg}>Message not delivered.</Text>
              <TouchableOpacity onPress={onRetry}>
                <Text style={T.retryBtn}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )
  }

  // ── attachment_added ──────────────────────────────────────────────────────

  if (event.type === 'attachment_added') {
    const p = event.payload as Record<string, string>
    const canMenu = !!(onReply || onDelete) && !isOptimistic
    return (
      <View style={[{ marginBottom: 16 }, highlightStyle]}>
        <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onReply={onReply} onDelete={onDelete} forAttachment />
        <NameRow name={isOwn ? 'You' : event.actor_name} />
        <BubbleRow
          avatarBg={C.avatarStaffBg} avatarTextColor={C.avatarStaffText}
          senderInitials={getInitials(event.actor_name || '?')}
          canMenu={canMenu} forAttachment
        >
          <AttachmentCard
            orderId={orderId}
            payload={p}
            isOwn={isOwn}
            onPreview={onPreviewImage ? (uri, onDownload) => onPreviewImage(
              uri, p.file_name,
              Number(p.size_bytes) || undefined,
              onReply, onDelete, onDownload,
              p.att_id || undefined,
            ) : undefined}
          />
        </BubbleRow>
        <TimeRow time={formatTimestamp(event.created_at)} />
      </View>
    )
  }

  // ── customer_message / customer_attachment / staff_portal_reply ───────────

  if (event.type === 'customer_message' || event.type === 'customer_attachment' || event.type === 'staff_portal_reply') {
    const p = event.payload as Record<string, string>
    const isStaff = event.type === 'staff_portal_reply'
    const senderName = isStaff ? (event.actor_name || 'Staff') : (p.customer_name || 'Customer')
    const avatarBg    = isStaff ? C.avatarPortalStaffBg    : C.avatarCustomerBg
    const avatarColor = isStaff ? C.avatarPortalStaffText   : C.avatarCustomerText
    const nameColor   = isStaff ? C.avatarPortalStaffText   : C.avatarCustomerText

    // customer_attachment path
    if (event.type === 'customer_attachment') {
      const attIdRaw = p.att_id != null ? Number(p.att_id) : null
      const fileName = p.file_name ?? ''
      if (!fileName) return null
      const canMenu = !!onReply && !isOptimistic
      return (
        <View style={[{ marginBottom: 16 }, highlightStyle]}>
          <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onReply={onReply} forAttachment />
          <NameRow name={isOwn ? 'You' : senderName} color={nameColor} />
          <BubbleRow avatarBg={avatarBg} avatarTextColor={avatarColor} senderInitials={getInitials(senderName)} canMenu={canMenu} forAttachment>
            <PortalAttachmentCard
              orderId={orderId} attId={attIdRaw} fileName={fileName} fileType={p.file_type}
              isOwn={isOwn} isStaff={false} caption={attCaption}
              onPreview={onPreviewImage ? (uri, onDownload) => {
                const sz = portalAttachments?.find(a => a.id === attIdRaw)?.file_size
                onPreviewImage(uri, fileName, sz, onReply, undefined, onDownload)
              } : undefined}
            />
          </BubbleRow>
          <TimeRow time={formatTimestamp(event.created_at)} />
        </View>
      )
    }

    // customer_message / staff_portal_reply text path
    const parsed = parsePortalMsg(p.text ?? '')
    if (event.type === 'customer_message' && parsed.tokens.length > 0) return null

    const quotedPortalMsg = parsed.replyToId !== null
      ? (portalMessages ?? []).find(m => m.id === parsed.replyToId) ?? null
      : null

    const canMenu = !!onReply && !isOptimistic
    const bubbleBg     = isStaff ? C.staffBubbleBg     : C.customerBubbleBg
    const bubbleBorder = isStaff ? C.staffBubbleBorder : C.customerBubbleBorder

    return (
      <View style={[{ marginBottom: 16 }, highlightStyle]}>
        <MenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onReply={onReply} />
        <NameRow name={isOwn ? 'You' : senderName} color={nameColor} />
        <BubbleRow avatarBg={avatarBg} avatarTextColor={avatarColor} senderInitials={getInitials(senderName)} canMenu={canMenu}>
          <View style={[T.bubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder }, isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }]}>
            {quotedPortalMsg && (() => {
              const qIsStaff = quotedPortalMsg.sender_type === 'staff'
              const preview = getPortalMsgPreview(quotedPortalMsg)
              const thumb = getPortalMsgThumb(quotedPortalMsg, portalAttachments ?? [])
              const borderColor = qIsStaff ? '#3B82F6' : '#10B981'
              return (
                <ReplyQuote
                  senderName={quotedPortalMsg.portal_sender}
                  previewText={preview}
                  thumb={thumb}
                  borderColor={borderColor}
                  onPress={() => parsed.replyToId !== null && onHighlightPortalMsg?.(parsed.replyToId)}
                />
              )
            })()}
            {parsed.text !== '' && <Text style={T.commentText}>{parsed.text}</Text>}
            {event.type === 'staff_portal_reply' && parsed.tokens.map(tok =>
              <PortalAttachmentCard
                key={tok.id} orderId={orderId} attId={tok.id} fileName={tok.name} isOwn={isOwn} isStaff
                onPreview={onPreviewImage ? (uri, onDownload) => {
                  const sz = portalAttachments?.find(a => a.id === tok.id)?.file_size
                  onPreviewImage(uri, tok.name, sz, onReply, undefined, onDownload)
                } : undefined}
              />
            )}
          </View>
        </BubbleRow>
        <TimeRow time={formatTimestamp(event.created_at)} />
      </View>
    )
  }

  return <SystemEventRow event={event} />
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Styles ───────────────────────────────────────────────────────────────────

const T = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontWeight: '700' },
  bubble: {
    backgroundColor: C.internalBubbleBg,
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: C.internalBubbleBorder,
    maxWidth: BUBBLE_MAX_W, minWidth: 60,
  },
  actorName: { fontSize: 13, fontWeight: '700', color: C.textActor },
  time: { fontSize: 11, color: C.textSecondary },
  commentText: { fontSize: 14, color: C.textPrimary, lineHeight: 20 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  retryMsg: { fontSize: 12, color: '#EF4444' },
  retryBtn: { fontSize: 12, fontWeight: '700', color: C.indigo, textDecorationLine: 'underline' },
})

const TM = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 24 },
  rowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '500', flex: 1, textAlign: 'center' },
})
