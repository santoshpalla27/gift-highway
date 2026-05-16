// All UI date formatting lives here. Backend always returns ISO/RFC3339; UI converts.
// All functions display and compare dates in IST (Asia/Kolkata, UTC+5:30).

const IST = 'Asia/Kolkata'

function to12hr(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

/** YYYY-MM-DD in IST for an arbitrary Date (default: now) */
export function istDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

/** YYYY-MM-DD in IST for today+offsetDays */
export function localDateStr(offsetDays = 0): string {
  const d = new Date()
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays)
  return istDateStr(d)
}

/** UTC ISO for start of a calendar date in IST (midnight IST) */
export function istDayStart(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00+05:30').toISOString()
}

/** UTC ISO for end of a calendar date in IST (23:59:59.999 IST) */
export function istDayEnd(dateStr: string): string {
  return new Date(dateStr + 'T23:59:59.999+05:30').toISOString()
}

/** YYYY-MM-DD IST date key — for timeline grouping */
export function dayKeyIST(isoString: string): string {
  return istDateStr(new Date(isoString))
}

/** Extract YYYY-MM-DD (IST) from a DateTimePicker result Date object */
export function datePickerToIST(d: Date): string {
  return istDateStr(d)
}

/** Extract HH:MM (IST, 24-hr) from a DateTimePicker result Date object */
export function timePickerToIST(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** 20/04/2026 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric' })
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
 */
export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 7200) return `${Math.floor(diffSec / 3600)}h ago`
  const todayIST = istDateStr(now)
  const yesterdayIST = istDateStr(new Date(now.getTime() - 86400000))
  const dIST = istDateStr(d)
  if (dIST === todayIST) return to12hr(d)
  if (dIST === yesterdayIST) return `Yesterday, ${to12hr(d)}`
  return formatDateTime(d)
}

/** "Today" / "Yesterday" / "20/04/2026" — for timeline date dividers */
export function formatDayGroup(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const todayIST = istDateStr(now)
  const yesterdayIST = istDateStr(new Date(now.getTime() - 86400000))
  const dIST = istDateStr(d)
  if (dIST === todayIST) return 'Today'
  if (dIST === yesterdayIST) return 'Yesterday'
  return formatDate(d)
}

/** Convert HH:MM (24hr string stored in DB) → "3:45 PM" */
export function fmt12hrStr(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
