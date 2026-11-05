import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { DELIVERY_STATUSES, pageQuery } from '../../lib/schemas.js'

const listQuery = z.object({
  ...pageQuery,
  status: z.enum(DELIVERY_STATUSES).optional(),
  businessId: z.string().uuid().optional(),
})

export const adminDeliveryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin('OPS', 'SUPPORT', 'FINANCE'))

  app.get('/admin/deliveries', async (req) => {
    const { page, limit, status, businessId } = listQuery.parse(req.query)
    const where = { ...(status ? { status } : {}), ...(businessId ? { businessId } : {}) }

    const [items, total] = await prisma.$transaction([
      prisma.delivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          trackingCode: true,
          status: true,
          vehicleType: true,
          price: true,
          commissionAmount: true,
          riderPayoutAmount: true,
          pickupAddress: true,
          dropoffAddress: true,
          createdAt: true,
          business: { select: { id: true, companyName: true } },
          zone: { select: { name: true } },
        },
      }),
      prisma.delivery.count({ where }),
    ])
    return { items, total, page, limit }
  })

  app.get('/admin/deliveries/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        business: { select: { id: true, companyName: true } },
        zone: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'asc' } },
        assignments: {
          orderBy: { offeredAt: 'asc' },
          include: { rider: { select: { user: { select: { fullName: true, phone: true } } } } },
        },
      },
    })
    if (!delivery) throw new AppError(404, 'NOT_FOUND', 'Delivery not found')
    const { deliveryOtpHash, ...safe } = delivery
    return safe
  })
}
