'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export default function TrackIndexPage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function go(event: FormEvent) {
    event.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean) router.push(`/track/${encodeURIComponent(clean)}`)
  }

  return (
    <div className="center-screen">
      <form className="card narrow stack" onSubmit={go}>
        <h1>Track a delivery</h1>
        <p className="muted">Enter the tracking code you were given, for example LG-7K2M9XQD.</p>
        <label className="field">
          <span>Tracking code</span>
          <input className="input mono" value={code} onChange={(e) => setCode(e.target.value)} autoFocus placeholder="LG-XXXXXXXX" />
        </label>
        <button className="btn btn-primary btn-block" disabled={code.trim().length < 6}>
          Track
        </button>
      </form>
    </div>
  )
}
