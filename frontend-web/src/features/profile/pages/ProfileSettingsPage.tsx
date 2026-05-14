import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { profileService } from '../../../services/profileService'
import { useAuthStore } from '../../../store/authStore'
import { AvatarUploader } from '../components/AvatarUploader'
import { NotificationPreferencesCard } from '../../notifications/components/NotificationPreferencesCard'

export function ProfileSettingsPage() {
  const { user, setAuth, accessToken, refreshToken } = useAuthStore()
  const qc = useQueryClient()
  const [freshSignedUrl, setFreshSignedUrl] = useState<string | null>(null)

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
    <div className="screen active" style={{ background: 'var(--bg)', minHeight: '100%', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      <div className="profile-max-width">
        <header style={{ marginBottom: '40px', textAlign: 'center' }}>

          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.025em' }}>Profile Settings</h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>Update your identity and workspace preferences.</p>
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
                  <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{profile?.first_name} {profile?.last_name}</h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{profile?.email}</p>
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
            <span className="card-label">Notification Preferences</span>
          </div>
          <div className="card-body">
            <NotificationPreferencesCard />
          </div>
        </div>
      </div>
    </div>
  )
}
