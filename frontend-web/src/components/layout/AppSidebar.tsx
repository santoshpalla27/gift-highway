import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface AppSidebarProps {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
}

export function AppSidebar({ isOpen, setIsOpen }: AppSidebarProps) {
  const { user } = useAuthStore()
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}` : '??'

  return (
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} id="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 100 100" style={{ width: '36px', height: '36px', flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }} fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="50" fill="#F0914A" />
            <g stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 16 28 H 25 L 34 62 H 70 L 78 38 H 28" />
              <circle cx="40" cy="75" r="5" fill="none" />
              <circle cx="64" cy="75" r="5" fill="none" />
              <path d="M 38 32 H 68 V 39 H 38 Z" fill="#F0914A" />
              <path d="M 42 39 V 56 H 64 V 39" fill="#F0914A" />
              <path d="M 53 32 V 56" />
              <path d="M 53 32 C 45 18 36 24 44 32" fill="#F0914A" />
              <path d="M 53 32 C 61 18 70 24 62 32" fill="#F0914A" />
            </g>
          </svg>
        </div>
        <div className="logo-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: 'translateY(1px)' }}>
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, fontFamily: "'Outfit', sans-serif" }}>
            <span style={{ color: '#F0914A' }}>Gift</span> Highway
          </span>
          <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Enriching Every Moment
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Main</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <div className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </div>
            <span className="nav-label">Dashboard</span>
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <div className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </div>
            <span className="nav-label">All Orders</span>
          </NavLink>
          <NavLink to="/my-orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <div className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <span className="nav-label">My Orders</span>
          </NavLink>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Workspace</div>
          <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <div className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <span className="nav-label">Notifications</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            <div className="nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41-1.41M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 6.75M21 12h-2M5 12H3M12 21v-2M12 5V3"/>
              </svg>
            </div>
            <span className="nav-label">Settings</span>
          </NavLink>
        </div>
        {user?.role === 'admin' && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Admin</div>
            <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
              <div className="nav-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <span className="nav-label">Users</span>
            </NavLink>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar avatar-sm" style={{ background: '#6366F120', color: '#6366F1', flexShrink: 0 }}>
            {initials}
          </div>
          <div className="user-info">
            <div className="user-name">{user?.first_name} {user?.last_name}</div>
            <div className="user-role" style={{ textTransform: 'capitalize' }}>{user?.role} · Online</div>
          </div>
          <button className="sidebar-toggle" onClick={() => setIsOpen(!isOpen)} title="Collapse sidebar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
