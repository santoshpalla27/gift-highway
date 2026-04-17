import { useAuthStore } from '../../../store/authStore'

export function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <div id="screen-dashboard" className="screen active">
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.first_name}</h1>
          <p>Here is what is happening today.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Total Orders', value: '—', color: 'var(--accent)' },
          { label: 'My Orders', value: '—', color: 'var(--status-work)' },
          { label: 'Due Today', value: '—', color: 'var(--warning)' },
          { label: 'Overdue', value: '—', color: 'var(--danger)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: card.color, marginTop: '8px' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
