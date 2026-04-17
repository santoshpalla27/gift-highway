import { useRef, useState } from 'react'
import { profileService } from '../../../services/profileService'

interface Props {
  currentUrl?: string
  initials: string
  onUploaded: (url: string) => void
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function AvatarUploader({ currentUrl, initials, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only PNG, JPEG, or WebP allowed')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('Max file size is 10MB')
      return
    }

    setUploading(true)
    try {
      const { upload_url, object_key } = await profileService.getAvatarUploadURL(file.name, file.type)

      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      const { signed_url } = await profileService.confirmAvatarUpload(object_key)
      onUploaded(signed_url)
    } catch {
      setError('Upload failed. Check storage configuration.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Avatar display */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {currentUrl ? (
          <img
            src={currentUrl}
            alt="avatar"
            style={{ width: '88px', height: '88px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }}
          />
        ) : (
          <div style={{
            width: '88px', height: '88px', borderRadius: '50%',
            background: '#6366F120', color: '#6366F1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', fontWeight: 700, border: '3px solid var(--border)',
          }}>
            {initials}
          </div>
        )}

        {/* Camera overlay */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'var(--accent)', border: '2px solid var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#fff',
          }}
          title="Change avatar"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {uploading && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Uploading…</span>
      )}
      {error && (
        <span style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</span>
      )}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn btn-secondary btn-sm"
        style={{ fontSize: '12px' }}
      >
        {uploading ? 'Uploading…' : 'Change Avatar'}
      </button>
    </div>
  )
}
