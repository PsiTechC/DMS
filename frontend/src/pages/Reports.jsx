import { useState } from 'react'
import {
  FileBarChart, HardDrive, QrCode, MessageSquareWarning, ShieldAlert,
  Package, Building2, ScrollText, FileSpreadsheet, FileText, FileType,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { download, errMsg } from '../lib/api'
import { PageHeader, Spinner } from '../components/UI'

const REPORTS = [
  { type: 'devices', title: 'Device Report', desc: 'Every device with its full record — identity, assignment, warranty, and status.', icon: HardDrive, color: 'blue' },
  { type: 'qr_codes', title: 'QR Code Report', desc: 'All QR codes, their status, batch, scan count, and mapped device.', icon: QrCode, color: 'indigo' },
  { type: 'queries', title: 'Query Report', desc: 'All tickets with device details, reporter, priority, and resolution.', icon: MessageSquareWarning, color: 'amber' },
  { type: 'warranty', title: 'Warranty Expiry Report', desc: 'Every device with a warranty date, sorted by expiry with days remaining.', icon: ShieldAlert, color: 'red' },
  { type: 'inventory', title: 'Device Inventory Summary', desc: 'Device counts grouped by category and brand, split by status.', icon: Package, color: 'emerald' },
  { type: 'department_assets', title: 'Department-wise Assets', desc: 'Asset totals per department and company, with employee counts.', icon: Building2, color: 'violet' },
  { type: 'audit', title: 'Audit Log Report', desc: 'The full activity trail — who did what, when, and from which IP.', icon: ScrollText, color: 'slate' },
]

const FORMATS = [
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet, hint: '.xlsx' },
  { key: 'pdf', label: 'PDF', icon: FileText, hint: '.pdf' },
  { key: 'csv', label: 'CSV', icon: FileType, hint: '.csv' },
]

const COLOR_CLS = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function Reports() {
  // Tracks which specific report+format is in flight so only that button spins.
  const [busy, setBusy] = useState(null)

  async function run(type, format) {
    const key = `${type}-${format}`
    setBusy(key)

    const t = toast.loading(`Building your ${format.toUpperCase()}…`)
    try {
      await download(`/reports/${type}?format=${format}`)
      toast.success('Report downloaded', { id: t })
    } catch (e) {
      toast.error(errMsg(e), { id: t })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Export your data to Excel, PDF, or CSV." icon={FileBarChart} />

      <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 dark:text-slate-400">
        Reports include every record you have access to. To export a filtered subset,
        apply your filters on the Devices or Queries page and use the Export button there.
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.type} className="card flex flex-col p-5">
            <div className={clsx('flex h-11 w-11 items-center justify-center rounded-xl', COLOR_CLS[r.color])}>
              <r.icon className="h-5 w-5" />
            </div>

            <h3 className="mt-4 text-sm font-semibold">{r.title}</h3>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {r.desc}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {FORMATS.map((f) => {
                const key = `${r.type}-${f.key}`
                const isBusy = busy === key

                return (
                  <button
                    key={f.key}
                    onClick={() => run(r.type, f.key)}
                    disabled={!!busy}
                    className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-2.5 transition-all hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Download as ${f.label}`}
                  >
                    {isBusy ? (
                      <Spinner className="h-4 w-4 text-brand-600" />
                    ) : (
                      <f.icon className="h-4 w-4 text-slate-400" />
                    )}
                    <span className="text-[11px] font-semibold">{f.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
