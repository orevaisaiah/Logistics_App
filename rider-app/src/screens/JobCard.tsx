import { useState, type MutableRefObject } from 'react'
import { Alert, Linking } from 'react-native'
import { api } from '../api'
import type { Coords } from '../hooks/useLocation'
import { formatNaira } from '../lib/format'
import { isDeliveryCode } from '../lib/validate'
import type { Job } from '../types'
import { Badge, Banner, Body, Button, Card, ChoiceSheet, Divider, Field, Heading, Muted, Row, useAction } from '../components/ui'

const CANCEL_REASONS = [
  { value: 'Vehicle problem', label: 'My vehicle has a problem' },
  { value: 'Cannot reach the pickup', label: 'I cannot reach the pickup' },
  { value: 'Emergency', label: 'Emergency' },
  { value: 'Another reason', label: 'Another reason' },
]
const FAIL_REASONS = [
  { value: 'RECIPIENT_UNREACHABLE', label: 'Recipient is not answering' },
  { value: 'WRONG_ADDRESS', label: 'The address is wrong' },
  { value: 'REFUSED', label: 'Recipient refused the package' },
  { value: 'OTHER', label: 'Another reason' },
]

const openMaps = (lat: number, lng: number) => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => undefined)
const callPhone = (phone: string) => void Linking.openURL(`tel:${phone}`).catch(() => undefined)

type Props = {
  job: Job
  latest: MutableRefObject<Coords | null>
  onChange: (job: Job | null) => void
  onFinished: (kind: 'delivered' | 'failed' | 'cancelled', payout: number) => void
}

export default function JobCard({ job, latest, onChange, onFinished }: Props) {
  const action = useAction()
  const [code, setCode] = useState('')
  const [sheet, setSheet] = useState<'cancel' | 'fail' | null>(null)
  const [codeSent, setCodeSent] = useState(false)

  // Where the rider is when they press a button, recorded on the delivery's timeline
  const where = () => (latest.current ? { lat: latest.current.latitude, lng: latest.current.longitude } : {})

  const confirmPickup = () =>
    Alert.alert('Collected the package?', 'The recipient will get a delivery code by text message.', [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Yes, collected',
        onPress: () =>
          void action.run(async () => {
            const result = await api<{ job: Job | null }>(`/v1/rider/jobs/${job.id}/pickup`, { method: 'POST', body: where() })
            if (result.job) onChange(result.job)
          }),
      },
    ])

  const startTrip = () =>
    void action.run(async () => {
      const result = await api<{ job: Job | null }>(`/v1/rider/jobs/${job.id}/start`, { method: 'POST', body: where() })
      if (result.job) onChange(result.job)
    })

  const resendCode = () =>
    void action.run(async () => {
      await api(`/v1/rider/jobs/${job.id}/resend-code`, { method: 'POST' })
      setCodeSent(true)
    })

  const complete = () =>
    void action.run(async () => {
      await api(`/v1/rider/jobs/${job.id}/deliver`, { method: 'POST', body: { code: code.trim(), ...where() } })
      onFinished('delivered', job.payout)
      onChange(null)
    })

  async function fail(reason: string) {
    setSheet(null)
    await action.run(async () => {
      await api(`/v1/rider/jobs/${job.id}/fail`, { method: 'POST', body: { reason, ...where() } })
      onFinished('failed', job.payout)
      onChange(null)
    })
  }

  async function cancel(reason: string) {
    setSheet(null)
    await action.run(async () => {
      await api(`/v1/rider/jobs/${job.id}/cancel`, { method: 'POST', body: { reason } })
      onFinished('cancelled', job.payout)
      onChange(null)
    })
  }

  const heading = job.status === 'ASSIGNED' ? 'Go to the pickup' : job.status === 'PICKED_UP' ? 'You have the package' : 'Deliver the package'

  return (
    <Card tone="info">
      <Row between>
        <Heading>{heading}</Heading>
        <Badge tone="success">{`Earn ${formatNaira(job.payout)}`}</Badge>
      </Row>
      <Muted small>{`${job.business.companyName} · ${job.trackingCode}`}</Muted>
      <Muted small>{`${job.packageDescription} · ${job.weightKg} kg${job.isFragile ? ' · Fragile' : ''}`}</Muted>
      {job.notes ? <Banner tone="warning">{`Note: ${job.notes}`}</Banner> : null}
      <Divider />

      {job.status === 'ASSIGNED' ? (
        <>
          <Body bold>Pickup</Body>
          <Body>{job.pickupAddress}</Body>
          <Muted>{`${job.pickupContactName} · ${job.pickupContactPhone}`}</Muted>
          <Row wrap>
            <Button small variant="secondary" title="Navigate" onPress={() => openMaps(job.pickupLat, job.pickupLng)} />
            <Button small variant="secondary" title="Call" onPress={() => callPhone(job.pickupContactPhone)} />
          </Row>
          <Muted small>{`Then deliver to: ${job.dropoffAddress}`}</Muted>
        </>
      ) : (
        <>
          <Body bold>Drop-off</Body>
          <Body>{job.dropoffAddress}</Body>
          <Muted>{`${job.recipientName} · ${job.recipientPhone}`}</Muted>
          <Row wrap>
            <Button small variant="secondary" title="Navigate" onPress={() => openMaps(job.dropoffLat, job.dropoffLng)} />
            <Button small variant="secondary" title="Call recipient" onPress={() => callPhone(job.recipientPhone)} />
          </Row>
        </>
      )}

      {action.error ? <Banner tone="danger">{action.error}</Banner> : null}

      {job.status === 'ASSIGNED' ? (
        <>
          <Button title="I have collected the package" onPress={confirmPickup} loading={action.busy} />
          <Button title="I cannot do this delivery" variant="danger" disabled={action.busy} onPress={() => setSheet('cancel')} />
        </>
      ) : null}

      {job.status === 'PICKED_UP' ? <Button title="Start the trip" onPress={startTrip} loading={action.busy} /> : null}

      {job.status === 'PICKED_UP' || job.status === 'IN_TRANSIT' ? (
        <>
          {job.status === 'IN_TRANSIT' ? (
            <>
              <Divider />
              <Field label="Delivery code from the recipient" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={4} hint="Ask the recipient for the 4-digit code we texted them. Only hand over the package once they give it." />
              <Button title="Complete delivery" onPress={complete} loading={action.busy} disabled={!isDeliveryCode(code)} />
              <Button title="I could not deliver" variant="danger" disabled={action.busy} onPress={() => setSheet('fail')} />
            </>
          ) : null}
          <Button title={codeSent ? 'Code sent again' : 'Send the code to the recipient again'} variant="ghost" small disabled={action.busy || codeSent} onPress={resendCode} />
        </>
      ) : null}

      <ChoiceSheet visible={sheet === 'cancel'} title="Why can you not do it?" options={CANCEL_REASONS} onChoose={(v) => void cancel(v)} onClose={() => setSheet(null)} />
      <ChoiceSheet visible={sheet === 'fail'} title="What went wrong?" options={FAIL_REASONS} onChoose={(v) => void fail(v)} onClose={() => setSheet(null)} />
    </Card>
  )
}
