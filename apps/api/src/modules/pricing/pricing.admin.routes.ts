import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { latSchema, lngSchema, VEHICLE_TYPES } from '../../lib/schemas.js'
import * as pricing from './pricing.admin.service.js'

const zoneBody = z.object({
  name: z.string().trim().min(2).max(100),
  centerLat: latSchema,
  centerLng: lngSchema,
  radiusKm: z.number().min(0.5).max(200),
  isActive: z.boolean().default(true),
})

// All money fields are integers in kobo (100 kobo = 1 naira)
const rateBody = z.object({
  baseFee: z.number().int().min(0),
  perKmFee: z.number().int().min(0),
  perKgFee: z.number().int().min(0).default(0),
  includedWeightKg: z.number().min(0).default(0),
  maxWeightKg: z.number().positive().max(2000),
  minFee: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const zoneParams = z.object({ zoneId: z.string().uuid() })
const rateParams = z.object({ zoneId: z.string().uuid(), vehicleType: z.enum(VEHICLE_TYPES) })

export const adminPricingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('ADMIN'))

  app.post('/admin/zones', async (req, reply) => {
    const body = zoneBody.parse(req.body)
    return reply.code(201).send(await pricing.createZone(req.user.sub, body))
  })

  app.get('/admin/zones', async () => pricing.listZones())

  app.patch('/admin/zones/:zoneId', async (req) => {
    const { zoneId } = zoneParams.parse(req.params)
    const body = zoneBody.partial().parse(req.body)
    return pricing.updateZone(req.user.sub, zoneId, body)
  })

  app.get('/admin/zones/:zoneId/rates', async (req) => {
    const { zoneId } = zoneParams.parse(req.params)
    return pricing.listRateCards(zoneId)
  })

  app.put('/admin/zones/:zoneId/rates/:vehicleType', async (req) => {
    const { zoneId, vehicleType } = rateParams.parse(req.params)
    const body = rateBody.parse(req.body)
    return pricing.upsertRateCard(req.user.sub, zoneId, vehicleType, body)
  })
}
