import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface AppSidebarProps {
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  mobileOpen?: boolean
  isMobile?: boolean
}

function NavItem({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      style={{ textDecoration: 'none' }}
      aria-label={label}
    >
      <div className="nav-icon">{icon}</div>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

export function AppSidebar({ isOpen, setIsOpen, mobileOpen = false, isMobile = false }: AppSidebarProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || '??'
    : '??'
  const fullName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : ''

  return (
    <aside
      className={[
        'sidebar',
        !isMobile && !isOpen ? 'collapsed' : '',
        isMobile ? 'mobile-sidebar' : '',
        isMobile && mobileOpen ? 'mobile-open' : '',
      ].filter(Boolean).join(' ')}
      id="sidebar"
    >

      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon" style={{ background: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <svg viewBox="0 0 100 100" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <span className="logo-text" style={{ fontSize: 16, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#F0914A' }}>Gift</span>Highway
        </span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Main</div>
          <NavItem to="/" end icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          } label="Dashboard" />
          <NavItem to="/orders" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          } label="All Orders" />
          <NavItem to="/my-orders" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          } label="My Orders" />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Workspace</div>
          <NavItem to="/notifications" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          } label="Activity" />
          <NavItem to="/settings/profile" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41-1.41M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 6.75M21 12h-2M5 12H3M12 21v-2M12 5V3"/>
            </svg>
          } label="Settings" />
        </div>

        {user?.role === 'admin' && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Admin</div>
            <NavItem to="/admin/users" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            } label="Users" />
            <NavItem to="/admin/metrics" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            } label="Metrics" />
            <NavItem to="/admin/activity" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            } label="Activity Log" />
            <NavItem to="/admin/audit" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            } label="Audit" />
            <NavItem to="/trash" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            } label="Trash" />
          </div>
        )}
      </nav>

      {/* Footer — user identity + collapse toggle */}
      <div className="sidebar-footer">
        <button
          className="sidebar-user"
          onClick={() => navigate('/settings/profile')}
          aria-label="Go to profile settings"
          title="Profile settings"
          style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
        >
          <div
            className="avatar avatar-sm"
            style={{ background: '#6366F120', color: '#6366F1', flexShrink: 0 }}
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="user-info">
            <div className="user-name">{fullName || 'Account'}</div>
            <div className="user-role" style={{ textTransform: 'capitalize' }}>{user?.role ?? ''}</div>
          </div>
        </button>

        <button
          className="sidebar-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            style={{ transform: isOpen ? 'none' : 'scaleX(-1)', transition: 'transform 0.3s' }}
          >
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
