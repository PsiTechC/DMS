import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  QrCode, AlertTriangle, LogIn, ArrowLeft, FileText, Wrench, ShieldCheck,
  MessageSquarePlus, Package, CalendarClock, MapPin, Building2, User, Tag,
  Pencil, X, ChevronDown, HelpCircle, Cpu, ListChecks, Sparkles, Zap, Gauge,
  Wifi, BarChart3, Layers, PlayCircle,
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

// Remove only near-white pixels connected to an image edge. This makes a
// studio-white upload merge into the page while preserving light details that
// are enclosed inside the product itself. The threshold also feathers off-white
// and anti-aliased edge pixels instead of producing a hard cut-out.
function useWhiteBackgroundRemovedImage(src) {
  const [processed, setProcessed] = useState(null)

  useEffect(() => {
    setProcessed(null)
    if (!src) return undefined

    let cancelled = false
    let generatedURL = null
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const maxSide = 1600
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
        const width = Math.max(1, Math.round(image.naturalWidth * scale))
        const height = Math.max(1, Math.round(image.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height)
        const count = width * height
        const visited = new Uint8Array(count)
        const queue = new Int32Array(count)
        let head = 0
        let tail = 0

        const isBackground = (pixel) => {
          const offset = pixel * 4
          const r = pixels.data[offset]
          const g = pixels.data[offset + 1]
          const b = pixels.data[offset + 2]
          return Math.min(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 45
        }
        const enqueue = (pixel) => {
          if (!visited[pixel] && isBackground(pixel)) {
            visited[pixel] = 1
            queue[tail++] = pixel
          }
        }

        for (let x = 0; x < width; x += 1) {
          enqueue(x)
          enqueue((height - 1) * width + x)
        }
        for (let y = 1; y < height - 1; y += 1) {
          enqueue(y * width)
          enqueue(y * width + width - 1)
        }

        while (head < tail) {
          const pixel = queue[head++]
          const x = pixel % width
          const y = Math.floor(pixel / width)
          const offset = pixel * 4
          const lightness = Math.min(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2])
          const feather = Math.max(0, Math.min(1, (245 - lightness) / 40))
          pixels.data[offset + 3] = Math.round(pixels.data[offset + 3] * feather)
          if (x > 0) enqueue(pixel - 1)
          if (x + 1 < width) enqueue(pixel + 1)
          if (y > 0) enqueue(pixel - width)
          if (y + 1 < height) enqueue(pixel + width)
        }

        context.putImageData(pixels, 0, 0)
        canvas.toBlob((blob) => {
          if (!blob) return
          generatedURL = URL.createObjectURL(blob)
          if (cancelled) URL.revokeObjectURL(generatedURL)
          else setProcessed(generatedURL)
        }, 'image/png')
      } catch {
        // Cross-origin or browser canvas restrictions fall back to the upload.
      }
    }
    image.src = src

    return () => {
      cancelled = true
      if (generatedURL) URL.revokeObjectURL(generatedURL)
    }
  }, [src])

  return processed || src
}

const FEATURE_ICONS = [Sparkles, Zap, Wifi, BarChart3, ShieldCheck, Gauge, Cpu, Layers]
// All blue-family, so the feature row stays on-theme instead of mixing pink/green.
const FEATURE_ACCENTS = [
  'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
  'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
]
const SPEC_BARS = ['bg-blue-500', 'bg-indigo-500', 'bg-sky-500', 'bg-cyan-500']

