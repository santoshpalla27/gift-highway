interface EmptyStateProps {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', textAlign: 'center',
    }}>
      {icon ? (
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: '#F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, color: '#9CA3AF',
        }}>
          {icon}
        </div>
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: '#F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: '#6B7280', maxWidth: 280, lineHeight: 1.6 }}>{description}</div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 20, padding: '8px 18px', borderRadius: 8,
            background: '#111827', color: '#FFFFFF', border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
