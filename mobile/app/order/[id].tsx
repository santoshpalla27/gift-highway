import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Image, RefreshControl, TextInput,
} from 'react-native'
import { ImageViewerModal } from './_components/ImageViewerModal'
import { ImageAnnotationSheet } from './_components/ImageAnnotationSheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import { Ionicons } from '@expo/vector-icons'

import { useOrderDetail, groupByDate, getEventPreview, getEventSenderName, getEventThumb, parseCommentText } from './_hooks/useOrderDetail'
import { TimelineItem } from './_components/TimelineItem'
import { DateDivider } from './_components/DateDivider'
import { ComposerBar } from './_components/ComposerBar'
import { ReplyBar } from './_components/ReplyBar'
import { StatusSheet } from './_sheets/StatusSheet'
import { InfoSheet } from './_sheets/OrderInfoSheet'
import { EditOrderSheet } from './_sheets/OrderInfoSheet'
import { PortalChatSheet } from './_sheets/PortalChatSheet'
import { formatDate } from '../../utils/date'
import { apiClient } from '../../services/apiClient'

function NewUpdatesDivider() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: '#6366F1', opacity: 0.3 }} />
      <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6366F1' }}>New updates</Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: '#6366F1', opacity: 0.3 }} />
    </View>
  )
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'New',     color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working', color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',    color: '#10B981', bg: '#ECFDF5' },
}

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const keyboardOffset = insets.top + 56

  // When the order screen opens: dismiss local push notifications for this
  // order and tell the backend to reset the push-service batch so the next
  // event starts a fresh notification instead of incrementing the old count.
  useEffect(() => {
    if (!id) return
    if (Platform.OS !== 'web') {
      Notifications.getPresentedNotificationsAsync().then(presented => {
        presented
          .filter(n => String(n.request.content.data?.order_id) === String(id))
          .forEach(n => Notifications.dismissNotificationAsync(n.request.identifier))
      })
    }
    apiClient.post('/push/mark-read', { order_id: id }).catch(() => {})
  }, [id])

  const D = useOrderDetail(id)
  const [imageViewer, setImageViewer] = useState<{
    uri: string; filename: string; fileSizeBytes?: number
    onReply?: () => void; onDelete?: () => void; onDownload?: () => void
    sourceAttachmentId?: string
  } | null>(null)
  const [annotation, setAnnotation] = useState<{ src: string; filename: string; sourceAttachmentId?: string; staffPortalOrderId?: string } | null>(null)

  // ── Loading / error states ─────────────────────────────────────────────

  if (D.loadingOrder) {
    return (
      <View style={S.loadingScreen}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    )
  }

  if (!D.order) {
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

  const { order } = D
  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium

  // ── Build attachment-id → caption map for portal attachment cards ──────

  const portalAttCaptions = new Map<number, string>()
  for (const ev of D.allEvents) {
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

  // ── Render timeline ────────────────────────────────────────────────────

  const groups = groupByDate(D.allEvents)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset : 0}
    >
      <View style={S.screen}>

        {/* Header */}
        <View style={[S.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={S.headerCenter}>
            <Text style={S.headerTitle} numberOfLines={1}>#{order.title}</Text>
          </View>
          <TouchableOpacity onPress={() => D.setShowInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="information-circle-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => D.setShowEdit(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="create-outline" size={22} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Chip row */}
        <View style={S.chipRow}>
          <TouchableOpacity
            style={[S.chip, { backgroundColor: sm.bg }]}
            onPress={D.canEdit(order) ? () => D.setShowStatus(true) : undefined}
            activeOpacity={D.canEdit(order) ? 0.7 : 1}
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
              <Text style={[S.chipText, { color: '#64748B', marginLeft: 4 }]}>{formatDate(order.due_date)}</Text>
            </View>
          )}
          {D.portal !== undefined && (
            D.portal ? (
              <TouchableOpacity
                style={[S.chip, { backgroundColor: D.portal.enabled ? '#F0FDF4' : '#F9FAFB', borderWidth: 1, borderColor: D.portal.enabled ? '#A7F3D0' : '#E5E7EB' }]}
                onPress={D.portal.enabled ? D.openPortalChat : undefined}
                activeOpacity={D.portal.enabled ? 0.7 : 1}
              >
                <Ionicons name="chatbubbles-outline" size={13} color={D.portal.enabled ? '#059669' : '#9CA3AF'} />
                <Text style={[S.chipText, { color: D.portal.enabled ? '#059669' : '#9CA3AF', marginLeft: 4 }]}>
                  {D.portal.enabled ? 'Portal Chat' : 'Revoked'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[S.chip, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }]}
                onPress={D.createPortal}
                activeOpacity={0.7}
                disabled={D.portalCreating}
              >
                {D.portalCreating
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
            ref={D.scrollRef}
            style={S.timeline}
            contentContainerStyle={S.timelineContent}
            refreshControl={<RefreshControl refreshing={D.refreshing} onRefresh={D.onRefresh} tintColor="#0F172A" />}
            onScroll={e => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
              D.atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40
              if (D.atBottomRef.current && D.newCount > 0) D.setNewCount(0)
            }}
            scrollEventThrottle={100}
            keyboardShouldPersistTaps="handled"
          >
            {D.hasOlder && (
              <TouchableOpacity style={S.loadOlderBtn} onPress={D.loadOlderEvents} disabled={D.loadingOlder}>
                {D.loadingOlder
                  ? <ActivityIndicator size="small" color="#64748B" />
                  : <Text style={S.loadOlderText}>Load older messages</Text>
                }
              </TouchableOpacity>
            )}

            {D.loadingEvents ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color="#94A3B8" />
              </View>
            ) : D.allEvents.length === 0 ? (
              <View style={S.emptyTimeline}>
                <Ionicons name="chatbubbles-outline" size={28} color="#CBD5E1" />
                <Text style={S.emptyTimelineText}>No activity yet. Add a comment below.</Text>
              </View>
            ) : (() => {
              const threshold = new Date(D.newSinceAt ?? D.pageEnteredAt.current)
              let newDividerInserted = false
              return groups.map(group => (
              <View key={group.label}>
                <DateDivider label={group.label} />
                {group.events.map(ev => {
                  const rawText = ev.type === 'comment_added' ? ((ev as any).payload?.text ?? '') : ''
                  const { replyEventId } = rawText ? parseCommentText(rawText) : { replyEventId: null }
                  const quotedEv = replyEventId ? D.allEvents.find(e => e.id === replyEventId) as any : undefined
                  const attCaption = ev.type === 'customer_attachment' && (ev.payload as any)?.att_id
                    ? portalAttCaptions.get(Number((ev.payload as any).att_id))
                    : undefined

                  let showDivider = false
                  if (
                    !newDividerInserted &&
                    !ev.id.startsWith('temp-') &&
                    String(ev.actor_id) !== String(D.user?.id) &&
                    new Date(ev.created_at) > threshold
                  ) {
                    newDividerInserted = true
                    showDivider = true
                  }

                  return (
                    <View key={ev.id} onLayout={(e) => { D.eventYPos.current[ev.id] = e.nativeEvent.layout.y }}>
                      {showDivider && <NewUpdatesDivider />}
                      <TimelineItem
                        event={ev as any}
                        orderId={id!}
                        isOptimistic={ev.id.startsWith('temp-')}
                        onRetry={() => D.handleRetry(ev as any)}
                        onDelete={D.canEdit(order) && (ev.type === 'comment_added' || ev.type === 'attachment_added')
                          ? () => D.handleDeleteComment(ev.id) : undefined}
                        onEdit={D.canEdit(order) && ev.type === 'comment_added'
                          ? (currentText: string) => { D.setEditingComment({ eventId: ev.id, text: currentText }); D.setEditCommentText(currentText) }
                          : undefined}
                        onReply={!ev.id.startsWith('temp-') && (
                          ev.type === 'comment_added' || ev.type === 'attachment_added' ||
                          ev.type === 'staff_portal_reply' || ev.type === 'customer_message' || ev.type === 'customer_attachment'
                        ) ? () => D.handleSelectReplyEvent(ev as any) : undefined}
                        onHighlightQuoted={replyEventId ? () => D.highlightEvent(replyEventId) : undefined}
                        onHighlightPortalMsg={D.highlightPortalMsg}
                        quotedEvent={quotedEv ?? null}
                        portalMessages={D.portalMessages}
                        portalAttachments={D.portalAttachments}
                        highlighted={D.highlightedEventId === ev.id}
                        attCaption={attCaption}
                        onPreviewImage={(uri, filename, fileSizeBytes, onReply, onDelete, onDownload, sourceAttachmentId) =>
                          setImageViewer({ uri, filename, fileSizeBytes, onReply, onDelete, onDownload, sourceAttachmentId })
                        }
                      />
                    </View>
                  )
                })}
              </View>
            ))
            })()}
          </ScrollView>

          {D.newCount > 0 && (
            <TouchableOpacity
              style={S.newBadge}
              onPress={() => { D.scrollRef.current?.scrollToEnd({ animated: true }); D.setNewCount(0) }}
            >
              <Text style={S.newBadgeText}>{D.newCount} new update{D.newCount > 1 ? 's' : ''} ↓</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upload progress */}
        {D.uploadingFiles.length > 0 && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, gap: 5, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
            {D.uploadingFiles.map(f => {
              const iconColor = f.mime === 'application/pdf' ? '#EF4444'
                : f.mime.includes('word') ? '#3B82F6'
                : f.mime.includes('sheet') || f.mime.includes('excel') ? '#10B981'
                : '#6B7280'
              return (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, backgroundColor: f.done ? '#F0FDF4' : f.error ? '#FFF5F5' : '#FFFFFF', borderWidth: 1, borderColor: f.done ? '#BBF7D0' : f.error ? '#FCA5A5' : '#E5E7EB' }}>
                  {f.previewUri
                    ? <Image source={{ uri: f.previewUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                    : <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: iconColor + '20', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="document-outline" size={14} color={iconColor} /></View>
                  }
                  <Text style={{ fontSize: 12, color: '#374151', flex: 1 }} numberOfLines={1}>{f.name}</Text>
                  {f.done ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="checkmark" size={13} color="#10B981" />
                      <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>Done</Text>
                    </View>
                  ) : f.error ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, color: '#EF4444' }}>Failed</Text>
                      <TouchableOpacity onPress={() => D.retryUpload(f.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: 11, color: '#6366F1', fontWeight: '600' }}>Retry</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => D.setUploadingFiles(prev => prev.filter(x => x.id !== f.id))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
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
        {D.replyToEvent && (
          <ReplyBar
            senderName={getEventSenderName(D.replyToEvent)}
            previewText={getEventPreview(D.replyToEvent)}
            thumb={getEventThumb(D.replyToEvent, D.portalAttachments)}
            onCancel={() => D.setReplyToEvent(null)}
          />
        )}

        {/* Composer */}
        <ComposerBar
          value={D.comment}
          onChangeText={D.setComment}
          onSend={D.handleSendComment}
          onAttach={() => D.setShowAttachSheet(true)}
          sending={D.sending}
          paddingBottom={Math.max(insets.bottom + 4, 16)}
        />
      </View>

      {/* Sheets */}
      {D.showStatus && (
        <StatusSheet order={order} onClose={() => D.setShowStatus(false)} onChanged={() => { D.fetchOrder(); /* fetchLatest called by socket */ }} />
      )}
      {D.showInfo && (
        <InfoSheet
          order={order}
          portal={D.portal}
          onClose={() => D.setShowInfo(false)}
          onPortalChange={D.setPortal}
          onArchived={() => router.back()}
        />
      )}
      {D.showEdit && (
        <EditOrderSheet order={order} onClose={() => D.setShowEdit(false)} onSaved={D.fetchOrder} />
      )}
      {D.showPortalChat && D.portal && (
        <PortalChatSheet
          orderId={id!}
          portal={D.portal}
          portalAttachments={D.portalAttachments}
          onClose={() => D.setShowPortalChat(false)}
          onPortalChange={p => D.setPortal(p ?? null)}
          onAttachmentsChange={D.setPortalAttachments}
          refreshRef={D.portalChatRefreshRef}
          onRequestAnnotation={(src, filename, sourceAttachmentId, staffPortalOrderId) =>
            setAnnotation({ src, filename, sourceAttachmentId, staffPortalOrderId })
          }
        />
      )}

      {/* Delete confirm */}
      <Modal visible={!!D.deleteConfirmId} transparent animationType="fade" onRequestClose={() => D.setDeleteConfirmId(null)}>
        <TouchableOpacity style={EC.overlay} activeOpacity={1} onPress={() => D.setDeleteConfirmId(null)}>
          <TouchableOpacity activeOpacity={1} style={EC.sheet}>
            <Text style={EC.title}>Delete?</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>This action cannot be undone.</Text>
            <View style={EC.actions}>
              <TouchableOpacity style={EC.cancelBtn} onPress={() => D.setDeleteConfirmId(null)}>
                <Text style={EC.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[EC.saveBtn, { backgroundColor: '#EF4444' }]} onPress={D.confirmDelete}>
                <Text style={EC.saveText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Edit comment */}
      <Modal visible={!!D.editingComment} transparent animationType="fade" onRequestClose={() => D.setEditingComment(null)}>
        <TouchableOpacity style={EC.overlay} activeOpacity={1} onPress={() => D.setEditingComment(null)}>
          <TouchableOpacity activeOpacity={1} style={EC.sheet}>
            <Text style={EC.title}>Edit comment</Text>
            <TextInput
              style={EC.input}
              value={D.editCommentText}
              onChangeText={D.setEditCommentText}
              multiline autoFocus
              placeholder="Edit your comment..."
              placeholderTextColor="#9CA3AF"
            />
            <View style={EC.actions}>
              <TouchableOpacity style={EC.cancelBtn} onPress={() => D.setEditingComment(null)}>
                <Text style={EC.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[EC.saveBtn, !D.editCommentText.trim() && { opacity: 0.4 }]}
                disabled={!D.editCommentText.trim()}
                onPress={D.saveEditComment}
              >
                <Text style={EC.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Attach sheet */}
      <Modal visible={D.showAttachSheet} transparent animationType="slide" onRequestClose={() => D.setShowAttachSheet(false)}>
        <TouchableOpacity style={AS.overlay} activeOpacity={1} onPress={() => D.setShowAttachSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={[AS.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <Text style={AS.title}>Attach File</Text>
            <TouchableOpacity style={AS.row} onPress={() => { D.setShowAttachSheet(false); setTimeout(D.handlePickImage, 100) }}>
              <Ionicons name="image-outline" size={20} color="#374151" />
              <Text style={AS.rowText}>Photo Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={AS.row} onPress={() => { D.setShowAttachSheet(false); setTimeout(D.handlePickDocument, 100) }}>
              <Ionicons name="document-outline" size={20} color="#374151" />
              <Text style={AS.rowText}>Files</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[AS.row, AS.cancelRow]} onPress={() => D.setShowAttachSheet(false)}>
              <Text style={AS.cancelText}>Cancel</Text>
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
          onReply={imageViewer.onReply ? () => { setImageViewer(null); imageViewer.onReply!() } : undefined}
          onDelete={imageViewer.onDelete ? () => { setImageViewer(null); imageViewer.onDelete!() } : undefined}
          onDownload={imageViewer.onDownload}
          onAnnotate={() => setAnnotation({ src: imageViewer.uri, filename: imageViewer.filename, sourceAttachmentId: imageViewer.sourceAttachmentId })}
        />
      )}
      {annotation && (
        <ImageAnnotationSheet
          src={annotation.src}
          filename={annotation.filename}
          orderId={id!}
          sourceAttachmentId={annotation.sourceAttachmentId}
          staffPortalOrderId={annotation.staffPortalOrderId}
          onSaved={() => {
            const wasPortal = !!annotation.staffPortalOrderId
            setAnnotation(null)
            if (wasPortal) D.portalChatRefreshRef.current?.()
          }}
          onCancel={() => setAnnotation(null)}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '600' },
  timeline: { flex: 1, backgroundColor: '#F8FAFC' },
  timelineContent: { padding: 16, paddingBottom: 8 },
  emptyTimeline: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTimelineText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
  loadOlderBtn: { alignItems: 'center', paddingVertical: 12 },
  loadOlderText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  newBadge: { position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: '#0F172A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  newBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnText: { color: '#0F172A', fontWeight: '700' },
})

const EC = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, color: '#111827', minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#6366F1' },
  saveText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
})

const AS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 4 },
  rowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '500', flex: 1, textAlign: 'center' },
})
