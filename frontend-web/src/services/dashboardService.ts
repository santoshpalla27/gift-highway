import { apiClient } from './apiClient'

export interface TeamStats {
  new_orders: number
  working_orders: number
  completed_today: number
  overdue: number
  due_today: number
  unread_customer: number
  stale_orders: number
}

export interface MyStats {
  assigned_to_me: number
  due_today: number
  overdue: number
  completed_this_week: number
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

function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const dashboardService = {
  getTeam: (): Promise<TeamDashboard> =>
    apiClient.get<TeamDashboard>('/dashboard/team', { params: { local_date: localDateStr() } }).then(r => r.data),

  getMe: (): Promise<MyDashboard> =>
    apiClient.get<MyDashboard>('/dashboard/me', { params: { local_date: localDateStr() } }).then(r => r.data),
}