// Full-bleed section backgrounds. Each is a soft top-tint fading to the page,
// so consecutive sections blend into one continuous page instead of stacking
// as separate boxes. `pill` is the matching eyebrow chip.
const THEME = {
  // Blue-leaning tints throughout so the whole page reads blue, with each
  // section's own accent mixed into a blue base.
  blue: { bg: 'bg-gradient-to-b from-blue-100/80 via-blue-50/50 to-blue-50/30 dark:from-brand-500/[0.08] dark:to-slate-950', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  violet: { bg: 'bg-gradient-to-b from-indigo-100/70 via-blue-50/40 to-blue-50/20 dark:from-indigo-500/[0.07] dark:to-slate-950', pill: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' },
  rose: { bg: 'bg-gradient-to-b from-sky-100/70 via-blue-50/40 to-blue-50/20 dark:from-sky-500/[0.07] dark:to-slate-950', pill: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  emerald: { bg: 'bg-gradient-to-b from-cyan-100/60 via-blue-50/40 to-blue-50/20 dark:from-cyan-500/[0.07] dark:to-slate-950', pill: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300' },
  amber: { bg: 'bg-gradient-to-b from-blue-100/70 via-blue-50/40 to-blue-50/20 dark:from-brand-500/[0.07] dark:to-slate-950', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  slate: { bg: 'bg-gradient-to-b from-slate-100 via-blue-50/40 to-blue-50/20 dark:from-slate-800/50 dark:to-slate-950', pill: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}

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

  const wantsRaise = params.get('raise') === '1'
  useEffect(() => {
    if (!wantsRaise || !isAuthenticated || !state.data) return
    if (canRaiseQuery && state.data.mapped) setQueryOpen(true)
    const next = new URLSearchParams(params)
    next.delete('raise')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRaise, isAuthenticated, canRaiseQuery, state.data])

  if (state.loading) return <Shell><div className="mx-auto max-w-6xl px-4"><PageLoader label={`Looking up ${assetId}…`} /></div></Shell>

  if (state.error) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-4 py-10">
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
        </div>
      </Shell>
    )
  }

  const { mapped, device, status } = state.data

  if (!mapped) {
    return (
      <Shell>
        <div className="px-4">
          <NotAssigned assetId={assetId} status={status} message={state.data.message} isAdmin={isAdmin} />
        </div>
      </Shell>
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

  function handleRaiseQuery() {
    if (!isAuthenticated) {
      navigate(`/login?mode=email&next=${encodeURIComponent(`/device/${assetId}?raise=1`)}`)
      return
    }
    if (!canRaiseQuery) {
      toast.error('Client accounts have read-only access and cannot raise queries.')
      return
    }
    setQueryOpen(true)
  }

  return (
    <Shell>
      <Hero device={device} assetId={assetId} images={images} isAdmin={isAdmin} onEdit={() => navigate(`/map/${assetId}?edit=${device.id}`)} />

      {features.length > 0 && <FeaturesSection features={features} />}
      {specs.length > 0 && <SpecsSection specs={specs} />}
      {(videos.length > 0 || manuals.length > 0) && <ResourcesSection videos={videos} manuals={manuals} />}
      {steps.length > 0 && <HowToUseSection steps={steps} />}
      <DetailsSection device={device} assetId={assetId} />
      <FaqSection deviceId={device.id} faqs={faqs} isAdmin={isAdmin} onChanged={() => loadFaqs(device.id)} />
      <CtaSection onRaiseQuery={handleRaiseQuery} />

      <RaiseQueryModal open={queryOpen} onClose={() => setQueryOpen(false)} device={device} assetId={assetId} user={user} />
    </Shell>
  )
}

/* ── Full-bleed section + centred header ───────────────────────────────── */

// Sections are transparent — the single page background shows through, so the
// whole page reads as one continuous blue rather than stacked coloured bands.
function Section({ id, children }) {
  return (
    <section id={id} className="scroll-mt-16 py-10 sm:py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  )
}

function Head({ eyebrow, icon: Icon, theme = 'blue', title, subtitle }) {
  const t = THEME[theme] || THEME.blue
  return (
    <div className="mb-6 text-center">
      {eyebrow && (
        <div className={clsx('mb-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]', t.pill)}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {eyebrow}
        </div>
      )}
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400 sm:text-base">{subtitle}</p>}
    </div>
  )
}

/* ── Hero (text left, image right) ────────────────────────────────────── */

function Hero({ device, assetId, images, isAdmin, onEdit }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const cover = images[active] || images[0]
  const blendedCoverURL = useWhiteBackgroundRemovedImage(cover?.url)

  const subline =
    device.description ||
    `${[device.brand, device.model].filter(Boolean).join(' ') || device.device_name} — assigned to ${device.assigned_employee || 'this location'} at ${device.location || device.company || 'your organisation'}. Scan any time to view specs, guides, and support.`

  return (
    <section className="relative">
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:min-h-[80vh] lg:grid-cols-2 lg:gap-10 lg:py-24">
        {/* LEFT — text */}
        <div className="order-2 lg:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {device.category && (
              <span className="rounded-full bg-brand-600/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{device.category}</span>
            )}
            <Badge map={DEVICE_STATUS} value={device.status} />
            {device.condition && <Badge map={CONDITION} value={device.condition} />}
          </div>

          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">{device.device_name}</h1>

          {device.headline && (
            <p className="mt-4 text-lg font-medium leading-relaxed text-brand-800 dark:text-brand-200 sm:text-xl">{device.headline}</p>
          )}

          <p className="mt-4 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{subline}</p>

          <div className="mt-7 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4">
            <HeroFact icon={Tag} label="Brand & Model" value={[device.brand, device.model].filter(Boolean).join(' ')} />
            <HeroFact icon={Building2} label="Company" value={device.company} />
            <HeroFact icon={User} label="Assigned to" value={device.assigned_employee} />
            <HeroFact icon={MapPin} label="Location" value={device.location} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button onClick={onEdit} className="btn-secondary">
                <Pencil className="h-4 w-4" />
                Edit device
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/70 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900/70">
              <QrCode className="h-3.5 w-3.5 text-brand-500" />
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{assetId}</span>
            </span>
          </div>
        </div>

        {/* RIGHT — image (large, pushed right) */}
        <div className="order-1 lg:order-2 lg:ml-auto lg:w-full lg:max-w-2xl">
          <button
            onClick={() => cover && setLightbox(true)}
            className="group relative flex aspect-[4/3] w-full items-center justify-center bg-transparent"
          >
            {cover ? (
              <img
                src={blendedCoverURL}
                alt={device.device_name}
                className="h-full w-full object-contain drop-shadow-[0_18px_22px_rgba(30,64,175,0.14)] transition-transform duration-300 group-hover:scale-[1.025]"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-300 dark:text-slate-600">
                <Package className="h-20 w-20" />
                <span className="text-sm">No image available</span>
              </div>
            )}
          </button>

          {images.length > 1 && (
            <div className="mt-3.5 flex justify-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActive(i)}
                  className={clsx(
                    'h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition-all dark:bg-slate-900',
                    i === active ? 'border-brand-600' : 'border-white/70 dark:border-slate-800 hover:border-brand-300',
                  )}
                >
                  <img src={img.url} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lightbox && cover && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightbox(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-sm">
            <button className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
            <img src={blendedCoverURL} alt={device.device_name} className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function HeroFact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="truncate text-sm font-medium">{value || <span className="text-slate-400">—</span>}</div>
      </div>
    </div>
  )
}

/* ── Features ─────────────────────────────────────────────────────────── */

function FeaturesSection({ features }) {
  return (
    <Section id="features" theme="blue">
      <Head eyebrow="Highlights" icon={Sparkles} theme="blue" title="Key Features" subtitle="What makes this device stand out" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => {
          const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]
          return (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 text-center transition-all hover:-translate-y-1 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900">
              <div className={clsx('mx-auto flex h-12 w-12 items-center justify-center rounded-xl', FEATURE_ACCENTS[i % FEATURE_ACCENTS.length])}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-bold">{f.title}</h3>
              {f.detail && <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.detail}</p>}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/* ── Specifications ───────────────────────────────────────────────────── */

function SpecsSection({ specs }) {
  return (
    <Section id="specs" theme="violet">
      <Head eyebrow="Technical" icon={Cpu} theme="violet" title="Technical Specifications" subtitle="Engineered for reliable, everyday performance" />
      <div className="grid gap-4 sm:grid-cols-2">
        {specs.map((s, i) => (
          <div key={i} className="flex gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className={clsx('w-1.5 shrink-0 rounded-full', SPEC_BARS[i % SPEC_BARS.length])} />
            <div className="min-w-0">
              <div className="text-base font-bold">{s.key}</div>
              {s.value && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.value}</div>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Resources: video + manual ────────────────────────────────────────── */

function ResourcesSection({ videos, manuals }) {
  const [videoOpen, setVideoOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

  // One manual opens straight away; several open a chooser, so a second or
  // third manual is never hidden behind the first.
  const onManual = () => {
    if (manuals.length === 1) window.open(manuals[0].url, '_blank', 'noopener')
    else setManualOpen(true)
  }

  return (
    <Section id="resources" theme="rose">
      <Head eyebrow="Media" icon={PlayCircle} theme="rose" title="Video & Documentation" subtitle="See it in action and read the full guide" />
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {videos.length > 0 && (
          <ResourceBox
            icon={PlayCircle}
            accent="from-sky-500 to-blue-600"
            title="Product video"
            subtitle={`Watch how this device works · ${videos.length} video${videos.length > 1 ? 's' : ''}`}
            cta={videos.length > 1 ? 'View all' : 'Watch now'}
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
            cta={manuals.length > 1 ? 'View all' : 'Open manual'}
            onClick={onManual}
          />
        )}
      </div>

      {/* Video player — every video, not just the first. */}
      <AnimatePresence>
        {videoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVideoOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/85 p-4 backdrop-blur-sm sm:p-8">
            <button className="fixed right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
            <div className="my-auto w-full max-w-4xl space-y-6" onClick={(e) => e.stopPropagation()}>
              {videos.map((v, i) => (
                <div key={v.id}>
                  <video src={v.url} controls autoPlay={videos.length === 1 && i === 0} className="w-full rounded-xl bg-black shadow-2xl" />
                  <p className="mt-2 text-center text-sm text-white/70">{v.file_name}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual chooser — lists every PDF with view + download. */}
      <AnimatePresence>
        {manualOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setManualOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">Manuals & guides</h3>
                <button onClick={() => setManualOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
              <ul className="space-y-2">
                {manuals.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/10">
                      <FileText className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.file_name}</div>
                      <div className="text-xs text-slate-400">{(m.size_bytes / 1024 / 1024).toFixed(2)} MB · PDF</div>
                    </div>
                    <a href={m.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm shrink-0">View</a>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  )
}

function ResourceBox({ icon: Icon, accent, title, subtitle, cta, onClick, preview }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:-translate-y-1 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900"
    >
      <div className={clsx('relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-white', accent)}>
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
    <Section id="usage" theme="emerald">
      <Head eyebrow="Guide" icon={ListChecks} theme="emerald" title="How to Use" subtitle="Get started in a few simple steps" />
      <div className="mx-auto max-w-3xl space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-brand-700 text-sm font-bold text-white">{i + 1}</div>
            <div className="min-w-0 pt-1">
              {s.title && <h3 className="text-sm font-semibold">{s.title}</h3>}
              {s.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Device details ───────────────────────────────────────────────────── */

function DetailsSection({ device, assetId }) {
  const warranty = device.warranty_expiry ? warrantyState(device.warranty_expiry) : null
  return (
    <Section id="details" theme="slate">
      <Head eyebrow="Asset record" icon={QrCode} theme="slate" title="Device Details" subtitle="The full record for this device" />
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
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
          <div className={clsx('flex flex-col items-center justify-center rounded-2xl border p-6 text-center', warranty.border, warranty.bg)}>
            <CalendarClock className={clsx('h-8 w-8', warranty.cls)} />
            <div className={clsx('mt-3 text-base font-bold', warranty.cls)}>{warranty.label}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{warranty.sub}</p>
            <div className="mt-2 text-xs text-slate-400">Expires {fmtDate(device.warranty_expiry)}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
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
    return { label: 'Warranty expired', sub: `${Math.abs(days)} day(s) ago`, cls: 'text-red-600', bg: 'bg-red-50/60 dark:bg-red-500/[0.06]', border: 'border-red-200 dark:border-red-500/20' }
  if (days <= 30)
    return { label: 'Expiring soon', sub: `${days} day(s) left`, cls: 'text-amber-600', bg: 'bg-amber-50/60 dark:bg-amber-500/[0.06]', border: 'border-amber-200 dark:border-amber-500/20' }
  return { label: 'Under warranty', sub: `${days} day(s) remaining`, cls: 'text-emerald-600', bg: 'bg-emerald-50/60 dark:bg-emerald-500/[0.06]', border: 'border-emerald-200 dark:border-emerald-500/20' }
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */

function FaqSection({ deviceId, faqs, isAdmin, onChanged }) {
  return (
    <Section id="faq" theme="amber">
      <Head eyebrow="Support" icon={HelpCircle} theme="amber" title="Frequently Asked Questions" subtitle="Answers to common questions about this device" />
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <DeviceFAQ deviceId={deviceId} faqs={faqs} isAdmin={isAdmin} onChanged={onChanged} limit={2} />
      </div>
    </Section>
  )
}

/* ── CTA (query + faq) ────────────────────────────────────────────────── */

function CtaSection({ onRaiseQuery }) {
  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-800 to-indigo-900 py-12 text-white sm:py-14">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <MessageSquarePlus className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Need help with this device?</h2>
        <p className="max-w-md text-sm text-white/70">
          Report a problem and it reaches the right team by email in seconds.
        </p>
        <button onClick={onRaiseQuery} className="btn mt-1 bg-white px-6 text-brand-700 hover:bg-blue-50">
          <MessageSquarePlus className="h-4 w-4" />
          Raise a query
        </button>
      </div>
    </section>
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

/* ── Shell (header + continuous page) ─────────────────────────────────── */

function Shell({ children }) {
  const { isAuthenticated } = useAuth()
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-100 via-blue-50 to-blue-100/70 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
      {/* One texture + glow layer for the WHOLE page (fixed), so nothing stops
          at a section edge and creates a "divided" seam. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-40 dark:opacity-[0.08]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(37,99,235,.13) 1px, transparent 0)', backgroundSize: '26px 26px' }}
      />
      <div aria-hidden className="pointer-events-none fixed -left-40 -top-40 z-0 h-[36rem] w-[36rem] rounded-full bg-brand-300/25 blur-3xl dark:bg-brand-500/10" />
      <div aria-hidden className="pointer-events-none fixed -right-40 top-1/3 z-0 h-[32rem] w-[32rem] rounded-full bg-indigo-300/20 blur-3xl dark:bg-violet-500/10" />

      <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-900/85">
        {/* max-w-7xl matches the hero below, so the logo lines up with the
            heading and the login button sits at the same right edge. */}
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
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

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-blue-100 py-6 text-center dark:border-slate-800">
        <p className="text-xs text-slate-400">Powered by DMS — Device Management System</p>
      </footer>
    </div>
  )
}
