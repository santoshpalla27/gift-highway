import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'

export function ComposerBar({ onSend, onAttach, sending, placeholder, paddingBottom }: {
  onSend: (text: string) => void
  onAttach: () => void
  sending: boolean
  placeholder?: string
  paddingBottom?: number
}) {
  const [text, setText] = useState('')
  const canSend = text.trim().length > 0 && !sending

  const handleSend = () => {
    if (!canSend) return
    const currentText = text
    setText('')
    onSend(currentText)
  }

  return (
    <View style={[C.composer, { paddingBottom: paddingBottom ?? 16 }]}>
      <TouchableOpacity
        onPress={onAttach}
        style={C.attachBtn}
        accessibilityRole="button"
        accessibilityLabel="Attach file"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <Ionicons name="attach-outline" size={22} color="#64748B" />
      </TouchableOpacity>

      <TextInput
        style={C.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder ?? 'Add a comment...'}
        placeholderTextColor="#94A3B8"
        multiline
        maxLength={2000}
        returnKeyType="default"
      />

      <TouchableOpacity
        style={[C.sendBtn, !canSend && C.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        {sending
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <Ionicons name="send" size={18} color="#FFFFFF" />
        }
      </TouchableOpacity>
    </View>
  )
}

const C = StyleSheet.create({
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  // 44×44 meets iOS HIG minimum touch target
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    maxHeight: 120,
    minHeight: 44,
  },
  // Primary action color matches app-wide indigo, not near-black
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
})
