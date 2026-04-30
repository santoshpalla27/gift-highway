import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../../services/authService'
import { useAuthStore } from '../../../store/authStore'
import { queryClient } from '../../../services/queryClient'

export function useLogout() {
  const navigate = useNavigate()
  const { clearAuth, refreshToken } = useAuthStore()

  return useMutation({
    mutationFn: () => authService.logout(refreshToken ?? ''),
    onSettled: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })
}
