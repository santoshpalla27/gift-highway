import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { dashboardService } from '../../../services/dashboardService'

export function useTeamDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'team'],
    queryFn: dashboardService.getTeam,
    refetchInterval: 60_000,
  })
}

export function useMyDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: dashboardService.getMe,
    refetchInterval: 60_000,
  })
}

export function useDashboardInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useDashboardSocketRefresh(socketEvent: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!socketEvent) return
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }, [socketEvent, qc])
}
