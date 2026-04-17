import { useState, useRef, useEffect } from 'react'
import { useAdminUsers, useDeleteUser } from '../hooks/useAdminUsers'
import { CreateUserModal } from '../components/CreateUserModal'
import { EditUserModal } from '../components/EditUserModal'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import type { AdminUser } from '../../../services/adminService'

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

function DropdownMenu({ user, onEdit, onPassword, onDelete }: { user: AdminUser, onEdit: () => void, onPassword: () => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [openUpwards, setOpenUpwards] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const dropdownHeight = 200 // Increased threshold for safety
      setOpenUpwards(spaceBelow < dropdownHeight)
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
          <button onClick={() => { setOpen(false); onDelete(); }} className="premium-menu-item danger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
            Disable User
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
  const { data: users = [], isLoading } = useAdminUsers()
  const { mutate: deleteUser } = useDeleteUser()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [pwdUser, setPwdUser] = useState<AdminUser | null>(null)

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (user: AdminUser) => {
    if (window.confirm(`Disable ${user.name}? This will prevent them from logging in.`)) {
      deleteUser(user.id)
    }
  }

  return (
    <div className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F9FAFB' }}>
      <style>{`
        .premium-header {
          padding: 32px 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .premium-breadcrumb {
          font-size: 13px;
          color: #6B7280;
          font-weight: 500;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .premium-toolbar {
          padding: 0 40px 16px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .premium-search {
          display: flex;
          align-items: center;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 0 12px;
          width: 300px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .premium-search:focus-within {
          border-color: #6366F1;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
        }
        .premium-search input {
          border: none;
          background: transparent;
          padding: 10px 8px;
          font-size: 14px;
          outline: none;
          width: 100%;
          color: #111827;
        }
        .premium-search input::placeholder {
          color: #9CA3AF;
        }
        .premium-table-wrap {
          margin: 0 40px 40px 40px;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          /* overflow: visible to allow dropdowns to pop out */
          overflow: visible;
        }
        .premium-table {
          width: 100%;
          border-collapse: collapse;
        }
        .premium-table th {
          text-align: left;
          padding: 14px 20px;
          font-size: 12px;
          font-weight: 600;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #F3F4F6;
          background: #FAFAFA;
        }
        .premium-table td {
          padding: 16px 20px;
          font-size: 14px;
          color: #374151;
          border-bottom: 1px solid #F3F4F6;
          transition: background 0.15s ease;
        }
        .premium-table tr:hover td {
          background: #F9FAFB;
        }
        .premium-table tr:last-child td {
          border-bottom: none;
        }
        .premium-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #F3F4F6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: #4B5563;
          border: 1px solid #E5E7EB;
          flex-shrink: 0;
        }
        .premium-role-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }
        .premium-role-chip.admin {
          background: #EEF2FF;
          color: #4F46E5;
          border: 1px solid #E0E7FF;
        }
        .premium-role-chip.user {
          background: #F3F4F6;
          color: #4B5563;
          border: 1px solid #E5E7EB;
        }
        .premium-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }
        .premium-status-dot.active { background: #10B981; }
        .premium-status-dot.disabled { background: #9CA3AF; }
        .premium-icon-btn {
          background: transparent;
          border: none;
          padding: 8px;
          border-radius: 6px;
          color: #9CA3AF;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .premium-icon-btn:hover {
          background: #F3F4F6;
          color: #374151;
        }
        .premium-dropdown {
          position: absolute;
          right: 0;
          background: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
          padding: 6px;
          min-width: 180px;
          z-index: 100;
        }
        .dropdown-down {
          top: calc(100% + 4px);
          animation: slideDown 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: top right;
        }
        .dropdown-up {
          bottom: calc(100% + 4px);
          animation: slideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: bottom right;
        }

        .premium-menu-item {
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.1s ease;
        }
        .premium-menu-item:hover {
          background: #F3F4F6;
        }
        .premium-menu-item.danger {
          color: #EF4444;
        }
        .premium-menu-item.danger:hover {
          background: #FEF2F2;
        }
        .premium-menu-divider {
          height: 1px;
          background: #F3F4F6;
          margin: 4px 0;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseSkeleton {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .skeleton-row td span {
          display: block;
          height: 20px;
          background: #E5E7EB;
          border-radius: 4px;
          animation: pulseSkeleton 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (max-width: 768px) {
          .premium-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            padding: 24px;
          }
          .premium-toolbar {
            flex-direction: column;
            gap: 16px;
            padding: 0 24px 16px 24px;
          }
          .premium-search {
            width: 100%;
          }
          .premium-table-wrap {
            margin: 0 24px 24px 24px;
            background: transparent;
            border: none;
            box-shadow: none;
          }
          .premium-table thead {
            display: none;
          }
          .premium-table tbody tr {
            display: flex;
            flex-direction: column;
            background: #FFFFFF;
            border: 1px solid #E5E7EB;
            border-radius: 12px;
            margin-bottom: 16px;
            padding: 16px;
            position: relative;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .premium-table td {
            border: none;
            padding: 8px 0;
            display: flex;
            align-items: center;
          }
          .premium-table td:nth-child(1) { /* Avatar + Name */
            padding-bottom: 12px;
            border-bottom: 1px solid #F3F4F6;
            margin-bottom: 6px;
          }
          .premium-table td:nth-child(2)::before { content: "Role: "; font-weight: 500; font-size: 13px; color: #6B7280; width: 60px; }
          .premium-table td:nth-child(3)::before { content: "Status: "; font-weight: 500; font-size: 13px; color: #6B7280; width: 60px; }
          .premium-table td:nth-child(4)::before { content: "Added: "; font-weight: 500; font-size: 13px; color: #6B7280; width: 60px; }
          .premium-table td:last-child {
            position: absolute;
            top: 16px;
            right: 16px;
            padding: 0;
          }
        }
      `}</style>

      <div className="premium-header">
        <div>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Users</h1>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0 0' }}>Manage access and team accounts.</p>
        </div>
        <div>
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
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280', display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
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
                  <td><div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><div className="premium-avatar" style={{ background: '#E5E7EB', border: 'none' }}></div><div style={{ flex: 1 }}><span style={{ width: '120px', marginBottom: '6px' }}></span><span style={{ width: '180px', height: '14px' }}></span></div></div></td>
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
                    <div style={{ width: '48px', height: '48px', background: '#F3F4F6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>No users found</h3>
                    <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>Try adjusting your search query, or add a new user.</p>
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
                        <span style={{ fontWeight: 600, color: '#111827' }}>{user.name}</span>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`premium-role-chip ${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                      <span className={`premium-status-dot ${user.is_active ? 'active' : 'disabled'}`}></span>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: 500 }}>
                      {user.created_at || 'Just now'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <DropdownMenu 
                        user={user} 
                        onEdit={() => setEditUser(user)}
                        onPassword={() => setPwdUser(user)}
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
    </div>
  )
}
