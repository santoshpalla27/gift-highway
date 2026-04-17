import { apiClient } from './apiClient'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
  }
  tokens: {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>('/auth/login', data)
    return res.data
  },
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },
}
