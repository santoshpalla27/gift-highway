import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { refreshAccessToken } from './tokenRefresh'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
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
  (res) => res,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    const newToken = await refreshAccessToken()
    if (!newToken) return Promise.reject(error)

    original.headers.Authorization = `Bearer ${newToken}`
    return apiClient(original)
  },
)
