'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { ENTRY_LABELS, formatDateTime, formatNaira, nairaToKobo, newIdempotencyKey } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page, Topup, TopupResult, Wallet, WalletEntry } from '@/lib/types'

const PRESETS = [1000, 5000, 10000, 50000]
const MIN_TOPUP_KOBO = 10_000 // 100 naira
const MAX_TOPUP_KOBO = 500_000_000 // 5,000,000 naira
const MAX_CHECKS = 45

export default function WalletPage() {
  const { me, can } = useSession()
  const wallet = useApi<Wallet>('/v1/wallet')
  const [page, setPage] = useState(1)
  const entries = useApi<Page<WalletEntry>>(`/v1/wallet/entries?limit=20&page=${page}`)

  const [amountText, setAmountText] = useState('5000')
  const [email, setEmail] = useState(me.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topup, setTopup] = useState<Topup | null>(null)
  const [result, setResult] = useState<TopupResult | null>(null)
  const [watching, setWatching] = useState(false)
  const idempotency = useRef<{ signature: string; key: string } | null>(null)

  const refreshAll = () => {
    wallet.reload()
    entries.reload()
  }

  async function check(reference: string): Promise<TopupResult | null> {
    try {
      const outcome = await api<TopupResult>(`/v1/wallet/topups/${encodeURIComponent(reference)}/verify`)
      setResult(outcome)
      if (outcome.status === 'SUCCESS') {
        setTopup(null)
        setWatching(false)
        refreshAll()
      } else if (outcome.status === 'FAILED') {
        setWatching(false)
      }
      return outcome
    } catch (err) {
      setError(errorMessage(err))
      return null
    }
  }

  // Coming back from the payment page: the address carries ?reference=...
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference')
    if (!reference) return
    window.history.replaceState(null, '', '/wallet')
    void check(reference)
    // runs once when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After the payment page is opened, keep checking until the payment goes through
  useEffect(() => {
    if (!watching || !topup) return
    let cancelled = false
    let checks = 0
    const reference = topup.reference
    const timer = setInterval(async () => {
      checks += 1
      const outcome = await check(reference)
      if (!cancelled && (checks >= MAX_CHECKS || outcome?.status === 'SUCCESS' || outcome?.status === 'FAILED')) setWatching(false)
    }, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, topup])

  async function startTopup(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)
    const amount = nairaToKobo(amountText)
    if (amount === null) return setError('Enter the amount in naira, for example 5000.')
    if (amount < MIN_TOPUP_KOBO) return setError('The smallest top-up is 100 naira.')
    if (amount > MAX_TOPUP_KOBO) return setError('The largest top-up is 5,000,000 naira.')
    if (!email.includes('@')) return setError('Enter an email address for the payment receipt.')

    // Pressing the button twice, or a dropped connection, must not start two payments
    const signature = `${amount}|${email.trim()}`
    const attempt = idempotency.current?.signature === signature ? idempotency.current : { signature, key: newIdempotencyKey() }
    idempotency.current = attempt

    setBusy(true)
    try {
      setTopup(await api<Topup>('/v1/wallet/topups', { method: 'POST', body: { amount, email: email.trim() }, idempotencyKey: attempt.key }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const pages = entries.data ? Math.max(1, Math.ceil(entries.data.total / 20)) : 1

  return (
    <>
      <PageHeader title="Wallet" subtitle="Deliveries are paid from your wallet balance." />

      <section className="grid stats">
        <div className="card stat">
          <span className="muted small">Balance</span>
          <strong className="stat-value">{wallet.data ? formatNaira(wallet.data.balance) : '...'}</strong>
        </div>
        {wallet.data && wallet.data.creditLimit > 0 ? (
          <div className="card stat">
            <span className="muted small">Available to spend (with credit)</span>
            <strong className="stat-value">{formatNaira(wallet.data.availableToSpend)}</strong>
            <span className="muted small">Credit limit {formatNaira(wallet.data.creditLimit)}</span>
          </div>
        ) : null}
      </section>

      {result?.status === 'SUCCESS' ? <Notice tone="success">Payment received. {formatNaira(result.amount)} was added to your wallet.</Notice> : null}
      {result?.status === 'PENDING' ? <Notice tone="warning">The payment has not been confirmed yet. If you have paid, wait a moment and check again.</Notice> : null}
      {result?.status === 'FAILED' ? <Notice tone="danger">The payment did not go through. No money was added. You can try again.</Notice> : null}

      {can.topUp ? (
        <section className="card stack">
          <h2>Add money</h2>

          {!topup ? (
            <form className="stack" onSubmit={(e) => void startTopup(e)}>
              <div className="chips">
                {PRESETS.map((n) => (
                  <button type="button" key={n} className={amountText === String(n) ? 'chip chip-active' : 'chip'} onClick={() => setAmountText(String(n))}>
                    {formatNaira(n * 100)}
                  </button>
                ))}
              </div>
              <div className="two-col">
                <label className="field">
                  <span>Amount in naira</span>
                  <input className="input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
                </label>
                <label className="field">
                  <span>Email for the receipt</span>
                  <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </label>
              </div>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <div>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? 'Starting payment...' : 'Continue to payment'}
                </button>
              </div>
            </form>
          ) : (
            <div className="stack">
              <p>
                Top-up of <strong>{formatNaira(topup.amount)}</strong> started. <span className="muted small">Reference {topup.reference}</span>
              </p>
              {topup.gateway === 'mock' ? (
                <>
                  <Notice tone="info">Test mode: no real payment is taken. Confirm to add the money to your wallet.</Notice>
                  <div className="row">
                    <button className="btn btn-primary" onClick={() => void check(topup.reference)}>
                      Confirm test payment
                    </button>
                    <button className="btn btn-ghost" onClick={() => setTopup(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">Pay on the secure payment page. This page checks automatically and adds the money as soon as the payment is confirmed.</p>
                  <div className="row">
                    <a className="btn btn-primary" href={topup.authorizationUrl} target="_blank" rel="noopener noreferrer" onClick={() => setWatching(true)}>
                      Open payment page
                    </a>
                    <button className="btn btn-secondary" onClick={() => void check(topup.reference)}>
                      I have paid. Check now
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setTopup(null); setWatching(false) }}>
                      Cancel
                    </button>
                  </div>
                  {watching ? <Spinner label="Waiting for your payment" /> : null}
                </>
              )}
              {error ? <Notice tone="danger">{error}</Notice> : null}
            </div>
          )}
        </section>
      ) : (
        <Notice tone="info">Only the business owner or finance team can add money. Ask them to top up the wallet.</Notice>
      )}

      <section className="card">
        <h2>Transactions</h2>
        {entries.loading ? <Spinner /> : null}
        {entries.error ? <Notice tone="danger">{entries.error.message}</Notice> : null}
        {entries.data && entries.data.items.length === 0 ? <p className="muted">No transactions yet.</p> : null}
        {entries.data && entries.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{formatDateTime(e.createdAt)}</td>
                    <td>
                      {ENTRY_LABELS[e.type] ?? e.type}
                      {e.deliveryId ? (
                        <div className="small">
                          <Link href={`/deliveries/${e.deliveryId}`}>View delivery</Link>
                        </div>
                      ) : null}
                      {e.note ? <div className="muted small">{e.note}</div> : null}
                    </td>
                    <td className={e.direction === 'CREDIT' ? 'num amount-in' : 'num amount-out'}>
                      {e.direction === 'CREDIT' ? '+' : '-'}
                      {formatNaira(e.amount)}
                    </td>
                    <td className="num">{formatNaira(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {entries.data && pages > 1 ? (
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
