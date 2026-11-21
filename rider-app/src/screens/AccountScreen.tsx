import { API_URL } from '../config'
import { useAuth } from '../context/AuthContext'
import { useLoad } from '../hooks/useLoad'
import { VEHICLE_LABELS } from '../lib/format'
import type { Me, Onboarding } from '../types'
import { Badge, Body, Button, Card, Heading, Muted, Row, Screen, Title } from '../components/ui'

export default function AccountScreen({ me }: { me: Me }) {
  const { signOut } = useAuth()
  const onboarding = useLoad<Onboarding>('/v1/rider/onboarding')
  const p = onboarding.data?.profile
  const bank = onboarding.data?.bank

  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Row between>
          <Heading>{me.fullName ?? 'Rider'}</Heading>
          <Badge tone="success">Approved</Badge>
        </Row>
        <Muted>{me.phone}</Muted>
        {p ? <Body>{`${VEHICLE_LABELS[p.vehicleType ?? ''] ?? p.vehicleType ?? ''} · ${p.plateNumber ?? ''}`}</Body> : null}
        {p?.serviceArea ? <Muted>{`Riding in ${p.serviceArea}`}</Muted> : null}
      </Card>
      {bank?.accountNumber ? (
        <Card>
          <Heading>Payout account</Heading>
          <Body>{bank.accountName}</Body>
          <Muted>{`${bank.bankName ?? ''} · ${'*'.repeat(6)}${bank.accountNumber.slice(-4)}`}</Muted>
          <Muted small>To change your details, contact support.</Muted>
        </Card>
      ) : null}
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      <Muted small>{`Connected to ${API_URL}`}</Muted>
    </Screen>
  )
}
