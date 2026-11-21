import { normalizeNgPhone } from '../lib/phone.js'

// Fixed test accounts. Change them with DEMO_RIDER_PHONE / DEMO_BUSINESS_PHONE in .env if you prefer other numbers.
const riderLocal = process.env.DEMO_RIDER_PHONE ?? '08011112222'
const businessLocal = process.env.DEMO_BUSINESS_PHONE ?? '08033334444'

export const DEMO = {
  riderLocal,
  businessLocal,
  riderPhone: normalizeNgPhone(riderLocal),
  businessPhone: normalizeNgPhone(businessLocal),
  recipientPhone: '08099990000',
}

// These scripts create fake accounts and free money, so they refuse to run on a live system
export function refuseInProduction() {
  if (process.env.NODE_ENV === 'production') {
    console.error('These demo commands only work on a development computer (NODE_ENV is "production" here).')
    process.exit(1)
  }
}
