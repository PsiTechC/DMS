import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  QrCode, Save, ArrowLeft, Plus, Trash2, ImageIcon, Video, FileText,
  UploadCloud, X, Star, Loader2, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { PageHeader, Field, Spinner, PageLoader, ConfirmDialog } from '../components/UI'

const BLANK = {
  device_number: '', device_name: '', category: '', brand: '', model: '', serial_number: '',
  purchase_date: '', warranty_expiry: '', department: '', company: '', project: '',
  assigned_employee: '', location: '', vendor: '',
  status: 'active', condition: 'good', headline: '', description: '',
}

const toDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '')

// Parse a stored JSON array, falling back to a single blank row so the editor
// always has something to render.
function parseJsonArray(raw, blankRow) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) && parsed.length ? parsed : [{ ...blankRow }]
  } catch {
    return [{ ...blankRow }]
  }
}

// Features now use one free-text field. Preserve older title/detail content by
// combining both parts when an existing device is edited.
function parseFeatures(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || !parsed.length) return [{ title: '', detail: '' }]
    return parsed.map((f) => {
      if (typeof f === 'string') return { title: f, detail: '' }
      return {
        title: [f?.title, f?.detail].filter((part) => String(part || '').trim()).join(' — '),
        detail: '',
      }
    })
  } catch {
    return [{ title: '', detail: '' }]
  }
}

// Specifications now use one free-text field. Preserve older key/value data
// by combining both parts into that field when an existing device is edited.
function parseSpecifications(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || !parsed.length) return [{ key: '', value: '' }]
    return parsed.map((s) => ({
      key: [s?.key, s?.value].filter((part) => String(part || '').trim()).join(' — '),
      value: '',
    }))
  } catch {
    return [{ key: '', value: '' }]
  }
}

// Build the product-page payload shared by save() and saveAndUpload().
function productPayload(form, specs, features, steps) {
  return {
    ...form,
    specifications: JSON.stringify(
      specs.filter((s) => s.key.trim()).map((s) => ({ key: s.key.trim(), value: '' })),
    ),
    features: JSON.stringify(
      features
        .map((f) => ({ title: f.title.trim(), detail: f.detail.trim() }))
        .filter((f) => f.title || f.detail),
    ),
    usage_steps: JSON.stringify(
      steps
        .map((s) => ({ title: s.title.trim(), detail: s.detail.trim() }))
        .filter((s) => s.title || s.detail),
    ),
  }
}

