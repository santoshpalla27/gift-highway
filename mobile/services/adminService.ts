import { apiClient } from './apiClient'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export interface AuditStatus {
  storage_configured: boolean
  email_configured: boolean
  csv_exists: boolean
  csv_size_bytes: number
  csv_row_count: number
  csv_last_modified: string | null
  email_to: string
  next_daily_report: string
  next_monthly_report: string
}

export const adminService = {
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await apiClient.get<{ users: AdminUser[] }>('/admin/users')
    return res.data.users
  },

  createUser: async (data: { name: string; email: string; password: string; role: string }) => {
    const res = await apiClient.post('/admin/users', data)
    return res.data
  },

  updateUser: async (id: string, data: { name: string; email: string; role: string }) => {
    const res = await apiClient.patch(`/admin/users/${id}`, data)
    return res.data
  },

  changePassword: async (id: string, password: string) => {
    const res = await apiClient.patch(`/admin/users/${id}/password`, { password })
    return res.data
  },

  disableUser: async (id: string) => {
    const res = await apiClient.patch(`/admin/users/${id}/disable`)
    return res.data
  },

  enableUser: async (id: string) => {
    const res = await apiClient.patch(`/admin/users/${id}/enable`)
    return res.data
  },

  deleteUser: async (id: string) => {
    const res = await apiClient.delete(`/admin/users/${id}`)
    return res.data
  },

  getAuditStatus: async (): Promise<AuditStatus> => {
    const res = await apiClient.get<AuditStatus>('/admin/audit/status')
    return res.data
  },

  testAuditWrite: async (): Promise<{ ok: boolean; message: string }> => {
    const res = await apiClient.post<{ ok: boolean; message: string }>('/admin/audit/test')
    return res.data
  },

  getAuditDownloadURL: (range: 'all' | 'today' | 'month' | 'custom', from?: string, to?: string): string => {
    const params = range === 'custom' ? `range=custom&from=${from}&to=${to}` : `range=${range}`
    return `/admin/audit/download?${params}`
  },
}
