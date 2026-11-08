'use client'

import { useRouter } from 'next/navigation'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatNaira } from '@/lib/format'

const VERIFICATION_LABELS = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
} as const

const ROLE_LABELS = { OWNER: 'Owner', DISPATCHER: 'Dispatcher', FINANCE: 'Finance', VIEWER: 'View only' } as const

export default function SettingsPage() {
  const router = useRouter()
  const { business, me, can, reload } = useSession()
  const [form, setForm] = useState({
    companyName: business.companyName,
    businessType: business.businessType ?? '',
    registrationNumber: business.registrationNumber ?? '',
    address: business.address ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value })
    setSaved(false)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/v1/business', { method: 'PATCH', body: { ...form, companyName: form.companyName.trim() } })
      setSaved(true)
      reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login')
  }

  return (
    <>
      <PageHeader title="Settings" />

      <section className="card stack">
        <h2>Business details</h2>
        <form className="stack" onSubmit={(e) => void save(e)}>
          <label className="field">
            <span>Business name</span>
            <input className="input" value={form.companyName} onChange={set('companyName')} disabled={!can.editBusiness} required minLength={2} />
          </label>
          <label className="field">
            <span>Type of business</span>
            <input className="input" value={form.businessType} onChange={set('businessType')} disabled={!can.editBusiness} />
          </label>
          <label className="field">
            <span>Registration number</span>
            <input className="input" value={form.registrationNumber} onChange={set('registrationNumber')} disabled={!can.editBusiness} />
          </label>
          <label className="field">
            <span>Address</span>
            <input className="input" value={form.address} onChange={set('address')} disabled={!can.editBusiness} />
          </label>
          {!can.editBusiness ? <p className="hint small">Only the business owner can change these details.</p> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {saved ? <Notice tone="success">Saved.</Notice> : null}
          {can.editBusiness ? (
            <div>
              <button className="btn btn-primary" disabled={busy || form.companyName.trim().length < 2}>
                {busy ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <section className="card stack">
        <h2>Account</h2>
        <dl className="summary">
          <div>
            <dt>Your name</dt>
            <dd>{me.fullName ?? 'Not set'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{me.phone}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{ROLE_LABELS[business.myRole]}</dd>
          </div>
          <div>
            <dt>Business status</dt>
            <dd>{VERIFICATION_LABELS[business.verificationStatus]}</dd>
          </div>
          <div>
            <dt>Credit limit</dt>
            <dd>{business.creditLimit > 0 ? formatNaira(business.creditLimit) : 'None'}</dd>
          </div>
        </dl>
        <div>
          <button className="btn btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </section>
    </>
  )
}
