import { COLORS, FONT_SIZE, RADIUS } from '../../../constants/theme'
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
  label: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.textSecondary, backgroundColor: COLORS.bgCard, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.pill },
})
