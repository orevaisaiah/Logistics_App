'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/api'
import { Notice, Spinner } from '@/components/ui'

export default function OnboardingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState({ companyName: '', registrationNumber: '', businessType: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only signed-in users without a business belong here
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await api('/v1/me')
        await api('/v1/business')
        if (!cancelled) router.replace('/dashboard')
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) router.replace('/login')
        else setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const clean = (v: string) => (v.trim() === '' ? undefined : v.trim())
    try {
      await api('/v1/business', {
        method: 'POST',
        body: {
          companyName: form.companyName.trim(),
          registrationNumber: clean(form.registrationNumber),
          businessType: clean(form.businessType),
          address: clean(form.address),
        },
      })
      router.replace('/dashboard')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    )
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  return (
    <div className="center-screen">
      <form className="card narrow stack" onSubmit={(e) => void submit(e)}>
        <h1>Set up your business</h1>
        <p className="muted">Tell us about your business. You can change these details later in Settings.</p>
        <label className="field">
          <span>Business name</span>
          <input className="input" value={form.companyName} onChange={set('companyName')} required minLength={2} autoFocus />
        </label>
        <label className="field">
          <span>Type of business (optional)</span>
          <input className="input" value={form.businessType} onChange={set('businessType')} placeholder="Fashion store, pharmacy, restaurant" />
        </label>
        <label className="field">
          <span>Registration number (optional)</span>
          <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="RC1234567" />
        </label>
        <label className="field">
          <span>Business address (optional)</span>
          <input className="input" value={form.address} onChange={set('address')} />
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <button className="btn btn-primary btn-block" disabled={busy || form.companyName.trim().length < 2}>
          {busy ? 'Saving...' : 'Create business'}
        </button>
      </form>
    </div>
  )
}
