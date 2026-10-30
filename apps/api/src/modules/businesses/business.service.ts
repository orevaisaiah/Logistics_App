import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'

type BusinessInput = {
  companyName: string
  registrationNumber?: string
  businessType?: string
  address?: string
}

export async function createBusiness(userId: string, data: BusinessInput) {
  const existing = await prisma.businessMember.findFirst({ where: { userId } })
  if (existing) throw new AppError(409, 'BUSINESS_EXISTS', 'You already belong to a business')

  return prisma.business.create({
    data: {
      ...data,
      ownerUserId: userId,
      members: { create: { userId, role: 'OWNER' } },
    },
  })
}

export async function getMyBusiness(userId: string) {
  const membership = await prisma.businessMember.findFirst({
    where: { userId },
    include: { business: true },
  })
  if (!membership) throw new AppError(404, 'NO_BUSINESS', 'Create your business profile first')
  return { ...membership.business, myRole: membership.role }
}

export async function updateBusiness(userId: string, data: Partial<BusinessInput>) {
  const membership = await prisma.businessMember.findFirst({ where: { userId } })
  if (!membership) throw new AppError(404, 'NO_BUSINESS', 'Create your business profile first')
  if (membership.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN', 'Only the owner can edit business details')

  return prisma.business.update({ where: { id: membership.businessId }, data })
}
