export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yet_to_start:       { label: 'Yet to Start',             color: '#6B7280', bg: '#F3F4F6' },
  working:            { label: 'Working',                   color: '#3B82F6', bg: '#EFF6FF' },
  waiting_for_client: { label: 'Waiting for Client Review', color: '#F59E0B', bg: '#FFFBEB' },
  making:             { label: 'Making',                    color: '#8B5CF6', bg: '#F3E8FF' },
  done:               { label: 'Done',                      color: '#10B981', bg: '#ECFDF5' },
  delivered:          { label: 'Delivered',                 color: '#0D9488', bg: '#F0FDFA' },
  cancelled:          { label: 'Cancelled',                 color: '#EF4444', bg: '#FEF2F2' },
}

export const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}

export const STATUS_OPTIONS = [
  'yet_to_start', 'working', 'waiting_for_client', 'making', 'done', 'delivered', 'cancelled',
] as const

export const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const

export type StatusKey = typeof STATUS_OPTIONS[number]
export type PriorityKey = typeof PRIORITY_OPTIONS[number]
