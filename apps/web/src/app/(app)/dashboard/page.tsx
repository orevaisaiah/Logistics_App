'use client'

import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import DeliveryTable from '@/components/DeliveryTable'
import { Notice, PageHeader, Spinner } from '@/components/ui'
import { formatNaira } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { DeliveryListItem, DeliveryStatus, Page, Wallet } from '@/lib/types'

const LOW_BALANCE_KOBO = 200_000

function useCount(status: DeliveryStatus) {
  const { data } = useApi<Page<DeliveryListItem>>(`/v1/deliveries?status=${status}&limit=1`, { refreshMs: 15_000 })
  return data?.total
}

export default function DashboardPage() {
  const { business, can } = useSession()
  const wallet = useApi<Wallet>('/v1/wallet', { refreshMs: 15_000 })
  const recent = useApi<Page<DeliveryListItem>>('/v1/deliveries?limit=8', { refreshMs: 15_000 })
  const searching = useCount('SEARCHING_RIDER')
  const assigned = useCount('ASSIGNED')
  const pickedUp = useCount('PICKED_UP')
  const inTransit = useCount('IN_TRANSIT')

  const counts = [searching, assigned, pickedUp, inTransit]
  const active = counts.every((c) => c !== undefined) ? counts.reduce<number>((sum, c) => sum + (c ?? 0), 0) : undefined
  const lowBalance = wallet.data !== undefined && wallet.data.availableToSpend < LOW_BALANCE_KOBO

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${business.companyName}.`}
        actions={
          can.createDeliveries ? (
            <Link href="/deliveries/new" className="btn btn-primary">
              New delivery
            </Link>
          ) : null
        }
      />

      {business.verificationStatus === 'SUSPENDED' || business.verificationStatus === 'REJECTED' ? (
        <Notice tone="danger">Your business account cannot create deliveries right now. Please contact support.</Notice>
      ) : null}

      {lowBalance ? (
        <Notice tone="warning">
          Your wallet balance is low. <Link href="/wallet">Top up your wallet</Link> to keep booking deliveries.
        </Notice>
      ) : null}

      <section className="grid stats">
        <div className="card stat">
          <span className="muted small">Wallet balance</span>
          <strong className="stat-value">{wallet.data ? formatNaira(wallet.data.balance) : '...'}</strong>
          {wallet.data && wallet.data.creditLimit > 0 ? <span className="muted small">Credit available: {formatNaira(wallet.data.availableToSpend)}</span> : null}
          <Link href="/wallet" className="small">
            Manage wallet
          </Link>
        </div>
        <div className="card stat">
          <span className="muted small">Active deliveries</span>
          <strong className="stat-value">{active ?? '...'}</strong>
          <Link href="/deliveries" className="small">
            View all
          </Link>
        </div>
        <div className="card stat">
          <span className="muted small">Waiting for a rider</span>
          <strong className="stat-value">{searching ?? '...'}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">On the road</span>
          <strong className="stat-value">{pickedUp !== undefined && inTransit !== undefined ? pickedUp + inTransit : '...'}</strong>
        </div>
      </section>

      <section className="card">
        <div className="row row-between">
          <h2>Recent deliveries</h2>
          <Link href="/deliveries" className="small">
            See all
          </Link>
        </div>
        {recent.loading ? <Spinner /> : null}
        {recent.error ? <Notice tone="danger">{recent.error.message}</Notice> : null}
        {recent.data && recent.data.items.length === 0 ? (
          <p className="muted">No deliveries yet. Book your first one to get started.</p>
        ) : null}
        {recent.data && recent.data.items.length > 0 ? <DeliveryTable items={recent.data.items} /> : null}
      </section>
    </>
  )
}
