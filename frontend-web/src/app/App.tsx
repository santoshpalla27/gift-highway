import { Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import { PublicRoute } from '../routes/PublicRoute'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { NotFoundPage } from '../components/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<DashboardPage />} />
          <Route path="/my-orders" element={<DashboardPage />} />
          <Route path="/notifications" element={<DashboardPage />} />
          <Route path="/settings" element={<DashboardPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
