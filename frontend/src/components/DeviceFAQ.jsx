import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  HelpCircle, Plus, Pencil, Trash2, ChevronDown, Ticket, EyeOff, Eye, GripVertical,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import api, { errMsg } from '../lib/api'
import { Modal, Field, Spinner, EmptyState, ConfirmDialog } from './UI'

/**
 * Per-device FAQ. Readable by anyone who scans the QR; only an admin sees the
 * add/edit/delete controls, and only an admin ever receives unpublished drafts
 * from the API.
 */
export default function DeviceFAQ({ deviceId, faqs = [], isAdmin, onChanged }) {
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null) // null = closed, {} = new
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const visible = isAdmin ? faqs : faqs.filter((f) => f.is_published)

  function toggle(faq) {
    const next = openId === faq.id ? null : faq.id
    setOpenId(next)
    // Count a read so an admin can see which answers people actually need.
    // Fire-and-forget — a failed count must never disturb the reader.
    if (next) api.post(`/faqs/${faq.id}/view`).catch(() => {})
  }

  async function remove() {
    setDeleting(true)
    try {
      await api.delete(`/faqs/${confirmDel.id}`)
      toast.success('FAQ deleted')
      setConfirmDel(null)
      onChanged?.()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setDeleting(false)
    }
  }

  // Publishing is the single most common edit, so it gets its own control
  // rather than making the admin open the form to tick one box.
  async function togglePublished(faq) {
    setTogglingId(faq.id)
    try {
      // PUT replaces the whole entry, so resend the fields we are not changing.
      await api.put(`/faqs/${faq.id}`, {
        question: faq.question,
        answer: faq.answer,
        sort_order: faq.sort_order,
        is_published: !faq.is_published,
      })
      toast.success(faq.is_published ? 'Moved to drafts — hidden from users' : 'Published — users can see it now')
      onChanged?.()
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setTogglingId(null)
    }
  }

  if (!visible.length) {
    return (
      <>
        <EmptyState
          icon={HelpCircle}
          title="No FAQs yet"
          message={
            isAdmin
              ? 'Add answers to the questions people ask about this device. You can also turn any resolved ticket into an FAQ from the Queries page.'
              : 'No questions have been answered for this device yet. If you have an issue, raise a query and the admin will respond.'
          }
          action={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setEditing({})}>
                <Plus className="h-4 w-4" />
                Add the first FAQ
              </button>
            ) : null
          }
        />
        <FAQModal deviceId={deviceId} faq={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged?.() }} />
      </>
    )
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {visible.length} question{visible.length === 1 ? '' : 's'} answered for this device.
        </p>
        {isAdmin && (
          <button className="btn-secondary btn-sm" onClick={() => setEditing({})}>
            <Plus className="h-3.5 w-3.5" />
            Add FAQ
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
        {visible.map((faq) => {
          const isOpen = openId === faq.id
          return (
            <div key={faq.id} className={clsx(!faq.is_published && 'bg-amber-50/40 dark:bg-amber-500/[0.04]')}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggle(faq)}
                  aria-expanded={isOpen}
                  className="flex flex-1 items-start gap-3 py-4 pr-2 text-left"
                >
                  <ChevronDown
                    className={clsx(
                      'mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
                      isOpen && 'rotate-180 text-brand-600',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm font-semibold', isOpen ? 'text-brand-700 dark:text-brand-400' : 'text-slate-800 dark:text-slate-100')}>
                      {faq.question}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {faq.source_ticket && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Ticket className="h-3 w-3" />
                          <span className="font-mono">{faq.source_ticket}</span>
                        </span>
                      )}
                      {!faq.is_published && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          <EyeOff className="h-3 w-3" />
                          Draft — click Publish to show it to users
                        </span>
                      )}
                      {isAdmin && faq.view_count > 0 && (
                        <span className="text-[10px] text-slate-400">{faq.view_count} views</span>
                      )}
                    </span>
                  </span>
                </button>

                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-0.5 py-4">
                    <button
                      onClick={() => togglePublished(faq)}
                      disabled={togglingId === faq.id}
                      className={clsx(
                        'btn-sm inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                        faq.is_published
                          ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600'
                          : 'bg-amber-500 text-white hover:bg-amber-600',
                      )}
                      title={faq.is_published ? 'Hide from users (move to drafts)' : 'Publish so users can see it'}
                    >
                      {togglingId === faq.id ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : faq.is_published ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {!faq.is_published && 'Publish'}
                    </button>

                    <button onClick={() => setEditing(faq)} className="btn-ghost btn-sm" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDel(faq)}
                      className="btn-ghost btn-sm text-slate-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pb-5 pl-7 pr-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                        {faq.answer}
                      </p>
                      {faq.created_by_name && (
                        <p className="mt-3 text-[10px] text-slate-400">
                          Answered by {faq.created_by_name}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      <FAQModal
        deviceId={deviceId}
        faq={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onChanged?.() }}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        loading={deleting}
        title="Delete this FAQ?"
        message={`"${confirmDel?.question}" will be permanently removed from this device.`}
        confirmLabel="Delete FAQ"
        onConfirm={remove}
      />
    </>
  )
}

/* ── Add / edit ───────────────────────────────────────────────────────── */

function FAQModal({ deviceId, faq, onClose, onSaved }) {
  const isEdit = !!faq?.id

  const [form, setForm] = useState({ question: '', answer: '', is_published: true, sort_order: 0 })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Reset from the incoming faq each time the modal opens.
  const [lastId, setLastId] = useState(undefined)
  if (faq && faq.id !== lastId) {
    setLastId(faq.id)
    setForm({
      question: faq.question || '',
      answer: faq.answer || '',
      is_published: faq.is_published ?? true,
      sort_order: faq.sort_order || 0,
    })
    setErrors({})
  }

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined }))
  }

  async function save(e) {
    e?.preventDefault()

    const err = {}
    if (form.question.trim().length < 5) err.question = 'Please enter a question of at least 5 characters'
    if (form.answer.trim().length < 5) err.answer = 'Please enter an answer of at least 5 characters'
    setErrors(err)
    if (Object.keys(err).length) return

    setSaving(true)
    try {
      if (isEdit) {
        await api.put(`/faqs/${faq.id}`, form)
        toast.success('FAQ updated')
      } else {
        await api.post(`/devices/${deviceId}/faqs`, form)
        toast.success('FAQ added')
      }
      onSaved()
    } catch (e2) {
      toast.error(errMsg(e2))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!faq}
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Edit FAQ' : 'Add an FAQ'}
      subtitle="Shown to anyone who scans this device's QR code."
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add FAQ'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-5">
        {faq?.source_ticket && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5 text-xs text-slate-500">
            <Ticket className="h-3.5 w-3.5 shrink-0" />
            Created from ticket <span className="font-mono font-semibold">{faq.source_ticket}</span>
          </div>
        )}

        <Field label="Question" required error={errors.question}>
          <input
            className={clsx('input', errors.question && 'input-error')}
            value={form.question}
            onChange={set('question')}
            placeholder="e.g. Why does the printer show a paper jam when there is no paper stuck?"
            maxLength={400}
            autoFocus
          />
        </Field>

        <Field
          label="Answer"
          required
          error={errors.answer}
          hint="Write it for the person standing at the device — plain steps, no jargon."
        >
          <textarea
            rows={6}
            className={clsx('input resize-y', errors.answer && 'input-error')}
            value={form.answer}
            onChange={set('answer')}
            placeholder="Open the rear panel and check the roller for torn paper fragments…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display order" hint="Lower numbers appear first.">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="number"
                className="input"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              />
            </div>
          </Field>

          <Field label="Visibility">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block text-sm font-medium">Published</span>
                <span className="block text-[11px] text-slate-400 leading-tight">
                  Uncheck to keep it as a draft only admins can see.
                </span>
              </span>
            </label>
          </Field>
        </div>
      </form>
    </Modal>
  )
}
