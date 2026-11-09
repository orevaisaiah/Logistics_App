export type DeliveryStatus = 'SEARCHING_RIDER' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'RETURNED'
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const wholeNaira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nairaAndKobo = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The API works in kobo (100 kobo = 1 naira)
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? '-' : ''
  const abs = Math.abs(kobo)
  return sign + (abs % 100 === 0 ? wholeNaira.format(abs / 100) : nairaAndKobo.format(abs / 100))
}

// "1,500.50" -> 150050, or null when it is not an amount. Works on the text, so no rounding surprises.
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return Number.isSafeInteger(kobo) ? kobo : null
}

// 150050 -> "1500.50", 150000 -> "1500". For filling an edit form.
export function koboToNairaText(kobo: number): string {
  return kobo % 100 === 0 ? String(kobo / 100) : (kobo / 100).toFixed(2)
}

const dateTime = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dateTime.format(date)
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

export function formatPercent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? 'n/a' : `${Math.round(ratio * 1000) / 10}%`
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  SEARCHING_RIDER: 'Finding a rider',
  ASSIGNED: 'Rider assigned',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'On the way',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

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

export const VEHICLE_LABELS: Record<string, string> = { BIKE: 'Motorbike', TRICYCLE: 'Tricycle', CAR: 'Car', VAN: 'Van' }
export const VEHICLE_TYPES = ['BIKE', 'TRICYCLE', 'CAR', 'VAN'] as const

export const DOCUMENT_LABELS: Record<string, string> = {
  ID: 'Government ID',
  LICENCE: 'Driver licence',
  VEHICLE_PAPERS: 'Vehicle papers',
  SELFIE: 'Selfie',
  GUARANTOR_FORM: 'Guarantor form',
}

export const ENTRY_LABELS: Record<string, string> = {
  TOPUP: 'Top-up',
  DELIVERY_CHARGE: 'Delivery charge',
  ESCROW_HOLD: 'Held in escrow',
  ESCROW_RELEASE: 'Released from escrow',
  REFUND: 'Refund',
  RIDER_EARNING: 'Rider earning',
  COMMISSION: 'Commission',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_REVERSAL: 'Withdrawal returned',
  ADJUSTMENT: 'Adjustment',
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
