import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QrCode, ArrowLeft, MailCheck, Send } from 'lucide-react'
import api, { errMsg } from '../lib/api'
import { Spinner } from '../components/UI'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800">
            <QrCode className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold leading-none">DMS</div>
            <div className="mt-1 text-[10px] text-slate-400">Device Management System</div>
          </div>
        </div>

        {sent ? (
          /* The success copy deliberately does not confirm the address exists —
             it mirrors the server, which says the same thing either way. */
          <div className="card p-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
              <MailCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-lg font-bold">Check your inbox</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>,
              we have sent it a link to reset the password.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              The link works once and expires in 60 minutes. Not there? Check your spam folder.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link to="/login" className="btn-primary w-full">Back to sign in</Link>
              <button
                className="btn-ghost w-full text-xs"
                onClick={() => { setSent(false); setError('') }}
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-7">
            <h1 className="text-xl font-bold tracking-tight">Forgot your password?</h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Enter your email and we will send you a link to set a new one.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={sending}>
                {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <Link
              to="/login"
              className="mt-6 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Still stuck? Ask an administrator to reset your password from the Users page.
        </p>
      </motion.div>
    </div>
  )
}
