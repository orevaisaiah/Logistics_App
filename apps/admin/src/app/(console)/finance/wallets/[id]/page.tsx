'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Pager, Spinner, StatCard } from '@/components/ui'
import { api } from '@/lib/api'
import { ENTRY_LABELS, formatDateTime, formatNaira, nairaToKobo } from '@/lib/format'
import { useApi } from '@/lib/hooks'

const PAGE_SIZE = 25
// Finance staff may correct a wallet by up to this much. Larger corrections need a super admin.
const FINANCE_LIMIT_KOBO = 10_000_000

interface WalletEntries {
  wallet: { id: string; ownerType: string; businessId: string | null; riderId: string | null; balance: number }
  items: { id: string; type: string; direction: 'CREDIT' | 'DEBIT'; amount: number; balanceAfter: number; deliveryId: string | null; note: string | null; createdAt: string }[]
  total: number
}

export default function WalletPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { can, me } = useSession()
  const [page, setPage] = useState(1)
  const entries = useApi<WalletEntries>(can('finance') ? `/v1/admin/wallets/${id}/entries?limit=${PAGE_SIZE}&page=${page}` : null)

  if (!can('finance')) return <Notice tone="warning">Your role cannot open wallets.</Notice>
  if (entries.loading) return <Spinner label="Loading wallet" />
  if (entries.error || !entries.data) return <Notice tone="danger">{entries.error?.message ?? 'Could not load this wallet.'}</Notice>

  const { wallet, items, total } = entries.data
  const isSuper = me.adminRole === 'SUPER_ADMIN'

  return (
    <>
      <PageHeader title={`${wallet.ownerType.charAt(0)}${wallet.ownerType.slice(1).toLowerCase()} wallet`} subtitle={wallet.id} />
      <p className="small">
        <Link href="/finance/wallets">&larr; All wallets</Link>
        {wallet.businessId ? <> · <Link href={`/businesses/${wallet.businessId}`}>View business</Link></> : null}
        {wallet.riderId ? <> · <Link href={`/riders/${wallet.riderId}`}>View rider</Link></> : null}
      </p>

      <section className="grid stats">
        <StatCard label="Balance" value={formatNaira(wallet.balance)} />
      </section>

      <section className="card stack">
        <h2>Manual adjustment</h2>
        <p className="muted small">
          For corrections only. Every adjustment needs a reason and is recorded in the audit log.
          {isSuper ? '' : ` You can adjust up to ${formatNaira(FINANCE_LIMIT_KOBO)} at a time. Larger amounts need a super admin.`}
        </p>
        <div>
          <ActionForm
            label="Adjust balance"
            tone="primary"
            confirmLabel="Apply adjustment"
            fields={[
              { name: 'direction', label: 'Direction', kind: 'select', initial: 'CREDIT', options: [{ value: 'CREDIT', label: 'Add money (credit)' }, { value: 'DEBIT', label: 'Remove money (debit)' }] },
              { name: 'amount', label: 'Amount in naira', required: true, placeholder: '1500' },
              { name: 'reason', label: 'Reason', kind: 'textarea', required: true, minLength: 5 },
            ]}
            onSubmit={async (v) => {
              const amount = nairaToKobo(v.amount)
              if (amount === null || amount <= 0) throw new Error('Enter the amount in naira, for example 1500.')
              await api(`/v1/admin/wallets/${id}/adjust`, { method: 'POST', body: { direction: v.direction, amount, reason: v.reason } })
            }}
            onDone={entries.reload}
          />
        </div>
      </section>

      <section className="card stack">
        <h2>Ledger</h2>
        {items.length === 0 ? <p className="muted">No entries yet.</p> : null}
        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>What</th><th className="num">Amount</th><th className="num">Balance after</th></tr></thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{formatDateTime(e.createdAt)}</td>
                    <td>
                      {ENTRY_LABELS[e.type] ?? e.type}
                      {e.deliveryId ? <div className="small"><Link href={`/deliveries/${e.deliveryId}`}>View delivery</Link></div> : null}
                      {e.note ? <div className="muted small">{e.note}</div> : null}
                    </td>
                    <td className={e.direction === 'CREDIT' ? 'num amount-in' : 'num amount-out'}>{e.direction === 'CREDIT' ? '+' : '-'}{formatNaira(e.amount)}</td>
                    <td className="num">{formatNaira(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Pager page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
      </section>
    </>
  )
}
