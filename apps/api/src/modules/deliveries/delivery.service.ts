import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { DeliveryStatus, MemberRole, VehicleType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { calculateQuote, toBusinessQuote } from '../pricing/pricing.service.js'
import { dispatchDelivery } from '../dispatch/dispatch.service.js'
import { chargeDelivery, refundDelivery } from '../finance/settlement.js'

// No I, L, O, U, 0 or 1, so codes are easy to read out over the phone
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

function generateTrackingCode() {
  let suffix = ''
  for (let i = 0; i < 8; i++) suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  return `LG-${suffix}`
}

// Finds the business the user belongs to, optionally restricting by role
async function getMembership(userId: string, allowedRoles?: MemberRole[]) {
  const membership = await prisma.businessMember.findFirst({ where: { userId } })
  if (!membership) throw new AppError(404, 'NO_BUSINESS', 'Create your business profile first')
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Your role does not allow this action')
  }
  return membership
}

const CAN_CREATE: MemberRole[] = ['OWNER', 'DISPATCHER']

// Deliberately leaves out commission, rider payout and the delivery OTP hash:
// businesses must not see how the price is split
const businessDeliverySelect = {
  id: true,
  trackingCode: true,
  status: true,
  vehicleType: true,
  distanceKm: true,
  price: true,
  pickupAddress: true,
  pickupLat: true,
  pickupLng: true,
  pickupContactName: true,
  pickupContactPhone: true,
  dropoffAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  recipientName: true,
  recipientPhone: true,
  packageDescription: true,
  weightKg: true,
  declaredValue: true,
  isFragile: true,
  notes: true,
  createdAt: true,
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  cancelledAt: true,
  cancelReason: true,
  zone: { select: { id: true, name: true } },
  rider: {
    select: {
      vehicleType: true,
      plateNumber: true,
      avgRating: true,
      currentLat: true,
      currentLng: true,
      lastSeenAt: true,
      user: { select: { fullName: true, phone: true } },
    },
  },
  events: {
    select: { status: true, actorType: true, note: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.DeliverySelect

const businessListSelect = {
  id: true,
  trackingCode: true,
  status: true,
  vehicleType: true,
  price: true,
  pickupAddress: true,
  dropoffAddress: true,
  recipientName: true,
  createdAt: true,
} satisfies Prisma.DeliverySelect

type Point = { address: string; lat: number; lng: number }

export type CreateDeliveryInput = {
  pickup: Point & { contactName: string; contactPhone: string }
  dropoff: Point & { recipientName: string; recipientPhone: string }
  package: { description: string; weightKg: number; declaredValue?: number; isFragile: boolean }
  vehicleType: VehicleType
  notes?: string
}

export async function quoteDelivery(
  userId: string,
  input: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number }; weightKg: number; vehicleType: VehicleType },
) {
  await getMembership(userId)
  return toBusinessQuote(await calculateQuote(input))
}

export async function createDelivery(userId: string, input: CreateDeliveryInput) {
  const { businessId } = await getMembership(userId, CAN_CREATE)

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { verificationStatus: true },
  })
  if (business.verificationStatus === 'SUSPENDED' || business.verificationStatus === 'REJECTED') {
    throw new AppError(403, 'BUSINESS_SUSPENDED', 'Your business account cannot create deliveries. Contact support.')
  }

  // The price is always recalculated here. The client never sends it, so it cannot be tampered with.
  const quote = await calculateQuote({
    pickup: input.pickup,
    dropoff: input.dropoff,
    weightKg: input.package.weightKg,
    vehicleType: input.vehicleType,
  })

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // The delivery and its payment are created together. If the wallet cannot cover the
      // price, nothing is created and the business is told to top up.
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.delivery.create({
          data: {
            trackingCode: generateTrackingCode(),
            businessId,
            createdByUserId: userId,
            pickupAddress: input.pickup.address,
            pickupLat: input.pickup.lat,
            pickupLng: input.pickup.lng,
            pickupContactName: input.pickup.contactName,
            pickupContactPhone: input.pickup.contactPhone,
            dropoffAddress: input.dropoff.address,
            dropoffLat: input.dropoff.lat,
            dropoffLng: input.dropoff.lng,
            recipientName: input.dropoff.recipientName,
            recipientPhone: input.dropoff.recipientPhone,
            packageDescription: input.package.description,
            weightKg: input.package.weightKg,
            declaredValue: input.package.declaredValue,
            isFragile: input.package.isFragile,
            notes: input.notes,
            status: 'SEARCHING_RIDER',
            vehicleType: input.vehicleType,
            zoneId: quote.zone.id,
            distanceKm: quote.distanceKm,
            price: quote.price,
            commissionAmount: quote.commissionAmount,
            riderPayoutAmount: quote.riderPayoutAmount,
            events: {
              create: { status: 'SEARCHING_RIDER', actorType: 'BUSINESS', actorId: userId, note: 'Delivery created' },
            },
          },
          select: { id: true },
        })
        await chargeDelivery(tx, { deliveryId: row.id, businessId, amount: quote.price })
        return tx.delivery.findUniqueOrThrow({ where: { id: row.id }, select: businessDeliverySelect })
      })
      // Start looking for a rider straight away; the background worker keeps retrying if none is free
      void dispatchDelivery(created.id).catch((e) => console.error('dispatch failed', e))
      return created
    } catch (err) {
      // Astronomically unlikely, but a duplicate tracking code just means: try another one
      const isCodeClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('trackingCode')
      if (!isCodeClash || attempt === 2) throw err
    }
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Could not create the delivery')
}

