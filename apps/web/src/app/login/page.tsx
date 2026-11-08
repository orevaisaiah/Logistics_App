'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/api'
import { Notice } from '@/components/ui'

const RESEND_SECONDS = 30

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Counts down until a new code may be requested
  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [secondsLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  async function requestCode(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/v1/auth/otp/request', { method: 'POST', body: { phone } })
      setStep('code')
      setSecondsLeft(RESEND_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/verify', { method: 'POST', body: { phone, code: code.trim(), fullName } })
      router.replace('/dashboard')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="card narrow">
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true" />
          <strong>Business dashboard</strong>
        </div>

        {step === 'phone' ? (
          <form onSubmit={(e) => void requestCode(e)} className="stack">
            <h1>Sign in or create an account</h1>
            <p className="muted">Enter your phone number. We will text you a 6-digit code.</p>
            <label className="field">
              <span>Phone number</span>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="08031234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <button className="btn btn-primary btn-block" disabled={busy || phone.trim().length < 10}>
              {busy ? 'Sending code...' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void verify(e)} className="stack">
            <h1>Enter your code</h1>
            <p className="muted">We sent a code to {phone}.</p>
            <label className="field">
              <span>6-digit code</span>
              <input
                className="input input-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Your name (only needed for a new account)</span>
              <input className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Chidi Eze" />
            </label>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Checking...' : 'Continue'}
            </button>
            <div className="row row-between">
              <button type="button" className="link-button" onClick={() => { setStep('phone'); setCode(''); setError(null) }}>
                Use a different number
              </button>
              <button type="button" className="link-button" disabled={busy || secondsLeft > 0} onClick={() => void requestCode()}>
                {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
