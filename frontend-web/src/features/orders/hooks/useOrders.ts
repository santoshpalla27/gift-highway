import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService, ListOrdersParams, Order } from '../../../services/orderService'

export function useOrders(params: ListOrdersParams = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => orderService.listOrders(params),
    refetchInterval: 60_000,
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

    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['orders'] })

      // Snapshot every cached orders query
      const snapshots: { key: readonly unknown[]; data: unknown }[] = []
      qc.getQueriesData<{ orders: Order[]; total: number } | Order>({ queryKey: ['orders'] })
        .forEach(([key, data]) => {
          snapshots.push({ key, data })
          if (!data) return
          // List query: { orders: Order[], total: number }
          if ('orders' in data && Array.isArray(data.orders)) {
            qc.setQueryData(key, {
              ...data,
              orders: data.orders.map(o => o.id === id ? { ...o, status } : o),
            })
          // Single order query: Order
          } else if ('id' in data && (data as Order).id === id) {
            qc.setQueryData(key, { ...data, status })
          }
        })

      return { snapshots }
    },

    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(({ key, data }) => qc.setQueryData(key, data))
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
