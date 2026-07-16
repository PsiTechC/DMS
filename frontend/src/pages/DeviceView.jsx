import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  QrCode, AlertTriangle, LogIn, ArrowLeft, FileText, Wrench, ShieldCheck,
  Download, MessageSquarePlus, Package, CalendarClock, MapPin, Building2,
  User, Tag, Pencil, Play, X, ChevronDown, HelpCircle, Cpu, ListChecks,
  Sparkles, Zap, Gauge, Wifi, ShieldCheck as ShieldIcon, BarChart3, Layers,
  PlayCircle,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { DEVICE_STATUS, CONDITION } from '../lib/constants'
import { Badge, PageLoader, DetailRow, EmptyState } from '../components/UI'
import RaiseQueryModal from '../components/RaiseQueryModal'
import DeviceFAQ from '../components/DeviceFAQ'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

function parseArr(raw) {
  try {
    const p = JSON.parse(raw || '[]')
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

// Feature cards get a rotating icon + accent so a wall of them still reads as
// distinct tiles, the way a real product page does.
const FEATURE_ICONS = [Sparkles, Zap, Wifi, BarChart3, ShieldIcon, Gauge, Cpu, Layers]
const FEATURE_ACCENTS = [
  'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
]
const SPEC_BARS = ['bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-cyan-500']

export default function DeviceView() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, canRaiseQuery, user } = useAuth()

  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [faqs, setFaqs] = useState([])
  const [queryOpen, setQueryOpen] = useState(false)

  const loadFaqs = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await api.get(`/devices/${id}/faqs`)
      setFaqs(res.data.data || [])
    } catch {
      /* non-fatal */
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
        setFaqs(res.data.data?.device?.faqs || [])
        loadFaqs(res.data.data?.device?.id)
      })
      .catch((e) => !cancelled && setState({ loading: false, data: null, error: errMsg(e) }))
    return () => { cancelled = true }
  }, [assetId, loadFaqs])

  // Returning from login with ?raise=1 reopens the query form. Wait for the
  // scan to resolve before acting, then drop the flag.
  const wantsRaise = params.get('raise') === '1'
  useEffect(() => {
    if (!wantsRaise || !isAuthenticated || !state.data) return
    if (canRaiseQuery && state.data.mapped) setQueryOpen(true)
    const next = new URLSearchParams(params)
    next.delete('raise')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRaise, isAuthenticated, canRaiseQuery, state.data])

  if (state.loading) return <PublicShell><PageLoader label={`Looking up ${assetId}…`} /></PublicShell>

  if (state.error) {
    return (
      <PublicShell>
        <div className="card mt-8 p-10">
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

  const features = parseArr(device.features)
    .map((f) => (typeof f === 'string' ? { title: f, detail: '' } : f))
    .filter((f) => f?.title)
  const steps = parseArr(device.usage_steps).filter((s) => s?.title || s?.detail)
  const specs = parseArr(device.specifications).filter((s) => s?.key)
  const visibleFaqCount = isAdmin ? faqs.length : faqs.filter((f) => f.is_published).length

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }

  function handleRaiseQuery() {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(`/device/${assetId}?raise=1`)}`)
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
      <ProductHero
        device={device}
        assetId={assetId}
        images={images}
        isAdmin={isAdmin}
        onEdit={() => navigate(`/map/${assetId}?edit=${device.id}`)}
      />

      <div className="space-y-4 pb-10">
        {features.length > 0 && <FeaturesSection features={features} />}
        {specs.length > 0 && <SpecsSection specs={specs} />}
        {(videos.length > 0 || manuals.length > 0) && <ResourcesSection videos={videos} manuals={manuals} />}
        {steps.length > 0 && <HowToUseSection steps={steps} />}
        <DeviceDetailsSection device={device} assetId={assetId} />
        <FaqSection deviceId={device.id} faqs={faqs} isAdmin={isAdmin} onChanged={() => loadFaqs(device.id)} />
        <EndActions onRaiseQuery={handleRaiseQuery} onFaq={() => scrollTo('faq')} hasFaq={!!visibleFaqCount} />
      </div>

      <RaiseQueryModal open={queryOpen} onClose={() => setQueryOpen(false)} device={device} assetId={assetId} user={user} />
    </PublicShell>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function ProductHero({ device, assetId, images, isAdmin, onEdit }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const cover = images[active] || images[0]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-100 via-indigo-50 to-violet-50 dark:border-slate-800 dark:from-brand-500/[0.12] dark:via-slate-900 dark:to-violet-500/[0.06]">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-300/40 blur-3xl dark:bg-brand-500/15" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-500/10" />

      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-2 lg:gap-10">
        {/* Gallery */}
        <div>
          <button
            onClick={() => cover && setLightbox(true)}
            className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
          >
            {cover ? (
              <img src={cover.url} alt={device.device_name} className="h-full w-full object-contain p-5 transition-transform duration-300 group-hover:scale-[1.03]" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-300 dark:text-slate-600">
                <Package className="h-14 w-14" />
                <span className="text-sm">No image available</span>
              </div>
            )}
          </button>

          {images.length > 1 && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActive(i)}
                  className={clsx(
                    'h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-all dark:bg-slate-950',
                    i === active ? 'border-brand-600' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300',
                  )}
                >
                  <img src={img.url} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col justify-center">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {device.category && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400">{device.category}</span>
            )}
            <Badge map={DEVICE_STATUS} value={device.status} />
            {device.condition && <Badge map={CONDITION} value={device.condition} />}
          </div>

          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{device.device_name}</h1>

          {device.headline ? (
            <p className="mt-2 text-base leading-relaxed text-slate-500 dark:text-slate-400">{device.headline}</p>
          ) : (
            [device.brand, device.model].filter(Boolean).length > 0 && (
              <p className="mt-2 text-base text-slate-500 dark:text-slate-400">{[device.brand, device.model].filter(Boolean).join(' · ')}</p>
            )
          )}

          {device.description && (
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{device.description}</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3.5">
            <HeroFact icon={Tag} label="Brand & Model" value={[device.brand, device.model].filter(Boolean).join(' ')} />
            <HeroFact icon={Building2} label="Company" value={device.company} />
            <HeroFact icon={User} label="Assigned to" value={device.assigned_employee} />
            <HeroFact icon={MapPin} label="Location" value={device.location} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button onClick={onEdit} className="btn-secondary">
                <Pencil className="h-4 w-4" />
                Edit device
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900/70">
              <QrCode className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-mono text-xs text-slate-500">{assetId}</span>
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {lightbox && cover && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightbox(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm">
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
            <img src={cover.url} alt={device.device_name} className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function HeroFact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="truncate text-sm font-medium">{value || <span className="text-slate-400">—</span>}</div>
      </div>
    </div>
  )
}

/* ── Section theming ──────────────────────────────────────────────────── */
// Each section gets its own colour identity — a tinted band, a matching
// eyebrow pill, and a title accent — so the page reads as vivid and varied
// rather than a wall of white cards.

const THEME = {
  blue: {
    band: 'from-blue-50 via-white to-white border-blue-100 dark:from-blue-500/[0.07] dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    dot: 'from-blue-400/40',
  },
  violet: {
    band: 'from-violet-50 via-white to-white border-violet-100 dark:from-violet-500/[0.07] dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    dot: 'from-violet-400/40',
  },
  rose: {
    band: 'from-rose-50 via-white to-white border-rose-100 dark:from-rose-500/[0.07] dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    dot: 'from-rose-400/40',
  },
  emerald: {
    band: 'from-emerald-50 via-white to-white border-emerald-100 dark:from-emerald-500/[0.07] dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    dot: 'from-emerald-400/40',
  },
  amber: {
    band: 'from-amber-50 via-white to-white border-amber-100 dark:from-amber-500/[0.07] dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    dot: 'from-amber-400/40',
  },
  slate: {
    band: 'from-slate-100 via-white to-white border-slate-200 dark:from-slate-800/50 dark:via-slate-900 dark:to-slate-900 dark:border-slate-800',
    pill: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'from-slate-400/30',
  },
}

function CenterHead({ eyebrow, icon: Icon, theme = 'blue', title, subtitle }) {
  const t = THEME[theme] || THEME.blue
  return (
    <div className="mb-6 text-center">
      {eyebrow && (
        <div className={clsx('mb-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]', t.pill)}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {eyebrow}
        </div>
      )}
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {subtitle && <p className="mx-auto mt-1.5 max-w-xl text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  )
}

// A colour-themed section band with a soft corner glow.
function Band({ id, theme = 'blue', children }) {
  const t = THEME[theme] || THEME.blue
  return (
    <section id={id} className={clsx('relative scroll-mt-24 overflow-hidden rounded-2xl border bg-gradient-to-b px-5 py-8 sm:px-8 sm:py-10', t.band)}>
      <div aria-hidden className={clsx('pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br to-transparent blur-3xl', t.dot)} />
      <div className="relative">{children}</div>
    </section>
  )
}

/* ── Features ─────────────────────────────────────────────────────────── */

function FeaturesSection({ features }) {
  return (
    <Band id="features" theme="blue">
      <CenterHead eyebrow="Highlights" icon={Sparkles} theme="blue" title="Key Features" subtitle="What makes this device stand out" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => {
          const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]
          return (
            <div key={i} className="card p-5 text-center card-hover">
              <div className={clsx('mx-auto flex h-12 w-12 items-center justify-center rounded-xl', FEATURE_ACCENTS[i % FEATURE_ACCENTS.length])}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-3.5 text-sm font-bold">{f.title}</h3>
              {f.detail && <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.detail}</p>}
            </div>
          )
        })}
      </div>
    </Band>
  )
}

/* ── Specifications ───────────────────────────────────────────────────── */

function SpecsSection({ specs }) {
  return (
    <Band id="specs" theme="violet">
      <CenterHead eyebrow="Technical" icon={Cpu} theme="violet" title="Technical Specifications" subtitle="Engineered for reliable, everyday performance" />
      <div className="grid gap-3 sm:grid-cols-2">
        {specs.map((s, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className={clsx('w-1 shrink-0 rounded-full', SPEC_BARS[i % SPEC_BARS.length])} />
            <div className="min-w-0">
              <div className="text-sm font-bold">{s.key}</div>
              <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{s.value || '—'}</div>
            </div>
          </div>
        ))}
      </div>
    </Band>
  )
}

/* ── Resources: video + manual boxes ──────────────────────────────────── */

function ResourcesSection({ videos, manuals }) {
  const [videoOpen, setVideoOpen] = useState(false)

  const openManual = () => {
    if (!manuals.length) return
    window.open(manuals[0].url, '_blank', 'noopener')
  }

  return (
    <Band id="resources" theme="rose">
      <CenterHead eyebrow="Media" icon={PlayCircle} theme="rose" title="Video & Documentation" subtitle="See it in action and read the full guide" />
      <div className="grid gap-4 sm:grid-cols-2">
        {videos.length > 0 && (
          <ResourceBox
            icon={PlayCircle}
            accent="from-rose-500 to-red-600"
            title="Product video"
            subtitle={`Watch how this device works · ${videos.length} video${videos.length > 1 ? 's' : ''}`}
            cta="Watch now"
            onClick={() => setVideoOpen(true)}
            preview={<video src={videos[0].url} muted preload="metadata" className="h-full w-full object-cover" />}
          />
        )}
        {manuals.length > 0 && (
          <ResourceBox
            icon={FileText}
            accent="from-blue-500 to-brand-700"
            title="User manual"
            subtitle={`Open the full PDF guide · ${manuals.length} document${manuals.length > 1 ? 's' : ''}`}
            cta="Open manual"
            onClick={openManual}
          />
        )}
      </div>

      <AnimatePresence>
        {videoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVideoOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-sm sm:p-8">
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
            <div className="w-full max-w-4xl space-y-4" onClick={(e) => e.stopPropagation()}>
              {videos.map((v) => (
                <div key={v.id}>
                  <video src={v.url} controls autoPlay={videos.length === 1} className="w-full rounded-xl bg-black shadow-2xl" />
                  <p className="mt-2 text-center text-sm text-white/70">{v.file_name}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Band>
  )
}

function ResourceBox({ icon: Icon, accent, title, subtitle, cta, onClick, preview }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900"
    >
      <div className={clsx('relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br text-white', accent)}>
        {preview && <div className="absolute inset-0 opacity-40">{preview}</div>}
        <Icon className="relative h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{title}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
        <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
          {cta}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      </div>
    </button>
  )
}

/* ── How to use ───────────────────────────────────────────────────────── */

function HowToUseSection({ steps }) {
  return (
    <Band id="usage" theme="emerald">
      <CenterHead eyebrow="Guide" icon={ListChecks} theme="emerald" title="How to Use" subtitle="Get started in a few simple steps" />
      <div className="mx-auto max-w-3xl space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</div>
            <div className="min-w-0 pt-0.5">
              {s.title && <h3 className="text-sm font-semibold">{s.title}</h3>}
              {s.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </Band>
  )
}

/* ── Device details ───────────────────────────────────────────────────── */

function DeviceDetailsSection({ device, assetId }) {
  const [open, setOpen] = useState(false)
  const warranty = device.warranty_expiry ? warrantyState(device.warranty_expiry) : null

  return (
    <Band id="details" theme="slate">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between lg:pointer-events-none">
        <CenterHead eyebrow="Asset record" icon={QrCode} theme="slate" title="Device Details" subtitle="The full asset record" />
        <ChevronDown className={clsx('h-5 w-5 text-slate-400 transition-transform lg:hidden', open && 'rotate-180')} />
      </button>

      <div className={clsx('grid gap-4 lg:grid-cols-3', !open && 'hidden lg:grid')}>
        <div className="rounded-xl border border-slate-200 p-5 dark:border-slate-800 lg:col-span-2">
          <div className="grid gap-x-10 sm:grid-cols-2">
            <dl>
              <DetailRow label="Device Number" value={device.device_number} mono />
              <DetailRow label="QR Number" value={assetId} mono />
              <DetailRow label="Serial Number" value={device.serial_number} mono />
              <DetailRow label="Category" value={device.category} />
              <DetailRow label="Vendor" value={device.vendor} />
            </dl>
            <dl>
              <DetailRow label="Company" value={device.company} />
              <DetailRow label="Project" value={device.project} />
              <DetailRow label="Department" value={device.department} />
              <DetailRow label="Purchase Date" value={fmtDate(device.purchase_date)} />
              <DetailRow label="Warranty Expiry" value={fmtDate(device.warranty_expiry)} />
            </dl>
          </div>

          {device.service_history?.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h4 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Wrench className="h-3.5 w-3.5" />
                Service history
              </h4>
              <ul className="space-y-2.5">
                {device.service_history.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <div>
                      <div className="text-sm font-medium">{r.title} <span className="ml-1 text-xs font-normal text-slate-400">{fmtDate(r.service_date)}</span></div>
                      {r.description && <div className="text-xs text-slate-500 dark:text-slate-400">{r.description}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {warranty ? (
          <div className={clsx('flex flex-col items-center justify-center rounded-xl border p-5 text-center', warranty.border, warranty.bg)}>
            <CalendarClock className={clsx('h-8 w-8', warranty.cls)} />
            <div className={clsx('mt-3 text-base font-bold', warranty.cls)}>{warranty.label}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{warranty.sub}</p>
            <div className="mt-2 text-xs text-slate-400">Expires {fmtDate(device.warranty_expiry)}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 p-5 text-center text-slate-400 dark:border-slate-800">
            <ShieldCheck className="h-8 w-8" />
            <p className="mt-3 text-sm">No warranty date recorded</p>
          </div>
        )}
      </div>
    </Band>
  )
}

function warrantyState(expiry) {
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000)
  if (days < 0)
    return { label: 'Warranty expired', sub: `${Math.abs(days)} day(s) ago`, cls: 'text-red-600', bg: 'bg-red-50/60 dark:bg-red-500/[0.06]', border: 'border-red-200 dark:border-red-500/20' }
  if (days <= 30)
    return { label: 'Expiring soon', sub: `${days} day(s) left`, cls: 'text-amber-600', bg: 'bg-amber-50/60 dark:bg-amber-500/[0.06]', border: 'border-amber-200 dark:border-amber-500/20' }
  return { label: 'Under warranty', sub: `${days} day(s) remaining`, cls: 'text-emerald-600', bg: 'bg-emerald-50/60 dark:bg-emerald-500/[0.06]', border: 'border-emerald-200 dark:border-emerald-500/20' }
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */

function FaqSection({ deviceId, faqs, isAdmin, onChanged }) {
  return (
    <Band id="faq" theme="amber">
      <CenterHead eyebrow="Support" icon={HelpCircle} theme="amber" title="Frequently Asked Questions" subtitle="Answers to common questions about this device" />
      <div className="mx-auto max-w-3xl">
        <DeviceFAQ deviceId={deviceId} faqs={faqs} isAdmin={isAdmin} onChanged={onChanged} />
      </div>
    </Band>
  )
}

/* ── End actions (two compact buttons) ────────────────────────────────── */

function EndActions({ onRaiseQuery, onFaq, hasFaq }) {
  return (
    <div className="relative flex flex-col items-center justify-between gap-3 overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 px-6 py-5 text-center text-white dark:border-slate-700 sm:flex-row sm:text-left">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="text-sm font-semibold">Need help with this device?</div>
        <div className="text-xs text-white/70">Report a problem or read common questions.</div>
      </div>
      <div className="relative flex gap-2.5">
        <button onClick={onRaiseQuery} className="btn btn-sm bg-white text-brand-700 hover:bg-blue-50">
          <MessageSquarePlus className="h-4 w-4" />
          Raise a query
        </button>
        {hasFaq && (
          <button onClick={onFaq} className="btn btn-sm border border-white/40 bg-white/10 text-white hover:bg-white/20">
            <HelpCircle className="h-4 w-4" />
            FAQ
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Unmapped screen ──────────────────────────────────────────────────── */

function NotAssigned({ assetId, status, message, isAdmin }) {
  const inactive = ['lost', 'inactive', 'replaced'].includes(status)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-8 max-w-lg overflow-hidden card">
      <div className={clsx('px-6 py-10 text-center', inactive ? 'bg-gradient-to-b from-red-50 to-transparent dark:from-red-500/10' : 'bg-gradient-to-b from-amber-50 to-transparent dark:from-amber-500/10')}>
        <div className={clsx('mx-auto flex h-16 w-16 items-center justify-center rounded-2xl', inactive ? 'bg-red-100 dark:bg-red-500/15' : 'bg-amber-100 dark:bg-amber-500/15')}>
          <AlertTriangle className={clsx('h-8 w-8', inactive ? 'text-red-600' : 'text-amber-600')} />
        </div>
        <h1 className="mt-5 text-xl font-bold">{inactive ? 'This QR code is not in use' : 'This QR is not assigned to any device'}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
          <QrCode className="h-4 w-4 text-slate-400" />
          <span className="font-mono text-sm font-semibold">{assetId}</span>
        </div>
      </div>
      <div className="border-t border-slate-200 p-6 dark:border-slate-800">
        {inactive ? (
          <p className="text-center text-sm text-slate-500">Contact your administrator if you believe this is a mistake.</p>
        ) : isAdmin ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">You are signed in as an admin. Map this QR code to a device now.</p>
            <Link to={`/map/${assetId}`} className="btn-primary"><QrCode className="h-4 w-4" />Map this QR to a device</Link>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Only an administrator can assign a device to this QR code.</p>
            <Link to={`/login?next=/device/${assetId}`} className="btn-primary"><LogIn className="h-4 w-4" />Login as Admin</Link>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ── Public shell ─────────────────────────────────────────────────────── */

function PublicShell({ children }) {
  const { isAuthenticated } = useAuth()
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/60 via-slate-50 to-slate-50 dark:from-brand-500/[0.04] dark:via-slate-950 dark:to-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold leading-none">DMS</div>
              <div className="mt-0.5 text-[10px] text-slate-400">Device Management</div>
            </div>
          </Link>
          <div className="flex-1" />
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-secondary btn-sm"><ArrowLeft className="h-3.5 w-3.5" />Dashboard</Link>
          ) : (
            <Link to="/login" className="btn-primary btn-sm"><LogIn className="h-3.5 w-3.5" />Login</Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">{children}</main>

      <footer className="mt-6 border-t border-slate-200 py-6 text-center dark:border-slate-800">
        <p className="text-xs text-slate-400">Powered by DMS — Device Management System</p>
      </footer>
    </div>
  )
}
