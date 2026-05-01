import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  Linking,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { formatBytes } from '../services/attachmentService'

const { width: SW } = Dimensions.get('window')

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'avif', 'svg']

function resolveIsImage(mimeType?: string, filename?: string): boolean {
  if (mimeType?.startsWith('image/')) return true
  const ext = filename?.split('.').pop()?.toLowerCase() ?? ''
  return IMG_EXTS.includes(ext)
}

type IconName =
  | 'document-text'
  | 'grid'
  | 'easel'
  | 'videocam'
  | 'musical-notes'
  | 'archive'
  | 'document-outline'

interface FileIconInfo { icon: IconName; color: string }

function getFileIconInfo(mimeType?: string, filename?: string): FileIconInfo {
  const ext = (filename?.split('.').pop() ?? '').toLowerCase()
  const mime = mimeType ?? ''
  if (mime === 'application/pdf' || ext === 'pdf')
    return { icon: 'document-text', color: '#EF4444' }
  if (mime.includes('word') || mime.includes('document') || ext === 'doc' || ext === 'docx')
    return { icon: 'document-text', color: '#3B82F6' }
  if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext))
    return { icon: 'grid', color: '#22C55E' }
  if (mime.includes('powerpoint') || mime.includes('presentation') || ['ppt', 'pptx'].includes(ext))
    return { icon: 'easel', color: '#F97316' }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext))
    return { icon: 'videocam', color: '#8B5CF6' }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'aac', 'm4a'].includes(ext))
    return { icon: 'musical-notes', color: '#EC4899' }
  if (mime.includes('zip') || mime.includes('archive') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return { icon: 'archive', color: '#6B7280' }
  return { icon: 'document-outline', color: '#6366F1' }
}

export interface AttachmentViewerProps {
  visible: boolean
  onClose: () => void
  url: string
  filename: string
  mimeType?: string
  sizeBytes?: number
  onReply?: () => void
}

export function AttachmentViewer({
  visible,
  onClose,
  url,
  filename,
  mimeType,
  sizeBytes,
  onReply,
}: AttachmentViewerProps) {
  const [imgLoading, setImgLoading] = useState(true)
  const [imgError, setImgError] = useState(false)

  const isImg = resolveIsImage(mimeType, filename)
  const fileIcon = isImg ? null : getFileIconInfo(mimeType, filename)
  const ext = (filename.split('.').pop() ?? '').toUpperCase()
  const _dot = filename.lastIndexOf('.')
  const baseName = _dot > 0 ? filename.slice(0, _dot) : filename
  const extName  = _dot > 0 ? filename.slice(_dot)  : ''

  async function handleDownload() {
    await Linking.openURL(url)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={S.root}>
        {/* Toolbar */}
        <View style={S.toolbar}>
          <TouchableOpacity onPress={onClose} style={S.toolbarBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={S.toolbarActions}>
            {onReply && (
              <TouchableOpacity onPress={() => { onClose(); onReply() }} style={S.toolbarBtn} hitSlop={8}>
                <Ionicons name="arrow-undo-outline" size={22} color="#6366F1" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDownload} style={S.toolbarBtn} hitSlop={8}>
              <Ionicons name="arrow-down-circle-outline" size={22} color="#6366F1" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={S.divider} />

        {isImg ? (
          <View style={S.imageArea}>
            {imgLoading && !imgError && (
              <ActivityIndicator size="large" color="#6366F1" style={StyleSheet.absoluteFill} />
            )}
            {imgError ? (
              <View style={S.errorBox}>
                <View style={S.errorIconWrap}>
                  <Ionicons name="image-outline" size={48} color="#94A3B8" />
                </View>
                <Text style={S.errorTitle}>Image unavailable</Text>
                <Text style={S.errorSub}>Could not load this image</Text>
                <TouchableOpacity style={S.retryBtn} onPress={handleDownload}>
                  <Text style={S.retryText}>Open in browser</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Image
                source={{ uri: url }}
                style={{ width: SW, flex: 1 }}
                resizeMode="contain"
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgLoading(false); setImgError(true) }}
              />
            )}
          </View>
        ) : (
          <View style={S.fileArea}>
            <View style={[S.fileIconCircle, { backgroundColor: fileIcon!.color + '15' }]}>
              <Ionicons name={fileIcon!.icon} size={56} color={fileIcon!.color} />
            </View>
            <View style={[S.extBadge, { backgroundColor: fileIcon!.color + '18' }]}>
              <Text style={[S.extText, { color: fileIcon!.color }]}>{ext}</Text>
            </View>
            <Text style={S.fileNameText} numberOfLines={3}>{filename}</Text>
            {!!sizeBytes && sizeBytes > 0 && (
              <Text style={S.fileSizeText}>{formatBytes(sizeBytes)}</Text>
            )}
            <TouchableOpacity style={S.downloadBtn} onPress={handleDownload} activeOpacity={0.85}>
              <Ionicons name="arrow-down-circle-outline" size={20} color="#FFFFFF" />
              <Text style={S.downloadBtnText}>Download</Text>
            </TouchableOpacity>
            {onReply && (
              <TouchableOpacity style={S.replyBtn} onPress={() => { onClose(); onReply() }} activeOpacity={0.85}>
                <Ionicons name="arrow-undo-outline" size={20} color="#6366F1" />
                <Text style={S.replyBtnText}>Reply</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bottom name + size bar */}
        <View style={S.bottomBar}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', minWidth: 0 }}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={S.bottomName}>{baseName}</Text>
            {extName ? <Text style={S.bottomExt}>{extName}</Text> : null}
          </View>
          {!!sizeBytes && sizeBytes > 0 && (
            <Text style={S.bottomSize}>{formatBytes(sizeBytes)}</Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  toolbarTitleBase: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  toolbarTitleExt: { flexShrink: 0, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  toolbarActions: { flexDirection: 'row', gap: 8 },
  divider: { height: 1, backgroundColor: '#F1F5F9' },

  imageArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { alignItems: 'center', gap: 10, paddingHorizontal: 40 },
  errorIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: '600', color: '#0F172A' },
  errorSub: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  retryText: { fontSize: 14, fontWeight: '600', color: '#6366F1' },

  fileArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  fileIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  extBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  extText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  fileNameText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 24,
  },
  fileSizeText: { fontSize: 13, color: '#94A3B8', marginTop: -4 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 16,
    width: '100%',
    justifyContent: 'center',
  },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    width: '100%',
    justifyContent: 'center',
  },
  replyBtnText: { fontSize: 15, fontWeight: '600', color: '#6366F1' },
  bottomBar: {
    flexDirection: 'row', alignItems: 'baseline',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 6,
  },
  bottomName: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  bottomExt: { flexShrink: 0, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  bottomSize: { flexShrink: 0, fontSize: 12, color: '#94A3B8' },
})
