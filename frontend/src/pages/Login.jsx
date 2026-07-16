import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QrCode, Eye, EyeOff, ShieldCheck, ScanLine, BarChart3, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/UI'

const FEATURES = [
  { icon: ScanLine, title: 'QR-based asset tracking', desc: 'Scan any sticker to pull up a full device record instantly.' },
  { icon: BarChart3, title: 'Live analytics', desc: 'Inventory, warranty, and query trends in one dashboard.' },
  { icon: Bell, title: 'Instant issue reporting', desc: 'Queries reach your admins by email the moment they are raised.' },
  { icon: ShieldCheck, title: 'Role-based access', desc: 'Admin, User, and Client permissions enforced end to end.' },
]

export default function Login() {
  const { login, isAuthenticated, loading: authLoading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const next = params.get('next') || '/dashboard'

  if (authLoading) return null
  if (isAuthenticated) return <Navigate to={next} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const res = await login(email.trim(), password)
    setSubmitting(false)

    if (!res.ok) {
      setError(res.message)
      return
    }
    toast.success(`Welcome back, ${res.user.name.split(' ')[0]}`)
    navigate(next, { replace: true })
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-slate-950 p-12 text-white">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight leading-none">DMS</div>
              <div className="text-[11px] text-white/50 mt-1">Device Management System</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-bold leading-tight tracking-tight"
          >
            Every asset,
            <br />
            one scan away.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 max-w-md text-white/60 leading-relaxed"
          >
            Track devices, manage QR labels, monitor warranties, and resolve issues
            across your entire organisation.
          </motion.p>

          <div className="mt-12 grid gap-5 max-w-md">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                className="flex gap-3.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{f.title}</div>
                  <div className="text-xs text-white/50 mt-0.5 leading-relaxed">{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-white/30">
          © {new Date().getFullYear()} Device Management System
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white dark:bg-slate-950">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-base font-bold leading-none">DMS</div>
              <div className="text-[10px] text-slate-400 mt-1">Device Management System</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Enter your credentials to access the system.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="label" htmlFor="password">Password</label>
                <Link
                  to="/forgot-password"
                  className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </motion.div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting && <Spinner className="h-4 w-4" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              Demo accounts
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              {[
                ['Admin', 'admin@dms.local', 'Admin@123'],
                ['User', 'user@dms.local', 'User@123'],
                ['Client', 'client@dms.local', 'Client@123'],
              ].map(([role, mail, pw]) => (
                <button
                  key={mail}
                  type="button"
                  onClick={() => {
                    setEmail(mail)
                    setPassword(pw)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white dark:hover:bg-slate-800"
                >
                  <span className="text-slate-400 w-12 shrink-0">{role}</span>
                  <span className="text-slate-600 dark:text-slate-300 truncate">{mail}</span>
                  <span className="text-slate-400 shrink-0">{pw}</span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[10px] text-slate-400">
              Click any row to fill the form. Change these passwords before going live.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Scanned a QR code?{' '}
            <Link to="/scan" className="font-semibold text-brand-600 hover:underline">
              Open the scanner
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
