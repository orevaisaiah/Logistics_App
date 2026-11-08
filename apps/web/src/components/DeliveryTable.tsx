'use client'

import Link from 'next/link'
import { formatDateTime, formatNaira } from '@/lib/format'
import type { DeliveryListItem } from '@/lib/types'
import { StatusBadge } from './ui'

export default function DeliveryTable({ items }: { items: DeliveryListItem[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Tracking code</th>
            <th>Status</th>
            <th>Recipient</th>
            <th className="num">Price</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
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
                {d.recipientName}
                <div className="muted small ellipsis">{d.dropoffAddress}</div>
              </td>
              <td className="num">{formatNaira(d.price)}</td>
              <td className="small">{formatDateTime(d.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
