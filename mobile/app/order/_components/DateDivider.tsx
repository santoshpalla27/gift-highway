import { View, Text, StyleSheet } from 'react-native'

export function DateDivider({ label }: { label: string }) {
  return (
    <View style={D.row}>
      <View style={D.line} />
      <Text style={D.label}>{label}</Text>
      <View style={D.line} />
    </View>
  )
}

const D = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  label: { fontSize: 11.5, fontWeight: '600', color: '#94A3B8' },
})
