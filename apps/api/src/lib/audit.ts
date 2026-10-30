import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

// Records who did what to which record. Use it for every sensitive admin action.
export function audit(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
) {
  return prisma.auditLog.create({ data: { adminUserId, action, entityType, entityId, meta } })
}
