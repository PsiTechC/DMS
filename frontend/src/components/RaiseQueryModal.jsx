import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Paperclip, X, Lock, Copy } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { Modal, Field, Spinner } from './UI'

const PRIORITIES = [
  { value: 'low', label: 'Low', hint: 'Minor — no work stoppage', cls: 'peer-checked:border-slate-500 peer-checked:bg-slate-50 dark:peer-checked:bg-slate-800' },
  { value: 'medium', label: 'Medium', hint: 'Affecting productivity', cls: 'peer-checked:border-amber-500 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-500/10' },
  { value: 'high', label: 'High', hint: 'Device unusable', cls: 'peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-500/10' },
]

export default function RaiseQueryModal({ open, onClose, device, assetId, user, onSubmitted }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' })
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [ticket, setTicket] = useState(null)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

  function reset() {
    setForm({ title: '', description: '', priority: 'medium' })
    setFile(null)
    setErrors({})
    setTicket(null)
  }

  function close() {
    reset()
    onClose()
  }

  function validate() {
    const e = {}
    if (form.title.trim().length < 3) e.title = 'Please enter a short title (at least 3 characters)'
    if (form.description.trim().length < 10) e.description = 'Please describe the issue in at least 10 characters'
    if (file && file.size > 20 * 1024 * 1024) e.file = 'Attachment must be under 20 MB'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      // Multipart carries the optional attachment; the server reads every
      // device/reporter field from the database, not from this form.
      const fd = new FormData()
      fd.append('device_id', device.id)
      fd.append('title', form.title.trim())
      fd.append('description', form.description.trim())
      fd.append('priority', form.priority)
      if (file) fd.append('attachment', file)

      const res = await api.post('/queries', fd)
      setTicket(res.data.data.ticket_number)
      onSubmitted?.(res.data.data.query)
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success state ────────────────────────────────────────────────── */
  if (ticket) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="Query submitted"
        size="sm"
        footer={<button className="btn-primary" onClick={close}>Done</button>}
      >
        <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>

          <h3 className="mt-4 text-base font-semibold">Your query has been submitted</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Our admin team has been notified by email and will review it shortly.
          </p>

          <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Your ticket number
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-2">
              <span className="font-mono text-lg font-bold text-brand-700 dark:text-brand-400">{ticket}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(ticket)
                  toast.success('Ticket number copied')
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-600"
                aria-label="Copy ticket number"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Save this number to track the status of your query.
            </p>
          </div>
        </motion.div>
      </Modal>
    )
  }

  /* ── Form ─────────────────────────────────────────────────────────── */
  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : close}
      title="Raise a query"
      subtitle={`${device?.device_name} · ${device?.device_number}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={close} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting && <Spinner className="h-4 w-4" />}
            {submitting ? 'Submitting…' : 'Submit query'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Issue Title" required error={errors.title}>
          <input
            className={clsx('input', errors.title && 'input-error')}
            value={form.title}
            onChange={set('title')}
            placeholder="e.g. Laptop not powering on"
            maxLength={250}
            autoFocus
          />
        </Field>

        <Field
          label="Issue Description"
          required
          error={errors.description}
          hint={`${form.description.length} characters — be as specific as you can`}
        >
          <textarea
            rows={5}
            className={clsx('input resize-y', errors.description && 'input-error')}
            value={form.description}
            onChange={set('description')}
            placeholder="Describe what happened, when it started, and anything you have already tried…"
          />
        </Field>

        <Field label="Priority" required>
          <div className="grid gap-3 sm:grid-cols-3">
            {PRIORITIES.map((p) => (
              <label key={p.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="priority"
                  value={p.value}
                  checked={form.priority === p.value}
                  onChange={set('priority')}
                  className="peer sr-only"
                />
                <div
                  className={clsx(
                    'rounded-lg border-2 border-slate-200 dark:border-slate-700 p-3 transition-all',
                    'hover:border-slate-300 dark:hover:border-slate-600',
                    p.cls,
                  )}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400 leading-tight">{p.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Attachment" error={errors.file} hint="Optional — a photo of the issue or a PDF. Max 20 MB.">
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-red-600"
                aria-label="Remove attachment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-6 text-sm text-slate-500 transition-colors hover:border-brand-500 hover:text-brand-600">
              <Paperclip className="h-4 w-4" />
              Click to attach an image or PDF
              <input
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null)
                  setErrors((x) => ({ ...x, file: undefined }))
                }}
              />
            </label>
          )}
        </Field>

        {/* ── Auto-filled context ──────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Attached automatically — you do not need to enter these
            </span>
          </div>

          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Auto label="Ticket Number" value="Generated on submit" muted />
            <Auto label="Device Number" value={device?.device_number} />
            <Auto label="QR Number" value={assetId || device?.qr_code?.asset_id} />
            <Auto label="Device Name" value={device?.device_name} />
            <Auto label="Brand" value={device?.brand} />
            <Auto label="Model" value={device?.model} />
            <Auto label="Serial Number" value={device?.serial_number} />
            <Auto label="Assigned Employee" value={device?.assigned_employee} />
            <Auto label="Department" value={device?.department} />
            <Auto label="Company" value={device?.company} />
            <Auto label="Project" value={device?.project} />
            <Auto label="Location" value={device?.location} />
            <Auto label="User Name" value={user?.name} />
            <Auto label="Employee ID" value={user?.employee_id} />
            <Auto label="User Email" value={user?.email} />
            <Auto label="Date & Time" value="Stamped on submit" muted />
          </div>
        </div>
      </form>
    </Modal>
  )
}

function Auto({ label, value, muted }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div
        className={clsx(
          'truncate text-xs font-medium',
          muted ? 'italic text-slate-400' : 'text-slate-700 dark:text-slate-200',
        )}
      >
        {value || <span className="text-slate-400">—</span>}
      </div>
    </div>
  )
}
