'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime, formatNaira, koboToNairaText, nairaToKobo, STATUS_LABELS, type DeliveryStatus, type Tone } from '@/lib/format'
import { useApi } from '@/lib/hooks'

const TONES: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', SUSPENDED: 'danger' }
// The API stores the credit limit as a 32-bit number of kobo, so 10 million naira is the ceiling
const MAX_CREDIT_KOBO = 1_000_000_000

interface BusinessDetail {
  business: {
    id: string
    companyName: string
    registrationNumber: string | null
    businessType: string | null
    address: string | null
    verificationStatus: string
    creditLimit: number
    createdAt: string
    owner: { fullName: string | null; phone: string; email: string | null }
    members: { role: string; user: { fullName: string | null; phone: string } }[]
    wallet: { id: string; balance: number } | null
  }
  deliveriesByStatus: { status: DeliveryStatus; _count: number; _sum: { price: number | null } }[]
  recentDeliveries: { id: string; trackingCode: string; status: DeliveryStatus; price: number; createdAt: string }[]
}

export default function BusinessPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { can } = useSession()
  const detail = useApi<BusinessDetail>(can('businesses') ? `/v1/admin/businesses/${id}` : null)

  if (!can('businesses')) return <Notice tone="warning">Your role cannot open businesses.</Notice>
  if (detail.loading) return <Spinner label="Loading business" />
  if (detail.error || !detail.data) return <Notice tone="danger">{detail.error?.message ?? 'Could not load this business.'}</Notice>

  const { business: b, deliveriesByStatus, recentDeliveries } = detail.data
  const totalSpent = deliveriesByStatus.filter((g) => g.status === 'DELIVERED').reduce((sum, g) => sum + (g._sum.price ?? 0), 0)

  return (
    <>
      <PageHeader title={b.companyName} subtitle={`Joined ${formatDateTime(b.createdAt)}`} actions={<Badge tone={TONES[b.verificationStatus] ?? 'neutral'}>{b.verificationStatus.toLowerCase()}</Badge>} />
      <p className="small"><Link href="/businesses">&larr; All businesses</Link></p>

      <section className="grid stats">
        <StatCard label="Wallet balance" value={formatNaira(b.wallet?.balance ?? 0)} hint={b.wallet && can('finance') ? <Link href={`/finance/wallets/${b.wallet.id}`}>Open ledger</Link> : undefined} />
        <StatCard label="Credit limit" value={b.creditLimit > 0 ? formatNaira(b.creditLimit) : 'None'} />
        <StatCard label="Spent on delivered jobs" value={formatNaira(totalSpent)} />
      </section>

      <div className="two-col two-col-wide">
        <div className="stack">
          <section className="card stack">
            <h2>Details</h2>
            <dl className="summary">
              <div><dt>Owner</dt><dd>{b.owner.fullName ?? ''} · {b.owner.phone}</dd></div>
              {b.owner.email ? <div><dt>Email</dt><dd>{b.owner.email}</dd></div> : null}
              <div><dt>Type</dt><dd>{b.businessType}</dd></div>
              <div><dt>Registration number</dt><dd>{b.registrationNumber}</dd></div>
              <div><dt>Address</dt><dd>{b.address}</dd></div>
            </dl>
            <h2>Team</h2>
            {b.members.map((m) => (
              <p key={m.user.phone} className="small">{m.user.fullName ?? m.user.phone} · {m.role.toLowerCase()}</p>
            ))}
          </section>

          <section className="card stack">
            <h2>Recent deliveries</h2>
            {recentDeliveries.length === 0 ? <p className="muted">No deliveries yet.</p> : null}
            {recentDeliveries.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Delivery</th><th>Status</th><th>Booked</th><th className="num">Price</th></tr></thead>
                  <tbody>
                    {recentDeliveries.map((d) => (
                      <tr key={d.id}>
                        <td>{can('deliveries') ? <Link href={`/deliveries/${d.id}`} className="mono">{d.trackingCode}</Link> : <span className="mono">{d.trackingCode}</span>}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td className="small">{formatDateTime(d.createdAt)}</td>
                        <td className="num">{formatNaira(d.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <h2>Deliveries by status</h2>
            {deliveriesByStatus.length === 0 ? <p className="muted">None yet.</p> : null}
            <dl className="summary">
              {deliveriesByStatus.map((g) => (
                <div key={g.status}><dt>{STATUS_LABELS[g.status]}</dt><dd>{g._count}</dd></div>
              ))}
            </dl>
          </section>

          {can('businessCredit') ? (
            <section className="card stack">
              <h2>Credit limit</h2>
              <p className="muted small">Credit lets the business book deliveries beyond its wallet balance, up to the limit. Only grant it to businesses you trust to pay. Every change is logged.</p>
              <div>
                <ActionForm
                  label="Change credit limit"
                  confirmLabel="Save"
                  fields={[
                    { name: 'creditLimit', label: 'New limit in naira (0 for none)', required: true, initial: koboToNairaText(b.creditLimit) },
                    { name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 },
                  ]}
                  onSubmit={async (v) => {
                    const kobo = nairaToKobo(v.creditLimit)
                    if (kobo === null) throw new Error('Enter the limit in naira, for example 50000.')
                    if (kobo > MAX_CREDIT_KOBO) throw new Error('The highest credit limit is 10,000,000 naira.')
                    await api(`/v1/admin/businesses/${id}`, { method: 'PATCH', body: { creditLimit: kobo, reason: v.reason } })
                  }}
                  onDone={detail.reload}
                />
              </div>
            </section>
          ) : null}

          {can('businessStatus') ? (
            <section className="card stack">
              <h2>Account status</h2>
              <p className="muted small">Suspended and rejected businesses cannot book deliveries.</p>
              <div>
                <ActionForm
                  label="Change status"
                  confirmLabel="Save"
                  fields={[
                    { name: 'status', label: 'Status', kind: 'select', initial: b.verificationStatus, options: ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
                    { name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 },
                  ]}
                  onSubmit={(v) => api(`/v1/admin/businesses/${id}`, { method: 'PATCH', body: { verificationStatus: v.status, reason: v.reason } })}
                  onDone={detail.reload}
                />
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}
