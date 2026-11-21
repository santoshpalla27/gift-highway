import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import './FilterPill.css'

interface FilterPillProps {
  label: string
  value?: string
  onClear?: () => void
  children: (close: () => void) => React.ReactNode
}
export function FilterPill({ label, value, onClear, children }: FilterPillProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 360 })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => setOpen(false)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!trigger.current || !panel.current) return
      const rect = trigger.current.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 14
      const above = rect.top - 14
      const height = Math.min(panel.current.scrollHeight, 360)
      const up = below < height && above > below
      const maxHeight = Math.max(0, Math.min(360, up ? above : below))
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - panel.current.offsetWidth - 8)), top: up ? Math.max(8, rect.top - Math.min(height, maxHeight) - 6) : rect.bottom + 6, maxHeight })
    }
    place()
    panel.current?.focus({ preventScroll: true })
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className={'filter-control' + (value ? ' is-active' : '')}>
    <button ref={trigger} type="button" className="filter-trigger" aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
      <span>{value ? `${label}: ${value}` : label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {value && onClear && <button type="button" className="filter-clear" aria-label={`Clear ${label} filter`} onClick={() => { onClear(); close() }}>×</button>}
    {open && createPortal(<div ref={panel} id={id} tabIndex={-1} role="dialog" aria-label={`${label} filter`} className="filter-popover" style={position}>
      <div className="filter-popover-heading"><span>{label}</span><button type="button" aria-label={`Close ${label} filter`} onClick={() => { close(); trigger.current?.focus() }}>×</button></div>
      {children(close)}
    </div>, document.body)}
  </div>
}
