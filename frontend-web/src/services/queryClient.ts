import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error: unknown) => {
        const axiosError = error as { response?: { status: number } }
        if (axiosError?.response?.status === 401) return false
        if (axiosError?.response?.status === 403) return false
        return failureCount < 2
      },
    },
  },
})
