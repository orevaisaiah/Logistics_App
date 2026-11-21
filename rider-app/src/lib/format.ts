const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// The API works in kobo (100 kobo = 1 naira). Whole naira are shown without decimals.
// Written by hand, because phone JavaScript engines do not always include full number formatting.
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? '-' : ''
  const abs = Math.abs(Math.round(kobo))
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  return `${sign}₦${group(whole)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`
}

// Nigeria has no daylight saving, so Lagos is always UTC+1
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t + 60 * 60 * 1000)
  const hours = d.getUTCHours()
  const h12 = hours % 12 === 0 ? 12 : hours % 12
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`
}

export function remainingSeconds(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))
}

// Sent with money-moving requests so a retry after a dropped connection is never charged twice.
// Phones have no built-in UUID generator, so this combines the time with random characters.
export function newIdempotencyKey(): string {
  let random = ''
  for (let i = 0; i < 24; i++) random += Math.floor(Math.random() * 36).toString(36)
  return `${Date.now().toString(36)}-${random}`
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: 'Go to pickup',
  PICKED_UP: 'Package collected',
  IN_TRANSIT: 'On the way to the recipient',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
}

export const ENTRY_LABELS: Record<string, string> = {
  RIDER_EARNING: 'Delivery earning',
  WITHDRAWAL: 'Withdrawal',
  WITHDRAWAL_REVERSAL: 'Withdrawal returned',
  ADJUSTMENT: 'Adjustment by support',
}

export const DOCUMENT_LABELS: Record<string, string> = {
  ID: 'Government ID',
  LICENCE: 'Driver licence',
  VEHICLE_PAPERS: 'Vehicle papers',
  SELFIE: 'Selfie',
  GUARANTOR_FORM: 'Guarantor form',
}

export const VEHICLE_LABELS: Record<string, string> = { BIKE: 'Motorbike', TRICYCLE: 'Tricycle', CAR: 'Car', VAN: 'Van' }
