import { useState, useRef, useEffect } from 'react'

interface FilterPillProps {
  label: string
  value?: string
  onClear?: () => void
  children: (close: () => void) => React.ReactNode
}

export function FilterPill({ label, value, onClear, children }: FilterPillProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = !!value

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          border: `1.5px solid ${isActive ? '#6366F1' : '#E4E6EF'}`,
          background: isActive ? '#EEF2FF' : '#FFFFFF',
          color: isActive ? '#6366F1' : '#374151',
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'border-color 120ms ease, background 120ms ease',
        }}
        className="filter-pill-btn"
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = '#C7CAD9' }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.borderColor = '#E4E6EF' }}
      >
        <span>{isActive ? `${label}: ${value}` : label}</span>
        {isActive ? (
          <span
            role="button"
            aria-label={`Clear ${label} filter`}
            onClick={e => { e.stopPropagation(); onClear?.(); setOpen(false) }}
            style={{ display: 'flex', alignItems: 'center', marginLeft: 2, opacity: 0.7, cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
            background: '#FFFFFF', border: '1px solid #E4E6EF',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06)',
            minWidth: 160, overflow: 'hidden',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
