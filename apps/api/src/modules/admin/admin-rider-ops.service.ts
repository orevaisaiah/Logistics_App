import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { dispatchDelivery } from '../dispatch/dispatch.service.js'
import { ratio } from './reports.js'

// Stops a rider from working. Refused while they hold a package (picked up or on the road),
// because that delivery has to be resolved first. A job they have only been assigned goes back
// to the search.
export async function suspendRider(adminId: string, riderId: string, reason: string) {
  const freedDeliveryId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${riderId}::text))`

    const rider = await tx.rider.findUnique({ where: { id: riderId } })
    if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found')
    if (rider.verificationStatus !== 'APPROVED') {
      throw new AppError(409, 'INVALID_STATE', 'Only an approved rider can be suspended')
    }

    const holdingPackage = await tx.delivery.findFirst({
      where: { riderId, status: { in: ['PICKED_UP', 'IN_TRANSIT'] } },
      select: { id: true, trackingCode: true },
    })
    if (holdingPackage) {
      throw new AppError(409, 'RIDER_ON_JOB', `Resolve delivery ${holdingPackage.trackingCode} first: the rider has the package`)
    }

    let freed: string | null = null
    const assigned = await tx.delivery.findFirst({ where: { riderId, status: 'ASSIGNED' } })
    if (assigned) {
      await tx.delivery.update({
        where: { id: assigned.id },
        data: { status: 'SEARCHING_RIDER', riderId: null, assignedAt: null, searchStartedAt: new Date() },
      })
      await tx.deliveryEvent.create({
        data: { deliveryId: assigned.id, status: 'SEARCHING_RIDER', actorType: 'ADMIN', actorId: adminId, note: 'Rider suspended. Finding another rider' },
      })
      freed = assigned.id
    }

    await tx.deliveryAssignment.updateMany({
      where: { riderId, status: { in: ['OFFERED', 'ACCEPTED'] } },
      data: { status: 'CANCELLED' },
    })
    await tx.rider.update({
      where: { id: riderId },
      data: { verificationStatus: 'SUSPENDED', isOnline: false, suspendedAt: new Date(), suspensionReason: reason },
    })
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'RIDER_SUSPENDED', entityType: 'Rider', entityId: riderId, meta: { reason } },
    })
    return freed
  })

  if (freedDeliveryId) await dispatchDelivery(freedDeliveryId).catch((err) => console.error('dispatch after suspension failed', err))
  return { ok: true, status: 'SUSPENDED' as const, freedDeliveryId }
}

export async function reinstateRider(adminId: string, riderId: string) {
  const result = await prisma.rider.updateMany({
    where: { id: riderId, verificationStatus: 'SUSPENDED' },
    data: { verificationStatus: 'APPROVED', suspendedAt: null, suspensionReason: null },
  })
  if (result.count === 0) throw new AppError(409, 'INVALID_STATE', 'Only a suspended rider can be reinstated')
  await prisma.auditLog.create({
    data: { adminUserId: adminId, action: 'RIDER_REINSTATED', entityType: 'Rider', entityId: riderId },
  })
  return { ok: true, status: 'APPROVED' as const }
}

export async function riderPerformance(riderId: string) {
  const rider = await prisma.rider.findUnique({
    where: { id: riderId },
    select: {
      id: true,
      verificationStatus: true,
      suspendedAt: true,
      suspensionReason: true,
      vehicleType: true,
      plateNumber: true,
      isOnline: true,
      lastSeenAt: true,
      user: { select: { fullName: true, phone: true, createdAt: true } },
    },
  })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found')

  const [deliveries, offers, earnings, timing, recent] = await Promise.all([
    prisma.delivery.groupBy({ by: ['status'], where: { riderId }, _count: true }),
    prisma.deliveryAssignment.groupBy({ by: ['status'], where: { riderId }, _count: true }),
    prisma.walletEntry.aggregate({ where: { type: 'RIDER_EARNING', wallet: { riderId } }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw<{ avgMinutes: number | null }[]>`
      SELECT (AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "pickedUpAt")) / 60))::float8 AS "avgMinutes"
      FROM "Delivery"
      WHERE "riderId" = ${riderId}::uuid AND "status" = 'DELIVERED'
        AND "pickedUpAt" IS NOT NULL AND "deliveredAt" IS NOT NULL
    `,
    prisma.delivery.findMany({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, trackingCode: true, status: true, createdAt: true, deliveredAt: true, riderPayoutAmount: true },
    }),
  ])

  const d = Object.fromEntries(deliveries.map((g) => [g.status, g._count])) as Record<string, number>
  const o = Object.fromEntries(offers.map((g) => [g.status, g._count])) as Record<string, number>
  const accepted = (o.ACCEPTED ?? 0) + (o.RIDER_CANCELLED ?? 0)
  const answered = accepted + (o.DECLINED ?? 0) + (o.EXPIRED ?? 0)

  return {
    rider,
    deliveriesByStatus: d,
    offersByStatus: o,
    acceptanceRate: ratio(accepted, answered), // offers accepted out of offers the rider answered or ignored
    cancellationRate: ratio(o.RIDER_CANCELLED ?? 0, accepted), // accepted jobs the rider later backed out of
    completionRate: ratio(d.DELIVERED ?? 0, (d.DELIVERED ?? 0) + (d.FAILED ?? 0)),
    averageMinutesPickupToDelivery: timing[0]?.avgMinutes ?? null,
    totalEarned: earnings._sum.amount ?? 0n,
    paidJobs: earnings._count,
    recentDeliveries: recent,
  }
}
