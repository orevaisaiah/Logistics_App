import type { MemberRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'

export async function getBusinessContext(userId: string, allowedRoles?: MemberRole[]) {
  const membership = await prisma.businessMember.findFirst({ where: { userId } })
  if (!membership) throw new AppError(404, 'NO_BUSINESS', 'Create your business profile first')
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Your role does not allow this action')
  }
  return { businessId: membership.businessId, role: membership.role }
}
