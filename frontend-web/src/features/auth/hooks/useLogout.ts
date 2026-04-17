import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService } from '../../../services/authService'
import { useAuthStore } from '../../../store/authStore'
import { queryClient } from '../../../services/queryClient'

export function useLogout() {
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()

  return useMutation({
    mutationFn: authService.logout,
    onSettled: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })
}
