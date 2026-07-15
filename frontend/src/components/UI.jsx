import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react'
import clsx from 'clsx'
import { lookup } from '../lib/constants'

/* ── Status badge ─────────────────────────────────────────────────────── */

export function Badge({ map, value, className }) {
  const { label, cls } = lookup(map, value)
  return <span className={clsx('badge', cls, className)}>{label}</span>
}

/* ── Page header ──────────────────────────────────────────────────────── */

export function PageHeader({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-600/15">
            <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/* ── Loading ──────────────────────────────────────────────────────────── */

export function Spinner({ className }) {
  return <Loader2 className={clsx('animate-spin', className || 'h-5 w-5')} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 w-16" />
        </div>
      ))}
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────────────── */

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {message && (
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{message}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ── Modal ────────────────────────────────────────────────────────────── */

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer }) {
  // Escape-to-close and body scroll lock while a modal is up.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={clsx(
              'relative w-full my-8 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl',
              'border border-slate-200 dark:border-slate-800',
              SIZES[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5">{children}</div>

            {footer && (
              <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ── Confirm dialog ───────────────────────────────────────────────────── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  danger = true,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            danger ? 'bg-red-100 dark:bg-red-500/15' : 'bg-amber-100 dark:bg-amber-500/15',
          )}
        >
          <AlertTriangle
            className={clsx('h-5 w-5', danger ? 'text-red-600' : 'text-amber-600')}
          />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1.5">
          {message}
        </p>
      </div>
    </Modal>
  )
}

/* ── Pagination ───────────────────────────────────────────────────────── */

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null

  const { page, total_pages: pages, total, limit } = meta
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  // Windowed page numbers: always show first/last, with a sliding middle.
  const numbers = []
  const push = (n) => !numbers.includes(n) && n >= 1 && n <= pages && numbers.push(n)
  push(1)
  for (let i = page - 1; i <= page + 1; i++) push(i)
  push(pages)
  numbers.sort((a, b) => a - b)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-4 py-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{from}–{to}</span> of{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {numbers.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && numbers[i - 1] !== n - 1 && (
              <span className="px-1.5 text-xs text-slate-400">…</span>
            )}
            <button
              onClick={() => onPage(n)}
              className={clsx(
                'min-w-[2rem] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
                n === page
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              {n}
            </button>
          </span>
        ))}

        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Debounced search box ─────────────────────────────────────────────── */

export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/* ── Field ────────────────────────────────────────────────────────────── */

export function Field({ label, required, error, hint, children, className }) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
      {hint && !error && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  )
}

/* ── Detail row ───────────────────────────────────────────────────────── */

export function DetailRow({ label, value, mono }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400 sm:w-44 shrink-0">{label}</dt>
      <dd className={clsx('text-sm font-medium break-words', mono && 'font-mono')}>
        {value || <span className="text-slate-400 font-normal">—</span>}
      </dd>
    </div>
  )
}

/* ── Click-outside hook ───────────────────────────────────────────────── */

export function useClickOutside(onOutside) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}
