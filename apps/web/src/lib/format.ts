import type { DeliveryStatus } from './types'

const wholeNaira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nairaAndKobo = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The API works in kobo (100 kobo = 1 naira). Whole naira amounts are shown without decimals.
export function formatNaira(kobo: number): string {
  return kobo % 100 === 0 ? wholeNaira.format(kobo / 100) : nairaAndKobo.format(kobo / 100)
}

// "1,500.50" -> 150050. Returns null for anything that is not a valid amount.
// Works on the digits as text, so there are no floating-point surprises.
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return Number.isSafeInteger(kobo) ? kobo : null
}

const dateTime = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dateTime.format(date)
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  SEARCHING_RIDER: 'Finding a rider',
  ASSIGNED: 'Rider assigned',
  PICKED_UP: 'Package picked up',
  IN_TRANSIT: 'On the way',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function statusTone(status: DeliveryStatus): Tone {
  switch (status) {
    case 'DELIVERED':
      return 'success'
    case 'FAILED':
    case 'CANCELLED':
      return 'danger'
    case 'SEARCHING_RIDER':
      return 'warning'
    case 'RETURNED':
      return 'neutral'
    default:
      return 'info'
  }
}

export const ACTIVE_STATUSES: DeliveryStatus[] = ['SEARCHING_RIDER', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']
export const CANCELLABLE_STATUSES: DeliveryStatus[] = ['SEARCHING_RIDER', 'ASSIGNED']

export const ENTRY_LABELS: Record<string, string> = {
  TOPUP: 'Wallet top-up',
  DELIVERY_CHARGE: 'Delivery charge',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment by support',
}

export const VEHICLE_LABELS = { BIKE: 'Motorbike', TRICYCLE: 'Tricycle', CAR: 'Car', VAN: 'Van' } as const

// Sent with money-moving requests so a retry after a dropped connection is never charged twice
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
