import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { normalizeNgPhone } from '../../lib/phone.js'
import { AppError } from '../../lib/errors.js'
import { logout, refreshSession, requestOtp, verifyOtp } from './auth.service.js'

const phoneSchema = z
  .string()
  .refine((v) => normalizeNgPhone(v) !== null, 'Invalid Nigerian phone number')
  .transform((v) => normalizeNgPhone(v) as string)

const otpRequestBody = z.object({ phone: phoneSchema })

const otpVerifyBody = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  role: z.enum(['BUSINESS_USER', 'RIDER']).optional(),
  fullName: z.string().trim().min(2).max(100).optional(),
})

const tokenBody = z.object({ refreshToken: z.string().min(10) })

export const authRoutes: FastifyPluginAsync = async (app) => {
  const sign = (payload: { sub: string; role: 'BUSINESS_USER' | 'RIDER' | 'ADMIN' }) =>
    app.jwt.sign(payload, { expiresIn: '15m' })

  app.post('/auth/otp/request', async (req) => {
    const { phone } = otpRequestBody.parse(req.body)
    await requestOtp(phone)
    return { ok: true }
  })

  app.post('/auth/otp/verify', async (req) => {
    const body = otpVerifyBody.parse(req.body)
    return verifyOtp(body, sign)
  })

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = tokenBody.parse(req.body)
    return refreshSession(refreshToken, sign)
  })

  app.post('/auth/logout', async (req) => {
    const { refreshToken } = tokenBody.parse(req.body)
    await logout(refreshToken)
    return { ok: true }
  })

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        rider: { select: { id: true, verificationStatus: true, isOnline: true } },
        ownedBusiness: { select: { id: true, companyName: true, verificationStatus: true } },
      },
    })
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    return user
  })
}
