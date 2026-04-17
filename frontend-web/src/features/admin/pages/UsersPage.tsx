import { useState } from 'react'
import { useAdminUsers, useDeleteUser } from '../hooks/useAdminUsers'
import { CreateUserModal } from '../components/CreateUserModal'
import { EditUserModal } from '../components/EditUserModal'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import type { AdminUser } from '../../../services/adminService'

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
    if (window.confirm(`Disable ${user.name}?`)) {
      deleteUser(user.id)
    }
  }

  return (
    <div className="screen active">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{users.length} total users</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add User
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <input
          className="filter-select"
          type="text"
          placeholder="🔍  Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '240px' }}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody style={{ opacity: isLoading ? 0.5 : 1 }}>
            {filtered.map(user => (
              <tr key={user.id}>
                <td style={{ fontWeight: 500 }}>{user.name}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{user.email}</td>
                <td>
                  <span className={`badge badge-${user.role === 'admin' ? 'review' : 'new'}`} style={{ textTransform: 'capitalize' }}>
                    {user.role}
                  </span>
                </td>
                <td className="date-cell">{user.created_at}</td>
                <td>
                  <span className={`badge badge-${user.is_active ? 'done' : 'new'}`}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditUser(user)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPwdUser(user)}
                    >
                      Password
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleDelete(user)}
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Disable
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                  No users found.
                </td>
              </tr>
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
