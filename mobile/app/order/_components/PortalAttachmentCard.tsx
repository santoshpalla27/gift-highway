import { View, Text, Image, TouchableOpacity, ActivityIndicator, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState, useEffect } from 'react'
import { staffPortalApi } from '../../../services/portalService'

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic']

export function PortalAttachmentCard({ orderId, attId, fileName, isOwn, isStaff, caption }: {
  orderId: string
  attId: number | null
  fileName: string
  fileType?: string
  isOwn?: boolean
  isStaff?: boolean
  caption?: string
}) {
  const ext = ('.' + (fileName.split('.').pop() ?? '')).toLowerCase()
  const isImg = IMG_EXTS.includes(ext)
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
  const bubbleBg     = isStaff ? '#EFF6FF' : '#F0FDF4'
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
