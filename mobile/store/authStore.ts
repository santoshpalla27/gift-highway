import { create } from 'zustand'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => Promise<void>
  clearAuth: () => Promise<void>
  loadAuth: () => Promise<void>
}

const storage = {
  set: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value)
    } else {
      await SecureStore.setItemAsync(key, value)
    }
  },
  get: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key)
    }
    return SecureStore.getItemAsync(key)
  },
  delete: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key)
    } else {
      await SecureStore.deleteItemAsync(key)
    }
  },
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  setAuth: async (user, accessToken, refreshToken) => {
    await storage.set('access_token', accessToken)
    await storage.set('refresh_token', refreshToken)
    await storage.set('user', JSON.stringify(user))
    set({ user, accessToken, isAuthenticated: true })
  },

  clearAuth: async () => {
    await storage.delete('access_token')
    await storage.delete('refresh_token')
    await storage.delete('user')
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  loadAuth: async () => {
    try {
      const token = await storage.get('access_token')
      const userStr = await storage.get('user')
      if (token && userStr) {
        set({ accessToken: token, user: JSON.parse(userStr), isAuthenticated: true })
      }
    } catch {}
  },
}))
