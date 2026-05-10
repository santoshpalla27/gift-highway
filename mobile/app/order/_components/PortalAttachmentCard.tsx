import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions, Linking } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import { staffPortalApi } from '../../../services/portalService'
import { formatBytes } from '../../../services/attachmentService'
import { AttachmentViewer } from '../../../components/AttachmentViewer'

const ATTACH_MAX_W = Math.round(Dimensions.get('window').width * 0.6)

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']

export const PortalAttachmentCard = React.memo(function PortalAttachmentCard({ orderId, attId, fileName, viewUrl, isOwn, isStaff, caption, sizeBytes, onReply }: {
  orderId: string
  attId: number | null
  fileName: string
  fileType?: string
  viewUrl?: string
  isOwn?: boolean
  isStaff?: boolean
  caption?: string
  sizeBytes?: number
  onReply?: () => void
}) {
  const ext = ('.' + (fileName.split('.').pop() ?? '')).toLowerCase()
  const isImg = IMG_EXTS.includes(ext)
  const [viewerVisible, setViewerVisible] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const hasBubble = isStaff !== undefined
  const bubbleBg     = isStaff ? '#EFF6FF' : '#F0FDF4'
  const bubbleBorder = isStaff ? '#BFDBFE' : '#A7F3D0'
  const trr = isOwn ? 4 : 14
  const tlr = isOwn ? 14 : 4

  const handleDownload = async () => {
    if (attId == null) return
    try {
      const url = downloadUrl ?? await staffPortalApi.getAttachmentDownloadURL(orderId, attId, fileName)
      setDownloadUrl(url)
      await Linking.openURL(url)
    } catch { /* ignore */ }
  }

  if (isImg) {
    return (
      <>
        <View style={{
          marginTop: 6, overflow: 'hidden', width: ATTACH_MAX_W,
          backgroundColor: hasBubble ? bubbleBg : '#FFFFFF',
          borderWidth: 1, borderColor: hasBubble ? bubbleBorder : '#E5E7EB',
          borderRadius: 14, borderTopRightRadius: trr, borderTopLeftRadius: tlr,
        }}>
          <TouchableOpacity
            onPress={() => { if (viewUrl) setViewerVisible(true) }}
            activeOpacity={0.85}
          >
            {viewUrl
              ? <Image source={{ uri: viewUrl }} style={{ width: '100%', height: 180 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
              : <View style={{ width: '100%', height: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
                  <ActivityIndicator size="small" color="#94A3B8" />
                </View>
            }
          </TouchableOpacity>
          <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#6B7280', flex: 1 }} numberOfLines={1}>{fileName}</Text>
              {!!sizeBytes && sizeBytes > 0 && (
                <Text style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{formatBytes(sizeBytes)}</Text>
              )}
              {viewUrl && (
                <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="arrow-down-circle-outline" size={16} color="#6366F1" />
                </TouchableOpacity>
              )}
            </View>
            {caption ? <Text style={{ fontSize: 13, color: '#374151', marginTop: 4, lineHeight: 18 }}>{caption}</Text> : null}
          </View>
        </View>

        {viewerVisible && viewUrl ? (
          <AttachmentViewer
            visible={viewerVisible}
            onClose={() => setViewerVisible(false)}
            url={viewUrl}
            filename={fileName}
            sizeBytes={sizeBytes}
            onReply={onReply}
            onDownload={handleDownload}
            orderId={orderId}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <View style={{
        flexDirection: 'column', gap: 6, marginTop: 4,
        backgroundColor: hasBubble ? bubbleBg : '#F9FAFB',
        borderWidth: 1, borderColor: hasBubble ? bubbleBorder : '#E5E7EB',
        borderRadius: 14, borderTopRightRadius: trr, borderTopLeftRadius: tlr,
        paddingHorizontal: 20, paddingVertical: 16, width: ATTACH_MAX_W,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => { if (viewUrl) setViewerVisible(true) }}
            activeOpacity={viewUrl ? 0.85 : 1}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="document-outline" size={20} color="#6B7280" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }} numberOfLines={1}>{fileName}</Text>
              {!!sizeBytes && sizeBytes > 0 && (
                <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{formatBytes(sizeBytes)}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-down-circle-outline" size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>
        {caption ? <Text style={{ fontSize: 13, color: '#374151', lineHeight: 18 }}>{caption}</Text> : null}
      </View>

      {viewerVisible && viewUrl ? (
        <AttachmentViewer
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          url={viewUrl}
          filename={fileName}
          sizeBytes={sizeBytes}
          onReply={onReply}
          onDownload={handleDownload}
          orderId={orderId}
        />
      ) : null}
    </>
  )
}, (prev, next) => {
  return prev.orderId === next.orderId &&
         prev.attId === next.attId &&
         prev.viewUrl === next.viewUrl &&
         prev.isOwn === next.isOwn &&
         prev.caption === next.caption
})
