import { apiClient } from './apiClient'

export interface Order {
  id: string
  order_number: number
  title: string
  description: string
  customer_name: string
  contact_number: string
  status: 'new' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assigned_to: string | null
  assigned_name: string | null
  created_by: string
  created_by_name: string
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface UserOption {
  id: string
  name: string
}

export interface ListOrdersParams {
  search?: string
  status?: string
  priority?: string
  assigned_to?: string
  page?: number
  limit?: number
}

export const orderService = {
  listOrders: async (params: ListOrdersParams = {}): Promise<{ orders: Order[]; total: number }> => {
    const res = await apiClient.get<{ orders: Order[]; total: number }>('/orders', { params })
    return res.data
  },

  createOrder: async (data: {
    title: string
    description: string
    customer_name: string
    contact_number?: string
    priority: string
    assigned_to?: string | null
    due_date?: string | null
  }): Promise<Order> => {
    const res = await apiClient.post<{ order: Order }>('/orders', data)
    return res.data.order
  },

  updateOrder: async (id: string, data: {
    title: string
    description: string
    customer_name: string
    contact_number?: string
    priority: string
    assigned_to?: string | null
    due_date?: string | null
  }): Promise<void> => {
    await apiClient.patch(`/orders/${id}`, data)
  },

  updateStatus: async (id: string, status: string): Promise<void> => {
    await apiClient.patch(`/orders/${id}/status`, { status })
  },

  listUsersForAssignment: async (): Promise<UserOption[]> => {
    const res = await apiClient.get<{ users: UserOption[] }>('/users')
    return res.data.users
  },
}
