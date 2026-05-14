/**
 * Gift Highway — single source of truth for design tokens.
 * All screens and components should reference these values instead of
 * hardcoding hex/size literals.
 */

// ─── Colors ───────────────────────────────────────────────────────────────────

export const COLORS = {
  // Primary (indigo)
  primary:       '#6366F1',
  primaryBg:     '#EEF2FF',
  primaryBorder: '#C7D2FE',
  primaryDark:   '#4F46E5',

  // Brand accent (orange)
  accent:    '#F0914A',
  accentBg:  '#FFF7ED',
  accentDark:'#C45F00',

  // Page & surface backgrounds — ONE value across all screens
  bgPage:   '#F5F6FA',
  bgCard:   '#FFFFFF',
  bgSubtle: '#F8FAFC',
  bgInput:  '#F3F4F6',

  // Text — contrast-compliant (WCAG AA)
  textPrimary:   '#111827', // ~14:1 on white
  textSecondary: '#64748B', // ~5.2:1 on white  (was #94A3B8 — 3:1, fails)
  textTertiary:  '#9CA3AF', // use only for de-emphasised UI, never body copy
  textMuted:     '#6B7280',
  textInverse:   '#FFFFFF',

  // Borders & dividers
  border:      '#E5E7EB',
  borderLight: '#F3F4F6',
  borderFocus: '#A5B4FC',

  // Semantic
  danger:        '#EF4444',
  dangerBg:      '#FEF2F2',
  dangerBorder:  '#FECACA',
  warning:       '#F59E0B',
  warningBg:     '#FFFBEB',
  warningBorder: '#FDE68A',
  success:       '#10B981',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',

  // Offline banner
  offlineBg:      '#FEF3C7',
  offlineBorder:  '#FCD34D',
  offlineText:    '#92400E',
  offlineDot:     '#F59E0B',
  onlineBg:       '#D1FAE5',
  onlineBorder:   '#6EE7B7',
  onlineText:     '#065F46',
  onlineDot:      '#10B981',
} as const

// ─── Status metadata (single source of truth) ────────────────────────────────

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',        color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',              color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client',   color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',               color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                 color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',            color: '#0D9488', bg: '#F0FDFA' },
  cancelled:          { label: 'Cancelled',            color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Priority metadata (single source of truth) ──────────────────────────────

export const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Typography ──────────────────────────────────────────────────────────────

export const FONT_SIZE = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const

export const FONT_WEIGHT = {
  regular:  '400' as const,
  medium:   '500' as const,
  semibold: '600' as const,
  bold:     '700' as const,
  extrabold:'800' as const,
}

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const

// ─── Border radius ───────────────────────────────────────────────────────────

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  pill: 999,
} as const

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
} as const

// ─── Touch targets ───────────────────────────────────────────────────────────

export const MIN_TOUCH = 44 // iOS HIG minimum
