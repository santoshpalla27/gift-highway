import { useAuthStore } from '../../../store/authStore'
import type { Order } from '../../../services/orderService'

export interface OrderPermissions {
  canChangeStatus: boolean
  allowedStatuses: readonly string[]
  canEditOrder: boolean
  canReassign: boolean
  canDeleteComment: boolean
  canArchive: boolean
  isAdmin: boolean
}

export function useOrderPermissions(order: Order | null): OrderPermissions {
  const user = useAuthStore(s => s.user)

  if (!user || !order) {
    return { canChangeStatus: false, allowedStatuses: [], canEditOrder: false, canReassign: false, canDeleteComment: false, canArchive: false, isAdmin: false }
  }

  const isAdmin = user.role === 'admin'
  const isAssigned = order.assigned_to.includes(user.id)

  return {
    canChangeStatus: isAdmin || isAssigned,
    allowedStatuses: isAdmin ? ['new', 'in_progress', 'completed'] : ['new', 'in_progress'],
    canEditOrder: isAdmin,
    canReassign: isAdmin,
    canDeleteComment: isAdmin || isAssigned,
    canArchive: isAdmin,
    isAdmin,
  }
}
