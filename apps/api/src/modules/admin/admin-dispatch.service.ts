import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { ACTIVE_JOB_STATUSES, dispatchDelivery } from '../dispatch/dispatch.service.js'
import { refundDelivery } from '../finance/settlement.js'
import type { Tx } from '../finance/ledger.js'

// Same lock order as automatic dispatch (delivery first, then rider), so they never clash
async function lock(tx: Tx, deliveryId: string, riderId?: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${deliveryId}::text))`
  if (riderId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${riderId}::text))`
}

// Hands a waiting delivery straight to a chosen rider, skipping the offer step.
// The rider sees it the next time the app checks GET /rider/jobs/current.
export async function assignRider(adminId: string, deliveryId: string, riderId: string, note?: string) {
  await prisma.$transaction(async (tx) => {
    await lock(tx, deliveryId, riderId)
    const now = new Date()

    const delivery = await tx.delivery.findUnique({ where: { id: deliveryId } })
    if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Delivery not found')
    if (delivery.status !== 'SEARCHING_RIDER') {
      throw new AppError(409, 'INVALID_STATE', 'Only a delivery that is searching for a rider can be assigned')
    }

    const rider = await tx.rider.findUnique({ where: { id: riderId }, include: { user: { select: { status: true } } } })
    if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found')
    if (rider.verificationStatus !== 'APPROVED' || rider.user.status !== 'ACTIVE') {
      throw new AppError(409, 'RIDER_NOT_ELIGIBLE', 'This rider is not approved or is suspended')
    }
    if (rider.vehicleType !== delivery.vehicleType) {
      throw new AppError(422, 'VEHICLE_MISMATCH', `This delivery needs a ${delivery.vehicleType}, the rider uses ${rider.vehicleType ?? 'no vehicle'}`)
    }
    const busy = await tx.delivery.findFirst({ where: { riderId, status: { in: ACTIVE_JOB_STATUSES } }, select: { id: true } })
    if (busy) throw new AppError(409, 'RIDER_BUSY', 'This rider is already on a delivery')

    // Any open offers for this delivery, or to this rider, are withdrawn
    await tx.deliveryAssignment.updateMany({
      where: { status: 'OFFERED', OR: [{ deliveryId }, { riderId }] },
      data: { status: 'CANCELLED' },
    })
    await tx.deliveryAssignment.upsert({
      where: { deliveryId_riderId: { deliveryId, riderId } },
      create: { deliveryId, riderId, status: 'ACCEPTED', expiresAt: now, respondedAt: now },
      update: { status: 'ACCEPTED', respondedAt: now },
    })

    const result = await tx.delivery.updateMany({
      where: { id: deliveryId, status: 'SEARCHING_RIDER' },
      data: { status: 'ASSIGNED', riderId, assignedAt: now },
    })
    if (result.count === 0) throw new AppError(409, 'INVALID_STATE', 'The delivery changed while assigning. Try again.')

    await tx.deliveryEvent.create({
      data: {
        deliveryId,
        status: 'ASSIGNED',
        actorType: 'ADMIN',
        actorId: adminId,
        note: note ? `Assigned by admin: ${note}` : 'Assigned by admin',
      },
    })
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'DELIVERY_ASSIGNED', entityType: 'Delivery', entityId: deliveryId, meta: { riderId, note: note ?? null } },
    })
  })
  return { ok: true, status: 'ASSIGNED' as const }
}

// Takes the rider off a job that has not been picked up yet and puts it back in the search
export async function unassignRider(adminId: string, deliveryId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    await lock(tx, deliveryId)
    const delivery = await tx.delivery.findUnique({ where: { id: deliveryId } })
    if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Delivery not found')
    if (delivery.status !== 'ASSIGNED' || !delivery.riderId) {
      throw new AppError(409, 'INVALID_STATE', 'Only an assigned delivery that has not been picked up can be unassigned')
    }

    await tx.delivery.update({
      where: { id: deliveryId },
      data: { status: 'SEARCHING_RIDER', riderId: null, assignedAt: null, searchStartedAt: new Date() },
    })
    await tx.deliveryAssignment.updateMany({
      where: { deliveryId, riderId: delivery.riderId, status: 'ACCEPTED' },
      data: { status: 'CANCELLED' },
    })
    await tx.deliveryEvent.create({
      data: { deliveryId, status: 'SEARCHING_RIDER', actorType: 'ADMIN', actorId: adminId, note: `Rider removed by admin: ${reason}. Finding another rider` },
    })
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'DELIVERY_UNASSIGNED', entityType: 'Delivery', entityId: deliveryId, meta: { riderId: delivery.riderId, reason } },
    })
  })

  // The removed rider is never offered this delivery again, so the next best rider gets it
  await dispatchDelivery(deliveryId).catch((err) => console.error('dispatch after unassign failed', err))
  return { ok: true, status: 'SEARCHING_RIDER' as const }
}

// Cancels a delivery that has not been picked up yet, and refunds the business
export async function adminCancelDelivery(adminId: string, deliveryId: string, reason: string) {
  const open = ['SEARCHING_RIDER', 'ASSIGNED'] as const

  await prisma.$transaction(async (tx) => {
    await lock(tx, deliveryId)
    const result = await tx.delivery.updateMany({
      where: { id: deliveryId, status: { in: [...open] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Cancelled by admin: ${reason}` },
    })
    if (result.count === 0) {
      throw new AppError(409, 'CANNOT_CANCEL', 'Only a delivery that has not been picked up can be cancelled')
    }
    await tx.deliveryAssignment.updateMany({
      where: { deliveryId, status: { in: ['OFFERED', 'ACCEPTED'] } },
      data: { status: 'CANCELLED' },
    })
    await tx.deliveryEvent.create({
      data: { deliveryId, status: 'CANCELLED', actorType: 'ADMIN', actorId: adminId, note: reason },
    })
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'DELIVERY_CANCELLED_BY_ADMIN', entityType: 'Delivery', entityId: deliveryId, meta: { reason } },
    })
  })

  await refundDelivery(deliveryId).catch((err) => console.error('refund failed, will retry', err))
  return { ok: true, status: 'CANCELLED' as const }
}
