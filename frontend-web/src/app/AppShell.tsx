import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '../components/layout/AppSidebar'
import { AppHeader } from '../components/layout/AppHeader'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="app">
      <AppSidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="main">
        <AppHeader onMenuClick={() => setSidebarOpen(o => !o)} />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
