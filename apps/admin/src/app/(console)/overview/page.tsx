'use client'

import Link from 'next/link'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner, StatCard } from '@/components/ui'
import { formatDuration, formatNaira, STATUS_LABELS, type DeliveryStatus } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Dashboard } from '@/lib/types'

const OPEN: DeliveryStatus[] = ['SEARCHING_RIDER', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

export default function OverviewPage() {
  const { can, me } = useSession()
  const { data, error, loading } = useApi<Dashboard>('/v1/admin/dashboard', { refreshMs: 15_000 })

  if (loading) return <Spinner label="Loading overview" />
  if (error || !data) return <Notice tone="danger">{error?.message ?? 'Could not load the overview.'}</Notice>

  const a = data.needsAttention
  const attention = [
    can('riderReview') && a.pendingRiderApplications > 0 ? { href: '/riders', text: `${a.pendingRiderApplications} rider ${a.pendingRiderApplications === 1 ? 'application is' : 'applications are'} waiting for review` } : null,
    can('finance') && a.pendingWithdrawals.count > 0 ? { href: '/finance/withdrawals', text: `${a.pendingWithdrawals.count} ${a.pendingWithdrawals.count === 1 ? 'withdrawal' : 'withdrawals'} to process (${formatNaira(a.pendingWithdrawals.amount)})` } : null,
    can('dispatchBoard') && a.deliveriesWaitingTooLong > 0 ? { href: '/dispatch', text: `${a.deliveriesWaitingTooLong} ${a.deliveriesWaitingTooLong === 1 ? 'delivery has' : 'deliveries have'} waited over ${a.waitingTooLongMeansOver} for a rider` } : null,
    can('deliveries') && a.failedDeliveriesAwaitingDecision > 0 ? { href: '/deliveries', text: `${a.failedDeliveriesAwaitingDecision} failed ${a.failedDeliveriesAwaitingDecision === 1 ? 'delivery needs' : 'deliveries need'} a refund or payout decision` } : null,
  ].filter((x): x is { href: string; text: string } => x !== null)

  return (
    <>
      <PageHeader title="Overview" subtitle={`Hello ${me.fullName ?? 'there'}. Figures for today are in Lagos time.`} />

      <section className="card stack">
        <h2>Needs attention</h2>
        {attention.length === 0 ? <p className="muted">Nothing needs your attention right now.</p> : null}
        {attention.map((item) => (
          <Notice key={item.href + item.text} tone="warning">
            <Link href={item.href}>{item.text}</Link>
          </Notice>
        ))}
        {can('dispatchBoard') && a.oldestWaiting ? (
          <p className="muted small">
            Longest wait: <Link href={`/deliveries/${a.oldestWaiting.id}`}>{a.oldestWaiting.trackingCode}</Link>, {formatDuration(a.oldestWaiting.waitingSeconds)} so far.
          </p>
        ) : null}
      </section>

      <section className="grid stats">
        <StatCard label="Deliveries booked today" value={data.today.deliveriesCreated} />
        <StatCard label="Delivered today" value={data.today.delivered} hint={`Worth ${formatNaira(data.today.deliveredValue)}`} />
        <StatCard label="Commission earned today" value={formatNaira(data.today.commissionEarned)} />
        <StatCard label="Riders online" value={data.riders.online} hint={`${data.riders.onJobs} on a job`} />
      </section>

      <section className="card stack">
        <h2>Open deliveries right now</h2>
        <div className="grid stats">
          {OPEN.map((s) => (
            <StatCard key={s} label={STATUS_LABELS[s]} value={data.openDeliveries[s] ?? 0} tone={s === 'SEARCHING_RIDER' && (data.openDeliveries[s] ?? 0) > 0 ? 'warning' : undefined} />
          ))}
        </div>
        {can('dispatchBoard') ? (
          <p>
            <Link href="/dispatch">Open the dispatch board</Link>
          </p>
        ) : null}
      </section>
    </>
  )
}
