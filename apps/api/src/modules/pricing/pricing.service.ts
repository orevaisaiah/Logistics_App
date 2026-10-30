import type { VehicleType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'
import { computePrice, findZone, haversineKm, isInsideZone, splitCommission, type LatLng } from './pricing.js'

type QuoteInput = { pickup: LatLng; dropoff: LatLng; weightKg: number; vehicleType: VehicleType }

// Internal quote: includes the platform's commission split, so never send it to businesses as is
export async function calculateQuote({ pickup, dropoff, weightKg, vehicleType }: QuoteInput) {
  const zones = await prisma.zone.findMany({ where: { isActive: true } })
  const zone = findZone(zones, pickup)
  if (!zone) throw new AppError(422, 'OUT_OF_SERVICE_AREA', 'The pickup location is outside our service area')
  if (!isInsideZone(zone, dropoff)) {
    throw new AppError(422, 'DROPOFF_OUTSIDE_ZONE', 'For now, pickup and drop-off must be in the same service area')
  }

  const rate = await prisma.rateCard.findUnique({
    where: { zoneId_vehicleType: { zoneId: zone.id, vehicleType } },
  })
  if (!rate || !rate.isActive) {
    throw new AppError(422, 'VEHICLE_NOT_AVAILABLE', `${vehicleType} deliveries are not available in ${zone.name}`)
  }
  if (weightKg > rate.maxWeightKg) {
    throw new AppError(422, 'OVERWEIGHT', `Maximum weight for ${vehicleType} is ${rate.maxWeightKg} kg`)
  }

  const straightKm = haversineKm(pickup, dropoff)
  const distanceKm = Math.round(straightKm * config.ROAD_DISTANCE_FACTOR * 100) / 100
  const breakdown = computePrice(rate, distanceKm, weightKg)
  const split = splitCommission(breakdown.total, config.COMMISSION_PERCENT)

  return {
    zone: { id: zone.id, name: zone.name },
    vehicleType,
    distanceKm,
    price: breakdown.total,
    breakdown,
    ...split,
  }
}

// What a business is allowed to see
export function toBusinessQuote(q: Awaited<ReturnType<typeof calculateQuote>>) {
  return {
    zone: q.zone,
    vehicleType: q.vehicleType,
    distanceKm: q.distanceKm,
    currency: 'NGN',
    amountUnit: 'kobo',
    price: q.price,
    breakdown: q.breakdown,
  }
}
