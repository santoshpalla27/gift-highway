import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Share, Linking,
} from 'react-native'
import { ImageViewerModal } from '../_components/ImageViewerModal'
import { formatRelative } from '../../../utils/date'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PortalStatus, PortalAttachment } from '../../../services/portalService'
import { staffPortalApi, getPortalURL } from '../../../services/portalService'
import { formatBytes } from '../../../services/attachmentService'
import { usePortalChat } from '../_hooks/usePortalChat'
import { getPortalMsgThumb } from '../_hooks/useOrderDetail'
import { ComposerBar } from '../_components/ComposerBar'
import { ReplyBar } from '../_components/ReplyBar'

// ─── Portal message row (WhatsApp-style) ─────────────────────────────────────

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']
function isImgExt(name: string) { return IMG_EXTS.some(e => name.toLowerCase().endsWith(e)) }

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export function PortalChatSheet({ orderId, portal, portalAttachments, onClose, onPortalChange, onAttachmentsChange, refreshRef, onRequestAnnotation }: {
  orderId: string
  portal: PortalStatus
  portalAttachments: PortalAttachment[]
  onClose: () => void
  onPortalChange: (p: PortalStatus | null) => void
  onAttachmentsChange: (a: PortalAttachment[]) => void
  refreshRef: React.MutableRefObject<(() => void) | null>
  onRequestAnnotation?: (src: string, filename: string, sourceAttachmentId?: string, staffPortalOrderId?: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [showOptions, setShowOptions] = React.useState(false)
  const [showAttachSheet, setShowAttachSheet] = React.useState(false)
  const [menuMsg, setMenuMsg] = React.useState<(typeof chat.messages)[0] | null>(null)
  const [deleteConfirmMsg, setDeleteConfirmMsg] = React.useState<(typeof chat.messages)[0] | null>(null)
  const [imageViewer, setImageViewer] = useState<{
    uri: string; filename: string; fileSizeBytes?: number; msgId: number; onDownload?: () => void
    sourceAttachmentId?: string
  } | null>(null)

  const chat = usePortalChat(orderId, portalAttachments, onAttachmentsChange, refreshRef)

  const handleShareLink = () => {
    const url = getPortalURL(portal.token)
    Share.share({ message: `Customer portal link:\n${url}`, url })
  }

  const handleRevoke = () => {
    Alert.alert('Revoke portal?', 'The customer link will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: async () => {
        try {
          await staffPortalApi.revokePortal(orderId)
          const p = await staffPortalApi.getPortal(orderId)
          onPortalChange(p)
        } catch { Alert.alert('Error', 'Could not revoke portal') }
      }},
    ])
  }

  const handleRegenerate = () => {
    Alert.alert('Regenerate link?', 'The old link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Regenerate', onPress: async () => {
        try {
          const p = await staffPortalApi.regenerateToken(orderId)
          onPortalChange(p)
        } catch { Alert.alert('Error', 'Could not regenerate link') }
      }},
    ])
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={PC.screen}>

          {/* Header */}
          <View style={[PC.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={PC.headerTitle}>{portal.customer_name || 'Customer'}</Text>
              <Text style={PC.headerSub}>Customer portal chat</Text>
            </View>
            <TouchableOpacity onPress={handleShareLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 12 }}>
              <Ionicons name="share-outline" size={22} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowOptions(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="ellipsis-vertical" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Revoked banner */}
          {!portal.enabled && (
            <View style={PC.revokedBanner}>
              <Ionicons name="ban-outline" size={14} color="#DC2626" />
              <Text style={PC.revokedText}>Portal link is revoked — customer cannot send messages</Text>
            </View>
          )}

          {/* Messages */}
          <ScrollView ref={chat.scrollRef} style={{ flex: 1 }} contentContainerStyle={PC.msgList}>
            {chat.loadingMsgs ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#94A3B8" />
            ) : chat.messages.length === 0 ? (
              <View style={PC.empty}>
                <Ionicons name="chatbubbles-outline" size={36} color="#CBD5E1" />
                <Text style={PC.emptyText}>No messages yet</Text>
              </View>
            ) : chat.messages.map(msg => {
              const isCustomer = msg.sender_type === 'customer'
              const isStaff = msg.sender_type === 'staff'
              const parsed = chat.parsePortalMsg(msg.message)
              const quotedMsg = parsed.replyToId !== null ? chat.messages.find(m => m.id === parsed.replyToId) ?? null : null
              const hasText = parsed.text !== ''
              const hasTokens = parsed.tokens.length > 0

              return (
                <View
                  key={msg.id}
                  onLayout={(e) => { chat.msgYPos.current[msg.id] = e.nativeEvent.layout.y }}
                  style={[PC.msgRow, isStaff ? PC.msgRight : PC.msgLeft, chat.highlightedMsgId === msg.id && { backgroundColor: 'rgba(37,211,102,0.15)', borderRadius: 8 }]}
                >
                  {isCustomer && (
                    <View style={[PC.msgAvatar, { backgroundColor: '#25D366' }]}>
                      <Text style={[PC.msgAvatarText, { color: '#FFFFFF' }]}>{getInitials(msg.portal_sender || 'C')}</Text>
                    </View>
                  )}

                  <View style={{ alignItems: isStaff ? 'flex-end' : 'flex-start' }}>
                    {isCustomer && (
                      <Text style={[PC.msgSender, { color: '#25D366' }]}>{msg.portal_sender}</Text>
                    )}
                    <View style={{ flexDirection: isStaff ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[PC.msgBubble, isCustomer ? PC.bubbleCustomer : PC.bubbleStaff, isStaff ? { borderTopRightRadius: 2 } : { borderTopLeftRadius: 2 }]}
                    >
                      {quotedMsg && (() => {
                        const qIsCustomer = quotedMsg.sender_type === 'customer'
                        const qPreview = chat.getPortalMsgPreview(quotedMsg)
                        const qThumb = getPortalMsgThumb(quotedMsg, portalAttachments)
                        return (
                          <TouchableOpacity
                            onPress={() => chat.highlightMsg(quotedMsg.id)}
                            activeOpacity={0.7}
                            style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 6, borderLeftWidth: 3, borderLeftColor: qIsCustomer ? '#10B981' : '#25D366', backgroundColor: isCustomer ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}
                          >
                            <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: qIsCustomer ? '#10B981' : '#25D366', marginBottom: 1 }} numberOfLines={1}>{quotedMsg.portal_sender}</Text>
                              <Text style={{ fontSize: 11, color: isCustomer ? '#6B7280' : 'rgba(255,255,255,0.8)' }} numberOfLines={2}>{qPreview}</Text>
                            </View>
                            {qThumb && <Image source={{ uri: qThumb }} style={{ width: 44, height: 44 }} resizeMode="cover" />}
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
                              <TouchableOpacity
                                onPress={() => setImageViewer({
                                  uri: att.view_url, filename: att.file_name, fileSizeBytes: att.file_size, msgId: msg.id,
                                  sourceAttachmentId: String(att.id),
                                  onDownload: async () => { try { const url = await staffPortalApi.getAttachmentDownloadURL(orderId, att.id, att.file_name); Linking.openURL(url) } catch { Linking.openURL(att.view_url) } },
                                })}
                                activeOpacity={0.85}
                              >
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
                      <Text style={[PC.msgTime, { textAlign: 'right', marginTop: 4 }]}>{formatRelative(msg.created_at)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMenuMsg(msg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="ellipsis-vertical" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                    </View>
                  </View>

                  {isStaff && (
                    <View style={[PC.msgAvatar, { backgroundColor: '#DBEAFE' }]}>
                      <Text style={[PC.msgAvatarText, { color: '#2563EB' }]}>{getInitials(msg.portal_sender || 'S')}</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </ScrollView>

          {/* Upload progress */}
          {chat.uploadingFiles.length > 0 && (
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 5, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              {chat.uploadingFiles.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, backgroundColor: f.done ? '#F0FDF4' : f.error ? '#FFF5F5' : '#FFFFFF', borderWidth: 1, borderColor: f.done ? '#BBF7D0' : f.error ? '#FCA5A5' : '#E5E7EB' }}>
                  {f.previewUri
                    ? <Image source={{ uri: f.previewUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                    : <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="document-outline" size={14} color="#6B7280" /></View>
                  }
                  <Text style={{ fontSize: 12, color: '#374151', flex: 1 }} numberOfLines={1}>{f.name}</Text>
                  {f.done
                    ? <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                    : f.error
                    ? <Text style={{ fontSize: 11, color: '#EF4444' }}>Failed</Text>
                    : <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{f.progress}%</Text>
                  }
                </View>
              ))}
            </View>
          )}

          {/* Reply bar */}
          {chat.replyTo && (
            <ReplyBar
              senderName={chat.replyTo.portal_sender}
              previewText={chat.getPortalMsgPreview(chat.replyTo)}
              thumb={getPortalMsgThumb(chat.replyTo, portalAttachments)}
              accentColor="#10B981"
              onCancel={() => chat.setReplyTo(null)}
            />
          )}

          {/* Composer */}
          {portal.enabled && (
            <ComposerBar
              value={chat.inputText}
              onChangeText={chat.setInputText}
              onSend={chat.handleSend}
              onAttach={() => setShowAttachSheet(true)}
              sending={chat.sending}
              placeholder="Reply to customer..."
              paddingBottom={Math.max(insets.bottom + 4, 16)}
            />
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

      {/* Message menu */}
      <Modal visible={!!menuMsg} transparent animationType="fade" onRequestClose={() => setMenuMsg(null)}>
        <TouchableOpacity style={TM.overlay} activeOpacity={1} onPress={() => setMenuMsg(null)}>
          <TouchableOpacity activeOpacity={1} style={TM.sheet}>
            <TouchableOpacity style={TM.row} onPress={() => { chat.setReplyTo(menuMsg!); setMenuMsg(null) }}>
              <Ionicons name="return-up-back-outline" size={18} color="#374151" />
              <Text style={TM.rowText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={TM.row} onPress={() => { setDeleteConfirmMsg(menuMsg); setMenuMsg(null) }}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[TM.rowText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setMenuMsg(null)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={!!deleteConfirmMsg} transparent animationType="fade" onRequestClose={() => setDeleteConfirmMsg(null)}>
        <TouchableOpacity style={DC.overlay} activeOpacity={1} onPress={() => setDeleteConfirmMsg(null)}>
          <TouchableOpacity activeOpacity={1} style={DC.sheet}>
            <Text style={DC.title}>Delete message?</Text>
            <Text style={DC.body}>This cannot be undone.</Text>
            <View style={DC.actions}>
              <TouchableOpacity style={DC.cancelBtn} onPress={() => setDeleteConfirmMsg(null)}>
                <Text style={DC.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={DC.deleteBtn} onPress={async () => {
                const msg = deleteConfirmMsg!
                setDeleteConfirmMsg(null)
                try {
                  await staffPortalApi.deleteMessage(orderId, msg.id)
                  chat.removeMessage(msg.id)
                } catch { /* silently ignore — message stays in list */ }
              }}>
                <Text style={DC.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={showAttachSheet} transparent animationType="slide" onRequestClose={() => setShowAttachSheet(false)}>
        <TouchableOpacity style={[TM.overlay, { justifyContent: 'flex-end' }]} activeOpacity={1} onPress={() => setShowAttachSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[TM.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24), padding: 24 }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>Attach File</Text>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(chat.handlePickImage, 100) }}>
              <Ionicons name="image-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={TM.row} onPress={() => { setShowAttachSheet(false); setTimeout(chat.handlePickDocument, 100) }}>
              <Ionicons name="document-outline" size={20} color="#374151" />
              <Text style={TM.rowText}>Files</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[TM.row, TM.cancelRow]} onPress={() => setShowAttachSheet(false)}>
              <Text style={TM.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {imageViewer && (
        <ImageViewerModal
          uri={imageViewer.uri}
          filename={imageViewer.filename}
          fileSizeBytes={imageViewer.fileSizeBytes}
          onClose={() => setImageViewer(null)}
          onReply={() => {
            const msg = chat.messages.find(m => m.id === imageViewer.msgId)
            setImageViewer(null)
            if (msg) chat.setReplyTo(msg)
          }}
          onDelete={() => {
            const msg = chat.messages.find(m => m.id === imageViewer.msgId)
            setImageViewer(null)
            if (msg) setDeleteConfirmMsg(msg)
          }}
          onDownload={imageViewer.onDownload}
          onAnnotate={() => onRequestAnnotation?.(imageViewer.uri, imageViewer.filename, imageViewer.sourceAttachmentId, orderId)}
        />
      )}
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PC = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  revokedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FEE2E2' },
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
  msgBubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, minWidth: 60, maxWidth: 280 },
  bubbleCustomer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleStaff: { backgroundColor: '#D9FDD3' },
  msgText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  msgTime: { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
})

const TM = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 36 : 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 24 },
  rowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '500', flex: 1, textAlign: 'center' },
})

const DC = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  body: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  deleteBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#EF4444' },
  deleteText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
})
