import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { AppHeader } from '../components/layout/AppHeader'
import { ConnectionBanner } from '../components/system/ConnectionBanner'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="app">
      <AppSidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="main">
        <AppHeader onMenuClick={() => setSidebarOpen(o => !o)} />
        <ConnectionBanner />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
