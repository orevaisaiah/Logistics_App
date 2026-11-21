import { useRef, useState } from 'react'
import { View } from 'react-native'
import { api } from '../api'
import { MIN_WITHDRAWAL_KOBO } from '../config'
import { useLoad } from '../hooks/useLoad'
import { ENTRY_LABELS, formatDateTime, formatNaira, newIdempotencyKey } from '../lib/format'
import { validateWithdrawal } from '../lib/validate'
import type { Page, WalletEntry, WalletInfo, Withdrawal } from '../types'
import { Badge, Banner, Body, Button, Card, Divider, Field, Heading, Muted, Row, Screen, Spinner, Title, useAction } from '../components/ui'

const STATUS: Record<Withdrawal['status'], { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  REQUESTED: { label: 'Waiting for approval', tone: 'warning' },
  APPROVED: { label: 'Approved, being paid', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  REJECTED: { label: 'Rejected, money returned', tone: 'danger' },
}

export default function EarningsScreen() {
  const wallet = useLoad<WalletInfo>('/v1/rider/wallet')
  const entries = useLoad<Page<WalletEntry>>('/v1/rider/wallet/entries?limit=20&page=1')
  const withdrawals = useLoad<Withdrawal[]>('/v1/rider/withdrawals')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const request = useAction()
  const attempt = useRef<{ signature: string; key: string } | null>(null)

  const reloadAll = () => {
    wallet.reload()
    entries.reload()
    withdrawals.reload()
  }

  async function withdraw() {
    setMessage(null)
    const ok = await request.run(async () => {
      const checked = validateWithdrawal(amount, wallet.data?.balance ?? 0, MIN_WITHDRAWAL_KOBO)
      if ('error' in checked) throw new Error(checked.error)
      // The same key is reused if this exact request is sent again, so one tap can never become two withdrawals
      const signature = String(checked.kobo)
      const current = attempt.current?.signature === signature ? attempt.current : { signature, key: newIdempotencyKey() }
      attempt.current = current
      await api('/v1/rider/withdrawals', { method: 'POST', body: { amount: checked.kobo }, idempotencyKey: current.key })
    })
    if (ok) {
      setAmount('')
      attempt.current = null
      setMessage('Withdrawal requested. We will pay it to your bank account after it is approved.')
      reloadAll()
    }
  }

  return (
    <Screen refreshing={wallet.loading || entries.loading} onRefresh={reloadAll}>
      <Title>Earnings</Title>

      <Card>
        <Muted>Wallet balance</Muted>
        <Heading>{wallet.data ? formatNaira(wallet.data.balance) : '...'}</Heading>
        {wallet.data && wallet.data.withdrawalsInProgress > 0 ? <Muted small>{`${formatNaira(wallet.data.withdrawalsInProgress)} is being withdrawn`}</Muted> : null}
        {wallet.error ? <Banner tone="danger">{wallet.error.message}</Banner> : null}
      </Card>

      <Card>
        <Heading>Withdraw to your bank</Heading>
        <Field label="Amount in naira" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="2500" hint={`The smallest withdrawal is ${formatNaira(MIN_WITHDRAWAL_KOBO)}. It goes to the bank account you registered.`} />
        {request.error ? <Banner tone="danger">{request.error}</Banner> : null}
        {message ? <Banner tone="success">{message}</Banner> : null}
        <Button title="Withdraw" onPress={() => void withdraw()} loading={request.busy} disabled={amount.trim() === ''} />
      </Card>

      <Card>
        <Heading>Withdrawals</Heading>
        {withdrawals.loading && !withdrawals.data ? <Spinner /> : null}
        {withdrawals.data && withdrawals.data.length === 0 ? <Muted>You have not made any yet.</Muted> : null}
        {withdrawals.data?.map((w, i) => (
          <View key={w.id}>
            {i > 0 ? <Divider /> : null}
            <Row between>
              <Body bold>{formatNaira(w.amount)}</Body>
              <Badge tone={STATUS[w.status].tone}>{STATUS[w.status].label}</Badge>
            </Row>
            <Muted small>{formatDateTime(w.requestedAt)}</Muted>
            {w.rejectionReason ? <Muted small>{`Reason: ${w.rejectionReason}`}</Muted> : null}
          </View>
        ))}
      </Card>

      <Card>
        <Heading>Recent activity</Heading>
        {entries.loading && !entries.data ? <Spinner /> : null}
        {entries.data && entries.data.items.length === 0 ? <Muted>Nothing yet. Your earnings from deliveries will show here.</Muted> : null}
        {entries.data?.items.map((e, i) => (
          <View key={e.id}>
            {i > 0 ? <Divider /> : null}
            <Row between>
              <Body>{ENTRY_LABELS[e.type] ?? e.type}</Body>
              <Body bold>{`${e.direction === 'CREDIT' ? '+' : '-'}${formatNaira(e.amount)}`}</Body>
            </Row>
            <Muted small>{formatDateTime(e.createdAt)}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  )
}
