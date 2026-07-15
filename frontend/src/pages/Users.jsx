import { useEffect, useState, useCallback } from 'react'
import { Users as UsersIcon, Plus, Search, Pencil, Trash2, ShieldCheck, X } from 'lucide-react'
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

  useEffect(() => {
    if (!user) return
    setErrors({})
    setForm(
      user.id
        ? {
            name: user.name || '', email: user.email || '', password: '',
            role: user.role || 'user', employee_id: user.employee_id || '',
            department: user.department || '', company: user.company || '',
            phone: user.phone || '', location: user.location || '',
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
      if (isEdit) {
        const payload = { ...form }
        if (!payload.password) delete payload.password
        delete payload.email // email is the identity key and is not editable
        await api.put(`/users/${user.id}`, payload)
        toast.success('User updated')
      } else {
        await api.post('/users', form)
        toast.success('User created')
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
            hint={isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          >
            <input type="password" className={clsx('input', errors.password && 'input-error')} value={form.password} onChange={set('password')} placeholder={isEdit ? '••••••••' : 'At least 8 characters'} autoComplete="new-password" />
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
