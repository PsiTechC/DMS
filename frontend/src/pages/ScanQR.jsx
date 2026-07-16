import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ScanLine, Camera, CameraOff, Keyboard, ArrowRight, Info, Image as ImageIcon,
  UploadCloud, ClipboardPaste, X, Loader2, CheckCircle2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { PageHeader, Field, Spinner } from '../components/UI'

const CAMERA_ID = 'dms-qr-camera'
const FILE_ID = 'dms-qr-file'

const TABS = [
  { key: 'camera', label: 'Camera', icon: Camera },
  { key: 'upload', label: 'Upload / Paste', icon: ImageIcon },
  { key: 'manual', label: 'Type code', icon: Keyboard },
]

// The QR encodes a full URL, but accept a bare asset ID too so a typed code or
// a differently-encoded sticker still resolves.
const extractAssetId = (text) => {
  const m = String(text || '').match(/DMS\d{6,}/i)
  return m ? m[0].toUpperCase() : null
}

export default function ScanQR() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('camera')

  return (
    <div>
      <PageHeader
        title="Scan QR Code"
        subtitle="Use your camera, upload a photo or screenshot, or type the code by hand."
        icon={ScanLine}
      />

      {/* Two columns so the scanner does not leave the right half of the page
          empty: scanner on the left, a help panel on the right. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="card mb-4 flex gap-1 p-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  tab === t.key
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'camera' && <CameraTab onFound={(a) => navigate(`/device/${a}`)} />}
          {tab === 'upload' && <UploadTab onFound={(a) => navigate(`/device/${a}`)} />}
          {tab === 'manual' && <ManualTab onFound={(a) => navigate(`/device/${a}`)} />}
        </div>

        <div className="lg:col-span-2">
          <HelpPanel onManual={() => setTab('manual')} />
        </div>
      </div>
    </div>
  )
}

/* ── Help panel ───────────────────────────────────────────────────────── */

function HelpPanel({ onManual }) {
  const steps = [
    { title: 'Point at the sticker', desc: 'Aim your camera at any DMS QR label on a device.' },
    { title: 'The page opens instantly', desc: 'No app or login needed just to view the device.' },
    { title: 'View or report', desc: 'See specs, manuals and videos — or raise a query if something is wrong.' },
  ]
  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      <div className="card p-5">
        <h3 className="text-sm font-semibold">How scanning works</h3>
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold">No camera?</h3>
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Switch to <span className="font-medium text-slate-700 dark:text-slate-200">Upload / Paste</span> to
          read a photo or screenshot, or{' '}
          <button onClick={onManual} className="font-semibold text-brand-600 hover:underline">type the code</button>{' '}
          by hand. A QR number looks like <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">DMS000001</span>.
        </p>
      </div>
    </div>
  )
}

/* ── Camera ───────────────────────────────────────────────────────────── */

function CameraTab({ onFound }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const scannerRef = useRef(null)

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current
    if (!s) return
    scannerRef.current = null
    try {
      await s.stop()
      s.clear()
    } catch {
      // Already stopped — nothing to do.
    }
  }, [])

  // A live camera left running keeps the device's recording indicator on and
  // drains battery, so always release it when leaving this tab.
  useEffect(() => () => { stopScanner() }, [stopScanner])

  async function start() {
    setError('')
    setScanning(true)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(CAMERA_ID)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          const asset = extractAssetId(decoded)
          if (!asset) {
            toast.error('That QR code is not a DMS device label.')
            return
          }
          await stopScanner()
          setScanning(false)
          onFound(asset)
        },
        () => {
          // Per-frame decode misses are normal; ignore them.
        },
      )
    } catch (e) {
      setScanning(false)
      scannerRef.current = null
      setError(
        e?.name === 'NotAllowedError' || /permission/i.test(e?.message || '')
          ? 'Camera access was denied. Allow camera permission in your browser, or use the Upload / Paste tab instead.'
          : 'Could not start the camera. This device may not have one, or another app is using it. Try the Upload / Paste tab instead.',
      )
    }
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="relative flex aspect-square items-center justify-center bg-slate-900 sm:aspect-video">
          <div id={CAMERA_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                <Camera className="h-8 w-8 text-white/70" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Camera is off</p>
                <p className="mt-1 text-xs text-white/50">Start the scanner to read a QR label</p>
              </div>
              <button className="btn-primary" onClick={start}>
                <Camera className="h-4 w-4" />
                Start camera
              </button>
            </div>
          )}

          {scanning && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-60 w-60">
                {['left-0 top-0 border-l-4 border-t-4 rounded-tl-lg',
                  'right-0 top-0 border-r-4 border-t-4 rounded-tr-lg',
                  'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-lg',
                  'right-0 bottom-0 border-r-4 border-b-4 rounded-br-lg',
                ].map((cls) => (
                  <div key={cls} className={`absolute h-8 w-8 border-brand-400 ${cls}`} />
                ))}
              </div>
            </div>
          )}
        </div>

        {scanning && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs text-slate-500">Hold the QR code steady inside the frame…</p>
            <button className="btn-secondary btn-sm" onClick={async () => { await stopScanner(); setScanning(false) }}>
              <CameraOff className="h-3.5 w-3.5" />
              Stop
            </button>
          </div>
        )}
      </div>

      {error && <Notice>{error}</Notice>}
    </>
  )
}

