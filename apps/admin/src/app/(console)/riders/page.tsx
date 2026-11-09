'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Chips, Notice, PageHeader, Pager, Spinner } from '@/components/ui'
import { formatDateTime, VEHICLE_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page } from '@/lib/types'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL'
const FILTERS: { value: Status; label: string }[] = [
  { value: 'PENDING', label: 'Waiting for review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ALL', label: 'All' },
]
const PAGE_SIZE = 20

interface RiderRow {
  id: string
  verificationStatus: string
  submittedAt: string | null
  vehicleType: string | null
  serviceArea: string | null
  user: { fullName: string | null; phone: string }
  _count: { documents: number }
}

export default function RidersPage() {
  const { can } = useSession()
  const [status, setStatus] = useState<Status>('PENDING')
  const [page, setPage] = useState(1)
  const list = useApi<Page<RiderRow>>(can('riderReview') ? `/v1/admin/riders?status=${status}&page=${page}&limit=${PAGE_SIZE}` : null, { refreshMs: 30_000 })

  if (!can('riderReview')) return <Notice tone="warning">Your role cannot review rider applications.</Notice>

  return (
    <>
      <PageHeader title="Riders" subtitle="Applications are listed oldest first, so the longest wait is at the top." />
      <Chips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No riders in this view.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Rider</th><th>Vehicle</th><th>Area</th><th>Documents</th><th>Submitted</th><th /></tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.user.fullName ?? 'No name'}</strong>
                      <div className="muted small">{r.user.phone}</div>
                    </td>
                    <td>{VEHICLE_LABELS[r.vehicleType ?? ''] ?? r.vehicleType}</td>
                    <td>{r.serviceArea}</td>
                    <td>{r._count.documents} of 5</td>
                    <td className="small">{formatDateTime(r.submittedAt)}</td>
                    <td className="num"><Link className="btn btn-secondary btn-sm" href={`/riders/${r.id}`}>Open</Link></td>
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
