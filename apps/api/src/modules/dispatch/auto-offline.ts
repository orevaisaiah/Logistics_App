import { prisma } from '../../lib/prisma.js'
import { shouldGoOffline, MISSED_OFFERS_BEFORE_OFFLINE } from '../../lib/offline-rule.js'
import { notifyRider } from '../../lib/push.js'
import { autoOfflineMessage } from '../../lib/push-messages.js'
import type { DeliveryStatus } from '@prisma/client'

type Logger = { error: (obj: unknown, msg?: string) => void }

// A rider holding a delivery in any of these states is never taken offline
const ACTIVE_JOB_STATUSES: DeliveryStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT']

// Called right after offers expire. A rider whose last few offers ALL went unanswered is set offline.
export async function setUnresponsiveRidersOffline(riderIds: string[], log: Logger) {
  for (const riderId of riderIds) {
    try {
      const recent = await prisma.deliveryAssignment.findMany({
        where: { riderId },
        orderBy: { offeredAt: 'desc' },
        take: MISSED_OFFERS_BEFORE_OFFLINE,
        select: { status: true },
      })
      if (!shouldGoOffline(recent.map((r) => r.status))) continue

      // Never touch a rider who is in the middle of a delivery
      const result = await prisma.rider.updateMany({
        where: { id: riderId, isOnline: true, deliveries: { none: { status: { in: ACTIVE_JOB_STATUSES } } } },
        data: { isOnline: false },
      })
      if (result.count > 0) void notifyRider(riderId, autoOfflineMessage(MISSED_OFFERS_BEFORE_OFFLINE))
    } catch (err) {
      log.error(err, 'could not set an unresponsive rider offline')
    }
  }
}
