import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, QrCode, HardDrive, MessageSquareWarning, Users, ScrollText,
  FileBarChart, Settings, LogOut, Menu, X, Moon, Sun, ScanLine, ChevronDown, Building2,
  Bell, Boxes,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Badge, useClickOutside } from './UI'
import { ROLE } from '../lib/constants'

// `roles` gates each link. Anything a role cannot use is never rendered — the
// backend enforces the same rules, this just avoids dead ends in the UI.
const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'user', 'client'] },
  { to: '/scan', label: 'Scan QR', icon: ScanLine, roles: ['admin', 'user', 'client'] },
  { to: '/products', label: 'Products', icon: Boxes, roles: ['admin'] },
  { to: '/devices', label: 'Devices', icon: HardDrive, roles: ['admin', 'user', 'client'] },
  { to: '/qr-codes', label: 'QR Codes', icon: QrCode, roles: ['admin'] },
  { to: '/queries', label: 'Queries', icon: MessageSquareWarning, roles: ['admin', 'user', 'client'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart, roles: ['admin'] },
  { to: '/clients', label: 'Clients', icon: Users, roles: ['admin'] },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'user', 'client'] },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setSidebarOpen(false), [location.pathname])

  const links = NAV.filter((n) => n.roles.includes(user?.role))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <Sidebar links={links} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        <Header onMenu={() => setSidebarOpen(true)} />
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px] animate-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar({ links, open, onClose }) {
  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 w-64 flex flex-col',
        'bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800',
        'transition-transform duration-300 ease-in-out lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5">
        <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 shadow-sm">
            <QrCode className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight leading-none">DMS</div>
            <div className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
              Device Management
            </div>
          </div>
        </Link>
        <button className="lg:hidden btn-ghost btn-sm" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx('sidebar-link', isActive && 'sidebar-link-active')
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">QR Asset Lifecycle Platform</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Header({ onMenu }) {
  const { user, logout } = useAuth()
  const { isDark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useClickOutside(() => setMenuOpen(false))

  const initials = (user?.name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-4 sm:px-6 backdrop-blur-lg">
      <button className="lg:hidden btn-ghost btn-sm" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <button
        onClick={toggle}
        className="btn-ghost btn-sm"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </button>

      <Link
        to="/queries"
        className="btn-ghost btn-sm"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden sm:block text-left min-w-0 max-w-[10rem]">
            <div className="text-xs font-semibold truncate">{user?.name}</div>
            <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
          </div>
          <ChevronDown className="hidden sm:block h-4 w-4 text-slate-400 shrink-0" />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 mt-2 w-60 origin-top-right rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl"
            >
              <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 mb-1">
                <div className="text-sm font-semibold truncate">{user?.name}</div>
                <div className="text-xs text-slate-400 truncate mb-2">{user?.email}</div>
                <Badge map={ROLE} value={user?.role} />
              </div>

              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>

              <button
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
