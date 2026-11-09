'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo } from 'react'
import ActionForm from '@/components/ActionForm'
import type { MapMarker } from '@/components/BoardMap'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner, StatCard, StatusBadge } from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime, formatDuration, formatNaira, VEHICLE_LABELS, type Tone } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import { parseCenter } from '@/lib/location'
import { eligibleRiders, type BoardRider } from '@/lib/riders'
import type { Board } from '@/lib/types'

const BoardMap = dynamic(() => import('@/components/BoardMap'), { ssr: false, loading: () => <div className="map map-tall map-loading">Loading map...</div> })

const STATE_LABELS: Record<BoardRider['state'], string> = { IDLE: 'Free', HAS_OFFER: 'Has an offer', ON_JOB: 'On a job', LOCATION_STALE: 'Location is old' }
const STATE_TONES: Record<BoardRider['state'], Tone> = { IDLE: 'success', HAS_OFFER: 'info', ON_JOB: 'warning', LOCATION_STALE: 'neutral' }
const STATE_COLORS: Record<BoardRider['state'], string> = { IDLE: '#16a34a', HAS_OFFER: '#2563eb', ON_JOB: '#d97706', LOCATION_STALE: '#6b7280' }

export default function DispatchPage() {
  const { can } = useSession()
  const board = useApi<Board>('/v1/admin/dispatch/board', { refreshMs: 5_000 })
  const center = useMemo(() => parseCenter(process.env.NEXT_PUBLIC_DEFAULT_CENTER), [])
  const actions = can('dispatchActions')
  const data = board.data

  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return []
    const riders = data.riders.flatMap((r) =>
      r.lat !== null && r.lng !== null ? [{ lat: r.lat, lng: r.lng, color: STATE_COLORS[r.state], label: `${r.name ?? r.phone} (${STATE_LABELS[r.state]})` }] : [],
    )
    const pickups = data.waiting.map((w) => ({ lat: w.pickupLat, lng: w.pickupLng, color: '#dc2626', big: true, label: `Waiting: ${w.trackingCode}` }))
    return [...riders, ...pickups]
  }, [data])

  if (board.loading) return <Spinner label="Loading the dispatch board" />
  if (board.error || !data) return <Notice tone="danger">{board.error?.message ?? 'Could not load the board.'}</Notice>

  const free = data.riders.filter((r) => r.state === 'IDLE').length

  return (
    <>
      <PageHeader title="Dispatch board" subtitle="Updates every 5 seconds. Only riders who are online or on a job appear here." />

      <section className="grid stats">
        <StatCard label="Waiting for a rider" value={data.waiting.length} tone={data.waiting.length > 0 ? 'warning' : undefined} />
        <StatCard label="In progress" value={data.inProgress.length} />
        <StatCard label="Free riders" value={free} hint={`${data.riders.length} online or on a job`} />
      </section>

      <section className="card stack">
        <div className="row row-between">
          <h2>Map</h2>
          <div className="legend small muted">
            <span><i style={{ background: '#dc2626' }} /> Waiting pickup</span>
            <span><i style={{ background: STATE_COLORS.IDLE }} /> Free rider</span>
            <span><i style={{ background: STATE_COLORS.HAS_OFFER }} /> Has an offer</span>
            <span><i style={{ background: STATE_COLORS.ON_JOB }} /> On a job</span>
            <span><i style={{ background: STATE_COLORS.LOCATION_STALE }} /> Old location</span>
          </div>
        </div>
        <BoardMap markers={markers} center={center} />
      </section>

      <section className="card stack">
        <h2>Waiting for a rider</h2>
        {data.waiting.length === 0 ? <p className="muted">No deliveries are waiting. Every booking has a rider.</p> : null}
        {data.waiting.map((w) => {
          const choices = eligibleRiders(data.riders, w.vehicleType, { lat: w.pickupLat, lng: w.pickupLng })
          return (
            <article key={w.id} className="item">
              <div className="row row-between">
                <div>
                  <Link href={`/deliveries/${w.id}`} className="mono">
                    <strong>{w.trackingCode}</strong>
                  </Link>{' '}
                  <span className="muted">· {w.business.companyName}</span>
                </div>
                <Badge tone={w.waitingSeconds > 180 ? 'danger' : 'warning'}>Waiting {formatDuration(w.waitingSeconds)}</Badge>
              </div>
              <p>{w.pickupAddress}</p>
              <p className="muted small">
                {VEHICLE_LABELS[w.vehicleType] ?? w.vehicleType} · {formatNaira(w.price)} · {w.offersMade} {w.offersMade === 1 ? 'offer' : 'offers'} made
                {w.lastOffer ? ` · last offer ${w.lastOffer.status.toLowerCase()}` : ''}
              </p>
              {actions ? (
                <div className="row">
                  <ActionForm
                    label="Assign a rider"
                    tone="primary"
                    small
                    disabled={choices.length === 0}
                    confirmLabel="Assign"
                    fields={[
                      {
                        name: 'riderId',
                        label: 'Rider (nearest first)',
                        kind: 'select',
                        required: true,
                        options: [
                          { value: '', label: 'Choose a rider' },
                          ...choices.map((c) => ({
                            value: c.rider.id,
                            label: `${c.rider.name ?? c.rider.phone}${c.distanceKm !== null ? ` · ${c.distanceKm} km` : ''} · ${STATE_LABELS[c.rider.state]}`,
                          })),
                        ],
                      },
                      { name: 'note', label: 'Note (optional)', placeholder: 'Arranged by phone' },
                    ]}
                    onSubmit={(v) => api(`/v1/admin/deliveries/${w.id}/assign`, { method: 'POST', body: { riderId: v.riderId, note: v.note || undefined } })}
                    onDone={board.reload}
                  />
                  <ActionForm
                    label="Cancel delivery"
                    tone="danger"
                    small
                    confirmLabel="Cancel and refund"
                    fields={[{ name: 'reason', label: 'Reason (the business can see this)', kind: 'textarea', required: true, minLength: 5 }]}
                    onSubmit={(v) => api(`/v1/admin/deliveries/${w.id}/cancel`, { method: 'POST', body: { reason: v.reason } })}
                    onDone={board.reload}
                  />
                  {choices.length === 0 ? <span className="muted small">No {VEHICLE_LABELS[w.vehicleType] ?? w.vehicleType} rider is free right now.</span> : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </section>

      <section className="card stack">
        <h2>In progress</h2>
        {data.inProgress.length === 0 ? <p className="muted">Nothing on the road.</p> : null}
        {data.inProgress.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th>Rider</th>
                  <th>Assigned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.inProgress.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/deliveries/${d.id}`} className="mono">
                        {d.trackingCode}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>
                      {d.rider ? <Link href={`/riders/${d.rider.id}`}>{d.rider.user.fullName ?? d.rider.user.phone}</Link> : ''}
                      <div className="muted small">{d.rider?.user.phone}</div>
                    </td>
                    <td className="small">{formatDateTime(d.assignedAt)}</td>
                    <td className="num">
                      {actions && d.status === 'ASSIGNED' ? (
                        <ActionForm
                          label="Take rider off"
                          small
                          confirmLabel="Unassign"
                          fields={[{ name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 }]}
                          onSubmit={(v) => api(`/v1/admin/deliveries/${d.id}/unassign`, { method: 'POST', body: { reason: v.reason } })}
                          onDone={board.reload}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card stack">
        <h2>Riders</h2>
        {data.riders.length === 0 ? <p className="muted">No riders are online.</p> : null}
        {data.riders.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Vehicle</th>
                  <th>State</th>
                  <th>Last seen</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {data.riders.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/riders/${r.id}`}>{r.name ?? r.phone}</Link>
                      <div className="muted small">{r.phone}</div>
                    </td>
                    <td>{VEHICLE_LABELS[r.vehicleType ?? ''] ?? r.vehicleType}</td>
                    <td>
                      <Badge tone={STATE_TONES[r.state]}>{STATE_LABELS[r.state]}</Badge>
                    </td>
                    <td className="small">{formatDateTime(r.lastSeenAt)}</td>
                    <td>{r.currentDelivery ? <Link href={`/deliveries/${r.currentDelivery.id}`}>View</Link> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}
