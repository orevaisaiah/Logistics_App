'use client'

import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner, StatCard } from '@/components/ui'
import { formatNaira } from '@/lib/format'
import { useApi } from '@/lib/hooks'

interface Summary {
  balances: Record<string, { wallets: number; balance: number }>
  pendingWithdrawals: { count: number; amount: number }
  integrity: {
    ok: boolean
    walletsWithBalanceNotMatchingLedger: { id: string; balance: number; ledger: number }[]
    totalBalances: number
    expectedFromBoundaryEntries: number
    difference: number
  }
}

const OWNER_LABELS: Record<string, string> = {
  BUSINESS: 'Business wallets',
  RIDER: 'Rider wallets',
  PLATFORM: 'Platform earnings',
  ESCROW: 'Held in escrow',
}

export default function FinancePage() {
  const { can } = useSession()
  const { data, error, loading } = useApi<Summary>(can('finance') ? '/v1/admin/finance/summary' : null, { refreshMs: 30_000 })

  if (!can('finance')) return <Notice tone="warning">Your role cannot open finance.</Notice>
  if (loading) return <Spinner label="Checking the books" />
  if (error || !data) return <Notice tone="danger">{error?.message ?? 'Could not load the finance summary.'}</Notice>

  const i = data.integrity
  return (
    <>
      <PageHeader title="Finance" subtitle="All amounts are in naira." />

      {i.ok ? (
        <Notice tone="success">The books balance. Every wallet matches its ledger, and the total in all wallets equals top-ups minus withdrawals plus manual adjustments.</Notice>
      ) : (
        <Notice tone="danger">
          The books do not balance. Stop paying out and investigate.
          {i.walletsWithBalanceNotMatchingLedger.length > 0 ? ` ${i.walletsWithBalanceNotMatchingLedger.length} wallet(s) differ from their ledger.` : ''}
          {i.difference !== 0 ? ` The total in all wallets is ${formatNaira(Math.abs(i.difference))} ${i.difference > 0 ? 'more' : 'less'} than expected.` : ''}
        </Notice>
      )}

      <section className="grid stats">
        {['BUSINESS', 'RIDER', 'PLATFORM', 'ESCROW'].map((type) => (
          <StatCard key={type} label={OWNER_LABELS[type]} value={formatNaira(data.balances[type]?.balance ?? 0)} hint={`${data.balances[type]?.wallets ?? 0} ${data.balances[type]?.wallets === 1 ? 'wallet' : 'wallets'}`} />
        ))}
      </section>

      <section className="card stack">
        <h2>Withdrawals to process</h2>
        <p>
          <strong>{data.pendingWithdrawals.count}</strong> {data.pendingWithdrawals.count === 1 ? 'request' : 'requests'} totalling <strong>{formatNaira(data.pendingWithdrawals.amount)}</strong>
        </p>
        <p><Link href="/finance/withdrawals">Open withdrawals</Link></p>
      </section>

      <section className="card stack">
        <h2>Reconciliation numbers</h2>
        <p className="muted small">Compare these with your real Paystack and bank balances regularly. This check proves the ledger is consistent with itself, not that it matches the bank.</p>
        <dl className="summary">
          <div><dt>Total in all wallets</dt><dd>{formatNaira(i.totalBalances)}</dd></div>
          <div><dt>Expected (top-ups, minus withdrawals, plus adjustments)</dt><dd>{formatNaira(i.expectedFromBoundaryEntries)}</dd></div>
          <div><dt>Difference</dt><dd>{formatNaira(i.difference)}</dd></div>
        </dl>
      </section>
    </>
  )
}
