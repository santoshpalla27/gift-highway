import { useLogout } from '../../features/auth/hooks/useLogout'
import { useAuthStore } from '../../store/authStore'

interface AppHeaderProps {
  onMenuClick: () => void
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const { user } = useAuthStore()
  const { mutate: logout } = useLogout()
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}` : '??'

  return (
    <header className="topbar">
      <div className="topbar-title">
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
        <span id="topbarTitle">Workspace</span>
      </div>

      <div className="topbar-actions" style={{ gap: '12px' }}>
        <button className="icon-btn" title="Notifications" style={{ width: '42px', height: '42px', position: 'relative' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        <div
          className="avatar avatar-md"
          style={{ background: '#6366F120', color: '#6366F1', cursor: 'pointer', width: '38px', height: '38px', fontSize: '13px' }}
          title={`${user?.first_name} ${user?.last_name}`}
          onClick={() => logout()}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}
