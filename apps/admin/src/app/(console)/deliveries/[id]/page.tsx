'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner, StatusBadge, Timeline } from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime, formatNaira, googleMapsLink, VEHICLE_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import { eligibleRiders } from '@/lib/riders'
import type { Board, DeliveryDetail } from '@/lib/types'

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { can } = useSession()
  const delivery = useApi<DeliveryDetail>(`/v1/admin/deliveries/${id}`, { refreshMs: 10_000 })
  const d = delivery.data

  const dispatchActions = can('dispatchActions')
  // The list of riders is only needed (and only allowed) when this delivery can be assigned
  const board = useApi<Board>(dispatchActions && d?.status === 'SEARCHING_RIDER' ? '/v1/admin/dispatch/board' : null, { refreshMs: 10_000 })

  if (delivery.loading) return <Spinner label="Loading delivery" />
  if (delivery.error || !d) {
    return (
      <>
        <PageHeader title="Delivery" />
        <Notice tone="danger">{delivery.error?.status === 404 ? 'This delivery was not found.' : (delivery.error?.message ?? 'Could not load this delivery.')}</Notice>
        <Link href="/deliveries">Back to deliveries</Link>
      </>
    )
  }

  const choices = board.data ? eligibleRiders(board.data.riders, d.vehicleType, { lat: d.pickupLat, lng: d.pickupLng }) : []
  const money = d.chargedAt ? (d.refundedAt ? 'Refunded to the business' : d.settledAt ? 'Paid out: rider and platform shares settled' : 'Held in escrow') : 'Not charged (booked before wallets existed)'
  const stuck = (d.status === 'FAILED' || d.status === 'RETURNED') && d.chargedAt && !d.settledAt && !d.refundedAt
  const canRefund = can('refundSettle') && Boolean(d.chargedAt) && !d.settledAt && !d.refundedAt && ['CANCELLED', 'FAILED', 'RETURNED'].includes(d.status)
  const canSettle = can('refundSettle') && Boolean(d.chargedAt) && !d.settledAt && !d.refundedAt && ['DELIVERED', 'FAILED'].includes(d.status) && Boolean(d.riderId)
  const reload = () => {
    delivery.reload()
    board.reload()
  }

  return (
    <>
      <PageHeader
        title={d.trackingCode}
        subtitle={`Booked ${formatDateTime(d.createdAt)} by ${d.business.companyName}`}
        actions={<StatusBadge status={d.status} />}
      />
      <p className="small">
        <Link href="/deliveries">&larr; All deliveries</Link>
      </p>

      {stuck ? <Notice tone="warning">This delivery did not complete. Decide who gets the money: refund the business, or pay the rider.</Notice> : null}
      {d.cancelReason ? <Notice tone="danger">Cancelled: {d.cancelReason}</Notice> : null}

      <div className="two-col two-col-wide">
        <div className="stack">
          <section className="card">
            <h2>Progress</h2>
            <Timeline events={d.events} />
          </section>

          <section className="card stack">
            <h2>Trip</h2>
            <div className="two-col">
              <div>
                <span className="muted small">Pickup</span>
                <p>{d.pickupAddress}</p>
                <p className="muted small">{d.pickupContactName} · {d.pickupContactPhone}</p>
                <a className="small" href={googleMapsLink(d.pickupLat, d.pickupLng)} target="_blank" rel="noopener noreferrer">Open on a map</a>
              </div>
              <div>
                <span className="muted small">Drop-off</span>
                <p>{d.dropoffAddress}</p>
                <p className="muted small">{d.recipientName} · {d.recipientPhone}</p>
              </div>
            </div>
            <hr />
            <dl className="summary">
              <div><dt>Package</dt><dd>{d.packageDescription}</dd></div>
              <div><dt>Weight</dt><dd>{d.weightKg} kg</dd></div>
              {d.declaredValue !== null ? <div><dt>Declared value</dt><dd>{formatNaira(d.declaredValue)}</dd></div> : null}
              {d.isFragile ? <div><dt>Handling</dt><dd>Fragile</dd></div> : null}
              {d.notes ? <div><dt>Notes</dt><dd>{d.notes}</dd></div> : null}
            </dl>
          </section>

          <section className="card stack">
            <h2>Offers to riders</h2>
            {d.assignments.length === 0 ? <p className="muted">No rider has been offered this delivery yet.</p> : null}
            {d.assignments.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Rider</th><th>Result</th><th>Offered</th><th>Answered</th></tr>
                  </thead>
                  <tbody>
                    {d.assignments.map((a) => (
                      <tr key={a.id}>
                        <td><Link href={`/riders/${a.riderId}`}>{a.rider.user.fullName ?? a.rider.user.phone}</Link></td>
                        <td>
                          <Badge tone={a.status === 'ACCEPTED' ? 'success' : a.status === 'OFFERED' ? 'info' : 'neutral'}>{a.status.replace('_', ' ').toLowerCase()}</Badge>
                          {a.declineReason ? <div className="muted small">{a.declineReason.replace('_', ' ').toLowerCase()}</div> : null}
                        </td>
                        <td className="small">{formatDateTime(a.offeredAt)}</td>
                        <td className="small">{formatDateTime(a.respondedAt)}</td>
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
            <h2>Money</h2>
            <div className="price">{formatNaira(d.price)}</div>
            <dl className="summary">
              <div><dt>Rider gets</dt><dd>{formatNaira(d.riderPayoutAmount)}</dd></div>
              <div><dt>Platform commission</dt><dd>{formatNaira(d.commissionAmount)}</dd></div>
              <div><dt>Distance</dt><dd>{d.distanceKm} km</dd></div>
              <div><dt>Vehicle</dt><dd>{VEHICLE_LABELS[d.vehicleType] ?? d.vehicleType}</dd></div>
              <div><dt>Area</dt><dd>{d.zone.name}</dd></div>
            </dl>
            <p className="muted small">{money}</p>
            <div className="stack">
              {canRefund ? (
                <ActionForm
                  label="Refund the business"
                  confirmText="The full price goes back to the business wallet. The rider is not paid."
                  confirmLabel="Refund"
                  onSubmit={() => api(`/v1/admin/deliveries/${d.id}/refund`, { method: 'POST' })}
                  onDone={reload}
                />
              ) : null}
              {canSettle ? (
                <ActionForm
                  label="Pay the rider"
                  confirmText="The rider receives their share and the platform keeps its commission. The business is not refunded."
                  confirmLabel="Pay rider"
                  onSubmit={() => api(`/v1/admin/deliveries/${d.id}/settle`, { method: 'POST' })}
                  onDone={reload}
                />
              ) : null}
            </div>
          </section>

          {dispatchActions && d.status === 'SEARCHING_RIDER' ? (
            <section className="card stack">
              <h2>Assign a rider</h2>
              {board.loading ? <Spinner /> : null}
              {board.data && choices.length === 0 ? <p className="muted">No {VEHICLE_LABELS[d.vehicleType] ?? d.vehicleType} rider is free right now.</p> : null}
              <ActionForm
                label="Choose a rider"
                tone="primary"
                disabled={choices.length === 0}
                confirmLabel="Assign"
                fields={[
                  {
                    name: 'riderId',
                    label: 'Rider (nearest first)',
                    kind: 'select',
                    required: true,
                    options: [{ value: '', label: 'Choose a rider' }, ...choices.map((c) => ({ value: c.rider.id, label: `${c.rider.name ?? c.rider.phone}${c.distanceKm !== null ? ` · ${c.distanceKm} km` : ''}` }))],
                  },
                  { name: 'note', label: 'Note (optional)' },
                ]}
                onSubmit={(v) => api(`/v1/admin/deliveries/${d.id}/assign`, { method: 'POST', body: { riderId: v.riderId, note: v.note || undefined } })}
                onDone={reload}
              />
            </section>
          ) : null}

          {dispatchActions && d.status === 'ASSIGNED' ? (
            <section className="card stack">
              <h2>Rider</h2>
              {d.assignments.filter((a) => a.status === 'ACCEPTED').map((a) => (
                <p key={a.id}>
                  <Link href={`/riders/${a.riderId}`}>{a.rider.user.fullName ?? a.rider.user.phone}</Link>
                  <span className="muted small"> · {a.rider.user.phone}</span>
                </p>
              ))}
              <ActionForm
                label="Take rider off"
                confirmLabel="Unassign"
                fields={[{ name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 }]}
                onSubmit={(v) => api(`/v1/admin/deliveries/${d.id}/unassign`, { method: 'POST', body: { reason: v.reason } })}
                onDone={reload}
              />
            </section>
          ) : null}

          {dispatchActions && (d.status === 'SEARCHING_RIDER' || d.status === 'ASSIGNED') ? (
            <section className="card stack">
              <h2>Cancel</h2>
              <ActionForm
                label="Cancel delivery"
                tone="danger"
                confirmLabel="Cancel and refund"
                fields={[{ name: 'reason', label: 'Reason (the business can see this)', kind: 'textarea', required: true, minLength: 5 }]}
                onSubmit={(v) => api(`/v1/admin/deliveries/${d.id}/cancel`, { method: 'POST', body: { reason: v.reason } })}
                onDone={reload}
              />
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}
