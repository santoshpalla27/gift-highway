import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { AppHeader } from '../components/layout/AppHeader'
import { ConnectionBanner } from '../components/system/ConnectionBanner'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Detect mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handle)
    return () => mq.removeEventListener('change', handle)
  }, [])

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  function handleMenuClick() {
    if (isMobile) setMobileOpen(o => !o)
    else setSidebarOpen(o => !o)
  }

  return (
    <div className="app">
      {/* Mobile overlay backdrop */}
      {isMobile && mobileOpen && (
        <div
          ref={overlayRef}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            zIndex: 299, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <AppSidebar
        isOpen={isMobile ? true : sidebarOpen}
        setIsOpen={isMobile ? setMobileOpen : setSidebarOpen}
        mobileOpen={mobileOpen}
        isMobile={isMobile}
      />

      <div className="main">
        <AppHeader onMenuClick={handleMenuClick} />
        <ConnectionBanner />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
