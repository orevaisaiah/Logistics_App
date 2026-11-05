import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { phoneSchema } from '../../lib/schemas.js'
import * as staff from './staff.service.js'

const ADMIN_ROLES = ['SUPER_ADMIN', 'OPS', 'FINANCE', 'SUPPORT', 'VERIFICATION'] as const

const createBody = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2).max(100),
  adminRole: z.enum(ADMIN_ROLES),
})

const updateBody = z
  .object({ adminRole: z.enum(ADMIN_ROLES).optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() })
  .refine((b) => b.adminRole !== undefined || b.status !== undefined, { message: 'Provide adminRole, status, or both' })

const idParams = z.object({ id: z.string().uuid() })
const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
})

// Managing the team: super admins only
export const staffRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin())

  app.get('/admin/staff', async () => staff.listStaff())

  app.post('/admin/staff', async (req, reply) => {
    const body = createBody.parse(req.body)
    return reply.code(201).send(await staff.createStaff(req.user.sub, body))
  })

  app.patch('/admin/staff/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    return staff.updateStaff(req.user.sub, id, updateBody.parse(req.body))
  })

  app.post('/admin/staff/:id/reset-password', async (req) => {
    const { id } = idParams.parse(req.params)
    return staff.resetStaffPassword(req.user.sub, id)
  })
}

// Any signed-in admin, including one who still has to replace a temporary password
export const adminSelfRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('ADMIN'))

  app.get('/admin/auth/me', async (req) => staff.adminMe(req.user.sub))

  app.post(
    '/admin/auth/change-password',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: (r) => r.ip } } },
    async (req) => {
      const { currentPassword, newPassword } = passwordBody.parse(req.body)
      return staff.changeOwnPassword(req.user.sub, currentPassword, newPassword)
    },
  )
}
