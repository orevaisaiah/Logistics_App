import type { VerificationStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'

export async function listBusinesses(q: { search?: string; status?: VerificationStatus; page: number; limit: number }) {
  const where = {
    ...(q.status ? { verificationStatus: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { companyName: { contains: q.search, mode: 'insensitive' as const } },
            { owner: { phone: { contains: q.search } } },
          ],
        }
      : {}),
  }
  const [items, total] = await prisma.$transaction([
    prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        companyName: true,
        verificationStatus: true,
        creditLimit: true,
        createdAt: true,
        owner: { select: { fullName: true, phone: true } },
        wallet: { select: { id: true, balance: true } },
        _count: { select: { deliveries: true } },
      },
    }),
    prisma.business.count({ where }),
  ])
  return { items, total, page: q.page, limit: q.limit }
}

export async function getBusiness(id: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
      members: { select: { role: true, user: { select: { fullName: true, phone: true } } } },
      wallet: { select: { id: true, balance: true } },
    },
  })
  if (!business) throw new AppError(404, 'NOT_FOUND', 'Business not found')

  const [byStatus, recent] = await Promise.all([
    prisma.delivery.groupBy({ by: ['status'], where: { businessId: id }, _count: true, _sum: { price: true } }),
    prisma.delivery.findMany({
      where: { businessId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, trackingCode: true, status: true, price: true, createdAt: true },
    }),
  ])
  return { business, deliveriesByStatus: byStatus, recentDeliveries: recent }
}

// Credit limits let a business owe money, so every change needs a reason and is logged with before and after
export async function updateBusiness(
  adminId: string,
  id: string,
  input: { creditLimit?: number; verificationStatus?: VerificationStatus; reason: string },
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.business.findUnique({
      where: { id },
      select: { creditLimit: true, verificationStatus: true },
    })
    if (!before) throw new AppError(404, 'NOT_FOUND', 'Business not found')

    const updated = await tx.business.update({
      where: { id },
      data: { creditLimit: input.creditLimit, verificationStatus: input.verificationStatus },
      select: { id: true, companyName: true, creditLimit: true, verificationStatus: true },
    })
    await tx.auditLog.create({
      data: {
        adminUserId: adminId,
        action: 'BUSINESS_UPDATED',
        entityType: 'Business',
        entityId: id,
        meta: {
          reason: input.reason,
          before: { creditLimit: before.creditLimit, verificationStatus: before.verificationStatus },
          after: { creditLimit: updated.creditLimit, verificationStatus: updated.verificationStatus },
        },
      },
    })
    return updated
  })
}
