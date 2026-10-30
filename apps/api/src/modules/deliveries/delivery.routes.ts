import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { DELIVERY_STATUSES, latSchema, lngSchema, pageQuery, phoneSchema, VEHICLE_TYPES } from '../../lib/schemas.js'
import * as deliveries from './delivery.service.js'
import { trackDelivery } from './delivery.service.js'

const text = (min: number, max: number) => z.string().trim().min(min).max(max)

const quoteBody = z.object({
  pickup: z.object({ lat: latSchema, lng: lngSchema }),
  dropoff: z.object({ lat: latSchema, lng: lngSchema }),
  weightKg: z.number().positive().max(2000),
  vehicleType: z.enum(VEHICLE_TYPES).default('BIKE'),
})

// All amounts in this API are integers in kobo (100 kobo = 1 naira)
const createBody = z.object({
  pickup: z.object({
    address: text(5, 300),
    lat: latSchema,
    lng: lngSchema,
    contactName: text(2, 100),
    contactPhone: phoneSchema,
  }),
  dropoff: z.object({
    address: text(5, 300),
    lat: latSchema,
    lng: lngSchema,
    recipientName: text(2, 100),
    recipientPhone: phoneSchema,
  }),
  package: z.object({
    description: text(2, 300),
    weightKg: z.number().positive().max(2000),
    declaredValue: z.number().int().min(0).max(100_000_000_00).optional(),
    isFragile: z.boolean().default(false),
  }),
  vehicleType: z.enum(VEHICLE_TYPES).default('BIKE'),
  notes: text(1, 500).optional(),
})

const listQuery = z.object({ ...pageQuery, status: z.enum(DELIVERY_STATUSES).optional() })
const idParams = z.object({ id: z.string().uuid() })
const cancelBody = z.object({ reason: text(3, 300) })

export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('BUSINESS_USER'))

  app.post('/deliveries/quote', async (req) => {
    const body = quoteBody.parse(req.body)
    return deliveries.quoteDelivery(req.user.sub, body)
  })

  app.post('/deliveries', async (req, reply) => {
    const body = createBody.parse(req.body)
    return reply.code(201).send(await deliveries.createDelivery(req.user.sub, body))
  })

  app.get('/deliveries', async (req) => deliveries.listDeliveries(req.user.sub, listQuery.parse(req.query)))

  app.get('/deliveries/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    return deliveries.getDelivery(req.user.sub, id)
  })

  app.post('/deliveries/:id/cancel', async (req) => {
    const { id } = idParams.parse(req.params)
    const { reason } = cancelBody.parse(req.body)
    return deliveries.cancelDelivery(req.user.sub, id, reason)
  })
}

// Public, no login: anyone with the tracking code can see progress
export const trackingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/track/:code', async (req) => {
    const { code } = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9-]{6,20}$/) }).parse(req.params)
    return trackDelivery(code)
  })
}
