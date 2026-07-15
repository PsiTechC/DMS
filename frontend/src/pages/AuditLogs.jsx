import { useEffect, useState, useCallback } from 'react'
import { ScrollText, Search, X, FileDown, ScanLine, Activity } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg, download } from '../lib/api'
import {
  PageHeader, EmptyState, Pagination, TableSkeleton, useDebounced,
} from '../components/UI'

// Colour by what the action does, not by which entity it touches — a reviewer
// scanning the log cares about "was something destroyed?" first.
const ACTION_CLS = (action) => {
  if (action.includes('DELETE')) return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
  if (action.includes('CREATE') || action.includes('GENERATED')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
  if (action.includes('UPDATE') || action.includes('CHANGED') || action.includes('MAPPED')) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
  if (action.includes('LOGIN')) return 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'
  if (action.includes('SCAN')) return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
}

const humanise = (a) => a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

const fmt = (d) => new Date(d)

export default function AuditLogs() {
  const [tab, setTab] = useState('audit')

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every action taken in the system, with who did it and from where." icon={ScrollText} />

      <div className="card mb-4 flex gap-1 p-1.5">
        {[
          { key: 'audit', label: 'Activity log', icon: Activity },
          { key: 'scans', label: 'QR scan history', icon: ScanLine },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === t.key
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'audit' ? <AuditTab /> : <ScansTab />}
    </>
  )
}

function AuditTab() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actions, setActions] = useState([])

  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const debounced = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/audit', {
        params: { search: debounced, action, from: from || undefined, to: to || undefined, page, limit: 25 },
      })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, action, from, to, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [debounced, action, from, to])
  useEffect(() => {
    api.get('/audit/actions').then((r) => setActions(r.data.data.actions || [])).catch(() => {})
  }, [])

  const hasFilters = search || action !== 'all' || from || to

  async function exportLogs() {
    const t = toast.loading('Building Excel…')
    try {
      const q = new URLSearchParams({ format: 'excel' })
      if (debounced) q.set('search', debounced)
      if (action !== 'all') q.set('action', action)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      await download(`/reports/audit?${q}`)
      toast.success('Audit log exported', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search user, action, reference, or IP…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <select className="select lg:w-52" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{humanise(a)}</option>)}
          </select>

          <input type="date" className="input lg:w-40" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <input type="date" className="input lg:w-40" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />

          {hasFilters && (
            <button className="btn-ghost shrink-0" onClick={() => { setSearch(''); setAction('all'); setFrom(''); setTo('') }}>
              <X className="h-4 w-4" />
            </button>
          )}

          <button className="btn-secondary shrink-0" onClick={exportLogs}>
            <FileDown className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={hasFilters ? 'No log entries match your filters' : 'No activity logged yet'}
            message={hasFilters ? 'Try widening your date range or clearing the search.' : 'Actions taken in the system will be recorded here.'}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Reference</th>
                    <th>Details</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {fmt(l.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-400">
                        {fmt(l.created_at).toLocaleTimeString('en-GB')}
                      </td>
                      <td>
                        <div className="truncate text-sm font-medium">{l.user_name}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">{l.user_role}</div>
                      </td>
                      <td>
                        <span className={clsx('badge', ACTION_CLS(l.action))}>{humanise(l.action)}</span>
                      </td>
                      <td className="font-mono text-xs text-slate-500">{l.entity_id || '—'}</td>
                      <td className="max-w-[18rem]">
                        <div className="truncate text-xs text-slate-400" title={l.details}>{l.details || '—'}</div>
                      </td>
                      <td className="font-mono text-xs text-slate-400">{l.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </div>
    </>
  )
}

function ScansTab() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const debounced = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/scans', { params: { search: debounced, page, limit: 25 } })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [debounced])

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by QR number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScanLine} title="No scans recorded" message="Every QR code scan will be logged here with its time, IP, and whether the code was mapped." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>QR Number</th>
                    <th>Result</th>
                    <th>IP Address</th>
                    <th>Device / Browser</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {fmt(s.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="font-mono text-xs font-semibold text-brand-600">{s.asset_id}</td>
                      <td>
                        <span className={clsx('badge', s.was_mapped
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400')}
                        >
                          {s.was_mapped ? 'Device shown' : 'Unmapped'}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-slate-400">{s.ip_address || '—'}</td>
                      <td className="max-w-[24rem]">
                        <div className="truncate text-xs text-slate-400" title={s.user_agent}>{s.user_agent || '—'}</div>
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
    </>
  )
}
