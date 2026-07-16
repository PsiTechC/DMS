import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  QrCode, AlertTriangle, LogIn, ArrowLeft, FileText, Wrench, ShieldCheck,
  Download, MessageSquarePlus, Package, CalendarClock, MapPin, Building2,
  User, Tag, Pencil, ExternalLink, Play, ChevronLeft, ChevronRight, HelpCircle,
  Check, Cpu, ListChecks, Sparkles, X, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { DEVICE_STATUS, CONDITION } from '../lib/constants'
import { Badge, PageLoader, DetailRow, EmptyState, Modal } from '../components/UI'
import RaiseQueryModal from '../components/RaiseQueryModal'
import DeviceFAQ from '../components/DeviceFAQ'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

// Stored product-page content is JSON text; read it back defensively.
function parseArr(raw) {
  try {
    const p = JSON.parse(raw || '[]')
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

export default function DeviceView() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isAdmin, canRaiseQuery, user } = useAuth()

  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [faqs, setFaqs] = useState([])
  const [queryOpen, setQueryOpen] = useState(false)
  const [loginPrompt, setLoginPrompt] = useState(false)

  const loadFaqs = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await api.get(`/devices/${id}/faqs`)
      setFaqs(res.data.data || [])
    } catch {
      // Non-fatal — the rest of the page still renders.
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

  if (!mapped) {
    return (
      <PublicShell wide>
        <NotAssigned assetId={assetId} status={status} message={state.data.message} isAdmin={isAdmin} />
      </PublicShell>
    )
  }

  const images = device.media?.filter((m) => m.type === 'image') || []
  const videos = device.media?.filter((m) => m.type === 'video') || []
  const manuals = device.media?.filter((m) => m.type === 'manual') || []

  const features = parseArr(device.features).map((f) => String(f).trim()).filter(Boolean)
  const steps = parseArr(device.usage_steps).filter((s) => s?.title || s?.detail)
  const specs = parseArr(device.specifications).filter((s) => s?.key)

  const visibleFaqCount = isAdmin ? faqs.length : faqs.filter((f) => f.is_published).length

  // Anchor nav only lists sections that actually have content.
  const sections = [
    features.length && { id: 'features', label: 'Features' },
    specs.length && { id: 'specs', label: 'Specifications' },
    steps.length && { id: 'usage', label: 'How to use' },
    videos.length && { id: 'videos', label: 'Videos' },
    manuals.length && { id: 'manuals', label: 'Manuals' },
    visibleFaqCount && { id: 'faq', label: 'FAQ' },
  ].filter(Boolean)

  function handleRaiseQuery() {
    if (!isAuthenticated) { setLoginPrompt(true); return }
    if (!canRaiseQuery) {
      toast.error('Client accounts have read-only access and cannot raise queries.')
      return
    }
    setQueryOpen(true)
  }

  return (
    <PublicShell wide>
      <ProductHero
        device={device}
        assetId={assetId}
        images={images}
        primaryManual={manuals[0]}
        isAdmin={isAdmin}
        onRaiseQuery={handleRaiseQuery}
        onEdit={() => navigate(`/map/${assetId}?edit=${device.id}`)}
      />

      {sections.length > 0 && <AnchorNav sections={sections} />}

      <div className="space-y-14 py-12 sm:space-y-20 sm:py-16">
        {features.length > 0 && <FeaturesSection features={features} />}
        {specs.length > 0 && <SpecsSection specs={specs} />}
        {steps.length > 0 && <HowToUseSection steps={steps} />}
        {videos.length > 0 && <VideosSection videos={videos} />}
        {manuals.length > 0 && <ManualsSection manuals={manuals} />}

        <Section id="faq" eyebrow="Support" title="Frequently asked questions" icon={HelpCircle}>
          <div className="mx-auto max-w-3xl">
            <DeviceFAQ deviceId={device.id} faqs={faqs} isAdmin={isAdmin} onChanged={() => loadFaqs(device.id)} />
          </div>
        </Section>

        <DeviceDetailsSection device={device} assetId={assetId} />

        <QueryBand device={device} onRaiseQuery={handleRaiseQuery} />
      </div>

      <RaiseQueryModal open={queryOpen} onClose={() => setQueryOpen(false)} device={device} assetId={assetId} user={user} />

      <Modal
        open={loginPrompt}
        onClose={() => setLoginPrompt(false)}
        title="Login required"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setLoginPrompt(false)}>Cancel</button>
            <Link to={`/login?next=/device/${assetId}`} className="btn-primary">
              <LogIn className="h-4 w-4" />
              Go to login
            </Link>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Please login to raise a query. Your name, employee ID, and department will be attached
          to the ticket automatically.
        </p>
      </Modal>
    </PublicShell>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function ProductHero({ device, assetId, images, primaryManual, isAdmin, onRaiseQuery, onEdit }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const cover = images[active] || images[0]

  return (
    <div className="relative overflow-hidden">
      {/* Soft brand wash behind the hero, so it reads as a product page rather
          than a form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/70 to-transparent dark:from-brand-500/[0.06]"
      />
      <div className="relative grid gap-8 py-8 sm:py-12 lg:grid-cols-2 lg:gap-12">
        {/* Gallery */}
        <div>
          <button
            onClick={() => cover && setLightbox(true)}
            className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            {cover ? (
              <img src={cover.url} alt={device.device_name} className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-[1.03]" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-300 dark:text-slate-600">
                <Package className="h-16 w-16" />
                <span className="text-sm">No image available</span>
              </div>
            )}
            {cover && (
              <span className="absolute bottom-3 right-3 rounded-full bg-slate-900/60 px-2.5 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                Click to enlarge
              </span>
            )}
          </button>

          {images.length > 1 && (
            <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActive(i)}
                  className={clsx(
                    'h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-all dark:bg-slate-900',
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {device.category && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400">
                {device.category}
              </span>
            )}
            <Badge map={DEVICE_STATUS} value={device.status} />
            {device.condition && <Badge map={CONDITION} value={device.condition} />}
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {device.device_name}
          </h1>

          {device.headline ? (
            <p className="mt-3 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
              {device.headline}
            </p>
          ) : (
            [device.brand, device.model].filter(Boolean).length > 0 && (
              <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
                {[device.brand, device.model].filter(Boolean).join(' · ')}
              </p>
            )
          )}

          {device.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {device.description}
            </p>
          )}

          {/* Key facts */}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
            <HeroFact icon={Tag} label="Brand & Model" value={[device.brand, device.model].filter(Boolean).join(' ')} />
            <HeroFact icon={Building2} label="Company" value={device.company} />
            <HeroFact icon={User} label="Assigned to" value={device.assigned_employee} />
            <HeroFact icon={MapPin} label="Location" value={device.location} />
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={onRaiseQuery} className="btn-primary">
              <MessageSquarePlus className="h-4 w-4" />
              Raise a query
            </button>
            {primaryManual && (
              <a href={primaryManual.url} download={primaryManual.file_name} className="btn-secondary">
                <Download className="h-4 w-4" />
                Download manual
              </a>
            )}
            {isAdmin && (
              <button onClick={onEdit} className="btn-secondary">
                <Pencil className="h-4 w-4" />
                Edit device
              </button>
            )}
          </div>

          <div className="mt-5 inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white/60 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/60">
            <QrCode className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-xs text-slate-500">{assetId}</span>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && cover && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightbox(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm"
          >
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
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
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="truncate text-sm font-medium">{value || <span className="text-slate-400">—</span>}</div>
      </div>
    </div>
  )
}

/* ── Sticky anchor nav ────────────────────────────────────────────────── */

function AnchorNav({ sections }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 72
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  return (
    <div className="sticky top-16 z-10 -mx-4 border-y border-slate-200 bg-white/85 px-4 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/85 sm:-mx-6 sm:px-6">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className="shrink-0 border-b-2 border-transparent px-4 py-3.5 text-sm font-medium text-slate-500 transition-colors hover:border-brand-500 hover:text-brand-600 dark:text-slate-400"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Section frame ────────────────────────────────────────────────────── */

function Section({ id, eyebrow, title, icon: Icon, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-7">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl font-bold tracking-tight sm:text-[26px]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/* ── Features ─────────────────────────────────────────────────────────── */

function FeaturesSection({ features }) {
  return (
    <Section id="features" eyebrow="Highlights" title="Key features" icon={Sparkles}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div key={i} className="card flex items-start gap-3 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <Check className="h-4 w-4" strokeWidth={3} />
            </div>
            <p className="pt-1 text-sm font-medium leading-snug">{f}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Specifications ───────────────────────────────────────────────────── */

function SpecsSection({ specs }) {
  return (
    <Section id="specs" eyebrow="Technical" title="Specifications" icon={Cpu}>
      <div className="card overflow-hidden">
        <dl className="grid sm:grid-cols-2">
          {specs.map((s, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-baseline justify-between gap-4 px-5 py-3.5',
                'border-b border-slate-100 dark:border-slate-800/70',
                // Right column gets a left divider on wide screens.
                i % 2 === 1 && 'sm:border-l',
              )}
            >
              <dt className="text-sm text-slate-500 dark:text-slate-400">{s.key}</dt>
              <dd className="text-right text-sm font-semibold">{s.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}

/* ── How to use ───────────────────────────────────────────────────────── */

function HowToUseSection({ steps }) {
  return (
    <Section id="usage" eyebrow="Getting started" title="How to use" icon={ListChecks}>
      <div className="relative space-y-6">
        {/* Connecting line down the step numbers. */}
        <div className="absolute bottom-4 left-[15px] top-4 w-px bg-slate-200 dark:bg-slate-800" />
        {steps.map((s, i) => (
          <div key={i} className="relative flex gap-4">
            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm">
              {i + 1}
            </div>
            <div className="card flex-1 p-4">
              {s.title && <h3 className="text-sm font-semibold">{s.title}</h3>}
              {s.detail && (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {s.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Videos ───────────────────────────────────────────────────────────── */

function VideosSection({ videos }) {
  const [playing, setPlaying] = useState(null)

  return (
    <Section id="videos" eyebrow="Watch" title="Videos" icon={Play}>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => setPlaying(v)}
            className="group card overflow-hidden text-left"
          >
            <div className="relative flex aspect-video items-center justify-center bg-slate-900">
              {/* A muted metadata-preload frame doubles as the thumbnail. */}
              <video src={v.url} preload="metadata" muted className="h-full w-full object-cover opacity-80" />
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 transition-colors group-hover:bg-slate-900/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                  <Play className="ml-0.5 h-6 w-6 text-brand-700" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-3">
              <Play className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-sm font-medium">{v.file_name}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Player — opens like a lightbox and plays immediately. */}
      <AnimatePresence>
        {playing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPlaying(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-sm sm:p-8"
          >
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <video src={playing.url} controls autoPlay className="w-full rounded-xl bg-black shadow-2xl" />
              <p className="mt-3 text-center text-sm text-white/70">{playing.file_name}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  )
}

/* ── Manuals ──────────────────────────────────────────────────────────── */

function ManualsSection({ manuals }) {
  return (
    <Section id="manuals" eyebrow="Documents" title="Manuals & guides" icon={FileText}>
      <div className="grid gap-3 sm:grid-cols-2">
        {manuals.map((m) => (
          <div key={m.id} className="card flex items-center gap-4 p-4">
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
            </a>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Device details (the asset record) ────────────────────────────────── */

function DeviceDetailsSection({ device, assetId }) {
  const [open, setOpen] = useState(false)
  const warranty = device.warranty_expiry ? warrantyState(device.warranty_expiry) : null

  return (
    <Section id="details" eyebrow="Asset record" title="Device details" icon={QrCode}>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="mb-1 flex w-full items-center justify-between lg:pointer-events-none"
          >
            <span className="text-sm font-semibold">Full record</span>
            <ChevronDown className={clsx('h-4 w-4 text-slate-400 transition-transform lg:hidden', open && 'rotate-180')} />
          </button>

          <div className={clsx('grid gap-x-10 sm:grid-cols-2', !open && 'hidden lg:grid')}>
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
            <div className={clsx('mt-6 border-t border-slate-100 pt-5 dark:border-slate-800', !open && 'hidden lg:block')}>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Wrench className="h-3.5 w-3.5" />
                Service history
              </h4>
              <ul className="space-y-3">
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

        {/* Warranty card */}
        {warranty ? (
          <div className={clsx('card flex flex-col items-center justify-center p-6 text-center', warranty.bg)}>
            <CalendarClock className={clsx('h-8 w-8', warranty.cls)} />
            <div className={clsx('mt-3 text-lg font-bold', warranty.cls)}>{warranty.label}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{warranty.sub}</p>
            <div className="mt-3 text-xs text-slate-400">Expires {fmtDate(device.warranty_expiry)}</div>
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <ShieldCheck className="h-8 w-8" />
            <p className="mt-3 text-sm">No warranty date recorded</p>
          </div>
        )}
      </div>
    </Section>
  )
}

function warrantyState(expiry) {
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000)
  if (days < 0)
    return { label: 'Warranty expired', sub: `${Math.abs(days)} day(s) ago`, cls: 'text-red-600', bg: 'bg-red-50/50 dark:bg-red-500/[0.06]' }
  if (days <= 30)
    return { label: 'Expiring soon', sub: `${days} day(s) left`, cls: 'text-amber-600', bg: 'bg-amber-50/50 dark:bg-amber-500/[0.06]' }
  return { label: 'Under warranty', sub: `${days} day(s) remaining`, cls: 'text-emerald-600', bg: 'bg-emerald-50/50 dark:bg-emerald-500/[0.06]' }
}

/* ── Query call-to-action band ────────────────────────────────────────── */

function QueryBand({ device, onRaiseQuery }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-700 to-brand-900 p-8 text-center text-white sm:p-12">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
        <MessageSquarePlus className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">Something wrong with this device?</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
        Raise a query and it reaches the right team by email in seconds. Your details are attached
        automatically — you only describe the issue.
      </p>
      <button
        onClick={onRaiseQuery}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-700 transition-transform hover:scale-[1.02]"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Raise a query
      </button>
    </div>
  )
}

/* ── Unmapped screen ──────────────────────────────────────────────────── */

function NotAssigned({ assetId, status, message, isAdmin }) {
  const inactive = ['lost', 'inactive', 'replaced'].includes(status)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-8 max-w-lg overflow-hidden card"
    >
      <div className={clsx('px-6 py-10 text-center', inactive ? 'bg-gradient-to-b from-red-50 to-transparent dark:from-red-500/10' : 'bg-gradient-to-b from-amber-50 to-transparent dark:from-amber-500/10')}>
        <div className={clsx('mx-auto flex h-16 w-16 items-center justify-center rounded-2xl', inactive ? 'bg-red-100 dark:bg-red-500/15' : 'bg-amber-100 dark:bg-amber-500/15')}>
          <AlertTriangle className={clsx('h-8 w-8', inactive ? 'text-red-600' : 'text-amber-600')} />
        </div>
        <h1 className="mt-5 text-xl font-bold">
          {inactive ? 'This QR code is not in use' : 'This QR is not assigned to any device'}
        </h1>
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
            <Link to={`/map/${assetId}`} className="btn-primary">
              <QrCode className="h-4 w-4" />
              Map this QR to a device
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Only an administrator can assign a device to this QR code.</p>
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

/* ── Public shell ─────────────────────────────────────────────────────── */

function PublicShell({ children, wide }) {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/85">
        <div className={clsx('mx-auto flex h-16 items-center gap-3 px-4 sm:px-6', wide ? 'max-w-6xl' : 'max-w-6xl')}>
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

      <main className="mx-auto max-w-6xl px-4 sm:px-6">{children}</main>

      <footer className="mt-8 border-t border-slate-200 py-8 text-center dark:border-slate-800">
        <p className="text-xs text-slate-400">Powered by DMS — Device Management System</p>
      </footer>
    </div>
  )
}
