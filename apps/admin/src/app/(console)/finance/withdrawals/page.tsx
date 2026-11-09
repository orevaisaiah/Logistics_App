'use client'

import { useState } from 'react'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Chips, Notice, PageHeader, Pager, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime, formatNaira, type Tone } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page } from '@/lib/types'

type Status = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'ALL'
const FILTERS: { value: Status; label: string }[] = [
  { value: 'REQUESTED', label: 'To approve' },
  { value: 'APPROVED', label: 'To pay' },
  { value: 'PAID', label: 'Paid' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
]
const TONES: Record<string, Tone> = { REQUESTED: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger' }
const PAGE_SIZE = 20

interface Withdrawal {
  id: string
  amount: number
  bankName: string
  accountNumber: string
  accountName: string
  status: string
  rejectionReason: string | null
  bankReference: string | null
  requestedAt: string
  paidAt: string | null
  rider: { id: string; user: { fullName: string | null; phone: string } }
}

export default function WithdrawalsPage() {
  const { can } = useSession()
  const [status, setStatus] = useState<Status>('REQUESTED')
  const [page, setPage] = useState(1)
  const list = useApi<Page<Withdrawal>>(can('finance') ? `/v1/admin/withdrawals?limit=${PAGE_SIZE}&page=${page}${status === 'ALL' ? '' : `&status=${status}`}` : null, { refreshMs: 30_000 })

  if (!can('finance')) return <Notice tone="warning">Your role cannot open withdrawals.</Notice>

  return (
    <>
      <PageHeader title="Withdrawals" subtitle="Riders ask to cash out. Approve the request, make the bank transfer yourself, then record it as paid." />
      <Notice tone="info">When the two-person rule is on, the admin who approves a withdrawal cannot be the one who marks it paid.</Notice>
      <Chips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />

      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">Nothing here.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Rider</th><th className="num">Amount</th><th>Pay to</th><th>Requested</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {list.data.items.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.rider.user.fullName ?? 'Rider'}</strong>
                      <div className="muted small">{w.rider.user.phone}</div>
                    </td>
                    <td className="num"><strong>{formatNaira(w.amount)}</strong></td>
                    <td>
                      {w.accountName}
                      <div className="muted small">{w.bankName} · {w.accountNumber}</div>
                    </td>
                    <td className="small">{formatDateTime(w.requestedAt)}</td>
                    <td>
                      <Badge tone={TONES[w.status] ?? 'neutral'}>{w.status.toLowerCase()}</Badge>
                      {w.rejectionReason ? <div className="muted small">{w.rejectionReason}</div> : null}
                      {w.bankReference ? <div className="muted small">Ref {w.bankReference}</div> : null}
                      {w.paidAt ? <div className="muted small">{formatDateTime(w.paidAt)}</div> : null}
                    </td>
                    <td>
                      <div className="stack">
                        {w.status === 'REQUESTED' ? (
                          <ActionForm label="Approve" small tone="primary" confirmText={`Approve ${formatNaira(w.amount)} for ${w.accountName}? Check the bank details first.`} confirmLabel="Approve" onSubmit={() => api(`/v1/admin/withdrawals/${w.id}/approve`, { method: 'POST' })} onDone={list.reload} />
                        ) : null}
                        {w.status === 'APPROVED' ? (
                          <ActionForm label="Mark as paid" small tone="primary" confirmLabel="Record payment" fields={[{ name: 'bankReference', label: 'Bank transfer reference', required: true, minLength: 3, help: 'Only record this after the transfer has actually been made.' }]} onSubmit={(v) => api(`/v1/admin/withdrawals/${w.id}/mark-paid`, { method: 'POST', body: { bankReference: v.bankReference } })} onDone={list.reload} />
                        ) : null}
                        {w.status === 'REQUESTED' || w.status === 'APPROVED' ? (
                          <ActionForm label="Reject" small tone="danger" confirmLabel="Reject and return the money" fields={[{ name: 'reason', label: 'Reason (the rider sees this)', kind: 'textarea', required: true, minLength: 5 }]} onSubmit={(v) => api(`/v1/admin/withdrawals/${w.id}/reject`, { method: 'POST', body: { reason: v.reason } })} onDone={list.reload} />
                        ) : null}
                      </div>
                    </td>
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