export async function listDeliveries(userId: string, q: { status?: DeliveryStatus; page: number; limit: number }) {
  const { businessId } = await getMembership(userId)
  const where = { businessId, ...(q.status ? { status: q.status } : {}) }

  const [items, total] = await prisma.$transaction([
    prisma.delivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: businessListSelect,
    }),
    prisma.delivery.count({ where }),
  ])
  return { items, total, page: q.page, limit: q.limit }
}

export async function getDelivery(userId: string, deliveryId: string) {
  const { businessId } = await getMembership(userId)
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, businessId },
    select: businessDeliverySelect,
  })
  if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Delivery not found')
  return hideRiderDetailsWhenFinished(delivery)
}

const LIVE_STATUSES: DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

// A business may follow its rider only while the job is live. Afterwards the rider's
// phone number and location are removed from what the business can see.
function hideRiderDetailsWhenFinished<T extends { status: DeliveryStatus; rider: unknown }>(delivery: T): T {
  if (!delivery.rider || LIVE_STATUSES.includes(delivery.status)) return delivery
  const rider = delivery.rider as { user: Record<string, unknown> } & Record<string, unknown>
  return {
    ...delivery,
    rider: {
      ...rider,
      currentLat: null,
      currentLng: null,
      lastSeenAt: null,
      user: { ...rider.user, phone: null },
    },
  }
}

const CANCELLABLE: DeliveryStatus[] = ['SEARCHING_RIDER', 'ASSIGNED']

export async function cancelDelivery(userId: string, deliveryId: string, reason: string) {
  const { businessId } = await getMembership(userId, CAN_CREATE)

  const delivery = await prisma.delivery.findFirst({ where: { id: deliveryId, businessId } })
  if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Delivery not found')
  if (!CANCELLABLE.includes(delivery.status)) {
    throw new AppError(409, 'CANNOT_CANCEL', 'This delivery can no longer be cancelled')
  }

  await prisma.$transaction(async (tx) => {
    // The status condition guards against a rider picking the parcel up at the same moment
    const result = await tx.delivery.updateMany({
      where: { id: deliveryId, status: { in: CANCELLABLE } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    })
    if (result.count === 0) throw new AppError(409, 'CANNOT_CANCEL', 'This delivery can no longer be cancelled')
    await tx.deliveryAssignment.updateMany({
      where: { deliveryId, status: { in: ['OFFERED', 'ACCEPTED'] } },
      data: { status: 'CANCELLED' },
    })
    await tx.deliveryEvent.create({
      data: { deliveryId, status: 'CANCELLED', actorType: 'BUSINESS', actorId: userId, note: reason },
    })
  })
  // Give the money back. If this fails, the background worker retries it within seconds.
  await refundDelivery(deliveryId).catch((err) => console.error('refund failed, will retry', err))
  return getDelivery(userId, deliveryId)
}

// Public tracking: shows progress only. No addresses, names, phone numbers or prices.
export async function trackDelivery(trackingCode: string) {
  const delivery = await prisma.delivery.findUnique({
    where: { trackingCode: trackingCode.toUpperCase() },
    select: {
      trackingCode: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      cancelledAt: true,
      events: { select: { status: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!delivery) throw new AppError(404, 'TRACKING_NOT_FOUND', 'No delivery found for that tracking code')
  return delivery
}
