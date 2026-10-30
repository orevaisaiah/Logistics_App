// Pure functions only: no database, no framework. That makes the money logic easy to test.

export type LatLng = { lat: number; lng: number }

export type ZoneCircle = {
  id: string
  name: string
  centerLat: number
  centerLng: number
  radiusKm: number
}

export type RateInput = {
  baseFee: number
  perKmFee: number
  perKgFee: number
  includedWeightKg: number
  minFee: number
}

// Prices are rounded up to the next 50 naira (5,000 kobo) so cash handling stays simple
export const PRICE_ROUNDING_KOBO = 5000

const EARTH_RADIUS_KM = 6371
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function isInsideZone(zone: ZoneCircle, point: LatLng): boolean {
  return haversineKm({ lat: zone.centerLat, lng: zone.centerLng }, point) <= zone.radiusKm
}

// If zones overlap, the zone whose centre is closest to the point wins
export function findZone<T extends ZoneCircle>(zones: T[], point: LatLng): T | null {
  const candidates = zones
    .map((zone) => ({ zone, distance: haversineKm({ lat: zone.centerLat, lng: zone.centerLng }, point) }))
    .filter((c) => c.distance <= c.zone.radiusKm)
    .sort((x, y) => x.distance - y.distance)
  return candidates[0]?.zone ?? null
}

export function computePrice(rate: RateInput, distanceKm: number, weightKg: number) {
  const distanceFee = Math.round(rate.perKmFee * distanceKm)
  const extraKg = Math.max(0, weightKg - rate.includedWeightKg)
  const weightFee = Math.round(rate.perKgFee * extraKg)
  const subtotal = rate.baseFee + distanceFee + weightFee
  const minFeeApplied = subtotal < rate.minFee
  const beforeRounding = Math.max(rate.minFee, subtotal)
  const total = Math.ceil(beforeRounding / PRICE_ROUNDING_KOBO) * PRICE_ROUNDING_KOBO
  return { baseFee: rate.baseFee, distanceFee, weightFee, minFeeApplied, total }
}

export function splitCommission(price: number, percent: number) {
  const commissionAmount = Math.round((price * percent) / 100)
  return { commissionAmount, riderPayoutAmount: price - commissionAmount }
}
