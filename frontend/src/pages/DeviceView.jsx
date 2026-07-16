import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  QrCode, AlertTriangle, LogIn, ArrowLeft, ImageIcon, Video, FileText, Wrench,
  ShieldCheck, Info, Cpu, Download, MessageSquarePlus, Package, CalendarClock,
  MapPin, Building2, User, Tag, Pencil, ExternalLink, PlayCircle, ChevronLeft,
  ChevronRight, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { DEVICE_STATUS, CONDITION } from '../lib/constants'
import { Badge, PageLoader, DetailRow, EmptyState, Modal } from '../components/UI'
import RaiseQueryModal from '../components/RaiseQueryModal'
import DeviceFAQ from '../components/DeviceFAQ'

// FAQ sits second: after a scan, "has someone already answered this?" is the
// question most people have, and it deflects duplicate tickets.
const TABS = [
  { key: 'overview', label: 'Overview', icon: Info },
  { key: 'faq', label: 'FAQ', icon: HelpCircle },
  { key: 'specs', label: 'Specifications', icon: Cpu },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'videos', label: 'Videos', icon: Video },
  { key: 'manuals', label: 'PDF Manuals', icon: FileText },
  { key: 'service', label: 'Service History', icon: Wrench },
  { key: 'warranty', label: 'Warranty', icon: ShieldCheck },
]

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export default function DeviceView() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, canRaiseQuery, user } = useAuth()

  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [faqs, setFaqs] = useState([])
  const [tab, setTab] = useState('overview')
  const [queryOpen, setQueryOpen] = useState(false)
  const [loginPrompt, setLoginPrompt] = useState(false)

  const deviceId = state.data?.device?.id

  // FAQs load on their own endpoint rather than from /scan, for two reasons:
  // re-fetching /scan would count a fresh scan every time an admin edits an
  // FAQ, and /scan only ever returns published entries — an admin needs to see
  // their drafts too.
  const loadFaqs = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await api.get(`/devices/${id}/faqs`)
      setFaqs(res.data.data || [])
    } catch {
      // Non-fatal: the rest of the device page is still worth showing.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, data: null, error: null })
    setFaqs([])

    api
      .get(`/scan/${assetId}`)
      .then((res) => {
        if (cancelled) return
        setState({ loading: false, data: res.data.data, error: null })
        // Seed from the scan payload so the tab count is right immediately,
        // then refresh for role-correct results.
        setFaqs(res.data.data?.device?.faqs || [])
        loadFaqs(res.data.data?.device?.id)
      })
      .catch((e) => !cancelled && setState({ loading: false, data: null, error: errMsg(e) }))

    return () => {
      cancelled = true
    }
  }, [assetId, loadFaqs])

  if (state.loading) return <PublicShell><PageLoader label={`Looking up ${assetId}…`} /></PublicShell>

  if (state.error) {
    return (
      <PublicShell>
        <div className="card p-10">
          <EmptyState
            icon={AlertTriangle}
            title="QR code not found"
            message={state.error}
            action={
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn-primary">
                {isAuthenticated ? 'Go to dashboard' : 'Go to login'}
              </Link>
            }
          />
        </div>
      </PublicShell>
    )
  }

  const { mapped, device, status } = state.data

  // ── The unmapped first-scan screen ─────────────────────────────────
  if (!mapped) {
    return (
      <PublicShell>
        <NotAssigned assetId={assetId} status={status} message={state.data.message} isAdmin={isAdmin} />
      </PublicShell>
    )
  }

  const images = device.media?.filter((m) => m.type === 'image') || []
  const videos = device.media?.filter((m) => m.type === 'video') || []
  const manuals = device.media?.filter((m) => m.type === 'manual') || []
  const cover = images.find((i) => i.is_primary) || images[0]

  const counts = {
    images: images.length,
    videos: videos.length,
    manuals: manuals.length,
    service: device.service_history?.length || 0,
    faq: isAdmin ? faqs.length : faqs.filter((f) => f.is_published).length,
  }

  function handleRaiseQuery() {
    if (!isAuthenticated) {
      setLoginPrompt(true)
      return
    }
    if (!canRaiseQuery) {
      toast.error('Client accounts have read-only access and cannot raise queries.')
      return
    }
    setQueryOpen(true)
  }

  return (
    <PublicShell>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden mb-6"
      >
        <div className="flex flex-col md:flex-row">
          <div className="md:w-72 shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-4">
            {cover ? (
              <img
                src={cover.url}
                alt={device.device_name}
                className="max-h-56 w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-48 w-full flex-col items-center justify-center gap-2 text-slate-400">
                <Package className="h-10 w-10" />
                <span className="text-xs">No image uploaded</span>
              </div>
            )}
          </div>

          <div className="flex-1 p-6 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge map={DEVICE_STATUS} value={device.status} />
              {device.condition && <Badge map={CONDITION} value={device.condition} />}
              <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                <QrCode className="h-3 w-3" />
                {assetId}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">{device.device_name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{device.device_number}</p>

            <div className="mt-5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              <HeroFact icon={Tag} label="Brand & Model" value={[device.brand, device.model].filter(Boolean).join(' ')} />
              <HeroFact icon={Building2} label="Company" value={device.company} />
              <HeroFact icon={MapPin} label="Location" value={device.location} />
              <HeroFact icon={User} label="Assigned to" value={device.assigned_employee} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={handleRaiseQuery} className="btn-primary">
                <MessageSquarePlus className="h-4 w-4" />
                Raise a query
              </button>

              {/* Point at the FAQ before the ticket form: the answer may already
                  be there, which saves the user waiting and the admin a duplicate. */}
              {counts.faq > 0 && (
                <button onClick={() => setTab('faq')} className="btn-secondary">
                  <HelpCircle className="h-4 w-4" />
                  FAQ
                  <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold">
                    {counts.faq}
                  </span>
                </button>
              )}

              {isAdmin && (
                <button onClick={() => navigate(`/map/${assetId}?edit=${device.id}`)} className="btn-secondary">
                  <Pencil className="h-4 w-4" />
                  Edit device
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 px-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const n = counts[key]
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  tab === key
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {n > 0 && (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {tab === 'overview' && <OverviewTab device={device} assetId={assetId} />}
          {tab === 'faq' && (
            <DeviceFAQ
              deviceId={device.id}
              faqs={faqs}
              isAdmin={isAdmin}
              onChanged={() => loadFaqs(device.id)}
            />
          )}
          {tab === 'specs' && <SpecsTab device={device} />}
          {tab === 'images' && <ImagesTab images={images} />}
          {tab === 'videos' && <VideosTab videos={videos} />}
          {tab === 'manuals' && <ManualsTab manuals={manuals} />}
          {tab === 'service' && <ServiceTab records={device.service_history} />}
          {tab === 'warranty' && <WarrantyTab device={device} />}
        </div>
      </div>

      <RaiseQueryModal
        open={queryOpen}
        onClose={() => setQueryOpen(false)}
        device={device}
        assetId={assetId}
        user={user}
      />

      <Modal
        open={loginPrompt}
        onClose={() => setLoginPrompt(false)}
        title="Login required"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setLoginPrompt(false)}>
              Cancel
            </button>
            <Link to={`/login?next=/device/${assetId}`} className="btn-primary">
              <LogIn className="h-4 w-4" />
              Go to login
            </Link>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Please login to raise a query. Your name, employee ID, and department will be
          attached to the ticket automatically.
        </p>
      </Modal>
    </PublicShell>
  )
}

/* ── Unmapped screen ──────────────────────────────────────────────────── */

function NotAssigned({ assetId, status, message, isAdmin }) {
  const inactive = ['lost', 'inactive', 'replaced'].includes(status)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div
        className={clsx(
          'px-6 py-10 text-center',
          inactive
            ? 'bg-gradient-to-b from-red-50 to-transparent dark:from-red-500/10'
            : 'bg-gradient-to-b from-amber-50 to-transparent dark:from-amber-500/10',
        )}
      >
        <div
          className={clsx(
            'mx-auto flex h-16 w-16 items-center justify-center rounded-2xl',
            inactive ? 'bg-red-100 dark:bg-red-500/15' : 'bg-amber-100 dark:bg-amber-500/15',
          )}
        >
          <AlertTriangle className={clsx('h-8 w-8', inactive ? 'text-red-600' : 'text-amber-600')} />
        </div>

        <h1 className="mt-5 text-xl font-bold">
          {inactive ? 'This QR code is not in use' : 'This QR is not assigned to any device'}
        </h1>

        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {message}
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
          <QrCode className="h-4 w-4 text-slate-400" />
          <span className="font-mono text-sm font-semibold">{assetId}</span>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 p-6">
        {inactive ? (
          <p className="text-center text-sm text-slate-500">
            Contact your administrator if you believe this is a mistake.
          </p>
        ) : isAdmin ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              You are signed in as an admin. Map this QR code to a device now.
            </p>
            <Link to={`/map/${assetId}`} className="btn-primary">
              <QrCode className="h-4 w-4" />
              Map this QR to a device
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Only an administrator can assign a device to this QR code.
            </p>
            <Link to={`/login?next=/device/${assetId}`} className="btn-primary">
              <LogIn className="h-4 w-4" />
              Login as Admin
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

function OverviewTab({ device, assetId }) {
  return (
    <div className="grid gap-x-10 lg:grid-cols-2">
      <dl>
        <DetailRow label="Device Number" value={device.device_number} mono />
        <DetailRow label="QR Number" value={assetId} mono />
        <DetailRow label="Device Name" value={device.device_name} />
        <DetailRow label="Category" value={device.category} />
        <DetailRow label="Brand" value={device.brand} />
        <DetailRow label="Model" value={device.model} />
        <DetailRow label="Serial Number" value={device.serial_number} mono />
        <DetailRow label="Vendor" value={device.vendor} />
      </dl>
      <dl>
        <DetailRow label="Company" value={device.company} />
        <DetailRow label="Project" value={device.project} />
        <DetailRow label="Department" value={device.department} />
        <DetailRow label="Assigned Employee" value={device.assigned_employee} />
        <DetailRow label="Location" value={device.location} />
        <DetailRow label="Purchase Date" value={fmtDate(device.purchase_date)} />
        <DetailRow label="Warranty Expiry" value={fmtDate(device.warranty_expiry)} />
        <DetailRow
          label="Device Status"
          value={<Badge map={DEVICE_STATUS} value={device.status} />}
        />
      </dl>

      {device.description && (
        <div className="lg:col-span-2 mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Description
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {device.description}
          </p>
        </div>
      )}
    </div>
  )
}

function SpecsTab({ device }) {
  let specs = []
  try {
    const parsed = JSON.parse(device.specifications || '[]')
    if (Array.isArray(parsed)) specs = parsed.filter((s) => s.key)
  } catch {
    // Legacy or free-text specifications — show them as-is rather than losing them.
    if (device.specifications?.trim()) {
      return (
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-sans leading-relaxed">
          {device.specifications}
        </pre>
      )
    }
  }

  if (!specs.length) {
    return <EmptyState icon={Cpu} title="No specifications recorded" message="An admin can add technical specifications when editing this device." />
  }

  return (
    <div className="grid gap-x-10 sm:grid-cols-2">
      {specs.map((s, i) => (
        <DetailRow key={i} label={s.key} value={s.value} />
      ))}
    </div>
  )
}

function ImagesTab({ images }) {
  const [active, setActive] = useState(null)

  if (!images.length) {
    return <EmptyState icon={ImageIcon} title="No images" message="No photos have been uploaded for this device yet." />
  }

  const idx = images.findIndex((i) => i.id === active?.id)
  const go = (delta) => setActive(images[(idx + delta + images.length) % images.length])

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => setActive(img)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800"
          >
            <img
              src={img.url}
              alt={img.file_name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {img.is_primary && (
              <span className="absolute left-2 top-2 rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                PRIMARY
              </span>
            )}
          </button>
        ))}
      </div>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.file_name} size="xl">
        {active && (
          <div className="relative">
            <img src={active.url} alt={active.file_name} className="mx-auto max-h-[65vh] rounded-lg object-contain" />
            {images.length > 1 && (
              <>
                <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function VideosTab({ videos }) {
  if (!videos.length) {
    return <EmptyState icon={Video} title="No videos" message="No demonstration or installation videos have been uploaded." />
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {videos.map((v) => (
        <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <video
            controls
            preload="metadata"
            className="aspect-video w-full bg-black"
            src={v.url}
          >
            Your browser does not support embedded video.
          </video>
          <div className="flex items-center gap-2 px-4 py-3">
            <PlayCircle className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-sm font-medium">{v.file_name}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {(v.size_bytes / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ManualsTab({ manuals }) {
  if (!manuals.length) {
    return <EmptyState icon={FileText} title="No manuals" message="No PDF manuals have been uploaded for this device." />
  }

  return (
    <div className="space-y-3">
      {manuals.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/10">
            <FileText className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{m.file_name}</div>
            <div className="text-xs text-slate-400">{(m.size_bytes / 1024 / 1024).toFixed(2)} MB · PDF</div>
          </div>
          <a href={m.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm shrink-0">
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </a>
          <a href={m.url} download={m.file_name} className="btn-primary btn-sm shrink-0">
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      ))}
    </div>
  )
}

function ServiceTab({ records }) {
  if (!records?.length) {
    return <EmptyState icon={Wrench} title="No service history" message="No maintenance or repairs have been logged for this device." />
  }

  return (
    <div className="relative space-y-6 pl-6">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800" />
      {records.map((r) => (
        <div key={r.id} className="relative">
          <div className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 bg-brand-600" />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="text-sm font-semibold">{r.title}</h4>
            <span className="text-xs text-slate-400">{fmtDate(r.service_date)}</span>
            {r.cost > 0 && (
              <span className="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                ₹{r.cost.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          {r.description && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{r.description}</p>
          )}
          {r.performed_by && (
            <p className="mt-1 text-xs text-slate-400">Performed by {r.performed_by}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function WarrantyTab({ device }) {
  if (!device.warranty_expiry) {
    return <EmptyState icon={ShieldCheck} title="No warranty recorded" message="No warranty expiry date has been set for this device." />
  }

  const expiry = new Date(device.warranty_expiry)
  const days = Math.ceil((expiry - new Date()) / 86400000)

  const state =
    days < 0
      ? { label: 'Expired', cls: 'text-red-600', bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/20' }
      : days <= 30
        ? { label: 'Expiring soon', cls: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' }
        : { label: 'Under warranty', cls: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20' }

  return (
    <div className="space-y-6">
      <div className={clsx('rounded-xl border p-6 text-center', state.bg, state.border)}>
        <CalendarClock className={clsx('mx-auto h-8 w-8', state.cls)} />
        <div className={clsx('mt-3 text-2xl font-bold', state.cls)}>{state.label}</div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {days < 0
            ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago on ${fmtDate(expiry)}`
            : `${days} day${days === 1 ? '' : 's'} remaining — expires ${fmtDate(expiry)}`}
        </p>
      </div>

      <dl className="mx-auto max-w-lg">
        <DetailRow label="Purchase Date" value={fmtDate(device.purchase_date)} />
        <DetailRow label="Warranty Expiry" value={fmtDate(device.warranty_expiry)} />
        <DetailRow label="Vendor" value={device.vendor} />
        <DetailRow label="Serial Number" value={device.serial_number} mono />
      </dl>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function HeroFact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className="truncate text-sm font-medium">
          {value || <span className="text-slate-400">—</span>}
        </div>
      </div>
    </div>
  )
}

/** Wraps the page in a standalone shell — this route is reachable without login. */
function PublicShell({ children }) {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold leading-none">DMS</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Device Management</div>
            </div>
          </Link>

          <div className="flex-1" />

          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-secondary btn-sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn-primary btn-sm">
              <LogIn className="h-3.5 w-3.5" />
              Login
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6 animate-in">{children}</main>
    </div>
  )
}
