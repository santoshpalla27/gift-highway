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
    <div className="avatar-uploader-container">
      <style>{`
        .avatar-uploader-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .avatar-wrapper {
          position: relative;
          width: 110px;
          height: 110px;
          border-radius: 50%;
          padding: 4px;
          background: #FFFFFF;
          box-shadow: 0 0 0 1px #E5E7EB, 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .avatar-wrapper:hover {
          box-shadow: 0 0 0 1px #6366F1, 0 10px 15px -3px rgba(99, 102, 241, 0.1);
          transform: translateY(-2px);
        }
        .avatar-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          background: #F3F4F6;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .avatar-initials {
          font-size: 32px;
          font-weight: 700;
          color: #4F46E5;
          letter-spacing: -0.02em;
        }
        .avatar-overlay {
          position: absolute;
          inset: 0;
          background: rgba(17, 24, 39, 0.6);
          backdrop-filter: blur(2px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s ease;
          color: #FFFFFF;
        }
        .avatar-wrapper:hover .avatar-overlay {
          opacity: 1;
        }
        .overlay-text {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 4px;
        }
        .upload-loading {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #E5E7EB;
          border-top-color: #4F46E5;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="avatar-wrapper" onClick={() => !uploading && inputRef.current?.click()}>
        <div className="avatar-inner">
          {uploading && (
            <div className="upload-loading">
              <div className="spinner" />
            </div>
          )}
          
          {currentUrl ? (
            <img src={currentUrl} alt="profile" className="avatar-img" />
          ) : (
            <div className="avatar-initials">{initials}</div>
          )}

          <div className="avatar-overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
            <span className="overlay-text">Change Photo</span>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#EF4444', fontSize: '12px', fontWeight: 500 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}
    </div>
  )
}

