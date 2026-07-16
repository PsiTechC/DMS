import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import { PageLoader } from './components/UI'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import ScanQR from './pages/ScanQR'
import DeviceView from './pages/DeviceView'
import Devices from './pages/Devices'
import QRCodes from './pages/QRCodes'
import MapDevice from './pages/MapDevice'
import Queries from './pages/Queries'
import Reports from './pages/Reports'
import UsersPage from './pages/Users'
import AuditLogs from './pages/AuditLogs'
import SettingsPage from './pages/Settings'
import NotFound from './pages/NotFound'

/** Blocks unauthenticated access, remembering where the user was headed. */
function Protected({ roles, children }) {
  const { isAuthenticated, loading, user } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Checking your session…" />

  if (!isAuthenticated) {
    // Keep the query string too, or a deep link like /queries?open=8 from the
    // notification email loses its target across the login round trip.
    const target = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(target)}`} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }
  return children
}

function Router() {
  return (
    <Routes>
      {/* Public — the QR sticker lands here, logged in or not. */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/device/:assetId" element={<DeviceView />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scan" element={<ScanQR />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/devices/:id" element={<Devices />} />
        <Route path="/queries" element={<Queries />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Admin-only */}
        <Route path="/qr-codes" element={<Protected roles={['admin']}><QRCodes /></Protected>} />
        <Route path="/map/:assetId" element={<Protected roles={['admin']}><MapDevice /></Protected>} />
        <Route path="/reports" element={<Protected roles={['admin']}><Reports /></Protected>} />
        <Route path="/users" element={<Protected roles={['admin', 'client']}><UsersPage /></Protected>} />
        <Route path="/audit-logs" element={<Protected roles={['admin']}><AuditLogs /></Protected>} />
      </Route>

      <Route path="/403" element={<NotFound code={403} />} />
      <Route path="*" element={<NotFound code={404} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Router />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className:
                '!bg-white dark:!bg-slate-800 !text-slate-800 dark:!text-slate-100 !text-sm !shadow-lg !border !border-slate-200 dark:!border-slate-700 !rounded-xl',
              success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#fff' }, duration: 5500 },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
