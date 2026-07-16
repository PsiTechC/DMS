import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  MessageSquareWarning, Search, X, Paperclip, FileDown, Clock,
  CheckCheck, Ban, PlayCircle, ExternalLink, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg, download } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { QUERY_STATUS, PRIORITY } from '../lib/constants'
import {
  PageHeader, Badge, Modal, Field, Spinner, EmptyState,
  Pagination, TableSkeleton, DetailRow, useDebounced,
} from '../components/UI'

const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const NEXT_STATUS = [
  { value: 'open', label: 'Open', icon: Clock },
  { value: 'in_progress', label: 'In Progress', icon: PlayCircle },
  { value: 'closed', label: 'Closed', icon: CheckCheck },
  { value: 'rejected', label: 'Rejected', icon: Ban },
]

export default function Queries() {
  const { isAdmin, isClient, seesAllQueries } = useAuth()
  const [params, setParams] = useSearchParams()

  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(params.get('status') || 'all')
  const [priority, setPriority] = useState('all')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState(null)

  const debounced = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/queries', {
        params: { search: debounced, status, priority, page, limit: 20 },
      })
      setRows(res.data.data || [])
      setMeta(res.data.meta)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [debounced, status, priority, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [debounced, status, priority])
  useEffect(() => {
    setParams(status !== 'all' ? { status } : {}, { replace: true })
  }, [status, setParams])

  // Deep link from the notification email: /queries?open=<id> opens that
  // ticket's detail straight away. The id is captured at render, so the
  // param-sync effect above cannot clear it before this fetch runs.
  const openId = params.get('open')
  useEffect(() => {
    if (!openId) return
    let cancelled = false
    api
      .get(`/queries/${openId}`)
      .then((res) => { if (!cancelled) setActive(res.data.data) })
      .catch((e) => { if (!cancelled) toast.error(errMsg(e)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  async function exportQueries(format) {
    const t = toast.loading(`Building ${format.toUpperCase()}…`)
    try {
      const q = new URLSearchParams({ format })
      if (debounced) q.set('search', debounced)
      if (status !== 'all') q.set('status', status)
      if (priority !== 'all') q.set('priority', priority)
      await download(`/reports/queries?${q}`)
      toast.success('Report downloaded', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    }
  }

  const hasFilters = search || status !== 'all' || priority !== 'all'

  return (
    <>
      <PageHeader
        title="Queries"
        subtitle={
          isAdmin
            ? 'Every issue raised across your organisation.'
            : isClient
              ? 'Every issue raised across your organisation — read-only.'
              : 'Issues you have raised and their current status.'
        }
        icon={MessageSquareWarning}
      >
        {isAdmin && (
          <button className="btn-secondary" onClick={() => exportQueries('excel')}>
            <FileDown className="h-4 w-4" />
            Export
          </button>
        )}
      </PageHeader>

      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search ticket number, title, device, or reporter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select className="select lg:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(QUERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select className="select lg:w-44" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="all">All priorities</option>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {hasFilters && (
            <button className="btn-ghost shrink-0" onClick={() => { setSearch(''); setStatus('all'); setPriority('all') }}>
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title={hasFilters ? 'No queries match your filters' : 'No queries yet'}
            message={
              hasFilters
                ? 'Try a different search or status.'
                : seesAllQueries
                  ? 'When someone reports a device issue, their ticket will appear here.'
                  : 'Scan a device QR code and use "Raise a query" to report an issue.'
            }
            action={
              hasFilters ? (
                <button className="btn-secondary" onClick={() => { setSearch(''); setStatus('all'); setPriority('all') }}>Clear filters</button>
              ) : isClient ? null : (
                <Link to="/scan" className="btn-primary">Scan a QR code</Link>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Issue</th>
                    <th>Device</th>
                    {seesAllQueries && <th>Reported By</th>}
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Raised</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="cursor-pointer" onClick={() => setActive(q)}>
                      <td>
                        <span className="font-mono text-xs font-semibold text-brand-600">{q.ticket_number}</span>
                        {q.attachment_url && <Paperclip className="ml-1.5 inline h-3 w-3 text-slate-400" />}
                      </td>
                      <td className="max-w-[16rem]">
                        <div className="truncate text-sm font-medium">{q.title}</div>
                        <div className="truncate text-xs text-slate-400">{q.description}</div>
                      </td>
                      <td>
                        <div className="truncate text-sm">{q.device_name}</div>
                        <div className="font-mono text-xs text-slate-400">{q.qr_number}</div>
                      </td>
                      {seesAllQueries && (
                        <td>
                          <div className="truncate text-sm">{q.reported_by_name}</div>
                          <div className="truncate text-xs text-slate-400">{q.department}</div>
                        </td>
                      )}
                      <td><Badge map={PRIORITY} value={q.priority} /></td>
                      <td><Badge map={QUERY_STATUS} value={q.status} /></td>
                      <td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(q.created_at)}</td>
                      <td>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
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

      <QueryDetail
        query={active}
        onClose={() => setActive(null)}
        isAdmin={isAdmin}
        onUpdated={(updated) => {
          setActive(updated)
          load()
        }}
      />
    </>
  )
}

/* ── Detail drawer ────────────────────────────────────────────────────── */

function QueryDetail({ query, onClose, isAdmin, onUpdated }) {
  const [status, setStatus] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    if (query) {
      setStatus(query.status)
      setRemarks(query.admin_remarks || '')
      setPromoting(false)
    }
  }, [query])

  if (!query) return null

  const dirty = status !== query.status || remarks !== (query.admin_remarks || '')

  async function save() {
    setSaving(true)
    try {
      const res = await api.patch(`/queries/${query.id}/status`, { status, admin_remarks: remarks })
      toast.success(res.data.message)
      onUpdated(res.data.data)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // Turn a resolved ticket into an FAQ on its device — this is where most FAQs
  // should come from: a real question, with the answer that actually worked.
  async function promote() {
    setPromoting(true)
    try {
      const res = await api.post(`/queries/${query.id}/promote-faq`)
      toast.success(res.data.data.message)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setPromoting(false)
    }
  }

  return (
    <Modal
      open={!!query}
      onClose={onClose}
      title={query.ticket_number}
      subtitle={`Raised ${fmtDateTime(query.created_at)}`}
      size="lg"
      footer={
        isAdmin ? (
          <>
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Close</button>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving && <Spinner className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Update ticket'}
            </button>
          </>
        ) : (
          <button className="btn-secondary" onClick={onClose}>Close</button>
        )
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge map={QUERY_STATUS} value={query.status} />
          <Badge map={PRIORITY} value={query.priority} />
          {query.resolved_at && (
            <span className="text-xs text-slate-400">Resolved {fmtDateTime(query.resolved_at)}</span>
          )}
        </div>

        <div className="rounded-xl border-l-4 border-brand-600 bg-slate-50 dark:bg-slate-800/50 p-4">
          <h3 className="text-base font-semibold">{query.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {query.description}
          </p>
          {query.attachment_url && (
            <a href={query.attachment_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm mt-3">
              <Paperclip className="h-3.5 w-3.5" />
              View attachment
            </a>
          )}
        </div>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Device</h4>
            <dl>
              <DetailRow label="Device Number" value={query.device_number} mono />
              <DetailRow label="QR Number" value={query.qr_number} mono />
              <DetailRow label="Device Name" value={query.device_name} />
              <DetailRow label="Brand / Model" value={[query.brand, query.model].filter(Boolean).join(' ')} />
              <DetailRow label="Serial Number" value={query.serial_number} mono />
              <DetailRow label="Location" value={query.location} />
            </dl>
          </div>

          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reported by</h4>
            <dl>
              <DetailRow label="Name" value={query.reported_by_name} />
              <DetailRow label="Employee ID" value={query.reported_by_emp_id} />
              <DetailRow label="Email" value={query.reported_by_email} />
              <DetailRow label="Department" value={query.department} />
              <DetailRow label="Company" value={query.company} />
              <DetailRow label="Project" value={query.project} />
            </dl>
          </div>
        </div>

        {isAdmin ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <h4 className="mb-3 text-sm font-semibold">Update this ticket</h4>

            <Field label="Status">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {NEXT_STATUS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2.5 text-xs font-semibold transition-all',
                      status === s.value
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300',
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Admin remarks / your reply"
              className="mt-4"
              hint="Both the reporter and the admin inbox are emailed when you save a status change."
            >
              <textarea
                rows={3}
                className="input resize-y"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="What action was taken?"
              />
            </Field>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={promote}
                disabled={promoting || !query.admin_remarks}
                title={
                  query.admin_remarks
                    ? "Publish this Q&A on the device's FAQ"
                    : 'Add remarks and save first — they become the FAQ answer'
                }
              >
                {promoting ? <Spinner className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
                Add to device FAQ
              </button>
              <span className="text-[11px] text-slate-400">
                {query.admin_remarks
                  ? 'Publishes this question and your remarks on the device page, so the next person finds the answer without raising a ticket.'
                  : 'Save your remarks first — they become the published answer.'}
              </span>
            </div>
          </div>
        ) : (
          query.admin_remarks && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin remarks</h4>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{query.admin_remarks}</p>
            </div>
          )
        )}
      </div>
    </Modal>
  )
}
