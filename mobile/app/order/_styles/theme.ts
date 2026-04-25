import { Platform } from 'react-native'

// ─── Colors ───────────────────────────────────────────────────────────────────

export const C = {
  indigo:           '#6366F1',
  indigoBg:         '#EEF2FF',
  indigoBorder:     '#C7D2FE',

  staffBubbleBg:    '#EFF6FF',
  staffBubbleBorder:'#BFDBFE',
  customerBubbleBg: '#F0FDF4',
  customerBubbleBorder: '#A7F3D0',

  // PortalChat (WhatsApp-style)
  portalCustomerBubble: '#FFFFFF',
  portalStaffBubble:    '#D9FDD3',

  internalBubbleBg:  '#FFFFFF',
  internalBubbleBorder: '#E2E8F0',

  failBubbleBg:     '#FFF5F5',
  failBubbleBorder: '#FCA5A5',

  avatarStaffBg:    '#0F172A',
  avatarStaffText:  '#FFFFFF',
  avatarCustomerBg: '#D1FAE5',
  avatarCustomerText:'#10B981',
  avatarPortalStaffBg:  '#DBEAFE',
  avatarPortalStaffText:'#2563EB',
  avatarPortalCustomerBg:  '#25D366',
  avatarPortalCustomerText:'#FFFFFF',

  textPrimary:   '#334155',
  textSecondary: '#94A3B8',
  textActor:     '#0F172A',
  textMuted:     '#6B7280',

  bg:       '#F8FAFC',
  bgWhite:  '#FFFFFF',
  border:   '#E2E8F0',
  borderLight: '#F1F5F9',
} as const

// ─── Sizing ───────────────────────────────────────────────────────────────────

export const AVATAR_SIZE  = 34
export const AVATAR_R     = 17
export const BUBBLE_MAX_W = 280   // fixed px ≈ 75 % on 390px screen minus avatar+gap
export const GAP          = 10    // avatar ↔ bubble horizontal gap

// ─── Shared stylesheet snippets reused by multiple components ─────────────────

export const overlaySheet = {
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' as const },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 36 : 16,
  },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingVertical: 16, paddingHorizontal: 24 },
  rowText: { fontSize: 15, color: '#111827', fontWeight: '500' as const },
  cancelRow: { borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '500' as const, flex: 1, textAlign: 'center' as const },
}
