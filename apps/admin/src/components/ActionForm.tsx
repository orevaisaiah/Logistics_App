'use client'

import { useState, type FormEvent } from 'react'
import { errorMessage } from '@/lib/api'
import { Notice } from './ui'

export type Field = {
  name: string
  label: string
  kind?: 'text' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  required?: boolean
  minLength?: number
  placeholder?: string
  initial?: string
  help?: string
}

type Props = {
  label: string
  tone?: 'primary' | 'secondary' | 'danger'
  fields?: Field[]
  // Shown instead of fields when the action only needs a confirmation
  confirmText?: string
  confirmLabel?: string
  disabled?: boolean
  small?: boolean
  onSubmit: (values: Record<string, string>) => Promise<void>
  onDone?: () => void
}

// A button that opens a small form (or a plain "are you sure"), runs the action, and shows any error.
// Used for every action that changes something, so they all behave the same way.
export default function ActionForm({ label, tone = 'secondary', fields = [], confirmText, confirmLabel, disabled, small, onSubmit, onDone }: Props) {
  const initialValues = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? '']))
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buttonClass = `btn btn-${tone}${small ? ' btn-sm' : ''}`

  if (!open) {
    return (
      <button type="button" className={buttonClass} disabled={disabled} onClick={() => { setValues(initialValues()); setError(null); setOpen(true) }}>
        {label}
      </button>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    for (const f of fields) {
      const v = (values[f.name] ?? '').trim()
      if (f.required && v === '') return setError(`${f.label} is required.`)
      if (f.minLength && v.length < f.minLength) return setError(`${f.label} must be at least ${f.minLength} characters.`)
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
      setOpen(false)
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inline-form stack" onSubmit={(e) => void submit(e)}>
      <strong>{label}</strong>
      {confirmText ? <p className="muted small">{confirmText}</p> : null}
      {fields.map((f) => (
        <label className="field" key={f.name}>
          <span>{f.label}</span>
          {f.kind === 'textarea' ? (
            <textarea className="input" rows={2} value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          ) : f.kind === 'select' ? (
            <select className="input" value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input className="input" value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          )}
          {f.help ? <span className="hint small">{f.help}</span> : null}
        </label>
      ))}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="row">
        <button className={`btn btn-${tone === 'secondary' ? 'primary' : tone}`} disabled={busy}>
          {busy ? 'Working...' : (confirmLabel ?? 'Confirm')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
