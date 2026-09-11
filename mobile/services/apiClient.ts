import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { refreshAccessToken } from './tokenRefresh'

function normalizeApiUrl(url?: string): string {
  let u = (url || 'https://gifthighway.store/api/v1').trim().replace(/\/+$/, '')
  if (!u.endsWith('/api/v1')) {
    if (u.endsWith('/api')) {
      u += '/v1'
    } else {
      u += '/api/v1'
    }
  }
  return u
}

export const API_BASE_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL)

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
