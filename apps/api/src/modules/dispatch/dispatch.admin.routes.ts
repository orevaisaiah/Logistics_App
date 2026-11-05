import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'
import { prisma } from '../../lib/prisma.js'
import { dispatchDelivery } from './dispatch.service.js'
import { explainDispatch } from './dispatch.explain.js'

const query = z.object({
  deliveryId: z.string().uuid().optional(),
  // run=true also attempts one dispatch right now and reports the outcome or the error
  run: z.enum(['true', 'false']).default('false'),
})

// Development helper: tells you exactly why a delivery is not being offered to a rider
export const dispatchAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin('OPS'))

  app.get('/admin/dispatch/explain', async (req) => {
    if (config.NODE_ENV === 'production') throw new AppError(404, 'NOT_FOUND', 'Not found')
    const { deliveryId, run } = query.parse(req.query)

    const explanation = await explainDispatch(deliveryId)
    if (run !== 'true' || !explanation.delivery) return explanation

    let attempt: { offered: boolean; error?: string }
    try {
      attempt = { offered: await dispatchDelivery(explanation.delivery.id) }
    } catch (err) {
      attempt = { offered: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
    }
    const assignments = await prisma.deliveryAssignment.findMany({
      where: { deliveryId: explanation.delivery.id },
      select: { riderId: true, status: true, offeredAt: true, expiresAt: true },
    })
    return { ...explanation, attempt, assignments }
  })
}
