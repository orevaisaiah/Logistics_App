'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { DOCUMENT_LABELS, formatDateTime, formatNaira, formatPercent, VEHICLE_LABELS, type DeliveryStatus, type Tone } from '@/lib/format'
import { useApi } from '@/lib/hooks'

const REQUIRED = ['ID', 'LICENCE', 'VEHICLE_PAPERS', 'SELFIE', 'GUARANTOR_FORM']
const STATUS_TONES: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', SUSPENDED: 'danger' }

interface RiderDetail {
  id: string
  verificationStatus: string
  rejectionReason: string | null
  submittedAt: string | null
  dateOfBirth: string | null
  address: string | null
  vehicleType: string | null
  plateNumber: string | null
  serviceArea: string | null
  bankName: string | null
  accountNumber: string | null
  accountName: string | null
  user: { fullName: string | null; phone: string; email: string | null; createdAt: string }
  documents: { id: string; type: string; status: string; note: string | null; reviewedAt: string | null }[]
}

interface Performance {
  rider: { verificationStatus: string; suspensionReason: string | null; suspendedAt: string | null; isOnline: boolean; lastSeenAt: string | null }
  deliveriesByStatus: Record<string, number>
  offersByStatus: Record<string, number>
  acceptanceRate: number | null
  cancellationRate: number | null
  completionRate: number | null
  averageMinutesPickupToDelivery: number | null
  totalEarned: number
  paidJobs: number
  recentDeliveries: { id: string; trackingCode: string; status: DeliveryStatus; createdAt: string; riderPayoutAmount: number }[]
}

// One preview per document. The image comes through this site's server, which adds the admin's sign-in,
// and every view is recorded in the audit log by the API.
function DocumentPreview({ riderId, docId }: { riderId: string; docId: string }) {
  const [broken, setBroken] = useState(false)
  const url = `/api/v1/admin/riders/${riderId}/documents/${docId}/file`
  return (
    <div className="doc-preview">
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Uploaded document" onError={() => setBroken(true)} />
      ) : (
        <p className="muted small">No preview available (it may be a PDF).</p>
      )}
      <a className="small" href={url} target="_blank" rel="noopener noreferrer">
        Open full size
      </a>
    </div>
  )
}

