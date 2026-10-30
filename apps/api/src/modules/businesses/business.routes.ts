import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createBusiness, getMyBusiness, updateBusiness } from './business.service.js'

const businessBody = z.object({
  companyName: z.string().trim().min(2).max(150),
  registrationNumber: z.string().trim().max(50).optional(),
  businessType: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
})

export const businessRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('BUSINESS_USER'))

  app.post('/business', async (req, reply) => {
    const body = businessBody.parse(req.body)
    const business = await createBusiness(req.user.sub, body)
    return reply.code(201).send(business)
  })

  app.get('/business', async (req) => getMyBusiness(req.user.sub))

  app.patch('/business', async (req) => {
    const body = businessBody.partial().parse(req.body)
    return updateBusiness(req.user.sub, body)
  })
}
