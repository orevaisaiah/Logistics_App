'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import LocationField from '@/components/LocationField'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Spinner } from '@/components/ui'
import { api, ApiError, errorMessage, isAborted } from '@/lib/api'
import { formatNaira, nairaToKobo, newIdempotencyKey, VEHICLE_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import { emptyLocation, locationPoint, parseCenter, type LocationValue } from '@/lib/location'
import type { DeliveryDetail, Quote, VehicleType, Wallet } from '@/lib/types'

type QuoteState = { key: string; quote?: Quote; error?: string }

export default function NewDeliveryPage() {
  const router = useRouter()
  const { can } = useSession()
  const wallet = useApi<Wallet>('/v1/wallet', { refreshMs: 20_000 })
  const center = useMemo(() => parseCenter(process.env.NEXT_PUBLIC_DEFAULT_CENTER), [])

  const [pickup, setPickup] = useState<LocationValue>(emptyLocation)
  const [dropoff, setDropoff] = useState<LocationValue>(emptyLocation)
  const [sender, setSender] = useState({ name: '', phone: '' })
  const [recipient, setRecipient] = useState({ name: '', phone: '' })
  const [pkg, setPkg] = useState({ description: '', weight: '1', fragile: false, declaredValue: '' })
  const [vehicleType, setVehicleType] = useState<VehicleType>('BIKE')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<{ message: string; needsTopUp: boolean } | null>(null)
  const idempotency = useRef<{ signature: string; key: string } | null>(null)

  /* ---------- live price ---------- */
  const pickupPoint = locationPoint(pickup)
  const dropoffPoint = locationPoint(dropoff)
  const weightKg = Number(pkg.weight)
  const quoteInput =
    pickupPoint && dropoffPoint && Number.isFinite(weightKg) && weightKg > 0
      ? { pickup: pickupPoint, dropoff: dropoffPoint, weightKg, vehicleType }
      : null
  const quoteKey = quoteInput ? JSON.stringify(quoteInput) : null
  const [quoteState, setQuoteState] = useState<QuoteState | null>(null)

  useEffect(() => {
    if (!quoteInput || !quoteKey) return
    const controller = new AbortController()
    // Wait for a pause in typing before asking for a price
    const timer = setTimeout(async () => {
      try {
        const quote = await api<Quote>('/v1/deliveries/quote', { method: 'POST', body: quoteInput, signal: controller.signal })
        setQuoteState({ key: quoteKey, quote })
      } catch (err) {
        if (isAborted(err)) return
        setQuoteState({ key: quoteKey, error: errorMessage(err) })
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // quoteKey describes everything quoteInput contains
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey])

  const currentQuote = quoteKey && quoteState?.key === quoteKey ? quoteState : null
  const quote = currentQuote?.quote
  const quoting = quoteKey !== null && currentQuote === null
  const shortBy = quote && wallet.data ? quote.price - wallet.data.availableToSpend : 0

  /* ---------- submit ---------- */
  function buildRequest(): { body: Record<string, unknown> } | { problem: string } {
    if (!pickupPoint) return { problem: 'Set the pickup location pin.' }
    if (!dropoffPoint) return { problem: 'Set the drop-off location pin.' }
    if (pickup.address.trim().length < 5) return { problem: 'Enter the full pickup address (at least 5 characters).' }
    if (dropoff.address.trim().length < 5) return { problem: 'Enter the full drop-off address (at least 5 characters).' }
    if (sender.name.trim().length < 2 || sender.phone.trim() === '') return { problem: 'Enter the name and phone number of the person at the pickup.' }
    if (recipient.name.trim().length < 2 || recipient.phone.trim() === '') return { problem: 'Enter the name and phone number of the recipient.' }
    if (pkg.description.trim().length < 2) return { problem: 'Describe what is being delivered.' }
    if (!(weightKg > 0)) return { problem: 'Enter the weight of the package in kilograms.' }

    let declaredValue: number | undefined
    if (pkg.declaredValue.trim() !== '') {
      const kobo = nairaToKobo(pkg.declaredValue)
      if (kobo === null) return { problem: 'The declared value must be an amount in naira, for example 15000.' }
      declaredValue = kobo
    }

    return {
      body: {
        pickup: { address: pickup.address.trim(), ...pickupPoint, contactName: sender.name.trim(), contactPhone: sender.phone.trim() },
        dropoff: { address: dropoff.address.trim(), ...dropoffPoint, recipientName: recipient.name.trim(), recipientPhone: recipient.phone.trim() },
        package: { description: pkg.description.trim(), weightKg, declaredValue, isFragile: pkg.fragile },
        vehicleType,
        notes: notes.trim() === '' ? undefined : notes.trim(),
      },
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const built = buildRequest()
    if ('problem' in built) {
      setFormError({ message: built.problem, needsTopUp: false })
      return
    }

    // The same key is reused if this exact request is sent again (for example after a dropped connection),
    // so the delivery can never be created and charged twice. Changing anything creates a fresh key.
    const signature = JSON.stringify(built.body)
    const attempt = idempotency.current?.signature === signature ? idempotency.current : { signature, key: newIdempotencyKey() }
    idempotency.current = attempt

    setSubmitting(true)
    try {
      const created = await api<DeliveryDetail>('/v1/deliveries', { method: 'POST', body: built.body, idempotencyKey: attempt.key })
      router.push(`/deliveries/${created.id}`)
    } catch (err) {
      setFormError({ message: errorMessage(err), needsTopUp: err instanceof ApiError && err.code === 'INSUFFICIENT_FUNDS' })
      setSubmitting(false)
    }
  }

  if (!can.createDeliveries) {
    return (
      <>
        <PageHeader title="New delivery" />
        <Notice tone="warning">Your role does not allow booking deliveries. Ask the business owner to change your role.</Notice>
      </>
    )
  }

  return (
    <>
      <PageHeader title="New delivery" subtitle="Tell us where to collect and where to deliver. The price updates as you go." />

      <form className="two-col two-col-wide" onSubmit={(e) => void submit(e)}>
        <div className="stack">
          <section className="card stack">
            <LocationField title="Pickup" value={pickup} onChange={setPickup} center={center} />
            <div className="two-col">
              <label className="field">
                <span>Contact name at pickup</span>
                <input className="input" value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} autoComplete="off" />
              </label>
              <label className="field">
                <span>Contact phone</span>
                <input className="input" type="tel" value={sender.phone} onChange={(e) => setSender({ ...sender, phone: e.target.value })} placeholder="08031234567" />
              </label>
            </div>
          </section>

          <section className="card stack">
            <LocationField title="Drop-off" value={dropoff} onChange={setDropoff} center={center} />
            <div className="two-col">
              <label className="field">
                <span>Recipient name</span>
                <input className="input" value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} autoComplete="off" />
              </label>
              <label className="field">
                <span>Recipient phone</span>
                <input className="input" type="tel" value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} placeholder="08039876543" />
              </label>
            </div>
            <p className="hint small">The recipient gets a code by text when the rider collects the package. They give it to the rider to confirm delivery.</p>
          </section>

          <section className="card stack">
            <h2>Package</h2>
            <label className="field">
              <span>What is being delivered?</span>
              <input className="input" value={pkg.description} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} placeholder="Two shoe boxes" />
            </label>
            <div className="two-col">
              <label className="field">
                <span>Weight (kg)</span>
                <input className="input" type="number" inputMode="decimal" min="0.1" step="0.1" value={pkg.weight} onChange={(e) => setPkg({ ...pkg, weight: e.target.value })} />
              </label>
              <label className="field">
                <span>Vehicle</span>
                <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>
                  {(Object.keys(VEHICLE_LABELS) as VehicleType[]).map((v) => (
                    <option key={v} value={v}>
                      {VEHICLE_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Value of the goods in naira (optional)</span>
              <input className="input" inputMode="decimal" value={pkg.declaredValue} onChange={(e) => setPkg({ ...pkg, declaredValue: e.target.value })} placeholder="15000" />
            </label>
            <label className="check">
              <input type="checkbox" checked={pkg.fragile} onChange={(e) => setPkg({ ...pkg, fragile: e.target.checked })} />
              <span>Fragile. Handle with care.</span>
            </label>
            <label className="field">
              <span>Notes for the rider (optional)</span>
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Call on arrival. Gate code 1234." />
            </label>
          </section>
        </div>

        <aside className="card stack sticky">
          <h2>Price</h2>
          {!quoteInput ? <p className="muted">Set both pins and the weight to see the price.</p> : null}
          {quoting ? <Spinner label="Calculating price" /> : null}
          {currentQuote?.error ? <Notice tone="danger">{currentQuote.error}</Notice> : null}

          {quote ? (
            <>
              <div className="price">{formatNaira(quote.price)}</div>
              <dl className="summary">
                <div>
                  <dt>Distance</dt>
                  <dd>{quote.distanceKm} km</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{quote.zone.name}</dd>
                </div>
                <div>
                  <dt>Base fee</dt>
                  <dd>{formatNaira(quote.breakdown.baseFee)}</dd>
                </div>
                <div>
                  <dt>Distance fee</dt>
                  <dd>{formatNaira(quote.breakdown.distanceFee)}</dd>
                </div>
                {quote.breakdown.weightFee > 0 ? (
                  <div>
                    <dt>Weight fee</dt>
                    <dd>{formatNaira(quote.breakdown.weightFee)}</dd>
                  </div>
                ) : null}
                {quote.breakdown.minFeeApplied ? <p className="hint small">The minimum delivery fee applies to this trip.</p> : null}
              </dl>
            </>
          ) : null}

          <hr />
          <div className="row row-between">
            <span className="muted">Wallet balance</span>
            <strong>{wallet.data ? formatNaira(wallet.data.availableToSpend) : '...'}</strong>
          </div>
          {shortBy > 0 ? (
            <Notice tone="warning">
              Your wallet is short by {formatNaira(shortBy)}. <Link href="/wallet">Top up your wallet</Link> first.
            </Notice>
          ) : null}
          <p className="hint small">The price is taken from your wallet when you book. If you cancel before pickup, it is returned in full.</p>

          {formError ? (
            <Notice tone="danger">
              {formError.message}
              {formError.needsTopUp ? (
                <>
                  {' '}
                  <Link href="/wallet">Top up your wallet</Link>.
                </>
              ) : null}
            </Notice>
          ) : null}

          <button className="btn btn-primary btn-block" disabled={submitting || !quote || shortBy > 0}>
            {submitting ? 'Booking...' : quote ? `Book delivery for ${formatNaira(quote.price)}` : 'Book delivery'}
          </button>
        </aside>
      </form>
    </>
  )
}
