import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { queryClient } from './queryClient'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Attach access token to all requests
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses — clear auth and redirect
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      queryClient.clear()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
