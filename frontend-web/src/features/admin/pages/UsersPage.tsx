import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminUsers, useDisableUser, useEnableUser, useDeleteUser } from '../hooks/useAdminUsers'
import { CreateUserModal } from '../components/CreateUserModal'
import { EditUserModal } from '../components/EditUserModal'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import type { AdminUser } from '../../../services/adminService'
import { formatDate } from '../../../utils/date'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  confirmColor?: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ title, message, confirmLabel, confirmColor = '#EF4444', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-msg"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: '28px 28px 24px',
          maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div id="confirm-dialog-title" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</div>
        <div id="confirm-dialog-msg" style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '24px' }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: confirmColor, color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function useClickOutside(ref: React.RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

function DropdownMenu({ user, onEdit, onPassword, onToggleActive, onDelete }: { user: AdminUser, onEdit: () => void, onPassword: () => void, onToggleActive: () => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [openUpwards, setOpenUpwards] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setOpenUpwards(spaceBelow < 240)
    }
  }, [open])

  return (
    <div className="relative" ref={ref} style={{ position: 'relative' }}>
      <button
        className="premium-icon-btn"
        onClick={() => setOpen(!open)}
        title="More actions"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>
        </svg>
      </button>

      {open && (
        <div
          className={`premium-dropdown ${openUpwards ? 'dropdown-up' : 'dropdown-down'}`}
        >
          <button onClick={() => { setOpen(false); onEdit(); }} className="premium-menu-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            Edit User
          </button>
          <button onClick={() => { setOpen(false); onPassword(); }} className="premium-menu-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Change Password
          </button>
          <div className="premium-menu-divider" />
          {user.is_active ? (
            <button onClick={() => { setOpen(false); onToggleActive(); }} className="premium-menu-item" style={{ color: '#D97706' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
              Disable User
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onToggleActive(); }} className="premium-menu-item" style={{ color: '#059669' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Enable User
            </button>
          )}
          <button onClick={() => { setOpen(false); onDelete(); }} className="premium-menu-item danger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
            Delete Permanently
          </button>
        </div>
      )}
    </div>
  )
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export function UsersPage() {
  const navigate = useNavigate()
  const { data: users = [], isLoading } = useAdminUsers()
  const { mutate: disableUser } = useDisableUser()
  const { mutate: enableUser } = useEnableUser()
  const { mutate: deleteUser } = useDeleteUser()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [pwdUser, setPwdUser] = useState<AdminUser | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogProps | null>(null)

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggleActive = (user: AdminUser) => {
    if (user.is_active) {
      setConfirmDialog({
        title: 'Disable User',
        message: `Disable ${user.name}? They will be logged out and won't be able to log in.`,
        confirmLabel: 'Disable',
        confirmColor: '#D97706',
        onConfirm: () => { setConfirmDialog(null); disableUser(user.id) },
        onCancel: () => setConfirmDialog(null),
      })
    } else {
      enableUser(user.id)
    }
  }

  const handleDelete = (user: AdminUser) => {
    setConfirmDialog({
      title: 'Delete User',
      message: `Permanently delete ${user.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: '#EF4444',
      onConfirm: () => { setConfirmDialog(null); deleteUser(user.id) },
      onCancel: () => setConfirmDialog(null),
    })
  }

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      <div className="premium-header">
        <div>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Users</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Manage access and team accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => navigate('/admin/audit')}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '7px' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Audit Log
          </button>
          <button
            onClick={() => navigate('/admin/metrics')}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '7px' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="16" y="13" width="6" height="8" rx="1"/>
            </svg>
            Metrics
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add User
          </button>
        </div>
      </div>

      <div className="premium-toolbar">
        <div className="premium-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input 
            type="text" 
            placeholder="Search users by name or email…" 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
            {users.length} users
          </div>
        </div>
      </div>

      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Added</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="skeleton-row">
                  <td><div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><div className="premium-avatar" style={{ background: 'var(--border)', border: 'none' }}></div><div style={{ flex: 1 }}><span style={{ width: '120px', marginBottom: '6px' }}></span><span style={{ width: '180px', height: '14px' }}></span></div></div></td>
                  <td><span style={{ width: '80px', height: '24px', borderRadius: '999px' }}></span></td>
                  <td><span style={{ width: '70px' }}></span></td>
                  <td><span style={{ width: '90px' }}></span></td>
                  <td><span style={{ width: '32px', height: '32px', float: 'right' }}></span></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>No users found</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Try adjusting your search query, or add a new user.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map(user => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div className="premium-avatar">{getInitials(user.name)}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`premium-role-chip ${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      <span className={`premium-status-dot ${user.is_active ? 'active' : 'disabled'}`}></span>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                      {formatDate(user.created_at) || 'Just now'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <DropdownMenu
                        user={user}
                        onEdit={() => setEditUser(user)}
                        onPassword={() => setPwdUser(user)}
                        onToggleActive={() => handleToggleActive(user)}
                        onDelete={() => handleDelete(user)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
      {pwdUser && <ChangePasswordModal user={pwdUser} onClose={() => setPwdUser(null)} />}
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </div>
  )
}
