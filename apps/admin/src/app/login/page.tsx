'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/api'
import { Notice } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  // After a password change the visitor lands here with ?changed=1
  useEffect(() => {
    const timer = setTimeout(() => setChanged(new URLSearchParams(window.location.search).get('changed') === '1'), 0)
    return () => clearTimeout(timer)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ mustChangePassword: boolean }>('/auth/login', { method: 'POST', body: { phone, password } })
      router.replace(result.mustChangePassword ? '/change-password' : '/overview')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form className="card narrow stack" onSubmit={(e) => void submit(e)}>
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true" />
          <strong>Admin panel</strong>
        </div>
        <h1>Staff sign-in</h1>
        {changed ? <Notice tone="success">Your password was changed. Sign in with the new password.</Notice> : null}
        <label className="field">
          <span>Phone number</span>
          <input className="input" type="tel" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus placeholder="08000000001" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <button className="btn btn-primary btn-block" disabled={busy || phone.trim().length < 10 || password.length === 0}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="hint small">Staff accounts are created by a super admin. If you are locked out, ask them to reset your password.</p>
      </form>
    </div>
  )
}
