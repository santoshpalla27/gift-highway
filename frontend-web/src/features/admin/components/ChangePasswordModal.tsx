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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px', margin: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Change Password</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{user.name}</p>
          </div>
          <button onClick={onClose} className="icon-btn" style={{ border: 'none', background: 'transparent' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {apiError && (
          <div style={{ padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius)', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'New Password', key: 'password' },
            { label: 'Confirm Password', key: 'confirm' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                {label}
              </label>
              <input
                type="password"
                placeholder="••••••••"
                {...register(key as keyof FormData)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-2)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
              />
              {errors[key as keyof FormData] && (
                <p style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                  {errors[key as keyof FormData]?.message}
                </p>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button type="submit" disabled={isPending} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
