import { useState } from 'react'
import { api } from '../api'
import { formatNaira, remainingSeconds } from '../lib/format'
import type { Job, Offer } from '../types'
import { Banner, Body, Button, Card, ChoiceSheet, Heading, Muted, Row, useAction } from '../components/ui'

const DECLINE_REASONS = [
  { value: 'TOO_FAR', label: 'Too far' },
  { value: 'LOW_PAY', label: 'Pay is too low' },
  { value: 'CANNOT_CARRY', label: 'I cannot carry it' },
  { value: 'OFF_SHIFT', label: 'I am off shift' },
  { value: 'OTHER', label: 'Another reason' },
]

// A job offer with a countdown. The pickup address is shown; the drop-off address stays hidden until the rider accepts.
export default function OfferCard({ offer, nowMs, onAccepted, onGone }: { offer: Offer & { expiresAtMs: number }; nowMs: number; onAccepted: (job: Job) => void; onGone: () => void }) {
  const action = useAction()
  const [declining, setDeclining] = useState(false)
  const seconds = remainingSeconds(offer.expiresAtMs, nowMs)
  if (seconds <= 0) return null

  async function accept() {
    const ok = await action.run(async () => {
      const result = await api<{ job: Job }>(`/v1/rider/offers/${offer.assignmentId}/accept`, { method: 'POST' })
      onAccepted(result.job)
    })
    // If it was taken or expired, drop the card so the rider is not left looking at a dead offer
    if (!ok) setTimeout(onGone, 2500)
  }

  async function decline(reason: string) {
    setDeclining(false)
    await action.run(async () => {
      await api(`/v1/rider/offers/${offer.assignmentId}/decline`, { method: 'POST', body: { reason } })
      onGone()
    })
  }

  return (
    <Card tone="info">
      <Row between>
        <Heading>New delivery</Heading>
        <Heading>{`${seconds}s`}</Heading>
      </Row>
      <Body bold>{`You earn ${formatNaira(offer.payout)}`}</Body>
      <Muted>{offer.pickupAddress}</Muted>
      <Row wrap>
        {offer.distanceToPickupKm !== null ? <Muted small>{`${offer.distanceToPickupKm} km to pickup`}</Muted> : null}
        <Muted small>{`· ${offer.tripDistanceKm} km trip`}</Muted>
        <Muted small>{`· ${offer.weightKg} kg`}</Muted>
        {offer.isFragile ? <Muted small>· Fragile</Muted> : null}
      </Row>
      <Muted small>{offer.packageDescription}</Muted>
      {action.error ? <Banner tone="danger">{action.error}</Banner> : null}
      <Button title="Accept" onPress={() => void accept()} loading={action.busy} />
      <Button title="Decline" variant="secondary" disabled={action.busy} onPress={() => setDeclining(true)} />
      <ChoiceSheet visible={declining} title="Why are you declining?" options={DECLINE_REASONS} onChoose={(v) => void decline(v)} onClose={() => setDeclining(false)} />
    </Card>
  )
}
