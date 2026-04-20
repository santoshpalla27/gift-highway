// All UI date formatting lives here. Backend always returns ISO/RFC3339; UI converts.

function to12hr(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** 20/04/2026 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** 20/04/2026, 3:45 PM */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return `${formatDate(d)}, ${to12hr(d)}`
}

/** 3:45 PM — for chat/portal message bubbles */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return to12hr(d)
}

/**
 * Relative: "just now", "5m ago", "2h ago", "Yesterday, 3:45 PM", "20/04/2026, 3:45 PM"
 * Used in timelines, activity feeds.
 */
export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 7200) return `${Math.floor(diffSec / 3600)}h ago`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return to12hr(d)
  if (dDay.getTime() === yesterday.getTime()) return `Yesterday, ${to12hr(d)}`
  return formatDateTime(d)
}

/** "Today" / "Yesterday" / "20/04/2026" — for timeline date dividers */
export function formatDayGroup(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return 'Today'
  if (dDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return formatDate(d)
}

/** Convert HH:MM (24hr string stored in DB) → "3:45 PM" */
export function fmt12hrStr(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

/** YYYY-MM-DD — for <input type="date"> value */
export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD for today (or offset days). Used for API ?local_date= param. */
export function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
