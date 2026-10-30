import { prisma } from '../../lib/prisma.js'
import { config } from '../../config.js'
import { haversineKm } from '../pricing/pricing.js'
import { ACTIVE_JOB_STATUSES } from './dispatch.service.js'

// Read-only diagnosis: for one delivery, says why each rider is or is not eligible for an offer.
// Used by the admin debug endpoint and by the dispatch-explain script.
export async function explainDispatch(deliveryId?: string) {
  const now = new Date()

  // Prefer a delivery that is still searching; otherwise show the newest one so its status is visible
  const delivery = deliveryId
    ? await prisma.delivery.findUnique({ where: { id: deliveryId } })
    : ((await prisma.delivery.findFirst({ where: { status: 'SEARCHING_RIDER' }, orderBy: { createdAt: 'desc' } })) ??
      (await prisma.delivery.findFirst({ orderBy: { createdAt: 'desc' } })))

  const settings = {
    offerSeconds: config.OFFER_SECONDS,
    radiusKm: config.DISPATCH_RADIUS_KM,
    locationMaxAgeSeconds: config.LOCATION_STALE_SECONDS,
    searchTimeoutMinutes: config.DISPATCH_TIMEOUT_MINUTES,
    workerEnabled: config.DISPATCH_WORKER_ENABLED,
  }

  if (!delivery) return { serverTime: now, settings, delivery: null, deliveryProblems: ['There are no deliveries yet'], riders: [] }

  const deliveryProblems: string[] = []
  if (delivery.status !== 'SEARCHING_RIDER') {
    deliveryProblems.push(
      `Delivery status is ${delivery.status}. Offers are only made while it is SEARCHING_RIDER` +
        (delivery.status === 'CANCELLED' ? ` (cancel reason: ${delivery.cancelReason ?? 'none'}). Create a new delivery.` : ''),
    )
  }

  const riders = await prisma.rider.findMany({
    include: {
      user: { select: { phone: true, status: true } },
      deliveries: { where: { status: { in: ACTIVE_JOB_STATUSES } }, select: { id: true, status: true } },
      assignments: { select: { deliveryId: true, status: true, expiresAt: true } },
    },
  })

  const report = riders.map((r) => {
    const problems: string[] = []

    if (r.verificationStatus !== 'APPROVED') problems.push(`verificationStatus is ${r.verificationStatus}, must be APPROVED`)
    if (!r.isOnline) problems.push('isOnline is false. Call POST /v1/rider/status with online true')
    if (r.vehicleType !== delivery.vehicleType) {
      problems.push(`vehicleType is ${r.vehicleType ?? 'empty'}, the delivery needs ${delivery.vehicleType}`)
    }

    if (!r.lastSeenAt) {
      problems.push('no location has ever been sent (lastSeenAt is empty)')
    } else {
      const ageSeconds = Math.round((now.getTime() - r.lastSeenAt.getTime()) / 1000)
      if (ageSeconds > config.LOCATION_STALE_SECONDS) {
        problems.push(`location is ${ageSeconds}s old, the limit is ${config.LOCATION_STALE_SECONDS}s. Send POST /v1/rider/location`)
      }
    }

    let distanceToPickupKm: number | null = null
    if (r.currentLat === null || r.currentLng === null) {
      problems.push('currentLat/currentLng are empty')
    } else {
      distanceToPickupKm =
        Math.round(
          haversineKm({ lat: r.currentLat, lng: r.currentLng }, { lat: delivery.pickupLat, lng: delivery.pickupLng }) * 10,
        ) / 10
      if (distanceToPickupKm > config.DISPATCH_RADIUS_KM) {
        problems.push(
          `rider is ${distanceToPickupKm} km from the pickup, the limit is ${config.DISPATCH_RADIUS_KM} km (rider at ${r.currentLat}, ${r.currentLng}; pickup at ${delivery.pickupLat}, ${delivery.pickupLng})`,
        )
      }
    }

    if (r.user.status !== 'ACTIVE') problems.push(`user account is ${r.user.status}`)
    if (r.deliveries.length > 0) problems.push(`rider is busy with delivery ${r.deliveries[0].id} (${r.deliveries[0].status})`)
    if (r.assignments.some((a) => a.status === 'OFFERED' && a.expiresAt > now && a.deliveryId !== delivery.id)) {
      problems.push('rider already holds an open offer for another delivery')
    }
    const previous = r.assignments.find((a) => a.deliveryId === delivery.id)
    if (previous) problems.push(`rider was already offered this delivery (${previous.status}); a rider is never offered the same delivery twice`)

    return { riderId: r.id, phone: r.user.phone, eligible: problems.length === 0, distanceToPickupKm, problems }
  })

  return {
    serverTime: now,
    settings,
    delivery: {
      id: delivery.id,
      status: delivery.status,
      vehicleType: delivery.vehicleType,
      pickup: { lat: delivery.pickupLat, lng: delivery.pickupLng },
      createdAt: delivery.createdAt,
    },
    deliveryProblems,
    eligibleRiders: report.filter((r) => r.eligible).length,
    riders: report,
  }
}
