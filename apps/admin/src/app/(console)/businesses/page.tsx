'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Badge, Chips, Notice, PageHeader, Pager, Spinner } from '@/components/ui'
import { formatDateTime, formatNaira, type Tone } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page } from '@/lib/types'

type Status = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
const FILTERS: { value: Status; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Rejected' },
]
const TONES: Record<string, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', SUSPENDED: 'danger' }
const PAGE_SIZE = 20

interface BusinessRow {
  id: string
  companyName: string
  verificationStatus: string
  creditLimit: number
  createdAt: string
  owner: { fullName: string | null; phone: string }
  wallet: { balance: number } | null
  _count: { deliveries: number }
}

export default function BusinessesPage() {
  const { can } = useSession()
  const [status, setStatus] = useState<Status>('ALL')
  const [page, setPage] = useState(1)
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const query = `/v1/admin/businesses?limit=${PAGE_SIZE}&page=${page}${status === 'ALL' ? '' : `&status=${status}`}${search ? `&search=${encodeURIComponent(search)}` : ''}`
  const list = useApi<Page<BusinessRow>>(can('businesses') ? query : null)

  if (!can('businesses')) return <Notice tone="warning">Your role cannot open businesses.</Notice>

  function applySearch(event: FormEvent) {
    event.preventDefault()
    setSearch(typed.trim())
    setPage(1)
  }

  return (
    <>
      <PageHeader title="Businesses" subtitle={list.data ? `${list.data.total} in this view` : undefined} />
      <form className="row" onSubmit={applySearch}>
        <input className="input search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by business name or owner phone" />
        <button className="btn btn-secondary">Search</button>
        {search ? <button type="button" className="btn btn-ghost" onClick={() => { setTyped(''); setSearch(''); setPage(1) }}>Clear</button> : null}
      </form>
      <Chips options={FILTERS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />

      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No businesses found.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Business</th><th>Owner</th><th>Status</th><th className="num">Wallet</th><th className="num">Credit limit</th><th className="num">Deliveries</th><th>Joined</th></tr></thead>
              <tbody>
                {list.data.items.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/businesses/${b.id}`}>{b.companyName}</Link></td>
                    <td>{b.owner.fullName ?? ''}<div className="muted small">{b.owner.phone}</div></td>
                    <td><Badge tone={TONES[b.verificationStatus] ?? 'neutral'}>{b.verificationStatus.toLowerCase()}</Badge></td>
                    <td className="num">{formatNaira(b.wallet?.balance ?? 0)}</td>
                    <td className="num">{b.creditLimit > 0 ? formatNaira(b.creditLimit) : 'None'}</td>
                    <td className="num">{b._count.deliveries}</td>
                    <td className="small">{formatDateTime(b.createdAt)}</td>
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
