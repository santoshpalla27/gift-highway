import { apiClient } from './apiClient'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
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

  deleteUser: async (id: string) => {
    const res = await apiClient.delete(`/admin/users/${id}`)
    return res.data
  },
}
