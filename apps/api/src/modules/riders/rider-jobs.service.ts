import crypto from 'node:crypto'
import type { DeliveryStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { redis } from '../../lib/redis.js'
import { sendSms } from '../../lib/sms.js'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'
import { haversineKm } from '../pricing/pricing.js'
import { ACTIVE_JOB_STATUSES, dispatchDelivery } from '../dispatch/dispatch.service.js'
import { settleDelivery } from '../finance/settlement.js'

const MAX_CODE_ATTEMPTS = 5
const MAX_CODE_RESENDS_PER_HOUR = 3

type Location = { lat?: number; lng?: number }

// Riders can only work once an admin has approved them
async function getApprovedRider(userId: string) {
  const rider = await prisma.rider.findUnique({ where: { userId } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')
  if (rider.verificationStatus !== 'APPROVED') {
    throw new AppError(403, 'NOT_APPROVED', 'Your account has not been approved yet')
  }
  return rider
}

const hashCode = (deliveryId: string, code: string) =>
  crypto.createHmac('sha256', config.OTP_SECRET).update(`${deliveryId}:${code}`).digest('hex')

const newCode = () => crypto.randomInt(1000, 10000).toString()

/* ---------- availability and location ---------- */

export async function setOnlineStatus(userId: string, input: { online: boolean; lat?: number; lng?: number }) {
  const rider = await getApprovedRider(userId)
  const updated = await prisma.rider.update({
    where: { id: rider.id },
    data: input.online
      ? { isOnline: true, currentLat: input.lat, currentLng: input.lng, lastSeenAt: new Date() }
      : { isOnline: false },
    select: { isOnline: true, lastSeenAt: true },
  })
  return updated
}

// Called every 10 to 15 seconds by the app while the rider is online or on a job.
// Riders who are offline and idle are not tracked.
export async function updateLocation(userId: string, lat: number, lng: number) {
  const rider = await getApprovedRider(userId)
  const activeJob = await prisma.delivery.findFirst({
    where: { riderId: rider.id, status: { in: ACTIVE_JOB_STATUSES } },
    select: { id: true },
  })
  if (!rider.isOnline && !activeJob) {
    throw new AppError(409, 'NOT_ONLINE', 'Go online before sharing your location')
  }
  await prisma.rider.update({
    where: { id: rider.id },
    data: { currentLat: lat, currentLng: lng, lastSeenAt: new Date() },
  })
  return { ok: true }
}

/* ---------- offers ---------- */

export async function getCurrentOffer(userId: string) {
  const rider = await getApprovedRider(userId)
  const now = new Date()
  const offer = await prisma.deliveryAssignment.findFirst({
    where: { riderId: rider.id, status: 'OFFERED', expiresAt: { gt: now } },
    include: {
      delivery: {
        select: {
          pickupAddress: true,
          pickupLat: true,
          pickupLng: true,
          distanceKm: true,
          riderPayoutAmount: true,
          weightKg: true,
          isFragile: true,
          packageDescription: true,
        },
      },
    },
  })
  if (!offer) return { offer: null }

  const d = offer.delivery
  const distanceToPickupKm =
    rider.currentLat !== null && rider.currentLng !== null
      ? Math.round(haversineKm({ lat: rider.currentLat, lng: rider.currentLng }, { lat: d.pickupLat, lng: d.pickupLng }) * 10) / 10
      : null

  // The drop-off address is hidden until the rider accepts
  return {
    offer: {
      assignmentId: offer.id,
      expiresAt: offer.expiresAt,
      secondsLeft: Math.max(0, Math.round((offer.expiresAt.getTime() - now.getTime()) / 1000)),
      pickupAddress: d.pickupAddress,
      pickupLat: d.pickupLat,
      pickupLng: d.pickupLng,
      distanceToPickupKm,
      tripDistanceKm: d.distanceKm,
      payout: d.riderPayoutAmount,
      weightKg: d.weightKg,
      isFragile: d.isFragile,
      packageDescription: d.packageDescription,
    },
  }
}

export async function acceptOffer(userId: string, assignmentId: string) {
  const rider = await getApprovedRider(userId)

  await prisma.$transaction(async (tx) => {
    const now = new Date()
    // Each step only succeeds if nothing changed in the meantime
    const claimed = await tx.deliveryAssignment.updateMany({
      where: { id: assignmentId, riderId: rider.id, status: 'OFFERED', expiresAt: { gt: now } },
      data: { status: 'ACCEPTED', respondedAt: now },
    })
    if (claimed.count === 0) {
      throw new AppError(409, 'OFFER_UNAVAILABLE', 'This offer has expired or is no longer available')
    }

    const assignment = await tx.deliveryAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
    const assigned = await tx.delivery.updateMany({
      where: { id: assignment.deliveryId, status: 'SEARCHING_RIDER' },
      data: { status: 'ASSIGNED', riderId: rider.id, assignedAt: now },
    })
    // Throwing here undoes the claim above
    if (assigned.count === 0) {
      throw new AppError(409, 'OFFER_UNAVAILABLE', 'This delivery is no longer available')
    }

    await tx.deliveryEvent.create({
      data: { deliveryId: assignment.deliveryId, status: 'ASSIGNED', actorType: 'RIDER', actorId: userId, note: 'Rider accepted the job' },
    })
  })
  return getCurrentJob(userId)
}

export async function declineOffer(userId: string, assignmentId: string, reason?: string) {
  const rider = await getApprovedRider(userId)
  const result = await prisma.deliveryAssignment.updateMany({
    where: { id: assignmentId, riderId: rider.id, status: 'OFFERED' },
    data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason },
  })
  if (result.count === 0) throw new AppError(409, 'OFFER_UNAVAILABLE', 'This offer is no longer available')

  // Offer it to the next rider straight away instead of waiting for the next cycle
  const assignment = await prisma.deliveryAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
  await dispatchDelivery(assignment.deliveryId).catch((err) => console.error('dispatch after decline failed', err))
  return { ok: true }
}

/* ---------- the active job ---------- */

const jobSelect = {
  id: true,
  trackingCode: true,
  status: true,
  vehicleType: true,
  distanceKm: true,
  riderPayoutAmount: true,
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
  isFragile: true,
  notes: true,
  assignedAt: true,
  pickedUpAt: true,
  business: { select: { companyName: true } },
} satisfies Prisma.DeliverySelect

export async function getCurrentJob(userId: string) {
  const rider = await getApprovedRider(userId)
  const job = await prisma.delivery.findFirst({
    where: { riderId: rider.id, status: { in: ACTIVE_JOB_STATUSES } },
    select: jobSelect,
  })
  if (!job) return { job: null }
  const { riderPayoutAmount, ...rest } = job
  return { job: { ...rest, payout: riderPayoutAmount } }
}

// Moves a job one step, only if it belongs to this rider and is in the expected state
async function transition(
  userId: string,
  deliveryId: string,
  from: DeliveryStatus,
  to: DeliveryStatus,
  opts: { data?: Prisma.DeliveryUpdateManyMutationInput; note?: string } & Location,
) {
  const rider = await getApprovedRider(userId)
  await prisma.$transaction(async (tx) => {
    const result = await tx.delivery.updateMany({
      where: { id: deliveryId, riderId: rider.id, status: from },
      data: { status: to, ...opts.data },
    })
    if (result.count === 0) {
      throw new AppError(409, 'INVALID_STATE', 'This job is not in the right state for that action')
    }
    await tx.deliveryEvent.create({
      data: {
        deliveryId,
        status: to,
        actorType: 'RIDER',
        actorId: userId,
        note: opts.note,
        latitude: opts.lat,
        longitude: opts.lng,
      },
    })
  })
}

async function sendDeliveryCode(deliveryId: string, code: string) {
  const d = await prisma.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
    select: { recipientPhone: true, trackingCode: true },
  })
  try {
    await sendSms(
      d.recipientPhone,
      `Your delivery code is ${code}. Give it to the rider only when you have received your package. Tracking: ${d.trackingCode}`,
    )
  } catch (err) {
    // The rider can ask for the code to be sent again
    console.error('Could not send delivery code', err)
  }
}

