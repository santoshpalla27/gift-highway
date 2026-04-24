import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogout } from '../../features/auth/hooks/useLogout'
import { useAuthStore } from '../../store/authStore'
import { orderService, type Order } from '../../services/orderService'
import { BellDropdown } from '../../features/notifications/components/BellDropdown'

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Order[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelectedIdx(-1)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const { orders } = await orderService.listOrders({ search: q.trim(), limit: 8 })
      setResults(orders)
      setOpen(true)
      setSelectedIdx(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = selectedIdx >= 0 ? results[selectedIdx] : results[0]
      if (target) openOrder(target.id)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSelectedIdx(-1)
      inputRef.current?.blur()
    }
  }

  function openOrder(id: string) {
    navigate(`/orders/${id}`)
    setQuery('')
    setResults([])
    setOpen(false)
    setSelectedIdx(-1)
    inputRef.current?.blur()
  }

  const STATUS_COLOR: Record<string, string> = {
    new: '#6B7280',
    in_progress: '#3B82F6',
    completed: '#10B981',
  }
  const STATUS_LABEL: Record<string, string> = {
    new: 'New',
    in_progress: 'Working',
    completed: 'Done',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, maxWidth: 420, minWidth: 0 }}>
      <div className={`search-bar${open || query ? ' active' : ''}`} style={{ width: '100%', boxSizing: 'border-box' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search orders…"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ flexShrink: 0, opacity: 0.5, animation: 'spin 0.8s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        )}
        {query && !loading && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-tertiary)', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
          zIndex: 200, overflow: 'hidden',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              No orders found
            </div>
          ) : (
            <>
              <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
                ORDERS · {results.length} result{results.length !== 1 ? 's' : ''}
              </div>
              {results.map((order, i) => (
                <div
                  key={order.id}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onMouseLeave={() => setSelectedIdx(-1)}
                  onClick={() => openOrder(order.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', cursor: 'pointer',
                    background: selectedIdx === i ? 'var(--surface-2)' : 'transparent',
                    borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 80ms',
                  }}
                >
                  {/* Order number badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '2px 6px',
                    flexShrink: 0, letterSpacing: '0.3px', fontFamily: 'monospace',
                  }}>
                    #{order.title}
                  </span>

                  {/* Title + customer */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.customer_name}
                    </div>
                  </div>

                  {/* Status dot */}
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: STATUS_COLOR[order.status] ?? '#6B7280',
                    flexShrink: 0,
                  }}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
              ))}
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
                <span><kbd style={kbdStyle}>↵</kbd> open</span>
                <span><kbd style={kbdStyle}>esc</kbd> close</span>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block', padding: '1px 5px', fontSize: 10, fontFamily: 'monospace',
  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text-secondary)', marginRight: 3,
}

// ─── App Header ───────────────────────────────────────────────────────────────

interface AppHeaderProps {
  onMenuClick: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuthStore()
  const { mutate: logout, isPending } = useLogout()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const initials = user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || '??' : '??'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-title" style={{ flex: 'none' }}>
        <button
          className="icon-btn"
          onClick={onMenuClick}
          style={{ marginRight: '8px', border: 'none', background: 'transparent' }}
          title="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Global search — centred in header */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px', minWidth: 0 }}>
        <GlobalSearch />
      </div>

      <div className="topbar-actions" style={{ gap: '12px', flexShrink: 0 }}>
        <BellDropdown />

        {/* Profile dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <div
            className="avatar avatar-md"
            style={{ background: '#6366F120', color: '#6366F1', cursor: 'pointer', width: '38px', height: '38px', fontSize: '13px', userSelect: 'none' }}
            onClick={() => setDropdownOpen(o => !o)}
            title={`${user?.first_name} ${user?.last_name}`}
          >
            {initials}
          </div>

          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
              minWidth: '200px', zIndex: 100, overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user?.first_name} {user?.last_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', textTransform: 'capitalize' }}>
                  {user?.role}
                </div>
              </div>

              <div style={{ padding: '6px' }}>
                <button
                  onClick={() => { setDropdownOpen(false); navigate('/settings/profile') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: 'var(--radius)', border: 'none',
                    background: 'transparent', cursor: 'pointer', fontSize: '13px',
                    color: 'var(--text-secondary)', textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  View Profile
                </button>

                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

                <button
                  onClick={() => { setDropdownOpen(false); logout() }}
                  disabled={isPending}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: 'var(--radius)', border: 'none',
                    background: 'transparent', cursor: 'pointer', fontSize: '13px',
                    color: 'var(--danger)', textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  {isPending ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
