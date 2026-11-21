import type { DeliveryStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { config } from '../../config.js'
import { boundingBox, rankByDistance } from './geo.js'
import { runFinanceCycle } from '../finance/settlement.js'
import { notifyRider } from '../../lib/push.js'
import { offerMessage } from '../../lib/push-messages.js'
import { setUnresponsiveRidersOffline } from './auto-offline.js'
import { purgeIdempotencyRecords } from '../../lib/idempotency.js'

// A rider with a delivery in any of these states is busy and gets no new offers
export const ACTIVE_JOB_STATUSES: DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

type Logger = { error: (obj: unknown, msg?: string) => void }

// Offers a delivery to the nearest eligible rider. One rider at a time:
// if they decline or let the timer run out, the next cycle offers it to the next rider.
export async function dispatchDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } })
  if (!delivery || delivery.status !== 'SEARCHING_RIDER') return false

  const now = new Date()
  const openOffer = await prisma.deliveryAssignment.findFirst({
    where: { deliveryId, status: 'OFFERED', expiresAt: { gt: now } },
  })
  if (openOffer) return false

  const pickup = { lat: delivery.pickupLat, lng: delivery.pickupLng }
  const box = boundingBox(pickup, config.DISPATCH_RADIUS_KM)
  const freshAfter = new Date(now.getTime() - config.LOCATION_STALE_SECONDS * 1000)
  const pushFreshAfter = new Date(now.getTime() - config.PUSH_REACHABLE_STALE_SECONDS * 1000)

  const riders = await prisma.rider.findMany({
    where: {
      verificationStatus: 'APPROVED',
      isOnline: true,
      vehicleType: delivery.vehicleType,
      // Available if the app shared its location recently, or if the phone can be alerted by push and its last known location is not too old
      OR: [{ lastSeenAt: { gte: freshAfter } }, { lastSeenAt: { gte: pushFreshAfter }, user: { pushTokens: { some: {} } } }],
      currentLat: { gte: box.minLat, lte: box.maxLat },
      currentLng: { gte: box.minLng, lte: box.maxLng },
      user: { status: 'ACTIVE' },
      // Not on another job, not already holding an open offer, never offered this delivery before
      deliveries: { none: { status: { in: ACTIVE_JOB_STATUSES } } },
      assignments: { none: { OR: [{ deliveryId }, { status: 'OFFERED', expiresAt: { gt: now } }] } },
    },
    select: { id: true, currentLat: true, currentLng: true },
  })

  const located = riders.flatMap((r) =>
    r.currentLat !== null && r.currentLng !== null ? [{ id: r.id, lat: r.currentLat, lng: r.currentLng }] : [],
  )

  for (const candidate of rankByDistance(located, pickup, config.DISPATCH_RADIUS_KM)) {
    if (await tryOffer(deliveryId, candidate.id)) {
      // Alert the rider's phone. Not awaited: push is best effort and must never hold up dispatch.
      void notifyRider(
        candidate.id,
        offerMessage({ payout: delivery.riderPayoutAmount, pickupAddress: delivery.pickupAddress, distanceToPickupKm: candidate.distanceKm, tripKm: delivery.distanceKm, ttlSeconds: config.OFFER_SECONDS }),
      )
      return true
    }
  }
  return false
}

// The checks are repeated inside a transaction holding locks on the delivery and the rider,
// so two dispatch runs at the same moment cannot double-offer a delivery or a rider
async function tryOffer(deliveryId: string, riderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deliveryId}::text))`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${riderId}::text))`

    const now = new Date()
    const delivery = await tx.delivery.findUnique({ where: { id: deliveryId } })
    if (!delivery || delivery.status !== 'SEARCHING_RIDER') return false

    const [openForDelivery, openForRider, busy, alreadyOffered] = await Promise.all([
      tx.deliveryAssignment.findFirst({ where: { deliveryId, status: 'OFFERED', expiresAt: { gt: now } } }),
      tx.deliveryAssignment.findFirst({ where: { riderId, status: 'OFFERED', expiresAt: { gt: now } } }),
      tx.delivery.findFirst({ where: { riderId, status: { in: ACTIVE_JOB_STATUSES } } }),
      tx.deliveryAssignment.findUnique({ where: { deliveryId_riderId: { deliveryId, riderId } } }),
    ])
    if (openForDelivery || openForRider || busy || alreadyOffered) return false

    await tx.deliveryAssignment.create({
      data: { deliveryId, riderId, expiresAt: new Date(now.getTime() + config.OFFER_SECONDS * 1000) },
    })
    return true
  })
}

let running = false

// Runs every few seconds. Every step is safe to repeat and safe to run on several servers at once.
export async function runDispatchCycle(log: Logger) {
  if (running) return
  running = true
  try {
    const now = new Date()

    // 1. Offers whose timer ran out. Riders who let several in a row go unanswered are set offline.
    const expiring = await prisma.deliveryAssignment.findMany({
      where: { status: 'OFFERED', expiresAt: { lte: now } },
      select: { riderId: true },
    })
    await prisma.deliveryAssignment.updateMany({
      where: { status: 'OFFERED', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    })
    await setUnresponsiveRidersOffline([...new Set(expiring.map((e) => e.riderId))], log)

    // 2. Give up on deliveries that have searched too long
    const giveUpBefore = new Date(now.getTime() - config.DISPATCH_TIMEOUT_MINUTES * 60 * 1000)
    const timedOut = await prisma.delivery.findMany({
      where: { status: 'SEARCHING_RIDER', searchStartedAt: { lt: giveUpBefore } },
      select: { id: true },
      take: 50,
    })
    for (const { id } of timedOut) {
      await prisma
        .$transaction(async (tx) => {
          const result = await tx.delivery.updateMany({
            where: { id, status: 'SEARCHING_RIDER' },
            data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'No rider available' },
          })
          if (result.count === 0) return
          await tx.deliveryAssignment.updateMany({
            where: { deliveryId: id, status: 'OFFERED' },
            data: { status: 'CANCELLED' },
          })
          await tx.deliveryEvent.create({
            data: { deliveryId: id, status: 'CANCELLED', actorType: 'SYSTEM', note: 'No rider available' },
          })
        })
        .catch((err) => log.error(err, 'failed to time out delivery'))
    }

    // 3. Deliveries still waiting and holding no live offer
    const waiting = await prisma.delivery.findMany({
      where: {
        status: 'SEARCHING_RIDER',
        assignments: { none: { status: 'OFFERED', expiresAt: { gt: now } } },
      },
      orderBy: { searchStartedAt: 'asc' },
      select: { id: true },
      take: 50,
    })
    for (const { id } of waiting) {
      await dispatchDelivery(id).catch((err) => log.error(err, 'dispatch failed'))
    }

    // 4. Money: pay riders for delivered jobs and refund cancelled ones that the request missed
    await runFinanceCycle(log)

    // 5. Housekeeping: forget retry records older than two days
    await purgeIdempotencyRecords().catch((err) => log.error(err, 'idempotency cleanup failed'))
  } catch (err) {
    log.error(err, 'dispatch cycle failed')
  } finally {
    running = false
  }
}

export function startDispatchWorker(log: Logger, everyMs = 5000) {
  const timer = setInterval(() => void runDispatchCycle(log), everyMs)
  return () => clearInterval(timer)
}
