import { apiClient } from './apiClient'
import { localDateStr } from '../utils/date'

export interface TeamStats {
  total_orders: number
  new_orders: number
  working_orders: number
  waiting_for_client_orders: number
  making_orders: number
  done_orders: number
  delivered_orders: number
  cancelled_orders: number
  overdue: number
  due_today: number
  unread_customer: number
  stale_orders: number
}

export interface MyStats {
  total_orders: number
  new_orders: number
  working_orders: number
  waiting_for_client_orders: number
  making_orders: number
  done_orders: number
  delivered_orders: number
  cancelled_orders: number
  assigned_to_me: number
  due_today: number
  overdue: number
  unread_customer: number
}

export interface DashboardOrder {
  id: string
  order_number: number
  title: string
  customer_name: string
  status: string
  priority: string
  due_date: string | null
  assigned_names: string[]
  updated_at: string
}


export interface TeamDashboard {
  stats: TeamStats
  due_today_list: DashboardOrder[]
  overdue_orders: DashboardOrder[]
  stale_orders: DashboardOrder[]
  unread_customer_orders: DashboardOrder[]
}

export interface MyDashboard {
  stats: MyStats
  due_today_list: DashboardOrder[]
  overdue_orders: DashboardOrder[]
  unread_customer_orders: DashboardOrder[]
}


export const dashboardService = {
  getTeam: (): Promise<TeamDashboard> =>
    apiClient.get('/dashboard/team', { params: { local_date: localDateStr() } }).then(r => r.data),

  getMe: (): Promise<MyDashboard> =>
    apiClient.get('/dashboard/me', { params: { local_date: localDateStr() } }).then(r => r.data),
}
