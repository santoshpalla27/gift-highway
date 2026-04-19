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
  assigned_to: string[]
  assigned_names: string[]
  created_by: string
  created_by_name: string
  due_date: string | null
  due_time: string | null
  created_at: string
  updated_at: string
}

export interface ListOrdersParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  priority?: string
  assigned_to?: string
  due_from?: string
  due_to?: string
}

export interface UserOption {
  id: string
  name: string
}

export interface OrderEvent {
  id: string
  order_id: string
  type: string
  actor_id: string | null
  actor_name: string
  payload: Record<string, string>
  created_at: string
}

export const orderService = {
  listOrders: async (params: ListOrdersParams = {}): Promise<{ orders: Order[]; total: number }> => {
    const res = await apiClient.get<{ orders: Order[]; total: number }>('/orders', { params })
    return res.data
  },

  getOrder: async (id: string): Promise<Order> => {
    const res = await apiClient.get<{ order: Order }>(`/orders/${id}`)
    return res.data.order
  },

  createOrder: async (data: {
    title: string
    description: string
    customer_name: string
    contact_number?: string
    priority: string
    assigned_to?: string[]
    due_date?: string | null
    due_time?: string | null
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
    assigned_to?: string[]
    due_date?: string | null
    due_time?: string | null
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

  listEvents: async (orderId: string, page = 1, limit = 30, sort: 'asc' | 'desc' = 'asc'): Promise<{ events: OrderEvent[]; total: number }> => {
    const res = await apiClient.get<{ events: OrderEvent[]; total: number }>(`/orders/${orderId}/events`, { params: { page, limit, sort } })
    return res.data
  },

  addComment: async (orderId: string, text: string): Promise<OrderEvent> => {
    const res = await apiClient.post<{ event: OrderEvent }>(`/orders/${orderId}/comments`, { text })
    return res.data.event
  },

  editComment: async (orderId: string, eventId: string, text: string): Promise<void> => {
    await apiClient.patch(`/orders/${orderId}/events/${eventId}`, { text })
  },

  deleteComment: async (orderId: string, eventId: string): Promise<void> => {
    await apiClient.delete(`/orders/${orderId}/events/${eventId}`)
  },
}
