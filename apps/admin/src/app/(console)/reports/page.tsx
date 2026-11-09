'use client'

import { useState } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner, StatCard } from '@/components/ui'
import { toCsv } from '@/lib/csv'
import { formatNaira, formatPercent } from '@/lib/format'
import { useApi } from '@/lib/hooks'

interface Day {
  day: string
  created: number
  delivered: number
  cancelled: number
  failed: number
  deliveredValue: number
  commission: number
  avgMinutesToDeliver: number | null
}
interface Daily {
  from: string
  to: string
  totals: { created: number; delivered: number; cancelled: number; failed: number; deliveredValue: number; commission: number; successRate: number | null; cancellationRate: number | null }
  days: Day[]
}
interface Leaders {
  topBusinesses: { businessId: string; companyName: string | null; deliveries: number; spent: number }[]
  topRiders: { riderId: string | null; name: string | null; phone: string | null; deliveries: number; earned: number }[]
}

export default function ReportsPage() {
  const { can } = useSession()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [range, setRange] = useState('')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const query = range ? `?${range}` : ''
  const daily = useApi<Daily>(can('reports') ? `/v1/admin/reports/daily${query}` : null)
  const leaders = useApi<Leaders>(can('reports') ? `/v1/admin/reports/leaders${query}` : null)

  if (!can('reports')) return <Notice tone="warning">Your role cannot open reports.</Notice>

  function apply() {
    if (!from || !to) return setRangeError('Choose both a start date and an end date.')
    if (from > to) return setRangeError('The start date must not be after the end date.')
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 92) return setRangeError('Choose a range of at most 92 days.')
    setRangeError(null)
    setRange(`from=${from}&to=${to}`)
  }

  function download(report: Daily) {
    const csv = toCsv(
      [
        { header: 'Date', value: (r) => r.day },
        { header: 'Booked', value: (r) => r.created },
        { header: 'Delivered', value: (r) => r.delivered },
        { header: 'Cancelled', value: (r) => r.cancelled },
        { header: 'Failed', value: (r) => r.failed },
        { header: 'Delivered value (naira)', value: (r) => Number(r.deliveredValue) / 100 },
        { header: 'Commission (naira)', value: (r) => Number(r.commission) / 100 },
        { header: 'Average minutes to deliver', value: (r) => (r.avgMinutesToDeliver === null ? '' : Math.round(Number(r.avgMinutesToDeliver))) },
      ],
      report.days as unknown as Record<string, unknown>[],
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `deliveries-${report.from}-to-${report.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const report = daily.data
  const busiest = report ? Math.max(1, ...report.days.map((d) => d.created)) : 1

  return (
    <>
      <PageHeader title="Reports" subtitle="Days are Lagos calendar days. Without dates, the last 7 days are shown." />

      <section className="card stack">
        <div className="row">
          <label className="field"><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn btn-primary" onClick={apply}>Show</button>
          {range ? <button className="btn btn-ghost" onClick={() => { setRange(''); setFrom(''); setTo('') }}>Last 7 days</button> : null}
        </div>
        {rangeError ? <Notice tone="danger">{rangeError}</Notice> : null}
      </section>

      {daily.loading ? <Spinner label="Building the report" /> : null}
      {daily.error ? <Notice tone="danger">{daily.error.message}</Notice> : null}

      {report ? (
        <>
          <section className="grid stats">
            <StatCard label="Booked" value={report.totals.created} hint={`${report.from} to ${report.to}`} />
            <StatCard label="Delivered" value={report.totals.delivered} hint={`Success rate ${formatPercent(report.totals.successRate)}`} />
            <StatCard label="Cancelled" value={report.totals.cancelled} hint={`${formatPercent(report.totals.cancellationRate)} of bookings`} />
            <StatCard label="Failed" value={report.totals.failed} />
            <StatCard label="Delivered value" value={formatNaira(Number(report.totals.deliveredValue))} />
            <StatCard label="Commission" value={formatNaira(Number(report.totals.commission))} />
          </section>

          <section className="card stack">
            <div className="row row-between">
              <h2>Day by day</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => download(report)}>Download CSV</button>
            </div>
            <div className="bars" role="img" aria-label="Bookings and deliveries per day">
              {report.days.map((d) => (
                <div key={d.day} className="bar-row">
                  <span className="bar-label small">{d.day.slice(5)}</span>
                  <div className="bar-track">
                    <div className="bar bar-booked" style={{ width: `${(d.created / busiest) * 100}%` }} />
                    <div className="bar bar-delivered" style={{ width: `${(d.delivered / busiest) * 100}%` }} />
                  </div>
                  <span className="bar-value small">{d.delivered}/{d.created}</span>
                </div>
              ))}
            </div>
            <p className="muted small">Grey is bookings, green is delivered.</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th className="num">Booked</th><th className="num">Delivered</th><th className="num">Cancelled</th><th className="num">Failed</th><th className="num">Value</th><th className="num">Commission</th><th className="num">Avg minutes</th></tr></thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td className="num">{d.created}</td>
                      <td className="num">{d.delivered}</td>
                      <td className="num">{d.cancelled}</td>
                      <td className="num">{d.failed}</td>
                      <td className="num">{formatNaira(Number(d.deliveredValue))}</td>
                      <td className="num">{formatNaira(Number(d.commission))}</td>
                      <td className="num">{d.avgMinutesToDeliver === null ? '' : Math.round(Number(d.avgMinutesToDeliver))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {leaders.data ? (
        <div className="two-col">
          <section className="card stack">
            <h2>Top businesses</h2>
            {leaders.data.topBusinesses.length === 0 ? <p className="muted">No activity in this range.</p> : null}
            {leaders.data.topBusinesses.map((b, i) => (
              <div key={b.businessId} className="row row-between"><span>{i + 1}. {b.companyName ?? 'Business'} <span className="muted small">({b.deliveries})</span></span><strong>{formatNaira(Number(b.spent))}</strong></div>
            ))}
          </section>
          <section className="card stack">
            <h2>Top riders</h2>
            {leaders.data.topRiders.length === 0 ? <p className="muted">No activity in this range.</p> : null}
            {leaders.data.topRiders.map((r, i) => (
              <div key={r.riderId ?? i} className="row row-between"><span>{i + 1}. {r.name ?? r.phone ?? 'Rider'} <span className="muted small">({r.deliveries})</span></span><strong>{formatNaira(Number(r.earned))}</strong></div>
            ))}
          </section>
        </div>
      ) : null}
    </>
  )
}
