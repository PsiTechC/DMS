import { useEffect, useState, useCallback } from 'react'
import {
  Users as UsersIcon, Plus, Search, Pencil, Trash2, ShieldCheck, X,
  Eye, EyeOff, Mail, RefreshCw, Copy,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { ROLE } from '../lib/constants'
import {
  PageHeader, Badge, Modal, Field, Spinner, EmptyState,
  Pagination, TableSkeleton, ConfirmDialog, useDebounced,
} from '../components/UI'

const BLANK = {
  name: '', email: '', password: '', role: 'user',
  employee_id: '', department: '', company: '', phone: '', location: '',
  send_credentials: true,
}

// Excludes characters that get misread when a password is retyped from an
// email: no O/0, l/1/I, or similar lookalikes.
function suggestPassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '@#$%&*!?'
  const all = upper + lower + digits + symbols

  const pick = (set) => set[Math.floor(Math.random() * set.length)]
  // Guarantee one of each class so it always clears a complexity rule.
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < 12) chars.push(pick(all))

  // Fisher-Yates, so the guaranteed characters aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

const ROLE_DESC = {
  admin: 'Full access — QR generation, mapping, devices, users, reports, and audit logs.',
  user: 'Can scan QR codes, view devices, and raise queries. No edit or delete rights.',
  client: 'Read-only. Can view devices, manuals, videos, and query status. Cannot raise queries.',
}

