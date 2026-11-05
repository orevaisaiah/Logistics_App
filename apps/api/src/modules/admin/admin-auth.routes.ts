import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { normalizeNgPhone } from '../../lib/phone.js'
import { adminLogin } from './admin-auth.service.js'

const loginBody = z.object({
  phone: z
    .string()
    .refine((v) => normalizeNgPhone(v) !== null, 'Invalid phone number')
    .transform((v) => normalizeNgPhone(v) as string),
  password: z.string().min(1).max(200),
})

// Public route: kept in its own plugin so the admin-only hook in admin.routes.ts does not apply to it
export const adminAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post('/admin/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (r) => r.ip } } }, async (req) => {
    const { phone, password } = loginBody.parse(req.body)
    return adminLogin(phone, password, (payload) => app.jwt.sign(payload, { expiresIn: '15m' }))
  })
}
