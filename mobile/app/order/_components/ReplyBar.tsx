import { View, Text, TouchableOpacity, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export function ReplyBar({ senderName, previewText, thumb, accentColor, onCancel }: {
  senderName: string
  previewText: string
  thumb?: string | null
  accentColor?: string
  onCancel: () => void
}) {
  const color = accentColor ?? '#6366F1'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', borderTopWidth: 1, borderTopColor: '#C7D2FE', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
      <Ionicons name="return-up-back-outline" size={16} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color, marginBottom: 1 }}>{senderName}</Text>
        <Text style={{ fontSize: 12, color: '#374151' }} numberOfLines={1}>{previewText}</Text>
      </View>
      {thumb ? <Image source={{ uri: thumb }} style={{ width: 36, height: 36, borderRadius: 4 }} resizeMode="cover" /> : null}
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={18} color="#6B7280" />
      </TouchableOpacity>
    </View>
  )
}
