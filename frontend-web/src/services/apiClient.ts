import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { queryClient } from './queryClient'
import { refreshAccessToken } from './tokenRefresh'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Attach access token to every outgoing request.
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Silent token refresh ─────────────────────────────────────────────────────
// When the 15-minute access token expires the server returns 401.
// refreshAccessToken() is a shared singleton — concurrent callers (this
// interceptor and SocketProvider) share one in-flight promise so the backend
// sees exactly one rotation request, preventing the race that logs users out.

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    const newToken = await refreshAccessToken()
    if (!newToken) {
      queryClient.clear()
      return Promise.reject(error)
    }

    original.headers.Authorization = `Bearer ${newToken}`
    return apiClient(original)
  },
)
