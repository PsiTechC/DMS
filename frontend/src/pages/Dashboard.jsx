import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  LayoutDashboard, HardDrive, QrCode, CheckCircle2, Link2, Activity, Wrench,
  ShieldAlert, MessageSquareWarning, Clock, CheckCheck, ScanLine, CalendarDays,
  TrendingUp, ArrowRight, Users,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { CHART_COLORS, QUERY_STATUS, DEVICE_STATUS, PRIORITY } from '../lib/constants'
import { PageHeader, Badge, CardSkeleton, EmptyState } from '../components/UI'

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { isDark } = useTheme()

  const [stats, setStats] = useState(null)
  const [charts, setCharts] = useState(null)
  const [recent, setRecent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/charts'),
      api.get('/dashboard/recent'),
    ])
      .then(([s, c, r]) => {
        if (cancelled) return
        setStats(s.data.data)
        setCharts(c.data.data)
        setRecent(r.data.data)
      })
      .catch((e) => !cancelled && toastOnce(errMsg(e)))
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  if (loading) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Loading your overview…" icon={LayoutDashboard} />
        <div className="space-y-6">
          <CardSkeleton count={4} />
          <CardSkeleton count={4} />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card h-80 skeleton" />
            <div className="card h-80 skeleton" />
          </div>
        </div>
      </>
    )
  }

  if (!stats) {
    return (
      <div className="card">
        <EmptyState
          icon={Activity}
          title="Could not load the dashboard"
          message="The server did not respond. Check that the backend is running, then reload."
          action={<button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>}
        />
      </div>
    )
  }

  // Cards are role-filtered: a client has no business seeing QR inventory.
  const allCards = [
    { key: 'total_devices', label: 'Total Devices', icon: HardDrive, color: 'blue', to: '/devices' },
    { key: 'total_qr_codes', label: 'Total QR Codes', icon: QrCode, color: 'indigo', to: '/qr-codes', admin: true },
    { key: 'available_qr_codes', label: 'Available QR', icon: CheckCircle2, color: 'emerald', to: '/qr-codes?status=available', admin: true },
    { key: 'mapped_qr_codes', label: 'Mapped QR', icon: Link2, color: 'violet', to: '/qr-codes?status=mapped', admin: true },
    { key: 'active_devices', label: 'Active Devices', icon: Activity, color: 'emerald', to: '/devices?status=active' },
    { key: 'maintenance_devices', label: 'Under Maintenance', icon: Wrench, color: 'amber', to: '/devices?status=maintenance' },
    { key: 'warranty_expiring_soon', label: 'Warranty Expiring', icon: ShieldAlert, color: 'red', to: '/devices?warranty_days=30', hint: 'Next 30 days' },
    { key: 'open_queries', label: 'Open Queries', icon: MessageSquareWarning, color: 'blue', to: '/queries?status=open' },
    { key: 'in_progress_queries', label: 'In Progress', icon: Clock, color: 'amber', to: '/queries?status=in_progress' },
    { key: 'closed_queries', label: 'Closed Queries', icon: CheckCheck, color: 'emerald', to: '/queries?status=closed' },
    { key: 'today_scans', label: "Today's Scans", icon: ScanLine, color: 'violet', admin: true },
    { key: 'today_queries', label: "Today's Queries", icon: CalendarDays, color: 'indigo' },
  ]
  const cards = allCards.filter((c) => !c.admin || isAdmin)

  const axis = isDark ? '#64748b' : '#94a3b8'
  const grid = isDark ? '#1e293b' : '#e2e8f0'

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        icon={LayoutDashboard}
      >
        {isAdmin && (
          <>
            <Link to="/qr-codes" className="btn-secondary">
              <QrCode className="h-4 w-4" />
              Generate QR
            </Link>
            <Link to="/reports" className="btn-primary">
              <TrendingUp className="h-4 w-4" />
              Reports
            </Link>
          </>
        )}
      </PageHeader>

      {/* ── KPI cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        {cards.map((c, i) => (
          <StatCard key={c.key} {...c} value={stats[c.key] ?? 0} index={i} />
        ))}
      </div>

      {/* ── Charts ───────────────────────────────────────────────────── */}
      {charts && (
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <ChartCard title="Monthly Queries" subtitle="Ticket volume over the last 12 months" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={charts.monthly_queries}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gClosed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="month" stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2} fill="url(#gTotal)" />
                <Area type="monotone" dataKey="closed" name="Closed" stroke="#10b981" strokeWidth={2} fill="url(#gClosed)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Device Category Distribution" subtitle="Devices grouped by category">
            <DonutOrEmpty data={charts.category_distribution} />
          </ChartCard>

          <ChartCard title="Device Status" subtitle="Current lifecycle state of every device">
            <DonutOrEmpty data={charts.device_status} labelMap={DEVICE_STATUS} />
          </ChartCard>

          <ChartCard title="Brand Distribution" subtitle="Top brands in your inventory">
            <BarOrEmpty data={charts.brand_distribution} axis={axis} grid={grid} color="#2563eb" />
          </ChartCard>

          <ChartCard title="Department-wise Devices" subtitle="Assets held per department">
            <BarOrEmpty data={charts.department_distribution} axis={axis} grid={grid} color="#8b5cf6" />
          </ChartCard>

          <ChartCard title="Company-wise Devices" subtitle="Assets held per company">
            <BarOrEmpty data={charts.company_distribution} axis={axis} grid={grid} color="#06b6d4" />
          </ChartCard>

          <ChartCard title="Warranty Expiry Timeline" subtitle="Devices whose warranty lapses each month">
            {charts.warranty_timeline?.some((w) => w.count > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={charts.warranty_timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: isDark ? '#1e293b60' : '#f1f5f9' }} />
                  <Bar dataKey="count" name="Devices" radius={[6, 6, 0, 0]}>
                    {charts.warranty_timeline.map((entry, i) => (
                      <Cell key={i} fill={entry.label === 'Expired' ? '#ef4444' : i === 1 ? '#f59e0b' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty message="No warranty dates recorded yet." />
            )}
          </ChartCard>

          {isAdmin && (
            <ChartCard title="QR Scans" subtitle="Scan activity over the last 14 days">
              {charts.scans_daily?.some((s) => s.count > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={charts.scans_daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="day" stroke={axis} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="count" name="Scans" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="No QR codes have been scanned yet." />
              )}
            </ChartCard>
          )}
        </div>
      )}

      {/* ── Activity panels ──────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent Queries" to="/queries" icon={MessageSquareWarning}>
          {recent?.recent_queries?.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.recent_queries.map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{q.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono">{q.ticket_number}</span>
                      <span>·</span>
                      <span className="truncate">{q.device_name}</span>
                    </div>
                  </div>
                  <Badge map={PRIORITY} value={q.priority} />
                  <Badge map={QUERY_STATUS} value={q.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={MessageSquareWarning} title="No queries yet" message="Raised queries will appear here." />
          )}
        </Panel>

        {isAdmin && recent?.warranty_expiring?.length ? (
          <Panel title="Warranty Expiring Soon" to="/devices?warranty_days=30" icon={ShieldAlert}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.warranty_expiring.map((d) => {
                const days = Math.ceil((new Date(d.warranty_expiry) - new Date()) / 86400000)
                return (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.device_name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">{d.device_number}</div>
                    </div>
                    <span className={clsx('badge', days <= 7 ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400')}>
                      {days}d left
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        ) : (
          <Panel title="Recently Added Devices" to="/devices" icon={HardDrive}>
            {recent?.recent_devices?.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.recent_devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.device_name}</div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-xs text-slate-400">
                        <span>{d.device_number}</span>
                        {d.qr_code && <><span>·</span><span>{d.qr_code.asset_id}</span></>}
                      </div>
                    </div>
                    <Badge map={DEVICE_STATUS} value={d.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={HardDrive} title="No devices yet" message="Generate QR codes and map them to start building your inventory." />
            )}
          </Panel>
        )}
      </div>
    </>
  )
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

const COLOR_CLS = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
}

function StatCard({ label, value, icon: Icon, color, to, hint, index }) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className={clsx('card p-4 sm:p-5 h-full', to && 'card-hover cursor-pointer')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight">{value.toLocaleString()}</p>
          {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
        </div>
        <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', COLOR_CLS[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function ChartCard({ title, subtitle, children, className }) {
  return (
    <div className={clsx('card p-5', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <span className="font-semibold text-slate-700 dark:text-slate-200">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function ChartEmpty({ message }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-slate-400">
      <Activity className="h-7 w-7" />
      <p className="text-xs">{message}</p>
    </div>
  )
}

function DonutOrEmpty({ data, labelMap }) {
  if (!data?.length) return <ChartEmpty message="No data yet — map some devices to see this chart." />

  const shaped = data.map((d) => ({
    ...d,
    name: labelMap?.[d.name]?.label || d.name,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={shaped}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
        >
          {shaped.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function BarOrEmpty({ data, axis, grid, color }) {
  if (!data?.length) return <ChartEmpty message="No data yet — map some devices to see this chart." />

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
        <XAxis type="number" stroke={axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" stroke={axis} fontSize={11} width={110} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
        <Bar dataKey="value" name="Devices" fill={color} radius={[0, 5, 5, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function Panel({ title, to, icon: Icon, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {to && (
          <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// All three dashboard calls fail together when the server is down; only tell
// the user once.
let toasted = false
function toastOnce(msg) {
  if (toasted) return
  toasted = true
  toast.error(msg)
  setTimeout(() => { toasted = false }, 3000)
}