export async function pickup(userId: string, deliveryId: string, loc: Location) {
  const code = newCode()
  await transition(userId, deliveryId, 'ASSIGNED', 'PICKED_UP', {
    data: { pickedUpAt: new Date(), deliveryOtpHash: hashCode(deliveryId, code) },
    note: 'Package picked up',
    ...loc,
  })
  await sendDeliveryCode(deliveryId, code)
  return getCurrentJob(userId)
}

export async function startTrip(userId: string, deliveryId: string, loc: Location) {
  await transition(userId, deliveryId, 'PICKED_UP', 'IN_TRANSIT', { note: 'On the way to the recipient', ...loc })
  return getCurrentJob(userId)
}

// Sends a fresh code to the recipient. The old one stops working.
export async function resendCode(userId: string, deliveryId: string) {
  const rider = await getApprovedRider(userId)
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, riderId: rider.id, status: { in: ['PICKED_UP', 'IN_TRANSIT'] } },
    select: { id: true },
  })
  if (!delivery) throw new AppError(409, 'INVALID_STATE', 'A code can only be sent after pickup')

  const key = `code:resend:${deliveryId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 3600)
  if (count > MAX_CODE_RESENDS_PER_HOUR) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many code requests. Contact support.')
  }

  const code = newCode()
  await prisma.delivery.update({ where: { id: deliveryId }, data: { deliveryOtpHash: hashCode(deliveryId, code) } })
  await redis.del(`deliver:tries:${deliveryId}`)
  await sendDeliveryCode(deliveryId, code)
  return { ok: true }
}

export async function deliver(userId: string, deliveryId: string, code: string, loc: Location) {
  const rider = await getApprovedRider(userId)
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, riderId: rider.id, status: 'IN_TRANSIT' },
    select: { deliveryOtpHash: true },
  })
  if (!delivery?.deliveryOtpHash) {
    throw new AppError(409, 'INVALID_STATE', 'This job is not ready to be completed')
  }

  const triesKey = `deliver:tries:${deliveryId}`
  const tries = await redis.incr(triesKey)
  if (tries === 1) await redis.expire(triesKey, 3600)
  if (tries > MAX_CODE_ATTEMPTS) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Contact support to complete this delivery.')
  }

  const given = hashCode(deliveryId, code)
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(delivery.deliveryOtpHash))) {
    throw new AppError(400, 'OTP_INVALID', `Incorrect code. ${MAX_CODE_ATTEMPTS - tries} attempts left.`)
  }

  await redis.del(triesKey)
  await transition(userId, deliveryId, 'IN_TRANSIT', 'DELIVERED', {
    data: { deliveredAt: new Date() },
    note: 'Delivered (code verified)',
    ...loc,
  })
  // Pay the rider. If this fails, the background worker retries it within seconds.
  await settleDelivery(deliveryId).catch((err) => console.error('settlement failed, will retry', err))
  return { ok: true, status: 'DELIVERED' }
}

export async function failDelivery(userId: string, deliveryId: string, reason: string, note: string | undefined, loc: Location) {
  await transition(userId, deliveryId, 'IN_TRANSIT', 'FAILED', {
    note: note ? `${reason}: ${note}` : reason,
    ...loc,
  })
  return { ok: true, status: 'FAILED' }
}

// A rider may back out before picking up. The delivery goes back to the search.
export async function riderCancel(userId: string, deliveryId: string, reason: string) {
  const rider = await getApprovedRider(userId)

  await prisma.$transaction(async (tx) => {
    const result = await tx.delivery.updateMany({
      where: { id: deliveryId, riderId: rider.id, status: 'ASSIGNED' },
      data: { status: 'SEARCHING_RIDER', riderId: null, assignedAt: null, searchStartedAt: new Date() },
    })
    if (result.count === 0) {
      throw new AppError(409, 'INVALID_STATE', 'You can only cancel a job before picking it up')
    }
    await tx.deliveryAssignment.updateMany({
      where: { deliveryId, riderId: rider.id, status: 'ACCEPTED' },
      data: { status: 'RIDER_CANCELLED' },
    })
    await tx.deliveryEvent.create({
      data: {
        deliveryId,
        status: 'SEARCHING_RIDER',
        actorType: 'RIDER',
        actorId: userId,
        note: `Rider cancelled (${reason}). Finding another rider`,
      },
    })
  })

  await dispatchDelivery(deliveryId).catch((err) => console.error('dispatch after rider cancel failed', err))
  return { ok: true }
}
