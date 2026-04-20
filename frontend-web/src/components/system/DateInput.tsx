import { useRef } from 'react'
import { formatDate } from '../../utils/date'

interface Props {
  value: string           // YYYY-MM-DD or ''
  onChange: (v: string) => void
  placeholder?: string
  min?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Native date picker that displays the selected value in DD/MM/YYYY.
 * Stores + emits YYYY-MM-DD (ISO) so the rest of the app is unaffected.
 */
export function DateInput({ value, onChange, placeholder = 'DD/MM/YYYY', min, className, style }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
      onClick={() => inputRef.current?.showPicker?.()}
    >
      {/* Visible styled label */}
      <span style={{
        fontSize: 14, color: value ? '#0F172A' : '#94A3B8',
        pointerEvents: 'none', whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {value ? formatDate(value) : placeholder}
      </span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"
        style={{ flexShrink: 0, marginLeft: 6, pointerEvents: 'none' }}>
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>

      {/* Transparent native input – drives the picker */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        onChange={e => onChange(e.target.value)}
        className={className}
        style={{
          position: 'absolute', inset: 0, opacity: 0,
          cursor: 'pointer', width: '100%', height: '100%',
        }}
      />
    </div>
  )
}
