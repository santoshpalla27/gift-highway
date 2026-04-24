import { useNotifPreference } from '../hooks/useNotifPreference'
import type { NotifScope } from '../hooks/useNotifPreference'

const GROUPS: { label: string; types: { key: string; label: string }[] }[] = [
  {
    label: 'Important Updates',
    types: [
      { key: 'customer_message',    label: 'Customer Messages' },
      { key: 'customer_attachment', label: 'Customer Attachments' },
      { key: 'assignees_changed',   label: 'Assignment Changes' },
    ],
  },
  {
    label: 'Workflow Updates',
    types: [
      { key: 'status_changed',    label: 'Status Changes' },
      { key: 'due_date_changed',  label: 'Due Date Changes' },
    ],
  },
  {
    label: 'Team Activity',
    types: [
      { key: 'comment_added',      label: 'Staff Comments' },
      { key: 'attachment_added',   label: 'Staff Attachments' },
      { key: 'staff_portal_reply', label: 'Portal Replies' },
    ],
  },
  {
    label: 'Low Priority',
    types: [
      { key: 'order_updated',    label: 'Generic Updates' },
      { key: 'priority_changed', label: 'Priority Changes' },
    ],
  },
]

export function NotificationPreferencesCard() {
  const { scope, prefs, setScope, toggleType } = useNotifPreference()

  const activeScope: NotifScope = scope
  const typePrefs = prefs.types[activeScope]

  return (
    <>
      {/* Scope selector */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Notification Scope</div>
          <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
            {scope === 'my_orders'
              ? 'Bell and badge show notifications only for orders assigned to you.'
              : 'Bell and badge show notifications for all orders in the workspace.'}
          </div>
        </div>
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2, flexShrink: 0 }}>
          {(['my_orders', 'all_orders'] as const).map(v => (
            <button
              key={v}
              onClick={() => setScope(v)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 150ms ease',
                background: scope === v ? '#fff' : 'transparent',
                color: scope === v ? '#4F46E5' : '#6B7280',
                boxShadow: scope === v ? '0 1px 3px rgba(0,0,0,.10)' : 'none',
              }}
            >
              {v === 'my_orders' ? 'My Orders' : 'All Orders'}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #F3F4F6', marginBottom: 20 }} />

      {/* Per-type title */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Notify me about ({scope === 'my_orders' ? 'My Orders' : 'All Orders'})
      </div>

      {/* Mentions — always on, no toggle */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
          Mentions
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8,
          background: '#F5F3FF', border: '1px solid #DDD6FE',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#4F46E5', flex: 1, userSelect: 'none' }}>
            Mentions (@you)
          </span>
          <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>Always on</span>
        </div>
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.types.map(({ key, label }) => {
                const checked = typePrefs[key] ?? false
                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer', padding: '8px 12px',
                      borderRadius: 8, transition: 'background 120ms',
                      background: checked ? '#F5F3FF' : '#F9FAFB',
                      border: `1px solid ${checked ? '#DDD6FE' : '#F3F4F6'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => toggleType(activeScope, key, e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: '#6366F1', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 500, color: checked ? '#4F46E5' : '#374151', userSelect: 'none' }}>
                      {label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
