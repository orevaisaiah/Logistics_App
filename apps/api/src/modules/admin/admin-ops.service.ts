import type { DeliveryStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { config } from '../../config.js'
import { ACTIVE_JOB_STATUSES } from '../dispatch/dispatch.service.js'
import { addDaysToDay, lagosDayStart, lagosDayString, listDays, rangeInstants, ratio } from './reports.js'

// A delivery that has waited this long for a rider is flagged
const STUCK_AFTER_SECONDS = 180
const OPEN_STATUSES: DeliveryStatus[] = ['SEARCHING_RIDER', ...ACTIVE_JOB_STATUSES]

const counts = (groups: { status: string; _count: number }[]) =>
  Object.fromEntries(groups.map((g) => [g.status, g._count])) as Record<string, number>

export async function getDashboard() {
  const now = new Date()
  const todayStart = lagosDayStart(now)
  const freshAfter = new Date(now.getTime() - config.LOCATION_STALE_SECONDS * 1000)
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_SECONDS * 1000)

  const [today, open, deliveredToday, ridersOnline, ridersOnJobs, applications, withdrawals, stuck, oldestWaiting, failedToResolve] =
    await Promise.all([
      prisma.delivery.groupBy({ by: ['status'], where: { createdAt: { gte: todayStart } }, _count: true }),
      prisma.delivery.groupBy({ by: ['status'], where: { status: { in: OPEN_STATUSES } }, _count: true }),
      prisma.delivery.aggregate({
        where: { status: 'DELIVERED', deliveredAt: { gte: todayStart } },
        _count: true,
        _sum: { price: true, commissionAmount: true },
      }),
      prisma.rider.count({ where: { verificationStatus: 'APPROVED', isOnline: true, lastSeenAt: { gte: freshAfter } } }),
      prisma.delivery.groupBy({ by: ['riderId'], where: { status: { in: ACTIVE_JOB_STATUSES }, riderId: { not: null } } }),
      prisma.rider.count({ where: { submittedAt: { not: null }, verificationStatus: 'PENDING' } }),
      prisma.payoutRequest.aggregate({ where: { status: { in: ['REQUESTED', 'APPROVED'] } }, _count: true, _sum: { amount: true } }),
      prisma.delivery.count({ where: { status: 'SEARCHING_RIDER', searchStartedAt: { lt: stuckBefore } } }),
      prisma.delivery.findFirst({
        where: { status: 'SEARCHING_RIDER' },
        orderBy: { searchStartedAt: 'asc' },
        select: { id: true, trackingCode: true, searchStartedAt: true },
      }),
      prisma.delivery.count({ where: { status: 'FAILED', chargedAt: { not: null }, settledAt: null, refundedAt: null } }),
    ])

  return {
    generatedAt: now,
    since: todayStart,
    today: {
      deliveriesCreated: Object.values(counts(today)).reduce((a, b) => a + b, 0),
      byStatus: counts(today),
      delivered: deliveredToday._count,
      deliveredValue: deliveredToday._sum.price ?? 0,
      commissionEarned: deliveredToday._sum.commissionAmount ?? 0,
    },
    openDeliveries: counts(open),
    riders: { online: ridersOnline, onJobs: ridersOnJobs.length },
    needsAttention: {
      pendingRiderApplications: applications,
      pendingWithdrawals: { count: withdrawals._count, amount: withdrawals._sum.amount ?? 0n },
      deliveriesWaitingTooLong: stuck,
      waitingTooLongMeansOver: `${STUCK_AFTER_SECONDS} seconds`,
      oldestWaiting: oldestWaiting && {
        ...oldestWaiting,
        waitingSeconds: Math.round((now.getTime() - oldestWaiting.searchStartedAt.getTime()) / 1000),
      },
      failedDeliveriesAwaitingDecision: failedToResolve,
    },
  }
}

