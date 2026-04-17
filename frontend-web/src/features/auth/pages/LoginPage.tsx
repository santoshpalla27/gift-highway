import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLogin } from '../hooks/useLogin'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const { mutate: login, isPending, error } = useLogin()

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = (data: LoginFormData) => login(data)
  const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>

        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
            <svg viewBox="0 0 100 100" style={{ width: '48px', height: '48px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }} fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <span style={{ fontWeight: 800, fontSize: '32px', letterSpacing: '-0.05em', lineHeight: 1, color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
              <span style={{ color: '#F0914A' }}>Gift</span> Highway
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Sign in to your workspace</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} noValidate>

            {(apiError || errors.email || errors.password) && (
              <div style={{ padding: '12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius)', fontSize: '12px', fontWeight: 600, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{apiError || errors.email?.message || errors.password?.message}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>
                Email Address
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                {...register('email')}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-2)', border: `1.5px solid ${errors.email ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', transition: 'all var(--t-fast)', boxSizing: 'border-box' }}
                onFocus={(e) => { if (!errors.email) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { if (!errors.email) e.currentTarget.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>
                  Password
                </label>

              </div>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-2)', border: `1.5px solid ${errors.password ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', transition: 'all var(--t-fast)', boxSizing: 'border-box' }}
                onFocus={(e) => { if (!errors.password) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { if (!errors.password) e.currentTarget.style.borderColor = 'var(--border)' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="rememberMe" {...register('rememberMe')} style={{ width: '14px', height: '14px', accentColor: 'var(--accent)', cursor: 'pointer' }} />
              <label htmlFor="rememberMe" style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Remember me for 30 days</label>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: '4px', opacity: isPending ? 0.7 : 1, cursor: isPending ? 'wait' : 'pointer' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isPending ? 'Authenticating...' : (
                  <>
                    Sign In
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </>
                )}
              </span>
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          Internal use only — unauthorized access is prohibited
        </p>
      </div>
    </div>
  )
}
