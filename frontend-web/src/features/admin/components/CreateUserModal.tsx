import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCreateUser } from '../hooks/useAdminUsers'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['user', 'admin']),
})
type FormData = z.infer<typeof schema>

interface Props {
  onClose: () => void
}

export function CreateUserModal({ onClose }: Props) {
  const { mutate: createUser, isPending, error } = useCreateUser()
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'user' },
  })

  const onSubmit = (data: FormData) => {
    createUser(data, { onSuccess: onClose })
  }

  const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '32px', margin: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Create User</h2>
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
            { label: 'Full Name', key: 'name', type: 'text', placeholder: 'John Doe' },
            { label: 'Email Address', key: 'email', type: 'email', placeholder: 'user@company.com' },
            { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                {label}
              </label>
              <input
                type={type}
                placeholder={placeholder}
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

          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
              Role
            </label>
            <select
              {...register('role')}
              className="filter-select"
              style={{ width: '100%' }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
              Cancel
            </button>
            <button type="submit" disabled={isPending} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
