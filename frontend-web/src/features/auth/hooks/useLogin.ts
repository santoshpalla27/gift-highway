import { useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { authService, type LoginRequest } from '../../../services/authService'
import { useAuthStore } from '../../../store/authStore'

export function useLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (response) => {
      setAuth(response.user, response.tokens.access_token, response.tokens.refresh_token)
      navigate(from, { replace: true })
    },
  })
}
