import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { profileService } from '../../../services/profileService'
import { useAuthStore } from '../../../store/authStore'
import { AvatarUploader } from '../components/AvatarUploader'

export function ProfileSettingsPage() {
  const { user, setAuth, accessToken, refreshToken } = useAuthStore()
  const qc = useQueryClient()
  // Holds a fresh signed URL after a new upload (overrides the fetched one temporarily)
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

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`
    : '??'

  const handleAvatarUploaded = (newSignedUrl: string) => {
    setFreshSignedUrl(newSignedUrl)
    if (user && accessToken && refreshToken) {
      setAuth({ ...user, avatar_url: newSignedUrl }, accessToken, refreshToken)
    }
    qc.invalidateQueries({ queryKey: ['profile', 'me'] })
    qc.invalidateQueries({ queryKey: ['profile', 'avatar-signed-url'] })
  }

  return (
    <div className="screen active">
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Manage your account</p>
        </div>
      </div>

      <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Profile Card */}
        <div className="card" style={{ padding: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px', marginBottom: '24px' }}>
            Identity
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'var(--surface-2)' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ height: '18px', width: '160px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
                <div style={{ height: '14px', width: '200px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
              <AvatarUploader
                currentUrl={avatarDisplayUrl}
                initials={initials}
                onUploaded={handleAvatarUploaded}
              />

              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {profile?.first_name} {profile?.last_name}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {profile?.email}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <span className={`badge badge-${profile?.role === 'admin' ? 'review' : 'new'}`} style={{ textTransform: 'capitalize' }}>
                    {profile?.role}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preferences placeholder */}
        <div className="card" style={{ padding: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px', marginBottom: '16px' }}>
            Preferences
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41-1.41M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 6.75M21 12h-2M5 12H3M12 21v-2M12 5V3"/>
            </svg>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Preferences coming soon</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Notification settings and theme preferences will appear here.
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
