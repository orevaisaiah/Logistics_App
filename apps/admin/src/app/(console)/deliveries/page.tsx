'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Chips, Notice, PageHeader, Pager, Spinner, StatusBadge } from '@/components/ui'
import { formatDateTime, formatNaira, STATUS_LABELS, VEHICLE_LABELS, type DeliveryStatus } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { DeliveryRow, Page } from '@/lib/types'

const FILTERS: { value: DeliveryStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...(['SEARCHING_RIDER', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED'] as DeliveryStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
]
const PAGE_SIZE = 20

export default function DeliveriesPage() {
  const [status, setStatus] = useState<DeliveryStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const list = useApi<Page<DeliveryRow>>(`/v1/admin/deliveries?limit=${PAGE_SIZE}&page=${page}${status === 'ALL' ? '' : `&status=${status}`}`, { refreshMs: 20_000 })

  return (
    <>
      <PageHeader title="Deliveries" subtitle={list.data ? `${list.data.total} in this view` : undefined} />
      <Chips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />

      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No deliveries match this filter.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking code</th>
                  <th>Business</th>
                  <th>Status</th>
                  <th>Route</th>
                  <th className="num">Price</th>
                  <th className="num">Rider gets</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/deliveries/${d.id}`} className="mono">
                        {d.trackingCode}
                      </Link>
                      <div className="muted small">{VEHICLE_LABELS[d.vehicleType] ?? d.vehicleType} · {d.zone.name}</div>
                    </td>
                    <td>
                      <Link href={`/businesses/${d.business.id}`}>{d.business.companyName}</Link>
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>
                      <div className="ellipsis small">{d.pickupAddress}</div>
                      <div className="ellipsis muted small">to {d.dropoffAddress}</div>
                    </td>
                    <td className="num">{formatNaira(d.price)}</td>
                    <td className="num">{formatNaira(d.riderPayoutAmount)}</td>
                    <td className="small">{formatDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {list.data ? <Pager page={page} total={list.data.total} limit={PAGE_SIZE} onChange={setPage} /> : null}
      </section>
    </>
  )
}
