import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  QrCode, Save, ArrowLeft, Plus, Trash2, ImageIcon, Video, FileText,
  UploadCloud, X, Star, Loader2, Info,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { DEVICE_CATEGORIES } from '../lib/constants'
import { PageHeader, Field, Spinner, PageLoader, ConfirmDialog } from '../components/UI'

const BLANK = {
  device_number: '', device_name: '', category: '', brand: '', model: '', serial_number: '',
  purchase_date: '', warranty_expiry: '', department: '', company: '', project: '',
  assigned_employee: '', location: '', vendor: '',
  status: 'active', condition: 'good', description: '',
}

const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '')

export default function MapDevice() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const isEdit = !!editId

  const [form, setForm] = useState(BLANK)
  const [specs, setSpecs] = useState([{ key: '', value: '' }])
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [deviceId, setDeviceId] = useState(editId ? Number(editId) : null)
  const [media, setMedia] = useState([])
  const [confirmDel, setConfirmDel] = useState(null)

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

  const loadMedia = useCallback(async (id) => {
    const res = await api.get(`/devices/${id}`)
    setMedia(res.data.data.media || [])
    return res.data.data
  }, [])

  // Edit mode: hydrate the form from the existing device.
  useEffect(() => {
    if (!isEdit) return
    let cancelled = false

    api
      .get(`/devices/${editId}`)
      .then((res) => {
        if (cancelled) return
        const d = res.data.data
        setForm({
          device_number: d.device_number || '', device_name: d.device_name || '',
          category: d.category || '', brand: d.brand || '', model: d.model || '',
          serial_number: d.serial_number || '',
          purchase_date: toDateInput(d.purchase_date),
          warranty_expiry: toDateInput(d.warranty_expiry),
          department: d.department || '', company: d.company || '', project: d.project || '',
          assigned_employee: d.assigned_employee || '', location: d.location || '',
          vendor: d.vendor || '', status: d.status || 'active',
          condition: d.condition || 'good', description: d.description || '',
        })
        try {
          const parsed = JSON.parse(d.specifications || '[]')
          setSpecs(Array.isArray(parsed) && parsed.length ? parsed : [{ key: '', value: '' }])
        } catch {
          setSpecs([{ key: '', value: '' }])
        }
        setMedia(d.media || [])
        setDeviceId(d.id)
      })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [isEdit, editId])

  function validate() {
    const e = {}
    if (!form.device_number.trim()) e.device_number = 'Device number is required'
    if (!form.device_name.trim()) e.device_name = 'Device name is required'
    if (form.purchase_date && form.warranty_expiry && form.warranty_expiry < form.purchase_date) {
      e.warranty_expiry = 'Warranty expiry cannot be before the purchase date'
    }
    setErrors(e)
    if (Object.keys(e).length) toast.error('Please fix the highlighted fields')
    return Object.keys(e).length === 0
  }

  async function save(e) {
    e?.preventDefault()
    if (!validate()) return

    setSaving(true)
    const payload = {
      ...form,
      specifications: JSON.stringify(specs.filter((s) => s.key.trim())),
    }

    try {
      if (isEdit) {
        await api.put(`/devices/${deviceId}`, payload)
        toast.success('Device updated')
      } else {
        const res = await api.post(`/qr/${assetId}/map`, payload)
        setDeviceId(res.data.data.id)
        toast.success(`${assetId} mapped to ${form.device_name}`)
      }
      navigate(`/device/${assetId}`)
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  // Mapping first, then uploads: media needs a device id to attach to.
  async function saveAndUpload(e) {
    e?.preventDefault()
    if (!validate()) return
    if (deviceId) return

    setSaving(true)
    try {
      const payload = { ...form, specifications: JSON.stringify(specs.filter((s) => s.key.trim())) }
      const res = await api.post(`/qr/${assetId}/map`, payload)
      setDeviceId(res.data.data.id)
      toast.success(`${assetId} mapped — you can now upload files`)
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading device…" />

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={isEdit ? 'Edit device' : 'Map QR to a device'}
        subtitle={
          isEdit
            ? 'Update this device’s details, media, and specifications.'
            : 'Fill in the device details to assign this QR code. This happens once per QR.'
        }
        icon={QrCode}
      >
        <Link to={isEdit ? `/device/${assetId}` : '/qr-codes'} className="btn-secondary">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </PageHeader>

      {/* QR banner */}
      <div className="card mb-6 flex flex-wrap items-center gap-4 p-4">
        <img
          src={`/api/qr/${assetId}/image?size=160`}
          alt={assetId}
          className="h-20 w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            QR Number
          </div>
          <div className="font-mono text-lg font-bold">{assetId}</div>
          <div className="mt-0.5 truncate text-xs text-slate-400">
            {window.location.origin}/device/{assetId}
          </div>
        </div>
        {deviceId && !isEdit && (
          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            Mapped
          </span>
        )}
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* ── Identity ─────────────────────────────────────────────── */}
        <Section title="Device identity" desc="How this asset is identified in your inventory.">
          <Field label="Device Number / Asset Number" required error={errors.device_number} className="sm:col-span-1">
            <input className={clsx('input', errors.device_number && 'input-error')} value={form.device_number} onChange={set('device_number')} placeholder="e.g. AST-1042" />
          </Field>
          <Field label="Device Name" required error={errors.device_name}>
            <input className={clsx('input', errors.device_name && 'input-error')} value={form.device_name} onChange={set('device_name')} placeholder="e.g. Dell Latitude 5440" />
          </Field>
          <Field label="Category">
            <select className="select" value={form.category} onChange={set('category')}>
              <option value="">Select a category…</option>
              {DEVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Brand">
            <input className="input" value={form.brand} onChange={set('brand')} placeholder="e.g. Dell" />
          </Field>
          <Field label="Model">
            <input className="input" value={form.model} onChange={set('model')} placeholder="e.g. Latitude 5440" />
          </Field>
          <Field label="Serial Number">
            <input className="input font-mono" value={form.serial_number} onChange={set('serial_number')} placeholder="e.g. SN9F82KD3" />
          </Field>
        </Section>

        {/* ── Purchase & warranty ──────────────────────────────────── */}
        <Section title="Purchase & warranty" desc="Used for the warranty expiry dashboard and reports.">
          <Field label="Purchase Date">
            <input type="date" className="input" value={form.purchase_date} onChange={set('purchase_date')} />
          </Field>
          <Field label="Warranty Expiry" error={errors.warranty_expiry}>
            <input type="date" className={clsx('input', errors.warranty_expiry && 'input-error')} value={form.warranty_expiry} onChange={set('warranty_expiry')} />
          </Field>
          <Field label="Vendor">
            <input className="input" value={form.vendor} onChange={set('vendor')} placeholder="e.g. Redington India" />
          </Field>
        </Section>

        {/* ── Assignment ───────────────────────────────────────────── */}
        <Section title="Assignment & location" desc="Who holds this device and where it lives.">
          <Field label="Company">
            <input className="input" value={form.company} onChange={set('company')} placeholder="e.g. PSI Tech" />
          </Field>
          <Field label="Project">
            <input className="input" value={form.project} onChange={set('project')} placeholder="e.g. Plant Automation" />
          </Field>
          <Field label="Department">
            <input className="input" value={form.department} onChange={set('department')} placeholder="e.g. IT" />
          </Field>
          <Field label="Assigned Employee / User Name">
            <input className="input" value={form.assigned_employee} onChange={set('assigned_employee')} placeholder="e.g. Rahul Sharma" />
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <input className="input" value={form.location} onChange={set('location')} placeholder="e.g. Head Office — 2nd Floor, Room 204" />
          </Field>
        </Section>

        {/* ── Condition ────────────────────────────────────────────── */}
        <Section title="Status & condition">
          <Field label="Device Status">
            <select className="select" value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="maintenance">Under Maintenance</option>
              <option value="faulty">Faulty</option>
              <option value="in_storage">In Storage</option>
              <option value="retired">Retired</option>
            </select>
          </Field>
          <Field label="Device Condition">
            <select className="select" value={form.condition} onChange={set('condition')}>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="damaged">Damaged</option>
            </select>
          </Field>
          <Field label="Description / Notes" className="sm:col-span-2 lg:col-span-3">
            <textarea rows={3} className="input resize-y" value={form.description} onChange={set('description')} placeholder="Any additional notes about this device…" />
          </Field>
        </Section>

        {/* ── Specifications ───────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHead title="Technical specifications" desc="Shown on the device page's Specifications tab." />
          <div className="mt-4 space-y-2.5">
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <input
                  className="input flex-1"
                  placeholder="Specification (e.g. RAM)"
                  value={s.key}
                  onChange={(e) => setSpecs((p) => p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                />
                <input
                  className="input flex-1"
                  placeholder="Value (e.g. 16 GB DDR5)"
                  value={s.value}
                  onChange={(e) => setSpecs((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => setSpecs((p) => (p.length === 1 ? [{ key: '', value: '' }] : p.filter((_, j) => j !== i)))}
                  className="btn-ghost shrink-0 px-3 text-slate-400 hover:text-red-600"
                  aria-label="Remove specification"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSpecs((p) => [...p, { key: '', value: '' }])}
            className="btn-secondary btn-sm mt-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Add specification
          </button>
        </div>

        {/* ── Media ────────────────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHead
            title="Images, videos & manuals"
            desc={deviceId ? 'Files upload immediately once selected.' : 'Save the device first, then upload files.'}
          />

          {!deviceId ? (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 sm:flex-row sm:items-center">
              <Info className="h-5 w-5 shrink-0 text-slate-400" />
              <p className="flex-1 text-sm text-slate-500">
                Uploads need a saved device to attach to. Save the mapping now — you will stay on
                this page and can upload right away.
              </p>
              <button type="button" onClick={saveAndUpload} className="btn-primary btn-sm shrink-0" disabled={saving}>
                {saving && <Spinner className="h-3.5 w-3.5" />}
                Save & enable uploads
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              <MediaSection deviceId={deviceId} type="image" label="Device Images" icon={ImageIcon} accept="image/*" hint="JPG, PNG, WEBP or GIF · max 10 MB each" media={media} onChange={() => loadMedia(deviceId)} onDelete={setConfirmDel} />
              <MediaSection deviceId={deviceId} type="video" label="Videos" icon={Video} accept="video/*" hint="MP4, WEBM, MOV, AVI or MKV · max 200 MB each" media={media} onChange={() => loadMedia(deviceId)} onDelete={setConfirmDel} />
              <MediaSection deviceId={deviceId} type="manual" label="PDF Manuals" icon={FileText} accept=".pdf,application/pdf" hint="PDF only · max 50 MB each" media={media} onChange={() => loadMedia(deviceId)} onDelete={setConfirmDel} />
            </div>
          )}
        </div>

        {/* ── Sticky action bar ────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 px-4 py-4 backdrop-blur-lg sm:mx-0 sm:rounded-xl sm:border">
          <Link to={isEdit ? `/device/${assetId}` : '/qr-codes'} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save & map QR'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete this file?"
        message={`"${confirmDel?.file_name}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete file"
        onConfirm={async () => {
          try {
            await api.delete(`/media/${confirmDel.id}`)
            toast.success('File deleted')
            const d = await loadMedia(deviceId)
            setMedia(d.media || [])
          } catch (e) {
            toast.error(errMsg(e))
          } finally {
            setConfirmDel(null)
          }
        }}
      />
    </div>
  )
}

/* ── Media uploader ───────────────────────────────────────────────────── */

function MediaSection({ deviceId, type, label, icon: Icon, accept, hint, media, onChange, onDelete }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const items = media.filter((m) => m.type === type)

  async function upload(files) {
    if (!files?.length) return
    setUploading(true)
    setProgress(0)

    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('files', f))

    try {
      const res = await api.post(`/devices/${deviceId}/media?type=${type}`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded * 100) / e.total))
        },
      })
      toast.success(res.data.message)
      onChange()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function makePrimary(id) {
    try {
      await api.patch(`/media/${id}/primary`)
      toast.success('Primary image updated')
      onChange()
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold">{label}</span>
        {items.length > 0 && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            {items.length}
          </span>
        )}
      </div>

      <label
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 transition-colors',
          uploading
            ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-500/5'
            : 'border-slate-300 dark:border-slate-700 hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <span className="text-sm font-medium text-brand-700 dark:text-brand-400">
              Uploading… {progress}%
            </span>
            <div className="mt-1 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="h-5 w-5 text-slate-400" />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Click to upload {label.toLowerCase()}
            </span>
            <span className="text-[11px] text-slate-400">{hint}</span>
          </>
        )}
        <input
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            upload(e.target.files)
            e.target.value = '' // let the same file be re-picked after a failure
          }}
        />
      </label>

      {items.length > 0 && (
        <div className={clsx('mt-3 gap-3', type === 'image' ? 'grid grid-cols-3 sm:grid-cols-5' : 'space-y-2')}>
          {items.map((m) =>
            type === 'image' ? (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <img src={m.url} alt={m.file_name} className="h-full w-full object-cover" loading="lazy" />
                {m.is_primary && (
                  <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 py-0.5 text-[9px] font-bold text-white">
                    PRIMARY
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/70 opacity-0 transition-opacity group-hover:opacity-100">
                  {!m.is_primary && (
                    <button type="button" onClick={() => makePrimary(m.id)} className="rounded-md bg-white/90 p-1.5 text-slate-700 hover:bg-white" title="Set as primary">
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => onDelete(m)} className="rounded-md bg-white/90 p-1.5 text-red-600 hover:bg-white" title="Delete">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.file_name}</span>
                <span className="shrink-0 text-xs text-slate-400">{(m.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" onClick={() => onDelete(m)} className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600" aria-label="Delete file">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/* ── Layout helpers ───────────────────────────────────────────────────── */

function SectionHead({ title, desc }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
    </div>
  )
}

function Section({ title, desc, children }) {
  return (
    <div className="card p-5">
      <SectionHead title={title} desc={desc} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}
