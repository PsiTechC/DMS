import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Plus, Layers, Package, Tag, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { PageHeader, Modal, Field, Spinner, EmptyState, TableSkeleton, ConfirmDialog } from '../components/UI'

// "PRODUCT-FMS-20260720-141719" -> "FMS". Categories are admin-managed rows
// (see /api/product-categories), so this only has the prefix to go on —
// matched against the loaded category list below to show its full name.
function prefixFromBatch(batchId) {
  return batchId.split('-')[1] || ''
}

export default function Products() {
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [counts, setCounts] = useState({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [batches, setBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [genOpen, setGenOpen] = useState(false)
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [deletingCategory, setDeletingCategory] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true)
    try {
      const res = await api.get('/product-categories')
      setCategories(res.data.data || [])
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setCategoriesLoading(false)
    }
  }, [])

  const loadCounts = useCallback(async (cats) => {
    if (!cats.length) { setCounts({}); setCountsLoading(false); return }
    setCountsLoading(true)
    try {
      const results = await Promise.all(
        cats.map((cat) => api.get('/devices', { params: { category: cat.name, limit: 1 } })),
      )
      const next = {}
      cats.forEach((cat, i) => { next[cat.name] = results[i].data.meta?.total ?? 0 })
      setCounts(next)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setCountsLoading(false)
    }
  }, [])

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const res = await api.get('/qr/batches')
      setBatches((res.data.data || []).filter((b) => b.batch_id.startsWith('PRODUCT-')))
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBatchesLoading(false)
    }
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadCounts(categories) }, [categories, loadCounts])
  useEffect(() => { loadBatches() }, [loadBatches])

  const categoryForPrefix = (prefix) =>
    categories.find((c) => c.product_prefix === prefix)?.name || prefix

  function onGenerated() {
    loadCounts(categories)
    loadBatches()
  }

  function onCategoryAdded() {
    setAddCatOpen(false)
    loadCategories()
  }

  function onCategoryUpdated() {
    setEditingCategory(null)
    loadCategories()
  }

  async function deleteCategory() {
    if (!deletingCategory) return
    setDeleteBusy(true)
    try {
      await api.delete(`/product-categories/${deletingCategory.id}`)
      toast.success(`${deletingCategory.name} deleted`)
      setDeletingCategory(null)
      loadCategories()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Bulk-generate product devices — each unit gets its own auto-numbered QR code."
        icon={Boxes}
      >
        <button className="btn-secondary" onClick={() => setAddCatOpen(true)}>
          <Tag className="h-4 w-4" />
          Add category
        </button>
        <Link className="btn-secondary" to="/map/new">
          <Plus className="h-4 w-4" />
          Create one device
        </Link>
        <button className="btn-primary" onClick={() => setGenOpen(true)} disabled={!categories.length}>
          <Layers className="h-4 w-4" />
          Generate batch
        </button>
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-6">
        {categoriesLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card flex w-full items-center gap-3 p-3.5 sm:w-56">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <Spinner className="h-5 w-5" />
            </div>
          ))
        ) : categories.length === 0 ? (
          <div className="card w-full p-4 sm:p-5">
            <EmptyState
              icon={Tag}
              title="No product categories yet"
              message="Add a category (name + serial prefixes) before generating your first batch."
              action={
                <button className="btn-primary" onClick={() => setAddCatOpen(true)}>
                  <Tag className="h-4 w-4" />
                  Add category
                </button>
              }
            />
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="card flex w-full items-center gap-3 p-3.5 sm:w-56">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                <Package className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-slate-400" title={cat.name}>{cat.name}</div>
                <div className="text-xl font-bold tabular-nums">
                  {countsLoading ? <Spinner className="h-5 w-5" /> : counts[cat.name] ?? 0}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
                  onClick={() => setEditingCategory(cat)}
                  title={`Edit ${cat.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  onClick={() => setDeletingCategory(cat)}
                  title={`Delete ${cat.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold">Product batches</h2>
        </div>

        {batchesLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : batches.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No product batches yet"
            message="Generate your first batch to bulk-create devices for a product category."
            action={
              categories.length > 0 && (
                <button className="btn-primary" onClick={() => setGenOpen(true)}>
                  <Layers className="h-4 w-4" />
                  Generate batch
                </button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Batch</th>
                  <th>Range</th>
                  <th>Quantity</th>
                  <th>Mapped</th>
                  <th>Generated</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id}>
                    <td className="text-sm font-medium">{categoryForPrefix(prefixFromBatch(b.batch_id))}</td>
                    <td className="font-mono text-xs text-slate-500">{b.batch_id}</td>
                    <td className="font-mono text-xs">{b.from_asset}–{b.to_asset}</td>
                    <td className="text-sm tabular-nums">{b.quantity}</td>
                    <td className="text-sm tabular-nums">{b.mapped}</td>
                    <td className="text-xs text-slate-400">
                      {new Date(b.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GenerateModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        onGenerated={onGenerated}
        categories={categories}
      />
      <AddCategoryModal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onAdded={onCategoryAdded}
      />
      <EditCategoryModal
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onUpdated={onCategoryUpdated}
        hasDevices={(counts[editingCategory?.name] ?? 0) > 0}
      />
      <ConfirmDialog
        open={Boolean(deletingCategory)}
        onClose={() => { if (!deleteBusy) setDeletingCategory(null) }}
        onConfirm={deleteCategory}
        loading={deleteBusy}
        confirmDisabled={(counts[deletingCategory?.name] ?? 0) > 0}
        title="Delete this category?"
        confirmLabel="Delete category"
        message={
          (counts[deletingCategory?.name] ?? 0) > 0
            ? `${deletingCategory?.name} has ${counts[deletingCategory?.name]} device(s) mapped to it and cannot be deleted until they're removed or recategorized.`
            : `This will permanently delete "${deletingCategory?.name}" and its ID prefixes. This cannot be undone.`
        }
      />
    </>
  )
}

function GenerateModal({ open, onClose, onGenerated, categories }) {
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [productStart, setProductStart] = useState('')
  const [deviceStart, setDeviceStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  // Keep the dropdown pointed at a real category once the list loads/changes,
  // rather than sitting on a stale or empty selection.
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.name === category)) {
      setCategory(categories[0].name)
    }
  }, [categories, category])

  function reset() {
    setCategory(categories[0]?.name || '')
    setQuantity('10')
    setProductStart('')
    setDeviceStart('')
    setResult(null)
  }

  async function generate() {
    const qty = parseInt(quantity, 10)
    if (!Number.isFinite(qty) || qty < 1 || qty > 5000) {
      toast.error('Enter a quantity between 1 and 5000')
      return
    }
    setBusy(true)
    const t = toast.loading(`Generating ${qty} device${qty === 1 ? '' : 's'}…`)
    try {
      const payload = { category, quantity: qty }
      if (productStart) payload.product_start_serial = parseInt(productStart, 10)
      if (deviceStart) payload.device_start_serial = parseInt(deviceStart, 10)
      const res = await api.post('/products/bulk', payload)
      toast.success(`${qty} device${qty === 1 ? '' : 's'} generated`, { id: t })
      setResult(res.data.data)
      onGenerated()
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    } finally {
      setBusy(false)
    }
  }

  function close() {
    if (busy) return
    onClose()
    setTimeout(reset, 200)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Generate a product batch"
      subtitle="Each unit gets its own auto-numbered QR code and device record, ready to print and ship."
      footer={
        result ? (
          <button className="btn-primary" onClick={close}>Done</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={generate} disabled={busy || !category}>
              {busy ? <Spinner className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              Generate
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm">
            <div className="font-semibold text-emerald-700 dark:text-emerald-400">
              {result.quantity} {result.category} device{result.quantity === 1 ? '' : 's'} created
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <div>Product IDs: <span className="font-mono">{result.product_from}–{result.product_to}</span></div>
              <div>Device IDs: <span className="font-mono">{result.device_from}–{result.device_to}</span></div>
              <div>Batch: <span className="font-mono">{result.batch_id}</span></div>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Print labels for this batch from the QR Codes page — filter by batch{' '}
            <span className="font-mono">{result.batch_id}</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Product category" required>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Quantity" required hint="Up to 5000 per batch">
            <input
              type="number"
              min={1}
              max={5000}
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <Field label="Product start serial" hint="Leave blank to continue automatically">
              <input
                type="number"
                min={0}
                className="input font-mono"
                value={productStart}
                onChange={(e) => setProductStart(e.target.value)}
                placeholder="auto"
              />
            </Field>
            <Field label="Device start serial" hint="Leave blank to continue automatically">
              <input
                type="number"
                min={0}
                className="input font-mono"
                value={deviceStart}
                onChange={(e) => setDeviceStart(e.target.value)}
                placeholder="auto"
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}

function EditCategoryModal({ category, onClose, onUpdated, hasDevices }) {
  const [name, setName] = useState('')
  const [productPrefix, setProductPrefix] = useState('')
  const [devicePrefix, setDevicePrefix] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!category) return
    setName(category.name || '')
    setProductPrefix(category.product_prefix || '')
    setDevicePrefix(category.device_prefix || '')
  }, [category])

  async function save() {
    if (!name.trim() || !productPrefix.trim() || !devicePrefix.trim()) {
      toast.error('Name, product prefix, and device prefix are required')
      return
    }
    setBusy(true)
    const t = toast.loading('Updating product categoryâ€¦')
    try {
      const payload = {
        name: name.trim(),
        product_prefix: productPrefix.trim(),
        device_prefix: devicePrefix.trim(),
        product_start: category.product_start,
        device_start: category.device_start,
      }
      await api.patch(`/product-categories/${category.id}`, payload)
      toast.success(`${payload.name} updated`, { id: t })
      onUpdated()
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(category)}
      onClose={() => { if (!busy) onClose() }}
      title="Edit product category"
      subtitle={hasDevices
        ? 'The category name can be changed. ID prefixes are locked because devices already use this numbering sequence.'
        : 'Update the category name and the prefixes used for future product and device IDs.'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Category name" required hint="Shown in dropdowns and on product cards">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Product ID prefix" required hint={hasDevices ? 'Locked after generation' : 'e.g. SL -> SL0001'}>
            <input
              className="input font-mono uppercase disabled:cursor-not-allowed disabled:opacity-60"
              value={productPrefix}
              onChange={(e) => setProductPrefix(e.target.value)}
              disabled={hasDevices}
            />
          </Field>
          <Field label="Device ID prefix" required hint={hasDevices ? 'Locked after generation' : 'e.g. SL -> SL0001'}>
            <input
              className="input font-mono disabled:cursor-not-allowed disabled:opacity-60"
              value={devicePrefix}
              onChange={(e) => setDevicePrefix(e.target.value)}
              disabled={hasDevices}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function AddCategoryModal({ open, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [productPrefix, setProductPrefix] = useState('')
  const [devicePrefix, setDevicePrefix] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [productStart, setProductStart] = useState('')
  const [deviceStart, setDeviceStart] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setName('')
    setProductPrefix('')
    setDevicePrefix('')
    setAdvanced(false)
    setProductStart('')
    setDeviceStart('')
  }

  function close() {
    if (busy) return
    onClose()
    setTimeout(reset, 200)
  }

  async function save() {
    if (!name.trim() || !productPrefix.trim() || !devicePrefix.trim()) {
      toast.error('Name, product prefix, and device prefix are required')
      return
    }
    setBusy(true)
    const t = toast.loading('Adding product category…')
    try {
      const payload = {
        name: name.trim(),
        product_prefix: productPrefix.trim(),
        device_prefix: devicePrefix.trim(),
      }
      if (advanced && productStart) payload.product_start = parseInt(productStart, 10)
      if (advanced && deviceStart) payload.device_start = parseInt(deviceStart, 10)
      await api.post('/product-categories', payload)
      toast.success(`${payload.name} added`, { id: t })
      onAdded()
      reset()
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a product category"
      subtitle="Defines a new hardware line — its prefixes drive the auto-numbered IDs (e.g. SL0001) once devices are generated."
      footer={
        <>
          <button className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
            Add category
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Category name" required hint="Shown in dropdowns and on the device page">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. SmartLock"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Product ID prefix" required hint="e.g. SL -> SL0001">
            <input
              className="input font-mono uppercase"
              value={productPrefix}
              onChange={(e) => setProductPrefix(e.target.value)}
              placeholder="SL"
            />
          </Field>
          <Field label="Device ID prefix" required hint="e.g. SL -> SL0001">
            <input
              className="input font-mono"
              value={devicePrefix}
              onChange={(e) => setDevicePrefix(e.target.value)}
              placeholder="SL"
            />
          </Field>
        </div>

        <button
          type="button"
          className="text-xs font-semibold text-brand-600 hover:underline"
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? 'Hide' : 'Show'} advanced options
        </button>

        {advanced && (
          <div className="grid grid-cols-2 gap-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5">
            <Field label="Product start serial" hint="Defaults to 1">
              <input
                type="number"
                min={0}
                className="input font-mono"
                value={productStart}
                onChange={(e) => setProductStart(e.target.value)}
                placeholder="1"
              />
            </Field>
            <Field label="Device start serial" hint="Defaults to 1">
              <input
                type="number"
                min={0}
                className="input font-mono"
                value={deviceStart}
                onChange={(e) => setDeviceStart(e.target.value)}
                placeholder="1"
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}