/* ── Upload / paste ───────────────────────────────────────────────────── */

function UploadTab({ onFound }) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [found, setFound] = useState(null)
  const previewRef = useRef(null)

  // Revoke the last object URL when it is replaced or the tab unmounts —
  // otherwise each pasted screenshot leaks its blob for the session.
  useEffect(() => {
    previewRef.current = preview
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [preview])

  const handleFile = useCallback(
    async (file) => {
      if (!file) return

      if (!file.type.startsWith('image/')) {
        setError('That is not an image. Upload a photo or screenshot of the QR code.')
        return
      }
      if (file.size > 15 * 1024 * 1024) {
        setError('That image is over 15 MB. Try a smaller screenshot.')
        return
      }

      setError('')
      setFound(null)
      setBusy(true)

      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(file))

      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode(FILE_ID)

        // scanFile decodes a still image — no camera permission involved, which
        // is why this path works on locked-down desktops.
        const decoded = await scanner.scanFile(file, false)
        scanner.clear()

        const asset = extractAssetId(decoded)
        if (!asset) {
          setError(`Found a QR code, but it is not a DMS device label. It contained: "${String(decoded).slice(0, 80)}"`)
          return
        }

        setFound(asset)
        toast.success(`Found ${asset}`)
        // Brief pause so the user sees which code was matched before we move.
        setTimeout(() => onFound(asset), 700)
      } catch {
        setError(
          'No QR code could be read in that image. Make sure the whole code is visible, in focus, and not too small — then try again.',
        )
      } finally {
        setBusy(false)
      }
    },
    [onFound, preview],
  )

  // Ctrl+V anywhere on this tab: pull the image straight off the clipboard so a
  // screenshot never has to be saved to disk first.
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            handleFile(file)
          }
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  return (
    <>
      {/* scanFile needs a mounted element to work against, but renders nothing. */}
      <div id={FILE_ID} className="hidden" />

      <div className="card p-5">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          className={clsx(
            'relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
              : busy
                ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-500/5'
                : 'border-slate-300 dark:border-slate-700 hover:border-brand-500 hover:bg-brand-50/40 dark:hover:bg-brand-500/5',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
                Reading the QR code…
              </p>
            </>
          ) : found ? (
            <>
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Found {found} — opening…
              </p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                <UploadCloud className="h-7 w-7 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Drop an image here, or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  A photo of the sticker or a screenshot · PNG, JPG, WEBP · max 15 MB
                </p>
              </div>
              <div className="mt-1 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5">
                <ClipboardPaste className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  or press <kbd className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold">Ctrl</kbd>
                  {' + '}
                  <kbd className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold">V</kbd>
                  {' '}to paste a screenshot
                </span>
              </div>
            </>
          )}

          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = '' // let the same file be re-picked after a failure
            }}
          />
        </label>

        {preview && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Your image</span>
              <button
                onClick={() => {
                  URL.revokeObjectURL(preview)
                  setPreview(null)
                  setFound(null)
                  setError('')
                }}
                className="btn-ghost btn-sm text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
            <img
              src={preview}
              alt="Uploaded QR code"
              className="mx-auto max-h-56 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
            />
          </div>
        )}
      </div>

      {error && <Notice>{error}</Notice>}
    </>
  )
}

/* ── Manual ───────────────────────────────────────────────────────────── */

function ManualTab({ onFound }) {
  const [value, setValue] = useState('')

  function submit(e) {
    e.preventDefault()
    const asset = extractAssetId(value.trim())
    if (!asset) {
      toast.error('Enter a QR number like DMS000001')
      return
    }
    onFound(asset)
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Keyboard className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold">Enter the QR number</h2>
      </div>

      <form onSubmit={submit}>
        <Field
          label="QR Number"
          hint="Printed under the QR code on the sticker — e.g. DMS000001. Pasting the full scan URL works too."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono uppercase"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="DMS000001"
              autoFocus
            />
            <button type="submit" className="btn-primary shrink-0">
              Open
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Field>
      </form>
    </div>
  )
}

/* ── Shared ───────────────────────────────────────────────────────────── */

function Notice({ children }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">{children}</p>
    </div>
  )
}