export default function RiderPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { can } = useSession()
  const review = useApi<RiderDetail>(can('riderReview') ? `/v1/admin/riders/${id}` : null)
  const perf = useApi<Performance>(can('riderPerformance') ? `/v1/admin/riders/${id}/performance` : null)

  if (!can('riderReview') && !can('riderPerformance')) return <Notice tone="warning">Your role cannot open rider records.</Notice>
  if ((review.loading || perf.loading) && !review.data && !perf.data) return <Spinner label="Loading rider" />

  const r = review.data
  const p = perf.data
  const name = r?.user.fullName ?? 'Rider'
  const underReview = Boolean(r && r.submittedAt && r.verificationStatus === 'PENDING')
  const reloadAll = () => {
    review.reload()
    perf.reload()
  }

  return (
    <>
      <PageHeader title={name} subtitle={r?.user.phone} actions={r ? <Badge tone={STATUS_TONES[r.verificationStatus] ?? 'neutral'}>{r.verificationStatus.toLowerCase()}</Badge> : undefined} />
      <p className="small">
        <Link href="/riders">&larr; All riders</Link>
      </p>

      {review.error ? <Notice tone="danger">{review.error.message}</Notice> : null}
      {perf.error ? <Notice tone="danger">{perf.error.message}</Notice> : null}

      {r ? (
        <>
          {r.rejectionReason ? <Notice tone="danger">Rejected: {r.rejectionReason}</Notice> : null}
          <section className="card stack">
            <h2>Profile</h2>
            <dl className="summary">
              <div><dt>Name</dt><dd>{r.user.fullName ?? ''}</dd></div>
              <div><dt>Phone</dt><dd>{r.user.phone}</dd></div>
              <div><dt>Date of birth</dt><dd>{r.dateOfBirth ? new Date(r.dateOfBirth).toLocaleDateString('en-NG', { timeZone: 'UTC' }) : ''}</dd></div>
              <div><dt>Address</dt><dd>{r.address}</dd></div>
              <div><dt>Vehicle</dt><dd>{VEHICLE_LABELS[r.vehicleType ?? ''] ?? r.vehicleType} · {r.plateNumber}</dd></div>
              <div><dt>Area</dt><dd>{r.serviceArea}</dd></div>
              <div><dt>Bank</dt><dd>{r.bankName} · {r.accountNumber} · {r.accountName}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDateTime(r.submittedAt)}</dd></div>
            </dl>
          </section>

          <section className="card stack">
            <h2>Documents</h2>
            {!underReview ? <p className="muted small">Documents can be reviewed while the application is waiting for review.</p> : null}
            <div className="docs">
              {REQUIRED.map((type) => {
                const doc = r.documents.find((x) => x.type === type)
                return (
                  <article key={type} className="item stack">
                    <div className="row row-between">
                      <strong>{DOCUMENT_LABELS[type]}</strong>
                      {doc ? <Badge tone={doc.status === 'APPROVED' ? 'success' : doc.status === 'REJECTED' ? 'danger' : 'warning'}>{doc.status.toLowerCase()}</Badge> : <Badge>missing</Badge>}
                    </div>
                    {doc ? <DocumentPreview riderId={r.id} docId={doc.id} /> : <p className="muted small">Not uploaded.</p>}
                    {doc?.note ? <p className="muted small">Note: {doc.note}</p> : null}
                    {doc && underReview ? (
                      <div className="row">
                        <ActionForm label="Approve" small tone="primary" confirmText="Mark this document as correct." confirmLabel="Approve" onSubmit={() => api(`/v1/admin/riders/${r.id}/documents/${doc.id}`, { method: 'PATCH', body: { status: 'APPROVED' } })} onDone={reloadAll} />
                        <ActionForm label="Reject" small tone="danger" confirmLabel="Reject document" fields={[{ name: 'note', label: 'What is wrong with it? (the rider sees this)', kind: 'textarea', required: true, minLength: 3 }]} onSubmit={(v) => api(`/v1/admin/riders/${r.id}/documents/${doc.id}`, { method: 'PATCH', body: { status: 'REJECTED', note: v.note } })} onDone={reloadAll} />
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>

          {underReview ? (
            <section className="card stack">
              <h2>Decision</h2>
              <p className="muted small">Approve every document first. Approving the rider needs all five approved. Rejecting the application unlocks the rider to fix problems and apply again.</p>
              <div className="row">
                <ActionForm label="Approve rider" tone="primary" confirmText="The rider can go online and receive deliveries straight away." confirmLabel="Approve rider" onSubmit={() => api(`/v1/admin/riders/${r.id}/approve`, { method: 'POST' })} onDone={reloadAll} />
                <ActionForm label="Reject application" tone="danger" confirmLabel="Reject application" fields={[{ name: 'reason', label: 'Reason (the rider sees this)', kind: 'textarea', required: true, minLength: 5 }]} onSubmit={(v) => api(`/v1/admin/riders/${r.id}/reject`, { method: 'POST', body: { reason: v.reason } })} onDone={reloadAll} />
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {p ? (
        <>
          <section className="grid stats">
            <StatCard label="Acceptance rate" value={formatPercent(p.acceptanceRate)} hint="Offers accepted out of offers answered or ignored" />
            <StatCard label="Backed out of accepted jobs" value={formatPercent(p.cancellationRate)} />
            <StatCard label="Completion rate" value={formatPercent(p.completionRate)} hint="Delivered out of delivered plus failed" />
            <StatCard label="Average trip" value={p.averageMinutesPickupToDelivery === null ? 'n/a' : `${Math.round(p.averageMinutesPickupToDelivery)} min`} hint="Pickup to delivery" />
            <StatCard label="Total earned" value={formatNaira(p.totalEarned)} hint={`${p.paidJobs} paid ${p.paidJobs === 1 ? 'job' : 'jobs'}`} />
          </section>

          <section className="card stack">
            <h2>Recent deliveries</h2>
            {p.recentDeliveries.length === 0 ? <p className="muted">No deliveries yet.</p> : null}
            {p.recentDeliveries.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Delivery</th><th>Status</th><th>Booked</th><th className="num">Earned</th></tr></thead>
                  <tbody>
                    {p.recentDeliveries.map((d) => (
                      <tr key={d.id}>
                        <td>{can('deliveries') ? <Link href={`/deliveries/${d.id}`} className="mono">{d.trackingCode}</Link> : <span className="mono">{d.trackingCode}</span>}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td className="small">{formatDateTime(d.createdAt)}</td>
                        <td className="num">{formatNaira(d.riderPayoutAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {can('riderSuspend') ? (
            <section className="card stack">
              <h2>Suspension</h2>
              {p.rider.verificationStatus === 'APPROVED' ? (
                <>
                  <p className="muted small">A suspended rider goes offline and cannot work. A job they have only been assigned goes back to the search. A rider who has the package cannot be suspended until that delivery is resolved.</p>
                  <div><ActionForm label="Suspend rider" tone="danger" confirmLabel="Suspend" fields={[{ name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 }]} onSubmit={(v) => api(`/v1/admin/riders/${id}/suspend`, { method: 'POST', body: { reason: v.reason } })} onDone={reloadAll} /></div>
                </>
              ) : null}
              {p.rider.verificationStatus === 'SUSPENDED' ? (
                <>
                  <Notice tone="danger">Suspended {formatDateTime(p.rider.suspendedAt)}: {p.rider.suspensionReason}</Notice>
                  <div><ActionForm label="Reinstate rider" tone="primary" confirmText="The rider can go online again." confirmLabel="Reinstate" onSubmit={() => api(`/v1/admin/riders/${id}/reinstate`, { method: 'POST' })} onDone={reloadAll} /></div>
                </>
              ) : null}
              {p.rider.verificationStatus !== 'APPROVED' && p.rider.verificationStatus !== 'SUSPENDED' ? <p className="muted">Only approved riders can be suspended.</p> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  )
}
