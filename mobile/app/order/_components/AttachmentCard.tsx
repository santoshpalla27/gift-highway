import { View, Text, Image, TouchableOpacity, Dimensions, ActivityIndicator, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState, useRef } from 'react'
import { attachmentService, isImage, formatBytes } from '../../../services/attachmentService'
import { AttachmentViewer } from '../../../components/AttachmentViewer'

const ATTACH_MAX_W = Math.round(Dimensions.get('window').width * 0.6)

export function AttachmentCard({ orderId, payload, isOwn, onReply }: {
  orderId: string
  payload: Record<string, string>
  isOwn?: boolean
  onReply?: () => void
}) {
  const [imgUri, setImgUri] = useState(payload.file_url)
  const [imgFailed, setImgFailed] = useState(false)
  const [viewerVisible, setViewerVisible] = useState(false)
  const [viewerUrl, setViewerUrl] = useState('')
  const [resolving, setResolving] = useState(false)
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

  const handleOpen = async () => {
    if (imgFile) {
      setViewerUrl(imgUri)
      setViewerVisible(true)
      return
    }
    setResolving(true)
    try {
      const url = await attachmentService.getDownloadUrl(orderId, payload.file_key, payload.file_name)
      setViewerUrl(url)
      setViewerVisible(true)
    } catch {
      await Linking.openURL(payload.file_url)
    } finally {
      setResolving(false)
    }
  }

  const handleDownload = async () => {
    try {
      const url = await attachmentService.getDownloadUrl(orderId, payload.file_key, payload.file_name)
      await Linking.openURL(url)
    } catch {
      await Linking.openURL(payload.file_url)
    }
  }

  const cornerStyle = isOwn ? { borderTopRightRadius: 4 } : { borderTopLeftRadius: 4 }

  return (
    <>
      <View style={[
        {
          backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
          width: ATTACH_MAX_W, minWidth: 60, overflow: 'hidden', padding: 0,
        },
        cornerStyle,
      ]}>
        {imgFile ? (
          <>
            <TouchableOpacity onPress={handleOpen} activeOpacity={0.85}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF', flex: 1 }} numberOfLines={1}>{payload.file_name}</Text>
              {!!payload.size_bytes && Number(payload.size_bytes) > 0 && (
                <Text style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{formatBytes(Number(payload.size_bytes))}</Text>
              )}
              <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="arrow-down-circle-outline" size={16} color="#6366F1" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16 }}>
            <TouchableOpacity onPress={handleOpen} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                {resolving
                  ? <ActivityIndicator size="small" color="#6366F1" />
                  : <Ionicons name="document-outline" size={20} color="#6B7280" />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>{payload.file_name}</Text>
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{formatBytes(Number(payload.size_bytes))}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-down-circle-outline" size={20} color="#6366F1" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {viewerVisible && viewerUrl ? (
        <AttachmentViewer
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          url={viewerUrl}
          filename={payload.file_name}
          mimeType={payload.mime_type}
          sizeBytes={payload.size_bytes ? Number(payload.size_bytes) : undefined}
          onReply={onReply}
          onDownload={handleDownload}
          orderId={orderId}
        />
      ) : null}
    </>
  )
}
