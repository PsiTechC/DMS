import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, Camera, CameraOff, Keyboard, ArrowRight, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader, Field } from '../components/UI'

const SCANNER_ID = 'dms-qr-reader'

export default function ScanQR() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const scannerRef = useRef(null)

  // Stop the camera on unmount — a live stream left running keeps the device's
  // camera indicator on and drains battery.
  useEffect(() => {
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function extractAssetId(text) {
    // The QR encodes a full URL, but accept a bare asset ID too so a typed or
    // differently-encoded code still resolves.
    const match = text.match(/DMS\d{6,}/i)
    return match ? match[0].toUpperCase() : null
  }

  async function stopScanner() {
    const s = scannerRef.current
    if (!s) return
    try {
      await s.stop()
      s.clear()
    } catch {
      // Already stopped — nothing to do.
    }
    scannerRef.current = null
  }

  async function startScanner() {
    setError('')
    setScanning(true)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(SCANNER_ID)
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
          navigate(`/device/${asset}`)
        },
        () => {
          // Per-frame decode misses are normal; ignore them.
        },
      )
    } catch (e) {
      setScanning(false)
      scannerRef.current = null
      setError(
        e?.message?.includes('Permission') || e?.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera permission in your browser, or enter the QR number manually below.'
          : 'Could not start the camera. Your device may not have one, or another app is using it. Enter the QR number manually below.',
      )
    }
  }

  async function stop() {
    await stopScanner()
    setScanning(false)
  }

  function goManual(e) {
    e.preventDefault()
    const asset = extractAssetId(manual.trim())
    if (!asset) {
      toast.error('Enter a QR number like DMS000001')
      return
    }
    navigate(`/device/${asset}`)
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Scan QR Code" subtitle="Point your camera at a device label, or enter the code by hand." icon={ScanLine} />

      <div className="card overflow-hidden">
        <div className="relative flex aspect-square items-center justify-center bg-slate-900 sm:aspect-video">
          {/* html5-qrcode injects the video element into this div. */}
          <div id={SCANNER_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                <Camera className="h-8 w-8 text-white/70" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Camera is off</p>
                <p className="mt-1 text-xs text-white/50">Start the scanner to read a QR label</p>
              </div>
              <button className="btn-primary" onClick={startScanner}>
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
            <button className="btn-secondary btn-sm" onClick={stop}>
              <CameraOff className="h-3.5 w-3.5" />
              Stop
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      <div className="card mt-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold">Enter the QR number manually</h2>
        </div>

        <form onSubmit={goManual}>
          <Field label="QR Number" hint="Printed under the QR code on the sticker — e.g. DMS000001.">
            <div className="flex gap-2">
              <input
                className="input font-mono uppercase"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="DMS000001"
              />
              <button type="submit" className="btn-primary shrink-0">
                Open
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </Field>
        </form>
      </div>
    </div>
  )
}
