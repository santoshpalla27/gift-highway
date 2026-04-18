import { useAuthStore } from '../../../store/authStore'
import type { Order } from '../../../services/orderService'

export interface OrderPermissions {
  canChangeStatus: boolean
  canEditOrder: boolean
  canReassign: boolean
  canDeleteComment: boolean
}

export function useOrderPermissions(order: Order | null): OrderPermissions {
  const user = useAuthStore(s => s.user)

  if (!user || !order) {
    return { canChangeStatus: false, canEditOrder: false, canReassign: false, canDeleteComment: false }
  }

  const isAdmin = user.role === 'admin'
  const isAssigned = order.assigned_to.includes(user.id)

  return {
    canChangeStatus: isAdmin || isAssigned,
    canEditOrder: isAdmin || isAssigned,
    canReassign: isAdmin,
    canDeleteComment: isAdmin || isAssigned,
  }
}
