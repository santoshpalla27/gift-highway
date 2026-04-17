import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService, ListOrdersParams } from '../../../services/orderService'

export function useOrders(params: ListOrdersParams = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => orderService.listOrders(params),
  })
}

export function useUsersForAssignment() {
  return useQuery({
    queryKey: ['users', 'assignment'],
    queryFn: orderService.listUsersForAssignment,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: orderService.createOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof orderService.updateOrder>[1] }) =>
      orderService.updateOrder(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      orderService.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}
