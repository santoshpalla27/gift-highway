import { apiClient } from './apiClient'

export interface NotificationEvent {
  id: string
  type: string
  actor_name: string
  payload: Record<string, any>
  created_at: string
  priority: 'high' | 'medium' | 'low'
}

export interface FlatActivityEvent {
  id: string
  order_id: string
  order_number: number
  order_title: string
  type: string
  actor_name: string
  payload: Record<string, any>
  created_at: string
  priority: 'high' | 'medium' | 'low'
}

export interface NotificationGroup {
  order_id: string
  order_number: number
  order_title: string
  unread_count: number
  events: NotificationEvent[]
  last_event_at: string
}

export interface OrderNotificationSummary {
  order_id: string
  order_number: number
  order_title: string
  total_count: number
  unread_count: number
  last_event_at: string
}

export const notificationService = {
  getUnread: async (mine = false, others = false): Promise<{ groups: NotificationGroup[]; total_count: number }> => {
    const params = mine ? { mine: 'true' } : others ? { others: 'true' } : {}
    const res = await apiClient.get('/notifications', { params })
    return res.data
  },

  getHistory: async (page = 1): Promise<{ groups: NotificationGroup[]; total: number; page: number }> => {
    const res = await apiClient.get(`/notifications/history?page=${page}`)
    return res.data
  },

  getOrderSummaries: async (): Promise<{ orders: OrderNotificationSummary[] }> => {
    const res = await apiClient.get('/notifications/orders')
    return res.data
  },

  getOrderEvents: async (orderId: string): Promise<{ events: NotificationEvent[] }> => {
    const res = await apiClient.get(`/notifications/order/${orderId}`)
    return res.data
  },

  getLastSeen: async (orderId: string): Promise<string | null> => {
    const res = await apiClient.get<{ last_seen_at: string | null }>(
      `/notifications/order/${orderId}/last-seen`,
    )
    return res.data.last_seen_at ?? null
  },

  markOrderRead: async (orderId: string): Promise<void> => {
    await apiClient.post(`/notifications/read/${orderId}`)
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.post('/notifications/read-all')
  },

  getActivity: async (page = 1, orderId?: string): Promise<{ events: FlatActivityEvent[]; total: number; page: number }> => {
    const params: Record<string, string> = { page: String(page) }
    if (orderId) params.order_id = orderId
    const res = await apiClient.get('/notifications/activity', { params })
    return res.data
  },
}