export default function MapDevice() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const isEdit = !!editId
  const isNewProduct = assetId === 'new' && !isEdit

  const [form, setForm] = useState({
    ...BLANK,
    category: isNewProduct ? (params.get('category') || '') : '',
  })
  const [specs, setSpecs] = useState([{ key: '', value: '' }])
  const [features, setFeatures] = useState([{ title: '', detail: '' }])
  const [steps, setSteps] = useState([{ title: '', detail: '' }])
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [deviceId, setDeviceId] = useState(editId ? Number(editId) : null)
  const [mappedAssetId, setMappedAssetId] = useState(isNewProduct ? null : assetId)
  const [media, setMedia] = useState([])
  const [pendingMedia, setPendingMedia] = useState({ image: [], video: [], manual: [] })
  const [confirmDel, setConfirmDel] = useState(null)
  const [categories, setCategories] = useState([])

  // Product categories are admin-managed rows, not a fixed list — every mode
  // of this form (create, map, edit) picks from whatever currently exists.
  useEffect(() => {
    api.get('/product-categories').then((res) => setCategories(res.data.data || [])).catch(() => {})
  }, [])

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
          condition: d.condition || 'good', headline: d.headline || '',
          description: d.description || '',
        })
        setSpecs(parseSpecifications(d.specifications))
        // Features are stored as a flat string array; the editor works in rows.
        setFeatures(parseFeatures(d.features))
        setSteps(parseJsonArray(d.usage_steps, { title: '', detail: '' }))
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
    if (!form.category.trim()) e.category = 'Product category is required'
    if (!form.assigned_employee.trim()) e.assigned_employee = 'Assigned employee is required'
    if (!form.location.trim()) e.location = 'Location is required'
    if (form.purchase_date && form.warranty_expiry && form.warranty_expiry < form.purchase_date) {
      e.warranty_expiry = 'Warranty expiry cannot be before the purchase date'
    }

    const filledSpecs = specs.filter((s) => s.key.trim())
    const filledFeatures = features.filter((f) => f.title.trim() || f.detail.trim())
    const filledSteps = steps.filter((s) => s.title.trim() || s.detail.trim())
    if (!filledSpecs.length) {
      e.specifications = 'Add at least one technical specification'
    }
    if (!filledFeatures.length) {
      e.features = 'Add at least one key feature'
    }
    if (filledSteps.some((s) => !s.title.trim() || !s.detail.trim())) {
      e.usage_steps = 'If you add a usage step, include both its title and instruction'
    }
    for (const type of ['image', 'manual']) {
      if (!media.some((m) => m.type === type) && pendingMedia[type].length === 0) {
        e[type] = `At least one ${type === 'manual' ? 'PDF manual' : type} is required`
      }
    }
    setErrors(e)
    if (Object.keys(e).length) toast.error('Please fix the highlighted fields')
    return Object.keys(e).length === 0
  }

  async function save(e) {
    e?.preventDefault()
    if (!validate()) return

    setSaving(true)
    const payload = productPayload(form, specs, features, steps)
    const creatingMapping = !isEdit && !deviceId
    let createdDeviceId = null
    let createdAssetId = null

    try {
      let savedDeviceId = deviceId
      if (isEdit || deviceId) {
        await api.put(`/devices/${deviceId}`, payload)
      } else if (isNewProduct) {
        const res = await api.post('/products', payload)
        savedDeviceId = res.data.data.device.id
        createdDeviceId = savedDeviceId
        createdAssetId = res.data.data.qr_code.asset_id
        setDeviceId(savedDeviceId)
        setMappedAssetId(createdAssetId)
      } else {
        const res = await api.post(`/qr/${assetId}/map`, payload)
        savedDeviceId = res.data.data.id
        createdDeviceId = savedDeviceId
        createdAssetId = assetId
        setDeviceId(savedDeviceId)
      }
      for (const type of ['image', 'video', 'manual']) {
        const files = pendingMedia[type]
        if (!files.length) continue
        const fd = new FormData()
        files.forEach((file) => fd.append('files', file))
        await api.post(`/devices/${savedDeviceId}/media?type=${type}`, fd)
      }
      setPendingMedia({ image: [], video: [], manual: [] })
      const destinationAsset = createdAssetId || mappedAssetId || assetId
      toast.success(isEdit ? 'Device updated' : `${destinationAsset} created and mapped to ${form.device_name}`)
      navigate(`/device/${destinationAsset}`)
    } catch (err) {
      if (creatingMapping && createdDeviceId) {
        try {
          const rollbackAsset = createdAssetId || mappedAssetId || assetId
          await api.delete(`/qr/${rollbackAsset}/map`)
          if (isNewProduct) await api.delete(`/qr/${rollbackAsset}`)
          setDeviceId(null)
          setMappedAssetId(isNewProduct ? null : assetId)
          setMedia([])
        } catch {
          toast.error('Upload failed and the incomplete mapping could not be rolled back. Please finish it from Edit device.')
        }
      }
      toast.error(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading device…" />

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={isEdit ? 'Edit device' : isNewProduct ? 'Create product device' : 'Map QR to a device'}
        subtitle={
          isEdit
            ? 'Update this device’s details, media, and specifications.'
            : isNewProduct
              ? 'Choose the hardware product category. Its unique QR is created and mapped automatically.'
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
        {mappedAssetId ? (
          <img
            src={`/api/qr/${mappedAssetId}/image?size=160`}
            alt={mappedAssetId}
            className="h-20 w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-500/10">
            <QrCode className="h-8 w-8 text-brand-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {isNewProduct && !mappedAssetId ? 'QR created automatically' : 'QR Number'}
          </div>
          <div className="font-mono text-lg font-bold">
            {mappedAssetId ||
              (form.category
                ? `${categories.find((c) => c.name === form.category)?.product_prefix || '???'}0001+`
                : 'Select a product category')}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-400">
            {mappedAssetId ? `${window.location.origin}/device/${mappedAssetId}` : 'A unique category sequence will be assigned when saved.'}
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
          <Field label="Product Category" required error={errors.category}>
            <select className={clsx('select', errors.category && 'input-error')} value={form.category} onChange={set('category')}>
              <option value="">Select a product category…</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
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
          <Field label="Assigned Employee / User Name" required error={errors.assigned_employee}>
            <input className={clsx('input', errors.assigned_employee && 'input-error')} value={form.assigned_employee} onChange={set('assigned_employee')} placeholder="e.g. Rahul Sharma" />
          </Field>
          <Field label="Location" required error={errors.location} className="sm:col-span-2">
            <input className={clsx('input', errors.location && 'input-error')} value={form.location} onChange={set('location')} placeholder="e.g. Head Office — 2nd Floor, Room 204" />
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

        {/* ── Product page ─────────────────────────────────────────── */}
        <Section
          title="Product page"
          desc="This is what anyone sees when they scan the QR code."
        >
          <Field label="Headline / Tagline" className="sm:col-span-2 lg:col-span-3">
            <input
              className="input"
              value={form.headline}
              onChange={set('headline')}
              placeholder="One line shown under the name, e.g. “Rugged 14-inch business laptop”"
              maxLength={250}
            />
          </Field>
        </Section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHead title="Key features *" desc="Required. Add each feature as a complete line of text." />
          {errors.features && <p className="mt-2 text-xs font-medium text-red-600">{errors.features}</p>}
          <div className="mt-4 space-y-3">
            {features.map((f, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <input
                    className="input"
                    placeholder="Feature description, e.g. Up to 18 hours of battery life"
                    value={f.title}
                    onChange={(e) => {
                      setFeatures((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                      setErrors((current) => ({ ...current, features: undefined }))
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFeatures((p) => (p.length === 1 ? [{ title: '', detail: '' }] : p.filter((_, j) => j !== i)))}
                  className="btn-ghost mt-1 shrink-0 self-start px-3 text-slate-400 hover:text-red-600"
                  aria-label="Remove feature"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setFeatures((p) => [...p, { title: '', detail: '' }])} className="btn-secondary btn-sm mt-3">
            <Plus className="h-3.5 w-3.5" />
            Add feature
          </button>
        </div>

        {/* ── How to use ───────────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHead title="How to use" desc="Optional. Add usage steps when the device needs instructions." />
          {errors.usage_steps && <p className="mt-2 text-xs font-medium text-red-600">{errors.usage_steps}</p>}
          <div className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300">
                  {i + 1}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    className="input"
                    placeholder="Step title, e.g. Power on the device"
                    value={s.title}
                    onChange={(e) => {
                      setSteps((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                      setErrors((current) => ({ ...current, usage_steps: undefined }))
                    }}
                  />
                  <textarea
                    rows={2}
                    className="input resize-y"
                    placeholder="What to do in this step…"
                    value={s.detail}
                    onChange={(e) => {
                      setSteps((p) => p.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))
                      setErrors((current) => ({ ...current, usage_steps: undefined }))
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSteps((p) => (p.length === 1 ? [{ title: '', detail: '' }] : p.filter((_, j) => j !== i)))}
                  className="btn-ghost mt-1 shrink-0 self-start px-3 text-slate-400 hover:text-red-600"
                  aria-label="Remove step"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setSteps((p) => [...p, { title: '', detail: '' }])} className="btn-secondary btn-sm mt-3">
            <Plus className="h-3.5 w-3.5" />
            Add step
          </button>
        </div>

        {/* ── Specifications ───────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHead title="Technical specifications *" desc="Required. Add each specification as a complete line of text." />
          {errors.specifications && <p className="mt-2 text-xs font-medium text-red-600">{errors.specifications}</p>}
          <div className="mt-4 space-y-2.5">
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2.5">
                <input
                  className="input flex-1"
                  placeholder="e.g. 16GB to 32GB unified memory"
                  value={s.key}
                  onChange={(e) => {
                    setSpecs((p) => p.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                    setErrors((current) => ({ ...current, specifications: undefined }))
                  }}
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
            desc={deviceId ? 'Images and PDF manuals are required; videos are optional.' : 'Select the required image and PDF manual now. Video is optional.'}
          />

          {!deviceId ? (
            <div className="mt-4 space-y-6">
              <PendingMediaSection type="image" label="Device Image" icon={ImageIcon} accept="image/*" hint="Required · JPG, PNG, WEBP or GIF · max 10 MB" files={pendingMedia.image} error={errors.image} onChange={(files) => { setPendingMedia((p) => ({ ...p, image: files })); setErrors((e) => ({ ...e, image: undefined })) }} />
              <PendingMediaSection type="video" label="Device Video" icon={Video} accept="video/*" hint="Optional · MP4, WEBM, MOV, AVI or MKV · max 200 MB" files={pendingMedia.video} error={errors.video} onChange={(files) => { setPendingMedia((p) => ({ ...p, video: files })); setErrors((e) => ({ ...e, video: undefined })) }} />
              <PendingMediaSection type="manual" label="PDF Manual" icon={FileText} accept=".pdf,application/pdf" hint="Required · PDF only · max 50 MB" files={pendingMedia.manual} error={errors.manual} onChange={(files) => { setPendingMedia((p) => ({ ...p, manual: files })); setErrors((e) => ({ ...e, manual: undefined })) }} />
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
            {saving ? 'Saving & uploading…' : isEdit ? 'Save changes' : isNewProduct ? 'Create device & QR' : 'Save, upload & map QR'}
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

function PendingMediaSection({ type, label, icon: Icon, accept, hint, files, error, onChange }) {
  const maxBytes = { image: 10, video: 200, manual: 50 }[type] * 1024 * 1024

  function select(selected) {
    const next = Array.from(selected || [])
    const invalid = next.find((file) => file.size === 0 || file.size > maxBytes)
    if (invalid) {
      toast.error(`${invalid.name} is empty or exceeds the allowed size`)
      return
    }
    onChange([...files, ...next])
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold">{label}{type === 'video' ? '' : ' *'}</span>
        {files.length > 0 && <span className="badge bg-emerald-100 text-emerald-700">Ready</span>}
      </div>
      <label className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 transition-colors hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
        error ? 'border-red-400 bg-red-50/40 dark:bg-red-500/5' : 'border-slate-300 dark:border-slate-700',
      )}>
        <UploadCloud className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">Choose {label.toLowerCase()}</span>
        <span className="text-[11px] text-slate-400">{hint}</span>
        <input type="file" multiple accept={accept} className="sr-only" onChange={(e) => { select(e.target.files); e.target.value = '' }} />
      </label>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" className="text-slate-400 hover:text-red-600" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
        <span className="text-sm font-semibold">{label}{type === 'video' ? '' : ' *'}</span>
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
