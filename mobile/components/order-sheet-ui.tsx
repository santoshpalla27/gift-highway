import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, MIN_TOUCH } from '../constants/theme'

export function OrderSheetHeader({ title, subtitle, onClose, topInset }: {
  title: string; subtitle: string; onClose: () => void; topInset: number
}) {
  return <View style={[sheetUI.header, { paddingTop: topInset + 16 }]}>
    <View style={sheetUI.headingCopy}>
      <Text accessibilityRole="header" style={sheetUI.title}>{title}</Text>
      <Text style={sheetUI.subtitle}>{subtitle}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose}
      style={({ pressed }) => [sheetUI.close, pressed && { backgroundColor: COLORS.border }]}>
      <Ionicons name="close" size={22} color={COLORS.textSecondary} />
    </Pressable>
  </View>
}

export const sheetUI = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: COLORS.bgPage },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: COLORS.bgPage },
  headingCopy: { flex: 1 },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, letterSpacing: -0.5, color: COLORS.textPrimary },
  subtitle: { fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.textSecondary, marginTop: 4 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: RADIUS.pill, backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textPrimary, marginBottom: 12, letterSpacing: -0.2 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 20 },
  metadataText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  input: { backgroundColor: COLORS.bgSubtle, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, minHeight: 50, fontSize: FONT_SIZE.md, color: COLORS.textPrimary },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.textSecondary, marginTop: 16, marginBottom: 8 },
  footer: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: COLORS.bgCard, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, gap: 10 },
  primaryButton: { minHeight: 52, borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.textPrimary },
  primaryText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.textInverse },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.bgSubtle },
  chipSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primaryBorder },
  selectedText: { color: COLORS.primaryDark, fontWeight: FONT_WEIGHT.semibold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, paddingVertical: 12, borderRadius: RADIUS.md },
  rowSelected: { backgroundColor: COLORS.primaryBg },
  statusText: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.textPrimary },
  filterSummary: { paddingHorizontal: 8, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  summaryText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  reset: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 8 },
  resetText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primaryDark },
})
