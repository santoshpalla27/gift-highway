import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { queryClient } from './queryClient'

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
// Instead of redirecting to login, silently call /auth/refresh with the stored
// refresh token (valid 30 days), update stored tokens, then retry the original
// request.  Concurrent requests that fail while a refresh is in-flight are
// queued and replayed once the new token arrives.

let isRefreshing = false
let pendingQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function drainQueue(token: string) {
  pendingQueue.forEach(p => p.resolve(token))
  pendingQueue = []
}

function rejectQueue(err: unknown) {
  pendingQueue.forEach(p => p.reject(err))
  pendingQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Only handle 401s that haven't already been retried.
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const refreshToken = useAuthStore.getState().refreshToken
    if (!refreshToken) {
      useAuthStore.getState().clearAuth()
      queryClient.clear()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Another refresh is already in-flight — queue this request.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(original))
          },
          reject,
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      // Use a plain axios call (not apiClient) to avoid triggering this interceptor again.
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      const { user, tokens } = res.data as {
        user: { id: string; email: string; first_name: string; last_name: string; role: string; avatar_url?: string }
        tokens: { access_token: string; refresh_token: string }
      }

      useAuthStore.getState().setAuth(user, tokens.access_token, tokens.refresh_token)
      drainQueue(tokens.access_token)

      original.headers.Authorization = `Bearer ${tokens.access_token}`
      return apiClient(original)
    } catch (refreshError) {
      rejectQueue(refreshError)
      // Only force-logout on a definitive auth failure (4xx from the refresh
      // endpoint). Network errors must NOT clear the session.
      if (axios.isAxiosError(refreshError) && refreshError.response?.status) {
        useAuthStore.getState().clearAuth()
        queryClient.clear()
        window.location.href = '/login'
      }
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)
