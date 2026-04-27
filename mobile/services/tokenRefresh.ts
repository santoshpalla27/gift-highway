import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'

// Single in-flight promise shared across all callers (apiClient + SocketProvider).
// Prevents the rotation race: if two callers try to refresh at the same time,
// both get the same promise and the backend sees only one refresh request.
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const store = useAuthStore.getState()
  if (!store.refreshToken) return null
  try {
    const res = await axios.post<{
      user: { id: string; email: string; first_name: string; last_name: string; role: string }
      tokens: { access_token: string; refresh_token: string }
    }>(`${API_BASE}/auth/refresh`, { refresh_token: store.refreshToken })
    const { user, tokens } = res.data
    // Save BOTH tokens — the old refresh token is now revoked by the server.
    await useAuthStore.getState().setAuth(user, tokens.access_token, tokens.refresh_token)
    return tokens.access_token
  } catch (err) {
    // Only clear auth on a definitive server rejection (4xx).
    // Network errors (device waking, brief offline) must not log the user out.
    if (axios.isAxiosError(err) && err.response?.status) {
      await useAuthStore.getState().clearAuth()
    }
    return null
  }
}

export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  return refreshPromise
}
