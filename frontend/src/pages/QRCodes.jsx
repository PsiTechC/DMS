import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  QrCode, Plus, Printer, Search, Download, Link2, Trash2, MoreHorizontal,
  Layers, FileDown, CheckSquare, Square, ExternalLink, Zap, ListOrdered,
  DownloadCloud,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg, download } from '../lib/api'
import { QR_STATUS } from '../lib/constants'
import {
  PageHeader, Badge, Modal, Field, Spinner, EmptyState, Pagination,
  TableSkeleton, ConfirmDialog, useDebounced, useClickOutside,
} from '../components/UI'

const PRESETS = [50, 100, 250, 500, 1000]

// DMS000042 -> 42. The serial is the numeric part of the asset ID, not the row
// position, so it stays the same no matter how the table is sorted or paged —
// which is what makes "print 1 to 15" mean something.
const serialOf = (assetId) => parseInt(String(assetId).replace(/\D/g, ''), 10) || 0

export default function QRCodes() {
  const [params, setParams] = useSearchParams()

  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [batches, setBatches] = useState([])

  const [search, setSearch] = useState(params.get('search') || '')
  const [status, setStatus] = useState(params.get('status') || 'all')
  const [batch, setBatch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search)

  const [selected, setSelected] = useState(new Set())
  const [genOpen, setGenOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/qr', {
        params: { search: debounced, status, batch_id: batch || undefined, page, limit: 20 },
      })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, status, batch, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/qr/batches').then((r) => setBatches(r.data.data || [])).catch(() => {})
  }, [])

  // Keep the URL in sync so filters survive a refresh and can be shared.
  useEffect(() => {
    const next = {}
    if (debounced) next.search = debounced
    if (status !== 'all') next.status = status
    setParams(next, { replace: true })
  }, [debounced, status, setParams])

  useEffect(() => { setPage(1) }, [debounced, status, batch])
  useEffect(() => { setSelected(new Set()) }, [rows])

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.asset_id))
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.asset_id)))

  async function printSelected() {
    if (!selected.size) return
    const t = toast.loading(`Building ${selected.size} label(s)…`)
    try {
      await download('/qr/print', { method: 'post', data: { asset_ids: [...selected] } })
      toast.success('Label sheet downloaded', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  // Every code in the system, in one sheet.
  async function downloadAll() {
    const t = toast.loading('Building a sheet with every QR code…')
    try {
      await download('/qr/print', { method: 'post', data: { all: true } })
      toast.success('All QR labels downloaded', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  // One code, one page, printed large — for replacing a damaged sticker.
  async function printOne(assetId) {
    const t = toast.loading(`Building ${assetId}…`)
    try {
      await download(`/qr/${assetId}/pdf`)
      toast.success(`${assetId} downloaded`, { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  return (
    <>
      <PageHeader
        title="QR Codes"
        subtitle={meta ? `${meta.total} code${meta.total === 1 ? '' : 's'} in your inventory` : 'Generate, print, and manage your QR label inventory.'}
        icon={QrCode}
      >
        <button className="btn-secondary" onClick={downloadAll} title="Download a label sheet with every QR code">
          <DownloadCloud className="h-4 w-4" />
          Download all
        </button>
        <button className="btn-secondary" onClick={() => setPrintOpen(true)}>
          <Printer className="h-4 w-4" />
          Print labels
        </button>
        <button className="btn-primary" onClick={() => setGenOpen(true)}>
          <Plus className="h-4 w-4" />
          Generate QR codes
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search by QR number or batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select className="select lg:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(QR_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select className="select lg:w-64" value={batch} onChange={(e) => setBatch(e.target.value)}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.from_asset}–{b.to_asset} ({b.quantity})
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 dark:bg-brand-500/10 px-4 py-2.5">
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              {selected.size} selected
            </span>
            <button className="btn-primary btn-sm" onClick={printSelected}>
              <Printer className="h-3.5 w-3.5" />
              Print selected
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title={debounced || status !== 'all' ? 'No QR codes match your filters' : 'No QR codes yet'}
            message={
              debounced || status !== 'all'
                ? 'Try clearing the search or choosing a different status.'
                : 'Generate your first batch of QR codes, print the labels, and stick them on your devices.'
            }
            action={
              debounced || status !== 'all' ? (
                <button className="btn-secondary" onClick={() => { setSearch(''); setStatus('all'); setBatch('') }}>
                  Clear filters
                </button>
              ) : (
                <button className="btn-primary" onClick={() => setGenOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Generate QR codes
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <button onClick={toggleAll} aria-label="Select all">
                        {allChecked ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                      </button>
                    </th>
                    <th className="w-14">S. No.</th>
                    <th>QR</th>
                    <th>QR Number</th>
                    <th>Status</th>
                    <th>Mapped Device</th>
                    <th>Scans</th>
                    <th>Generated</th>
                    <th className="w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button onClick={() => toggle(r.asset_id)} aria-label={`Select ${r.asset_id}`}>
                          {selected.has(r.asset_id) ? <CheckSquare className="h-4 w-4 text-brand-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                        </button>
                      </td>
                      <td className="font-mono text-xs font-semibold tabular-nums text-slate-400">
                        {serialOf(r.asset_id)}
                      </td>
                      <td>
                        <img
                          src={`/api/qr/${r.asset_id}/image?size=80`}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 rounded border border-slate-200 dark:border-slate-700 bg-white p-0.5"
                        />
                      </td>
                      <td>
                        <Link to={`/device/${r.asset_id}`} className="font-mono text-sm font-semibold text-brand-600 hover:underline">
                          {r.asset_id}
                        </Link>
                      </td>
                      <td><Badge map={QR_STATUS} value={r.status} /></td>
                      <td>
                        {r.device ? (
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{r.device.device_name}</div>
                            <div className="font-mono text-xs text-slate-400">{r.device.device_number}</div>
                          </div>
                        ) : (
                          <Link to={`/map/${r.asset_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                            <Link2 className="h-3 w-3" />
                            Map now
                          </Link>
                        )}
                      </td>
                      <td className="text-sm text-slate-500">{r.scan_count}</td>
                      <td className="text-xs text-slate-400">
                        {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => printOne(r.asset_id)}
                            className="btn-ghost btn-sm text-slate-400 hover:text-brand-600"
                            title={`Print ${r.asset_id} on its own page`}
                            aria-label={`Print ${r.asset_id}`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <RowMenu row={r} onDelete={setConfirmDel} onChanged={load} />
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

      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} onDone={() => { load(); api.get('/qr/batches').then((r) => setBatches(r.data.data || [])) }} />
      {/* Batch quantities, not meta.total: meta.total reflects the current
          search/filter, and the range hint must describe the whole inventory. */}
      <PrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        batches={batches}
        total={batches.reduce((sum, b) => sum + (b.quantity || 0), 0)}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete this QR code?"
        message={`${confirmDel?.asset_id} will be removed permanently. Any printed sticker with this code will stop working.`}
        confirmLabel="Delete QR"
        onConfirm={async () => {
          try {
            await api.delete(`/qr/${confirmDel.asset_id}`)
            toast.success(`${confirmDel.asset_id} deleted`)
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

/* ── Row menu ─────────────────────────────────────────────────────────── */

function RowMenu({ row, onDelete, onChanged }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))

  async function setStatus(status) {
    setOpen(false)
    try {
      await api.patch(`/qr/${row.asset_id}/status`, { status })
      toast.success(`${row.asset_id} marked ${status}`)
      onChanged()
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  async function unmap() {
    setOpen(false)
    try {
      await api.delete(`/qr/${row.asset_id}/map`)
      toast.success(`${row.asset_id} unmapped and available again`)
      onChanged()
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost btn-sm" aria-label="Actions">
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl">
          {/* Downloading this code's PDF now has its own print button in the
              row, so it is not repeated here. */}
          <MenuItem icon={ExternalLink} onClick={() => { setOpen(false); window.open(`/device/${row.asset_id}`, '_blank') }}>
            Open device page
          </MenuItem>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {row.status === 'mapped' ? (
            <MenuItem icon={Link2} onClick={unmap} danger>
              Unmap device
            </MenuItem>
          ) : (
            <MenuItem icon={Link2} onClick={() => { setOpen(false); window.location.href = `/map/${row.asset_id}` }}>
              Map to device
            </MenuItem>
          )}

          {row.status !== 'mapped' && (
            <>
              {row.status !== 'available' && <MenuItem onClick={() => setStatus('available')}>Mark available</MenuItem>}
              {row.status !== 'lost' && <MenuItem onClick={() => setStatus('lost')}>Mark lost</MenuItem>}
              {row.status !== 'inactive' && <MenuItem onClick={() => setStatus('inactive')}>Mark inactive</MenuItem>}
              {row.status !== 'replaced' && <MenuItem onClick={() => setStatus('replaced')}>Mark replaced</MenuItem>}

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <MenuItem icon={Trash2} onClick={() => { setOpen(false); onDelete(row) }} danger>
                Delete QR code
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, onClick, danger, children }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  )
}

/* ── Generate modal ───────────────────────────────────────────────────── */

function GenerateModal({ open, onClose, onDone }) {
  const [qty, setQty] = useState(100)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  function close() {
    setResult(null)
    setQty(100)
    setNotes('')
    onClose()
  }

  async function generate() {
    const n = Number(qty)
    if (!Number.isInteger(n) || n < 1 || n > 5000) {
      toast.error('Enter a whole number between 1 and 5000')
      return
    }

    setBusy(true)
    try {
      const res = await api.post('/qr/generate', { quantity: n, notes })
      setResult(res.data.data)
      toast.success(`${n} QR codes generated`)
      onDone()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="QR codes generated"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={close}>Done</button>
            <button
              className="btn-primary"
              onClick={async () => {
                const t = toast.loading('Building label sheet…')
                try {
                  await download('/qr/print', { method: 'post', data: { batch_id: result.batch_id } })
                  toast.success('Label sheet downloaded', { id: t })
                } catch (e) {
                  toast.error(errMsg(e), { id: t })
                }
              }}
            >
              <FileDown className="h-4 w-4" />
              Download labels
            </button>
          </>
        }
      >
        <div className="text-center py-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <Zap className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-base font-semibold">{result.quantity} QR codes are ready</h3>
          <p className="mt-1 text-sm text-slate-500">Download the label sheet and print it on sticker paper.</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">From</div>
              <div className="mt-0.5 font-mono text-sm font-bold">{result.from}</div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">To</div>
              <div className="mt-0.5 font-mono text-sm font-bold">{result.to}</div>
            </div>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : close}
      title="Generate QR codes"
      subtitle="Each code gets a unique asset ID and its own scannable URL."
      footer={
        <>
          <button className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={generate} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {busy ? 'Generating…' : `Generate ${qty || 0}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Quantity" required hint="Between 1 and 5000 per batch.">
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQty(p)}
                className={clsx(
                  'rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-all',
                  Number(qty) === p
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={5000}
            className="input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Custom quantity"
          />
        </Field>

        <Field label="Batch notes" hint="Optional — e.g. 'Q1 laptop rollout'.">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is this batch for?" />
        </Field>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Codes are numbered sequentially (DMS000001, DMS000002, …) and start with status{' '}
          <span className="font-semibold">Available</span>. Print the labels, stick them on
          devices, then scan each one to map it.
        </div>
      </div>
    </Modal>
  )
}

/* ── Print modal ──────────────────────────────────────────────────────── */

function PrintModal({ open, onClose, batches, total }) {
  const [mode, setMode] = useState('range')
  const [batchId, setBatchId] = useState('')
  const [status, setStatus] = useState('available')
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('15')
  const [busy, setBusy] = useState(false)

  const fromN = parseInt(from, 10)
  const toN = parseInt(to, 10)
  const rangeCount =
    Number.isFinite(fromN) && Number.isFinite(toN) && toN >= fromN ? toN - fromN + 1 : 0

  async function print() {
    let data
    if (mode === 'range') {
      if (!Number.isFinite(fromN) || !Number.isFinite(toN) || fromN < 1 || toN < 1) {
        toast.error('Enter a start and end serial number')
        return
      }
      if (toN < fromN) {
        toast.error('The end serial must not be lower than the start')
        return
      }
      data = { from_serial: fromN, to_serial: toN }
    } else if (mode === 'batch') {
      if (!batchId) {
        toast.error('Choose a batch to print')
        return
      }
      data = { batch_id: batchId }
    } else {
      data = { status }
    }

    setBusy(true)
    const t = toast.loading('Building label sheet…')
    try {
      await download('/qr/print', { method: 'post', data })
      toast.success('Label sheet downloaded', { id: t })
      onClose()
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Print QR labels"
      subtitle="Generates an A4 PDF with 28 labels per page and cut guides."
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={print} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
            Download PDF
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'range', label: 'Serial range', icon: ListOrdered, desc: 'e.g. 1 to 15' },
            { key: 'batch', label: 'By batch', icon: Layers, desc: 'A whole generated batch' },
            { key: 'status', label: 'By status', icon: QrCode, desc: 'Every code with a status' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={clsx(
                'rounded-xl border-2 p-4 text-left transition-all',
                mode === m.key
                  ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
              )}
            >
              <m.icon className={clsx('h-5 w-5', mode === m.key ? 'text-brand-600' : 'text-slate-400')} />
              <div className="mt-2 text-sm font-semibold">{m.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-400 leading-tight">{m.desc}</div>
            </button>
          ))}
        </div>

        {mode === 'range' && (
          <div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From serial number" required>
                <input
                  type="number"
                  min={1}
                  className="input font-mono"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="1"
                />
              </Field>
              <Field label="To serial number" required>
                <input
                  type="number"
                  min={1}
                  className="input font-mono"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="15"
                />
              </Field>
            </div>

            {/* Show the actual asset IDs, so the serial numbers are never
                ambiguous about which stickers come out. */}
            {rangeCount > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 dark:bg-brand-500/10 px-3.5 py-2.5">
                <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                  DMS{String(fromN).padStart(6, '0')}
                </span>
                <span className="text-xs text-slate-400">to</span>
                <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                  DMS{String(toN).padStart(6, '0')}
                </span>
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {rangeCount} label{rangeCount === 1 ? '' : 's'} · {Math.ceil(rangeCount / 28)} page
                  {Math.ceil(rangeCount / 28) === 1 ? '' : 's'}
                </span>
              </div>
            )}
            {total > 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                You have {total} code{total === 1 ? '' : 's'}: 1 to {total}.
              </p>
            )}
          </div>
        )}

        {mode === 'batch' && (
          <Field label="Batch" required>
            <select className="select" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Choose a batch…</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.from_asset} – {b.to_asset} · {b.quantity} codes · {b.mapped} mapped
                </option>
              ))}
            </select>
          </Field>
        )}

        {mode === 'status' && (
          <Field label="Status">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(QR_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3.5 text-xs text-slate-500 dark:text-slate-400">
          Print at 100% scale (no "fit to page") so the labels come out the right size.
          28 labels per A4 sheet, 2000 per PDF.
        </div>
      </div>
    </Modal>
  )
}
