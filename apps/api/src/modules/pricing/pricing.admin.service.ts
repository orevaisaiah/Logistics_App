import type { VehicleType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { audit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'

type ZoneInput = { name: string; centerLat: number; centerLng: number; radiusKm: number; isActive: boolean }
type RateInput = {
  baseFee: number
  perKmFee: number
  perKgFee: number
  includedWeightKg: number
  maxWeightKg: number
  minFee: number
  isActive: boolean
}

export async function createZone(adminId: string, data: ZoneInput) {
  const zone = await prisma.zone.create({ data })
  await audit(adminId, 'ZONE_CREATED', 'Zone', zone.id, data)
  return zone
}

export const listZones = () => prisma.zone.findMany({ orderBy: { name: 'asc' } })

export async function updateZone(adminId: string, zoneId: string, data: Partial<ZoneInput>) {
  const existing = await prisma.zone.findUnique({ where: { id: zoneId } })
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Zone not found')
  const zone = await prisma.zone.update({ where: { id: zoneId }, data })
  await audit(adminId, 'ZONE_UPDATED', 'Zone', zone.id, data)
  return zone
}

export async function listRateCards(zoneId: string) {
  return prisma.rateCard.findMany({ where: { zoneId }, orderBy: { vehicleType: 'asc' } })
}

export async function upsertRateCard(adminId: string, zoneId: string, vehicleType: VehicleType, data: RateInput) {
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } })
  if (!zone) throw new AppError(404, 'NOT_FOUND', 'Zone not found')

  const rate = await prisma.rateCard.upsert({
    where: { zoneId_vehicleType: { zoneId, vehicleType } },
    create: { zoneId, vehicleType, ...data },
    update: data,
  })
  await audit(adminId, 'RATE_CARD_UPSERTED', 'RateCard', rate.id, { zoneId, vehicleType, ...data })
  return rate
}