// Everything the live dispatch screen needs: waiting deliveries, jobs in progress, and riders for the map
export async function getDispatchBoard() {
  const now = new Date()
  const freshAfter = new Date(now.getTime() - config.LOCATION_STALE_SECONDS * 1000)

  const [waiting, inProgress, riders] = await Promise.all([
    prisma.delivery.findMany({
      where: { status: 'SEARCHING_RIDER' },
      orderBy: { searchStartedAt: 'asc' },
      take: 100,
      select: {
        id: true,
        trackingCode: true,
        vehicleType: true,
        pickupAddress: true,
        pickupLat: true,
        pickupLng: true,
        price: true,
        searchStartedAt: true,
        business: { select: { companyName: true } },
        _count: { select: { assignments: true } },
        assignments: { orderBy: { offeredAt: 'desc' }, take: 1, select: { status: true, offeredAt: true } },
      },
    }),
    prisma.delivery.findMany({
      where: { status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { assignedAt: 'asc' },
      take: 200,
      select: {
        id: true,
        trackingCode: true,
        status: true,
        pickupLat: true,
        pickupLng: true,
        dropoffLat: true,
        dropoffLng: true,
        assignedAt: true,
        pickedUpAt: true,
        rider: { select: { id: true, user: { select: { fullName: true, phone: true } } } },
      },
    }),
    prisma.rider.findMany({
      where: {
        verificationStatus: 'APPROVED',
        OR: [{ isOnline: true }, { deliveries: { some: { status: { in: ACTIVE_JOB_STATUSES } } } }],
      },
      take: 200,
      select: {
        id: true,
        vehicleType: true,
        currentLat: true,
        currentLng: true,
        lastSeenAt: true,
        isOnline: true,
        user: { select: { fullName: true, phone: true } },
        deliveries: { where: { status: { in: ACTIVE_JOB_STATUSES } }, select: { id: true, status: true }, take: 1 },
        assignments: { where: { status: 'OFFERED', expiresAt: { gt: now } }, select: { deliveryId: true, expiresAt: true }, take: 1 },
      },
    }),
  ])

  return {
    generatedAt: now,
    waiting: waiting.map(({ assignments, _count, ...d }) => ({
      ...d,
      waitingSeconds: Math.round((now.getTime() - d.searchStartedAt.getTime()) / 1000),
      offersMade: _count.assignments,
      lastOffer: assignments[0] ?? null,
    })),
    inProgress,
    riders: riders.map((r) => {
      const stale = !r.lastSeenAt || r.lastSeenAt < freshAfter
      const state = r.deliveries.length > 0 ? 'ON_JOB' : r.assignments.length > 0 ? 'HAS_OFFER' : stale ? 'LOCATION_STALE' : 'IDLE'
      return {
        id: r.id,
        name: r.user.fullName,
        phone: r.user.phone,
        vehicleType: r.vehicleType,
        lat: r.currentLat,
        lng: r.currentLng,
        lastSeenAt: r.lastSeenAt,
        state,
        currentDelivery: r.deliveries[0] ?? null,
      }
    }),
  }
}

/* ---------- reports ---------- */

type DayRow = {
  day: string
  created: number
  delivered: number
  cancelled: number
  failed: number
  deliveredValue: bigint
  commission: bigint
  avgMinutesToDeliver: number | null
}

// Days are Lagos calendar days. "from" and "to" are inclusive, written YYYY-MM-DD.
export async function dailyReport(from: string, to: string) {
  const { start, end } = rangeInstants(from, to)
  // The database stores UTC times without a zone, so the range is passed the same way
  const naive = (d: Date) => d.toISOString().replace('Z', '')

  const rows = await prisma.$queryRaw<DayRow[]>`
    SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD') AS "day",
           (COUNT(*))::int AS "created",
           (COUNT(*) FILTER (WHERE "status" = 'DELIVERED'))::int AS "delivered",
           (COUNT(*) FILTER (WHERE "status" = 'CANCELLED'))::int AS "cancelled",
           (COUNT(*) FILTER (WHERE "status" = 'FAILED'))::int AS "failed",
           (COALESCE(SUM("price") FILTER (WHERE "status" = 'DELIVERED'), 0))::bigint AS "deliveredValue",
           (COALESCE(SUM("commissionAmount") FILTER (WHERE "status" = 'DELIVERED'), 0))::bigint AS "commission",
           (AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "createdAt")) / 60) FILTER (WHERE "status" = 'DELIVERED'))::float8 AS "avgMinutesToDeliver"
    FROM "Delivery"
    WHERE "createdAt" >= ${naive(start)}::timestamp AND "createdAt" < ${naive(end)}::timestamp
    GROUP BY 1
    ORDER BY 1
  `

  const byDay = new Map(rows.map((r) => [r.day, r]))
  const days: DayRow[] = listDays(from, to).map(
    (day) =>
      byDay.get(day) ?? { day, created: 0, delivered: 0, cancelled: 0, failed: 0, deliveredValue: 0n, commission: 0n, avgMinutesToDeliver: null },
  )

  const sum = (pick: (r: DayRow) => number) => days.reduce((total, r) => total + pick(r), 0)
  const sumBig = (pick: (r: DayRow) => bigint) => days.reduce((total, r) => total + pick(r), 0n)
  const created = sum((r) => r.created)
  const delivered = sum((r) => r.delivered)
  const cancelled = sum((r) => r.cancelled)
  const failed = sum((r) => r.failed)

  return {
    from,
    to,
    unit: 'kobo',
    totals: {
      created,
      delivered,
      cancelled,
      failed,
      deliveredValue: sumBig((r) => r.deliveredValue),
      commission: sumBig((r) => r.commission),
      successRate: ratio(delivered, delivered + failed), // delivered out of delivered + failed
      cancellationRate: ratio(cancelled, created),
    },
    days,
  }
}

export async function leaders(from: string, to: string) {
  const { start, end } = rangeInstants(from, to)
  const inRange = { createdAt: { gte: start, lt: end } }

  const [businessGroups, riderGroups] = await Promise.all([
    prisma.delivery.groupBy({
      by: ['businessId'],
      where: inRange,
      _count: true,
      _sum: { price: true },
      orderBy: { _sum: { price: 'desc' } },
      take: 10,
    }),
    prisma.delivery.groupBy({
      by: ['riderId'],
      where: { ...inRange, status: 'DELIVERED', riderId: { not: null } },
      _count: true,
      _sum: { riderPayoutAmount: true },
      orderBy: { _count: { riderId: 'desc' } },
      take: 10,
    }),
  ])

  const [businesses, riders] = await Promise.all([
    prisma.business.findMany({ where: { id: { in: businessGroups.map((g) => g.businessId) } }, select: { id: true, companyName: true } }),
    prisma.rider.findMany({
      where: { id: { in: riderGroups.flatMap((g) => (g.riderId ? [g.riderId] : [])) } },
      select: { id: true, user: { select: { fullName: true, phone: true } } },
    }),
  ])

  return {
    from,
    to,
    topBusinesses: businessGroups.map((g) => ({
      businessId: g.businessId,
      companyName: businesses.find((b) => b.id === g.businessId)?.companyName ?? null,
      deliveries: g._count,
      spent: g._sum.price ?? 0,
    })),
    topRiders: riderGroups.map((g) => {
      const rider = riders.find((r) => r.id === g.riderId)
      return {
        riderId: g.riderId,
        name: rider?.user.fullName ?? null,
        phone: rider?.user.phone ?? null,
        deliveries: g._count,
        earned: g._sum.riderPayoutAmount ?? 0,
      }
    }),
  }
}

export function defaultRange() {
  const to = lagosDayString(new Date())
  return { from: addDaysToDay(to, -6), to }
}

/* ---------- audit log ---------- */

export async function listAuditLogs(q: {
  entityType?: string
  entityId?: string
  adminUserId?: string
  action?: string
  page: number
  limit: number
}) {
  const where = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.adminUserId ? { adminUserId: q.adminUserId } : {}),
    ...(q.action ? { action: q.action } : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { admin: { select: { fullName: true, phone: true } } },
    }),
    prisma.auditLog.count({ where }),
  ])
  return { items, total, page: q.page, limit: q.limit }
}
