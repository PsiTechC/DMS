import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  HardDrive, Search, SlidersHorizontal, X, Pencil, Trash2, ExternalLink,
  Package, LayoutGrid, List, FileDown,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg, download } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { DEVICE_STATUS, CONDITION } from '../lib/constants'
import {
  PageHeader, Badge, EmptyState, Pagination, TableSkeleton,
  ConfirmDialog, useDebounced, Field,
} from '../components/UI'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const FILTER_KEYS = ['category', 'brand', 'department', 'company', 'project', 'location']

export default function Devices() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()

  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState({})
  const [view, setView] = useState(localStorage.getItem('dms-device-view') || 'table')

  const [search, setSearch] = useState(params.get('search') || '')
  const [filters, setFilters] = useState(() => {
    const init = { status: params.get('status') || 'all', condition: 'all' }
    FILTER_KEYS.forEach((k) => (init[k] = params.get(k) || 'all'))
    return init
  })
  const [warrantyDays, setWarrantyDays] = useState(params.get('warranty_days') || '')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [confirmDel, setConfirmDel] = useState(null)

  const debounced = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = { search: debounced, page, limit: 20 }
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== 'all') query[k] = v
      })
      if (warrantyDays) query.warranty_days = warrantyDays

      const res = await api.get('/devices', { params: query })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, filters, warrantyDays, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/devices/filters/options').then((r) => setOptions(r.data.data || {})).catch(() => {})
  }, [])

  useEffect(() => { setPage(1) }, [debounced, filters, warrantyDays])
  useEffect(() => { localStorage.setItem('dms-device-view', view) }, [view])

  const activeCount =
    Object.values(filters).filter((v) => v && v !== 'all').length + (warrantyDays ? 1 : 0)

  function clearAll() {
    setSearch('')
    setWarrantyDays('')
    const cleared = { status: 'all', condition: 'all' }
    FILTER_KEYS.forEach((k) => (cleared[k] = 'all'))
    setFilters(cleared)
    setParams({}, { replace: true })
  }

  async function exportDevices(format) {
    const t = toast.loading(`Building ${format.toUpperCase()}…`)
    try {
      const query = new URLSearchParams({ format })
      if (debounced) query.set('search', debounced)
      Object.entries(filters).forEach(([k, v]) => v !== 'all' && query.set(k, v))
      await download(`/reports/devices?${query}`)
      toast.success('Report downloaded', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  return (
    <>
      <PageHeader title="Devices" subtitle={meta ? `${meta.total} device${meta.total === 1 ? '' : 's'} in your inventory` : 'Your asset inventory'} icon={HardDrive}>
        <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5">
          {[
            { key: 'table', icon: List },
            { key: 'grid', icon: LayoutGrid },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={clsx(
                'rounded-md p-2 transition-colors',
                view === v.key ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-600',
              )}
              aria-label={`${v.key} view`}
            >
              <v.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {isAdmin && (
          <button className="btn-secondary" onClick={() => exportDevices('excel')}>
            <FileDown className="h-4 w-4" />
            Export
          </button>
        )}
      </PageHeader>

      {/* Search + filter bar */}
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search device number, name, serial, QR, employee, brand, model, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className={clsx('btn-secondary shrink-0', activeCount && 'border-brand-500 text-brand-600')}
            onClick={() => setShowFilters((s) => !s)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>

          {(activeCount > 0 || search) && (
            <button className="btn-ghost shrink-0" onClick={clearAll}>
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Status">
              <select className="select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="all">All statuses</option>
                {Object.entries(DEVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>

            <Field label="Condition">
              <select className="select" value={filters.condition} onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))}>
                <option value="all">All conditions</option>
                {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>

            {FILTER_KEYS.map((key) => (
              <Field key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}>
                <select className="select" value={filters[key]} onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}>
                  <option value="all">All</option>
                  {(options[key] || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            ))}

            <Field label="Warranty">
              <select className="select" value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value)}>
                <option value="">Any</option>
                <option value="7">Expiring in 7 days</option>
                <option value="30">Expiring in 30 days</option>
                <option value="90">Expiring in 90 days</option>
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="card"><TableSkeleton rows={8} cols={6} /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HardDrive}
            title={search || activeCount ? 'No devices match your search' : 'No devices yet'}
            message={
              search || activeCount
                ? 'Try adjusting or clearing your filters.'
                : isAdmin
                  ? 'Generate QR codes, print the labels, then scan one to map your first device.'
                  : 'No devices have been added to the system yet.'
            }
            action={
              search || activeCount ? (
                <button className="btn-secondary" onClick={clearAll}>Clear filters</button>
              ) : isAdmin ? (
                <Link to="/qr-codes" className="btn-primary">Go to QR codes</Link>
              ) : null
            }
          />
        </div>
      ) : view === 'grid' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((d) => <DeviceCard key={d.id} device={d} />)}
          </div>
          <div className="card mt-4"><Pagination meta={meta} onPage={setPage} /></div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>QR Number</th>
                  <th>Category</th>
                  <th>Brand / Model</th>
                  <th>Assigned To</th>
                  <th>Location</th>
                  <th>Warranty</th>
                  <th>Status</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const cover = d.media?.[0]
                  return (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          {cover ? (
                            <img src={cover.url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                              <Package className="h-4 w-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{d.device_name}</div>
                            <div className="font-mono text-xs text-slate-400">{d.device_number}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {d.qr_code ? (
                          <Link to={`/device/${d.qr_code.asset_id}`} className="font-mono text-xs font-semibold text-brand-600 hover:underline">
                            {d.qr_code.asset_id}
                          </Link>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="text-sm text-slate-500">{d.category || '—'}</td>
                      <td className="text-sm">
                        <div className="truncate">{d.brand || '—'}</div>
                        <div className="truncate text-xs text-slate-400">{d.model}</div>
                      </td>
                      <td className="text-sm">
                        <div className="truncate">{d.assigned_employee || '—'}</div>
                        <div className="truncate text-xs text-slate-400">{d.department}</div>
                      </td>
                      <td className="max-w-[12rem] truncate text-sm text-slate-500">{d.location || '—'}</td>
                      <td><WarrantyCell expiry={d.warranty_expiry} /></td>
                      <td><Badge map={DEVICE_STATUS} value={d.status} /></td>
                      <td>
                        <div className="flex items-center gap-1">
                          {d.qr_code && (
                            <Link to={`/device/${d.qr_code.asset_id}`} className="btn-ghost btn-sm" title="View">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {isAdmin && d.qr_code && (
                            <>
                              <Link to={`/map/${d.qr_code.asset_id}?edit=${d.id}`} className="btn-ghost btn-sm" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                              <button onClick={() => setConfirmDel(d)} className="btn-ghost btn-sm text-slate-400 hover:text-red-600" title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPage={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete this device?"
        message={`"${confirmDel?.device_name}" (${confirmDel?.device_number}) and all its images, videos, and manuals will be permanently deleted. Its QR code ${confirmDel?.qr_code?.asset_id || ''} will become available again.`}
        confirmLabel="Delete device"
        onConfirm={async () => {
          try {
            await api.delete(`/devices/${confirmDel.id}`)
            toast.success('Device deleted')
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

function WarrantyCell({ expiry }) {
  if (!expiry) return <span className="text-xs text-slate-400">—</span>

  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000)
  const cls =
    days < 0 ? 'text-red-600 dark:text-red-400'
      : days <= 30 ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-500'

  return (
    <div>
      <div className="text-xs font-medium">{fmtDate(expiry)}</div>
      <div className={clsx('text-[10px] font-semibold', cls)}>
        {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
      </div>
    </div>
  )
}

function DeviceCard({ device: d }) {
  const cover = d.media?.[0]

  return (
    <Link to={d.qr_code ? `/device/${d.qr_code.asset_id}` : '#'} className="card card-hover overflow-hidden">
      <div className="flex h-36 items-center justify-center bg-slate-100 dark:bg-slate-800">
        {cover ? (
          <img src={cover.url} alt={d.device_name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-9 w-9 text-slate-300 dark:text-slate-600" />
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{d.device_name}</h3>
          <Badge map={DEVICE_STATUS} value={d.status} />
        </div>

        <p className="font-mono text-xs text-slate-400">{d.device_number}</p>

        <dl className="mt-3 space-y-1 text-xs">
          {[
            ['Brand', [d.brand, d.model].filter(Boolean).join(' ')],
            ['Assigned', d.assigned_employee],
            ['Location', d.location],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-400">{k}</dt>
              <dd className="min-w-0 flex-1 truncate font-medium">{v || '—'}</dd>
            </div>
          ))}
        </dl>

        {d.qr_code && (
          <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-2.5 font-mono text-[10px] text-brand-600">
            {d.qr_code.asset_id}
          </div>
        )}
      </div>
    </Link>
  )
}
