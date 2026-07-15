import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldOff, SearchX, ArrowLeft, Home } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const PAGES = {
  403: {
    icon: ShieldOff,
    title: 'Access denied',
    message:
      'You do not have permission to view this page. If you believe this is a mistake, contact your administrator.',
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-500/10',
  },
  404: {
    icon: SearchX,
    title: 'Page not found',
    message: 'The page you are looking for does not exist or may have been moved.',
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
  },
}

export default function NotFound({ code = 404 }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const page = PAGES[code] || PAGES[404]
  const Icon = page.icon

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl ${page.bg}`}>
          <Icon className={`h-9 w-9 ${page.color}`} />
        </div>

        <div className={`mt-6 text-6xl font-bold tracking-tight ${page.color}`}>{code}</div>
        <h1 className="mt-2 text-xl font-bold">{page.title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {page.message}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className="btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn-primary">
            <Home className="h-4 w-4" />
            {isAuthenticated ? 'Dashboard' : 'Login'}
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
