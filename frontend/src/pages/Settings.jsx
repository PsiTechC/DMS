import { useState } from 'react'
import { Settings as SettingsIcon, User, Lock, Mail, Moon, Sun, Send, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { ROLE } from '../lib/constants'
import { PageHeader, Field, Spinner, Badge } from '../components/UI'

export default function SettingsPage() {
  const { user, isAdmin } = useAuth()

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Manage your profile, password, and preferences." icon={SettingsIcon} />

      <div className="space-y-6">
        <ProfileCard user={user} />
        <PasswordCard />
        <AppearanceCard />
        {isAdmin && <EmailCard />}
      </div>
    </div>
  )
}

function Card({ title, desc, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Icon className="h-4 w-4 text-slate-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function ProfileCard({ user }) {
  const { refresh } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    location: user?.location || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    if (form.name.trim().length < 2) {
      toast.error('Please enter your name')
      return
    }

    setSaving(true)
    try {
      await api.put('/auth/profile', form)
      await refresh()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Your profile" desc="These details appear on any query you raise." icon={User}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
            {(user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user?.email}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge map={ROLE} value={user?.role} />
              {user?.employee_id && (
                <span className="font-mono text-[11px] text-slate-400">{user.employee_id}</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input className="input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <input className="input" value={form.location} onChange={set('location')} placeholder="Head Office — 2nd Floor" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" hint="Only an admin can change this.">
            <input className="input" value={user?.department || ''} disabled />
          </Field>
          <Field label="Company" hint="Only an admin can change this.">
            <input className="input" value={user?.company || ''} disabled />
          </Field>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            Save profile
          </button>
        </div>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

  async function save(e) {
    e.preventDefault()

    const err = {}
    if (!form.current_password) err.current_password = 'Enter your current password'
    if (form.new_password.length < 8) err.new_password = 'New password must be at least 8 characters'
    if (form.new_password !== form.confirm) err.confirm = 'Passwords do not match'
    setErrors(err)
    if (Object.keys(err).length) return

    setSaving(true)
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      toast.success('Password changed')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (e2) {
      toast.error(errMsg(e2))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Change password" desc="Use at least 8 characters." icon={Lock}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Current password" required error={errors.current_password}>
          <input type="password" autoComplete="current-password" className={clsx('input', errors.current_password && 'input-error')} value={form.current_password} onChange={set('current_password')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" required error={errors.new_password}>
            <input type="password" autoComplete="new-password" className={clsx('input', errors.new_password && 'input-error')} value={form.new_password} onChange={set('new_password')} />
          </Field>
          <Field label="Confirm new password" required error={errors.confirm}>
            <input type="password" autoComplete="new-password" className={clsx('input', errors.confirm && 'input-error')} value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            Change password
          </button>
        </div>
      </form>
    </Card>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme()

  return (
    <Card title="Appearance" desc="Choose how the interface looks." icon={theme === 'dark' ? Moon : Sun}>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { key: 'light', label: 'Light', icon: Sun, desc: 'Bright, high contrast' },
          { key: 'dark', label: 'Dark', icon: Moon, desc: 'Easier on the eyes at night' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            className={clsx(
              'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
              theme === t.key
                ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
          >
            <t.icon className={clsx('h-5 w-5', theme === t.key ? 'text-brand-600' : 'text-slate-400')} />
            <div>
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-[11px] text-slate-400">{t.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}

function EmailCard() {
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    setSending(true)
    try {
      const res = await api.post('/settings/test-email', { to: to.trim() || undefined })
      toast.success(res.data.message)
    } catch (e) {
      toast.error(errMsg(e), { duration: 8000 })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card title="Email notifications" desc="Every query raised is emailed to the admin address configured on the server." icon={Mail}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            SMTP credentials live in <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5 font-mono text-[11px]">backend/.env</code> and
            are never exposed to the browser. Set{' '}
            <code className="rounded bg-slate-200 dark:bg-slate-700 px-1 py-0.5 font-mono text-[11px]">ADMIN_EMAIL</code> to
            the address that should receive query notifications, then restart the backend.
          </div>
        </div>

        <Field label="Send a test email to" hint="Leave blank to send to the configured ADMIN_EMAIL.">
          <div className="flex gap-2">
            <input
              type="email"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="admin@yourdomain.com"
            />
            <button className="btn-primary shrink-0" onClick={send} disabled={sending}>
              {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </Field>
      </div>
    </Card>
  )
}
