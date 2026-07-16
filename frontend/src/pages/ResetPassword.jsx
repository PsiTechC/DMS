import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QrCode, Eye, EyeOff, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react'
import clsx from 'clsx'
import api, { errMsg } from '../lib/api'
import { Spinner, PageLoader } from '../components/UI'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''

  // The link is checked before the form is shown. Letting someone type a new
  // password into a form backed by a dead token, only to fail on submit, is a
  // pointless waste of their time.
  const [check, setCheck] = useState({ loading: true, ok: false, email: '', error: '' })
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setCheck({ loading: false, ok: false, email: '', error: 'This link is missing its reset token.' })
      return
    }
    let cancelled = false
    api
      .get('/auth/reset-password', { params: { token } })
      .then((res) => {
        if (!cancelled) setCheck({ loading: false, ok: true, email: res.data.data.email, error: '' })
      })
      .catch((e) => {
        if (!cancelled) setCheck({ loading: false, ok: false, email: '', error: errMsg(e) })
      })
    return () => { cancelled = true }
  }, [token])

  async function submit(e) {
    e.preventDefault()

    const err = {}
    if (pw.length < 8) err.pw = 'Use at least 8 characters'
    if (pw !== confirm) err.confirm = 'Passwords do not match'
    setErrors(err)
    if (Object.keys(err).length) return

    setSaving(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: pw })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (e2) {
      setErrors({ form: errMsg(e2) })
    } finally {
      setSaving(false)
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

        <div className="card p-7">
          {check.loading ? (
            <PageLoader label="Checking your link…" />
          ) : done ? (
            <div className="py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h1 className="mt-4 text-lg font-bold">Password changed</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                You can now sign in with your new password. Taking you to the login page…
              </p>
              <Link to="/login" className="btn-primary mt-6 w-full">Sign in now</Link>
            </div>
          ) : !check.ok ? (
            <div className="py-2 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
                <AlertTriangle className="h-7 w-7 text-amber-600" />
              </div>
              <h1 className="mt-4 text-lg font-bold">This link no longer works</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {check.error}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Reset links expire after 60 minutes and can only be used once.
              </p>
              <Link to="/forgot-password" className="btn-primary mt-6 w-full">Request a new link</Link>
              <Link to="/login" className="btn-ghost mt-2 w-full text-xs">Back to sign in</Link>
            </div>
          ) : (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/15">
                <KeyRound className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>

              <h1 className="mt-4 text-xl font-bold tracking-tight">Choose a new password</h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                For <span className="font-medium text-slate-700 dark:text-slate-200">{check.email}</span>
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="label" htmlFor="pw">New password</label>
                  <div className="relative">
                    <input
                      id="pw"
                      type={show ? 'text' : 'password'}
                      required
                      autoFocus
                      autoComplete="new-password"
                      className={clsx('input pr-11', errors.pw && 'input-error')}
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setErrors((x) => ({ ...x, pw: undefined })) }}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={show ? 'Hide password' : 'Show password'}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.pw && <p className="field-error">{errors.pw}</p>}
                </div>

                <div>
                  <label className="label" htmlFor="confirm">Confirm new password</label>
                  <input
                    id="confirm"
                    type={show ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    className={clsx('input', errors.confirm && 'input-error')}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })) }}
                    placeholder="Type it again"
                  />
                  {errors.confirm && <p className="field-error">{errors.confirm}</p>}
                </div>

                {errors.form && (
                  <div className="rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-400">
                    {errors.form}
                  </div>
                )}

                <button type="submit" className="btn-primary w-full" disabled={saving}>
                  {saving && <Spinner className="h-4 w-4" />}
                  {saving ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
