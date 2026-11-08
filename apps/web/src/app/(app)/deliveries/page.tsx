'use client'

import Link from 'next/link'
import { useState } from 'react'
import DeliveryTable from '@/components/DeliveryTable'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner } from '@/components/ui'
import { STATUS_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { DeliveryListItem, DeliveryStatus, Page } from '@/lib/types'

const FILTERS: { value: DeliveryStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'SEARCHING_RIDER', label: STATUS_LABELS.SEARCHING_RIDER },
  { value: 'ASSIGNED', label: STATUS_LABELS.ASSIGNED },
  { value: 'PICKED_UP', label: STATUS_LABELS.PICKED_UP },
  { value: 'IN_TRANSIT', label: STATUS_LABELS.IN_TRANSIT },
  { value: 'DELIVERED', label: STATUS_LABELS.DELIVERED },
  { value: 'CANCELLED', label: STATUS_LABELS.CANCELLED },
  { value: 'FAILED', label: STATUS_LABELS.FAILED },
]

const PAGE_SIZE = 20

export default function DeliveriesPage() {
  const { can } = useSession()
  const [status, setStatus] = useState<DeliveryStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)

  const query = `/v1/deliveries?limit=${PAGE_SIZE}&page=${page}${status === 'ALL' ? '' : `&status=${status}`}`
  const list = useApi<Page<DeliveryListItem>>(query, { refreshMs: 20_000 })
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle={list.data ? `${list.data.total} ${list.data.total === 1 ? 'delivery' : 'deliveries'}` : undefined}
        actions={
          can.createDeliveries ? (
            <Link href="/deliveries/new" className="btn btn-primary">
              New delivery
            </Link>
          ) : null
        }
      />

      <div className="chips" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={status === f.value}
            className={status === f.value ? 'chip chip-active' : 'chip'}
            onClick={() => {
              setStatus(f.value)
              setPage(1)
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No deliveries match this filter.</p> : null}
        {list.data && list.data.items.length > 0 ? <DeliveryTable items={list.data.items} /> : null}

        {list.data && pages > 1 ? (
          <div className="row row-between pager">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="muted small">
              Page {page} of {pages}
            </span>
            <button className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </section>
    </>
  )
}
