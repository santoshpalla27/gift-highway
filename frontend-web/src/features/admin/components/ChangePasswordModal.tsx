import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useChangePassword } from '../hooks/useAdminUsers'
import type { AdminUser } from '../../../services/adminService'

const schema = z.object({
  password: z.string().min(8, 'Min 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type FormData = z.infer<typeof schema>

interface Props {
  user: AdminUser
  onClose: () => void
}

export function ChangePasswordModal({ user, onClose }: Props) {
  const { mutate: changePassword, isPending, error } = useChangePassword()
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = (data: FormData) => {
    changePassword({ id: user.id, password: data.password }, { onSuccess: onClose })
  }

  const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s ease-out' }}>
      <style>{`
        @keyframes modalScaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .premium-modal {
          background: #FFFFFF;
          width: 100%;
          max-width: 440px;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          animation: modalScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .premium-modal-header {
          padding: 24px 32px 16px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #F3F4F6;
        }
        .premium-modal-body {
          padding: 24px 32px;
        }
        .premium-input {
          width: 100%;
          padding: 12px 14px;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          font-size: 14px;
          color: #111827;
          outline: none;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }
        .premium-input:focus {
          background: #FFFFFF;
          border-color: #6366F1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        .premium-label {
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          display: block;
          margin-bottom: 6px;
        }
      `}</style>

      <div className="premium-modal">
        <div className="premium-modal-header">
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Set New Password
            </h2>
            <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>For {user.name}</p>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'} onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="premium-modal-body">
          {apiError && (
            <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: '8px', fontSize: '13px', fontWeight: 500, marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="premium-label">New Password</label>
              <input type="password" placeholder="••••••••" className="premium-input" {...register('password')} />
              {errors.password && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px' }}>{errors.password.message}</p>}
            </div>

            <div>
              <label className="premium-label">Confirm Password</label>
              <input type="password" placeholder="••••••••" className="premium-input" {...register('confirm')} />
              {errors.confirm && <p style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px' }}>{errors.confirm.message}</p>}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingTop: '24px', borderTop: '1px solid #F3F4F6' }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#374151', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}>
                Cancel
              </button>
              <button type="submit" disabled={isPending} style={{ flex: 1, padding: '12px', background: '#111827', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#FFFFFF', cursor: 'pointer', opacity: isPending ? 0.7 : 1, transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} onMouseEnter={e => { if(!isPending) e.currentTarget.style.background = '#374151' }} onMouseLeave={e => { if(!isPending) e.currentTarget.style.background = '#111827' }}>
                {isPending ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
