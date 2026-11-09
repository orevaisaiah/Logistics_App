'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/api'
import { Notice, Spinner } from '@/components/ui'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [forced, setForced] = useState<boolean | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only signed-in staff belong here
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await api<{ mustChangePassword: boolean }>('/v1/admin/auth/me')
        if (!cancelled) setForced(me.mustChangePassword)
      } catch (err) {
        if (!cancelled && err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace('/login')
        else if (!cancelled) setError(errorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (next !== again) return setError('The new password and its confirmation do not match.')
    setBusy(true)
    setError(null)
    try {
      await api('/v1/admin/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      // Every session was ended by the change, so clear this one too and sign in again
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
      router.replace('/login?changed=1')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (forced === null && !error) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="center-screen">
      <form className="card narrow stack" onSubmit={(e) => void submit(e)}>
        <h1>{forced ? 'Choose a new password' : 'Change your password'}</h1>
        {forced ? <Notice tone="warning">You are using a temporary password. Replace it to continue.</Notice> : null}
        <label className="field">
          <span>{forced ? 'Temporary password' : 'Current password'}</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />
          <span className="hint small">At least 12 characters. A short phrase of several words works well.</span>
        </label>
        <label className="field">
          <span>New password again</span>
          <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <button className="btn btn-primary btn-block" disabled={busy || next.length < 12}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
        <p className="hint small">You will be signed out everywhere and asked to sign in again.</p>
        {forced === false ? (
          <Link href="/overview" className="small">
            Back to the panel
          </Link>
        ) : null}
      </form>
    </div>
  )
}
