'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Chips, Notice, PageHeader, Pager, Spinner } from '@/components/ui'
import { formatNaira } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page } from '@/lib/types'

type Owner = 'ALL' | 'BUSINESS' | 'RIDER' | 'PLATFORM' | 'ESCROW'
const FILTERS: { value: Owner; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'BUSINESS', label: 'Businesses' },
  { value: 'RIDER', label: 'Riders' },
  { value: 'PLATFORM', label: 'Platform' },
  { value: 'ESCROW', label: 'Escrow' },
]
const PAGE_SIZE = 25

interface WalletRow {
  id: string
  ownerType: string
  balance: number
  business: { companyName: string } | null
  rider: { user: { fullName: string | null; phone: string } } | null
}

export default function WalletsPage() {
  const { can } = useSession()
  const [owner, setOwner] = useState<Owner>('ALL')
  const [page, setPage] = useState(1)
  const list = useApi<Page<WalletRow>>(can('finance') ? `/v1/admin/wallets?limit=${PAGE_SIZE}&page=${page}${owner === 'ALL' ? '' : `&ownerType=${owner}`}` : null)

  if (!can('finance')) return <Notice tone="warning">Your role cannot open wallets.</Notice>

  return (
    <>
      <PageHeader title="Wallets" />
      <Chips options={FILTERS} value={owner} onChange={(v) => { setOwner(v); setPage(1) }} />
      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No wallets here.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Owner</th><th>Type</th><th className="num">Balance</th><th /></tr></thead>
              <tbody>
                {list.data.items.map((w) => (
                  <tr key={w.id}>
                    <td>{w.business?.companyName ?? w.rider?.user.fullName ?? w.rider?.user.phone ?? (w.ownerType === 'PLATFORM' ? 'Platform' : 'Escrow')}</td>
                    <td className="small">{w.ownerType.toLowerCase()}</td>
                    <td className="num">{formatNaira(w.balance)}</td>
                    <td className="num"><Link className="btn btn-secondary btn-sm" href={`/finance/wallets/${w.id}`}>Open</Link></td>
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
