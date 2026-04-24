import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { PublicRoute } from '../routes/PublicRoute'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { NotificationsPage } from '../features/notifications/pages/NotificationsPage'
import { OrderNotificationsPage } from '../features/notifications/pages/OrderNotificationsPage'
import { NotFoundPage } from '../components/NotFoundPage'
import { UsersPage } from '../features/admin/pages/UsersPage'
import { ProfileSettingsPage } from '../features/profile/pages/ProfileSettingsPage'
import { OrdersPage } from '../features/orders/pages/OrdersPage'
import { OrderDetailPage } from '../features/orders/pages/OrderDetailPage'
import { TrashPage } from '../features/orders/pages/TrashPage'
import CustomerPortalPage from '../features/portal/pages/CustomerPortalPage'

export default function App() {
  return (
    <Routes>
      {/* Public portal route — no auth required */}
      <Route path="/portal/:token" element={<CustomerPortalPage />} />

      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/my-orders" element={<OrdersPage myOrdersOnly />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/notifications/:orderId" element={<OrderNotificationsPage />} />
          <Route path="/settings/profile" element={<ProfileSettingsPage />} />
          <Route path="/settings" element={<ProfileSettingsPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
