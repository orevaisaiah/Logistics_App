'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner, StatusBadge, Timeline } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { CANCELLABLE_STATUSES, formatDateTime, formatNaira, googleMapsLink, VEHICLE_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { DeliveryDetail } from '@/lib/types'

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { can } = useSession()
  const delivery = useApi<DeliveryDetail>(`/v1/deliveries/${id}`, { refreshMs: 10_000 })

  const [copied, setCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const d = delivery.data

  async function copyTrackingLink() {
    if (!d) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/track/${d.trackingCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this tracking link', `${window.location.origin}/track/${d.trackingCode}`)
    }
  }

  async function cancel() {
    setBusy(true)
    setCancelError(null)
    try {
      await api(`/v1/deliveries/${id}/cancel`, { method: 'POST', body: { reason: reason.trim() } })
      setCancelling(false)
      setReason('')
      delivery.reload()
    } catch (err) {
      setCancelError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

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

  const canCancel = can.createDeliveries && CANCELLABLE_STATUSES.includes(d.status)
  const live = d.status === 'ASSIGNED' || d.status === 'PICKED_UP' || d.status === 'IN_TRANSIT'

  return (
    <>
      <PageHeader
        title={d.trackingCode}
        subtitle={`Booked ${formatDateTime(d.createdAt)}`}
        actions={
          <>
            <StatusBadge status={d.status} />
            <button className="btn btn-secondary" onClick={() => void copyTrackingLink()}>
              {copied ? 'Link copied' : 'Copy tracking link'}
            </button>
          </>
        }
      />
      <p className="small">
        <Link href="/deliveries">&larr; All deliveries</Link>
      </p>

      {d.status === 'CANCELLED' ? (
        <Notice tone="danger">
          This delivery was cancelled{d.cancelReason ? `: ${d.cancelReason}` : '.'} The amount was returned to your wallet.
        </Notice>
      ) : null}
      {d.status === 'FAILED' ? (
        <Notice tone="danger">The rider could not complete this delivery. Our team will contact you about the next steps.</Notice>
      ) : null}
      {d.status === 'SEARCHING_RIDER' ? <Notice tone="warning">We are looking for a rider near the pickup point. This page updates automatically.</Notice> : null}

      <div className="two-col two-col-wide">
        <div className="stack">
          <section className="card">
            <h2>Progress</h2>
            <Timeline events={d.events} />
          </section>

          <section className="card stack">
            <h2>Trip details</h2>
            <div className="two-col">
              <div>
                <span className="muted small">Pickup</span>
                <p>{d.pickupAddress}</p>
                <p className="muted small">
                  {d.pickupContactName} · {d.pickupContactPhone}
                </p>
              </div>
              <div>
                <span className="muted small">Drop-off</span>
                <p>{d.dropoffAddress}</p>
                <p className="muted small">
                  {d.recipientName} · {d.recipientPhone}
                </p>
              </div>
            </div>
            <hr />
            <dl className="summary">
              <div>
                <dt>Package</dt>
                <dd>{d.packageDescription}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{d.weightKg} kg</dd>
              </div>
              {d.declaredValue !== null ? (
                <div>
                  <dt>Declared value</dt>
                  <dd>{formatNaira(d.declaredValue)}</dd>
                </div>
              ) : null}
              {d.isFragile ? (
                <div>
                  <dt>Handling</dt>
                  <dd>Fragile</dd>
                </div>
              ) : null}
              {d.notes ? (
                <div>
                  <dt>Notes</dt>
                  <dd>{d.notes}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <h2>Summary</h2>
            <div className="price">{formatNaira(d.price)}</div>
            <dl className="summary">
              <div>
                <dt>Distance</dt>
                <dd>{d.distanceKm} km</dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>{VEHICLE_LABELS[d.vehicleType]}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>{d.zone.name}</dd>
              </div>
              {d.deliveredAt ? (
                <div>
                  <dt>Delivered</dt>
                  <dd>{formatDateTime(d.deliveredAt)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="card stack">
            <h2>Rider</h2>
            {!d.rider ? <p className="muted">No rider yet.</p> : null}
            {d.rider ? (
              <>
                <p>
                  <strong>{d.rider.user.fullName ?? 'Rider'}</strong>
                  {d.rider.avgRating > 0 ? <span className="muted"> · rated {d.rider.avgRating.toFixed(1)}</span> : null}
                </p>
                <p className="muted small">
                  {d.rider.vehicleType ? VEHICLE_LABELS[d.rider.vehicleType] : 'Vehicle'}
                  {d.rider.plateNumber ? ` · ${d.rider.plateNumber}` : ''}
                </p>
                {d.rider.user.phone ? (
                  <a className="btn btn-secondary btn-block" href={`tel:${d.rider.user.phone}`}>
                    Call {d.rider.user.phone}
                  </a>
                ) : null}
                {live && d.rider.currentLat !== null && d.rider.currentLng !== null ? (
                  <>
                    <a className="btn btn-secondary btn-block" href={googleMapsLink(d.rider.currentLat, d.rider.currentLng)} target="_blank" rel="noopener noreferrer">
                      See rider on a map
                    </a>
                    {d.rider.lastSeenAt ? <p className="muted small">Location updated {formatDateTime(d.rider.lastSeenAt)}</p> : null}
                  </>
                ) : null}
                {!live ? <p className="muted small">Rider contact details are hidden once a delivery is finished.</p> : null}
              </>
            ) : null}
          </section>

          {canCancel ? (
            <section className="card stack">
              <h2>Cancel delivery</h2>
              {!cancelling ? (
                <>
                  <p className="muted small">You can cancel until the rider collects the package. The full price returns to your wallet.</p>
                  <button className="btn btn-danger btn-block" onClick={() => setCancelling(true)}>
                    Cancel this delivery
                  </button>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Reason</span>
                    <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
                  </label>
                  {cancelError ? <Notice tone="danger">{cancelError}</Notice> : null}
                  <div className="row">
                    <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => void cancel()}>
                      {busy ? 'Cancelling...' : 'Confirm cancellation'}
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => setCancelling(false)}>
                      Keep delivery
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}
