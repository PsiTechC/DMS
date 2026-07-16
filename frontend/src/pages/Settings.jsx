import { useState } from 'react'
import { Settings as SettingsIcon, User, Lock, Mail, Send } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ROLE } from '../lib/constants'
import { PageHeader, Field, Spinner, Badge } from '../components/UI'

export default function SettingsPage() {
  const { user, isAdmin } = useAuth()

  return (
    <div className="max-w-6xl">
      <PageHeader title="Settings" subtitle="Manage your profile and password." icon={SettingsIcon} />

      {/* Two columns rather than one tall stack, so the page uses its width
          instead of leaving half the screen empty. `items-start` stops the
          shorter column from stretching to match the taller one. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ProfileCard user={user} />

        <div className="space-y-5">
          <PasswordCard />
          {isAdmin && <EmailCard />}
        </div>
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

// There is no Appearance card: the light/dark toggle lives in the header, where
// it is one click from anywhere. A second control for the same setting, buried
// a page deep, is just another thing to keep in sync.

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
      <Field label="Send a test email to" hint="Leave blank to send to the configured admin address.">
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
    </Card>
  )
}