export default function UsersPage() {
  const { user: me } = useAuth()

  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState(null) // null = closed, {} = new
  const [confirmDel, setConfirmDel] = useState(null)

  const debounced = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/users', { params: { search: debounced, role, page, limit: 20 } })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, role, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [debounced, role])

  async function toggleActive(u) {
    try {
      await api.put(`/users/${u.id}`, { ...u, is_active: !u.is_active })
      toast.success(`${u.name} ${u.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <>
      <PageHeader title="Users" subtitle={meta ? `${meta.total} account${meta.total === 1 ? '' : 's'}` : 'Manage who can access the system.'} icon={UsersIcon}>
        <button className="btn-primary" onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </PageHeader>

      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, email, employee ID, or department…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select sm:w-44" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">All roles</option>
            {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(search || role !== 'all') && (
            <button className="btn-ghost shrink-0" onClick={() => { setSearch(''); setRole('all') }}>
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No users found"
            message={search || role !== 'all' ? 'Try a different search or role filter.' : 'Add your first user account.'}
            action={<button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add user</button>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Employee ID</th>
                    <th>Department</th>
                    <th>Last Login</th>
                    <th>Active</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white">
                            {u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {u.name}
                              {u.id === me?.id && <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>}
                            </div>
                            <div className="truncate text-xs text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><Badge map={ROLE} value={u.role} /></td>
                      <td className="font-mono text-xs text-slate-500">{u.employee_id || '—'}</td>
                      <td className="text-sm text-slate-500">{u.department || '—'}</td>
                      <td className="text-xs text-slate-400">
                        {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </td>
                      <td>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={u.id === me?.id}
                          className={clsx(
                            'relative h-5 w-9 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                            u.is_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                          )}
                          title={u.id === me?.id ? 'You cannot deactivate yourself' : u.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', u.is_active ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditing(u)} className="btn-ghost btn-sm" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDel(u)}
                            disabled={u.id === me?.id}
                            className="btn-ghost btn-sm text-slate-400 hover:text-red-600 disabled:opacity-30"
                            title={u.id === me?.id ? 'You cannot delete yourself' : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </div>

      <UserModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete this user?"
        message={`${confirmDel?.name} (${confirmDel?.email}) will lose access immediately. Queries they raised are kept.`}
        confirmLabel="Delete user"
        onConfirm={async () => {
          try {
            await api.delete(`/users/${confirmDel.id}`)
            toast.success('User deleted')
            load()
          } catch (e) {
            toast.error(errMsg(e))
          } finally {
            setConfirmDel(null)
          }
        }}
      />
    </>
  )
}

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?.id
  const [form, setForm] = useState(BLANK)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (!user) return
    setErrors({})
    setShowPw(false)
    setForm(
      user.id
        ? {
            name: user.name || '', email: user.email || '', password: '',
            role: user.role || 'user', employee_id: user.employee_id || '',
            department: user.department || '', company: user.company || '',
            phone: user.phone || '', location: user.location || '',
            send_credentials: true,
          }
        : BLANK,
    )
  }, [user])

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

  function validate() {
    const e = {}
    if (form.name.trim().length < 2) e.name = 'Name is required'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address'
    // Password is required on create, optional on edit (blank = unchanged).
    if (!isEdit && form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (isEdit && form.password && form.password.length < 8) e.password = 'Password must be at least 8 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save(e) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      let res
      if (isEdit) {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        delete payload.email // email is the identity key and is not editable
        res = await api.put(`/users/${user.id}`, payload)
      } else {
        res = await api.post('/users', form)
      }

      // The server reports whether the credentials email actually went out,
      // rather than us assuming it did — a silent failure would leave the new
      // user never knowing they have an account.
      const msg = res.data?.message || (isEdit ? 'User updated' : 'User created')
      if (res.data?.meta?.email_error) {
        toast.error(msg, { duration: 8000 })
      } else {
        toast.success(msg, { duration: 5000 })
      }
      onSaved()
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit user' : 'Add a user'}
      subtitle={isEdit ? user.email : 'Create an account and assign its role.'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <input className={clsx('input', errors.name && 'input-error')} value={form.name} onChange={set('name')} placeholder="Rahul Sharma" autoFocus />
          </Field>

          <Field label="Email address" required error={errors.email} hint={isEdit ? 'Email cannot be changed after creation.' : undefined}>
            <input type="email" className={clsx('input', errors.email && 'input-error')} value={form.email} onChange={set('email')} disabled={isEdit} placeholder="rahul@company.com" />
          </Field>

          <Field
            label={isEdit ? 'New password' : 'Password'}
            required={!isEdit}
            error={errors.password}
            hint={
              isEdit
                ? 'Leave blank to keep the current password.'
                : 'At least 8 characters. This exact password is emailed to the user.'
            }
          >
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className={clsx('input pr-20', errors.password && 'input-error')}
                value={form.password}
                onChange={set('password')}
                placeholder={isEdit ? 'Leave blank to keep current' : 'At least 8 characters'}
                autoComplete="new-password"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const pw = suggestPassword()
                    setForm((f) => ({ ...f, password: pw }))
                    setErrors((x) => ({ ...x, password: undefined }))
                    setShowPw(true) // no point generating one you can't read
                  }}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600"
                  title="Generate a strong password"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600"
                  title={showPw ? 'Hide password' : 'Show password'}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {form.password && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(form.password)
                  toast.success('Password copied')
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-brand-600"
              >
                <Copy className="h-3 w-3" />
                Copy password
              </button>
            )}
          </Field>

          <Field label="Employee ID">
            <input className="input font-mono" value={form.employee_id} onChange={set('employee_id')} placeholder="EMP-1042" />
          </Field>

          <Field label="Department">
            <input className="input" value={form.department} onChange={set('department')} placeholder="IT" />
          </Field>

          <Field label="Company">
            <input className="input" value={form.company} onChange={set('company')} placeholder="PSI Tech" />
          </Field>

          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
          </Field>

          <Field label="Location">
            <input className="input" value={form.location} onChange={set('location')} placeholder="Head Office" />
          </Field>
        </div>

        {/* Only relevant when a password is actually being set. */}
        {(!isEdit || form.password) && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
            <input
              type="checkbox"
              checked={form.send_credentials}
              onChange={(e) => setForm((f) => ({ ...f, send_credentials: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {isEdit ? 'Email the new password to the user' : 'Email the login details to the user'}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">
                {form.email ? (
                  <>
                    Sends to <span className="font-medium text-slate-500 dark:text-slate-300">{form.email}</span> with
                    their username (their email address) and this password.
                    {isEdit && ' Without this, they will not know their password changed.'}
                  </>
                ) : (
                  'Enter an email address above to enable this.'
                )}
              </span>
            </span>
          </label>
        )}

        <Field label="Role" required>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(ROLE).map(([key, v]) => (
              <label key={key} className="cursor-pointer">
                <input type="radio" name="role" value={key} checked={form.role === key} onChange={set('role')} className="peer sr-only" />
                <div className="h-full rounded-lg border-2 border-slate-200 dark:border-slate-700 p-3 transition-all hover:border-slate-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 dark:peer-checked:bg-brand-500/10">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm font-semibold">{v.label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400">{ROLE_DESC[key]}</p>
                </div>
              </label>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  )
}
