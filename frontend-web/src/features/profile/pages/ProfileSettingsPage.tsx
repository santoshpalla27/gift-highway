import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { profileService } from '../../../services/profileService'
import { useAuthStore } from '../../../store/authStore'
import { AvatarUploader } from '../components/AvatarUploader'
import { useNotifPreference } from '../../notifications/hooks/useNotifPreference'

export function ProfileSettingsPage() {
  const { user, setAuth, accessToken, refreshToken } = useAuthStore()
  const qc = useQueryClient()
  const [freshSignedUrl, setFreshSignedUrl] = useState<string | null>(null)

  const { scope, setScope } = useNotifPreference()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: profileService.getProfile,
  })

  const { data: signedUrl } = useQuery({
    queryKey: ['profile', 'avatar-signed-url'],
    queryFn: profileService.getAvatarSignedURL,
    enabled: !!profile?.avatar_url,
    staleTime: 50 * 60 * 1000,
  })

  const avatarDisplayUrl = freshSignedUrl ?? signedUrl ?? undefined
  const initials = user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}` : '??'

  const handleAvatarUploaded = (newSignedUrl: string) => {
    setFreshSignedUrl(newSignedUrl)
    if (user && accessToken && refreshToken) {
      setAuth({ ...user, avatar_url: newSignedUrl }, accessToken, refreshToken)
    }
    qc.invalidateQueries({ queryKey: ['profile', 'me'] })
    qc.invalidateQueries({ queryKey: ['profile', 'avatar-signed-url'] })
  }

  return (
    <div className="screen active" style={{ background: '#F9FAFB', minHeight: '100%', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        .profile-max-width {
          width: 100%;
          max-width: 680px;
          display: flex;
          flex-direction: column;
        }

        .premium-card {
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 24px;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .premium-card:hover {
          border-color: #D1D5DB;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }
        .card-header {
          padding: 24px 32px 0 32px;
          margin-bottom: 24px;
        }
        .card-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: #9CA3AF;
          letter-spacing: 0.05em;
        }
        .card-body {
          padding: 0 32px 32px 32px;
        }
        .hero-layout {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 24px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 16px 0;
          border-bottom: 1px solid #F3F4F6;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-size: 14px;
          font-weight: 500;
          color: #6B7280;
        }
        .detail-value {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }
        .badge-status {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          background: #ECFDF5;
          color: #059669;
          border: 1px solid #D1FAE5;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
      `}</style>

      <div className="profile-max-width">
        <header style={{ marginBottom: '40px', textAlign: 'center' }}>

          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.025em' }}>Profile Settings</h1>
          <p style={{ fontSize: '15px', color: '#6B7280', marginTop: '4px' }}>Update your identity and workspace preferences.</p>
        </header>

        {/* HERO CARD */}
        <div className="premium-card">
          <div className="card-body" style={{ padding: '40px 32px' }}>
            {isLoading ? (
              <div className="hero-layout">
                <div className="skeleton" style={{ width: '110px', height: '110px', borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '8px' }} />
                  <div className="skeleton" style={{ height: '18px', width: '240px' }} />
                </div>
              </div>
            ) : (
              <div className="hero-layout">
                <AvatarUploader
                  currentUrl={avatarDisplayUrl}
                  initials={initials}
                  onUploaded={handleAvatarUploaded}
                />
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>{profile?.first_name} {profile?.last_name}</h2>
                  <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0 0' }}>{profile?.email}</p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <span className="badge-status">
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', marginRight: '6px' }} />
                      Account Active
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS CARD */}
        <div className="premium-card">
          <div className="card-header">
            <span className="card-label">Account details</span>
          </div>
          <div className="card-body">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="detail-row">
                  <div className="skeleton" style={{ height: '20px', width: '100px' }} />
                  <div className="skeleton" style={{ height: '20px', width: '180px' }} />
                </div>
              ))
            ) : (
              <>
                <div className="detail-row">
                  <span className="detail-label">Full Name</span>
                  <span className="detail-value">{profile?.first_name} {profile?.last_name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email Address</span>
                  <span className="detail-value">{profile?.email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Role</span>
                  <span className="detail-value" style={{ textTransform: 'capitalize' }}>{profile?.role}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* PREFERENCES */}
        <div className="premium-card">
          <div className="card-header">
            <span className="card-label">Preferences</span>
          </div>
          <div className="card-body">
            {/* My Orders setting */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>My Orders Notifications</div>
                <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                  {scope === 'my_orders'
                    ? 'Bell and badge only show notifications for orders assigned to you. All-order activity is still tracked silently.'
                    : 'Bell and badge show notifications for all orders across the workspace.'}
                </div>
              </div>
              {/* Toggle */}
              <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
                {(['my_orders', 'all_orders'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setScope(v)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, transition: 'all 150ms ease',
                      background: scope === v ? '#fff' : 'transparent',
                      color: scope === v ? '#4F46E5' : '#6B7280',
                      boxShadow: scope === v ? '0 1px 3px rgba(0,0,0,.10)' : 'none',
                    }}
                  >
                    {v === 'my_orders' ? 'My Orders' : 'All Orders'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
