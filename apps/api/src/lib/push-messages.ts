export type PushMessage = {
  title: string
  body: string
  data?: Record<string, string>
  // "offers" is the loud channel with a long vibration, used for time-critical deliveries
  channelId?: 'offers' | 'default'
  ttlSeconds?: number
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// Kobo -> "₦1,500.50". Whole naira are shown without decimals.
export function naira(kobo: number): string {
  const abs = Math.abs(Math.round(kobo))
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  return `${kobo < 0 ? '-' : ''}₦${group(whole)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`
}

const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

// A new delivery offer. It expires with the offer, because a late alert is worse than none.
export function offerMessage(o: { payout: number; pickupAddress: string; distanceToPickupKm: number; tripKm: number; ttlSeconds: number }): PushMessage {
  return {
    title: `New delivery · ${naira(o.payout)}`,
    body: `${Math.round(o.distanceToPickupKm * 10) / 10} km to pickup · ${o.tripKm} km trip · ${short(o.pickupAddress)}`,
    data: { type: 'offer' },
    channelId: 'offers',
    ttlSeconds: o.ttlSeconds,
  }
}

export const assignedMessage = (o: { payout: number; pickupAddress: string }): PushMessage => ({
  title: `Delivery assigned to you · ${naira(o.payout)}`,
  body: `Pickup: ${short(o.pickupAddress)}`,
  data: { type: 'job' },
  channelId: 'offers',
  ttlSeconds: 600,
})

export const jobCancelledMessage = (): PushMessage => ({
  title: 'Delivery cancelled',
  body: 'This delivery was cancelled. You do not need to go to the pickup.',
  data: { type: 'job' },
  channelId: 'offers',
  ttlSeconds: 600,
})

export const approvedMessage = (): PushMessage => ({
  title: 'You are approved to ride',
  body: 'Open the app and go online to start receiving deliveries.',
  data: { type: 'account' },
})

export const rejectedMessage = (reason: string): PushMessage => ({
  title: 'Your application needs changes',
  body: short(reason, 120),
  data: { type: 'account' },
})

export const suspendedMessage = (): PushMessage => ({
  title: 'Your account is suspended',
  body: 'Contact support to find out why and what to do next.',
  data: { type: 'account' },
})

export const withdrawalPaidMessage = (amountKobo: number): PushMessage => ({
  title: 'Withdrawal paid',
  body: `${naira(amountKobo)} has been sent to your bank account.`,
  data: { type: 'money' },
})

export const withdrawalRejectedMessage = (amountKobo: number, reason: string): PushMessage => ({
  title: 'Withdrawal returned to your wallet',
  body: `${naira(amountKobo)} was not paid out: ${short(reason, 100)}`,
  data: { type: 'money' },
})

export const autoOfflineMessage = (misses: number): PushMessage => ({
  title: 'You were set offline',
  body: `You did not answer ${misses} deliveries in a row. Go online again when you are ready.`,
  data: { type: 'account' },
})
