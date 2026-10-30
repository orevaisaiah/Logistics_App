import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
import * as riders from './rider.service.js'

const DOCUMENT_TYPES = ['ID', 'LICENCE', 'VEHICLE_PAPERS', 'SELFIE', 'GUARANTOR_FORM'] as const
const VEHICLE_TYPES = ['BIKE', 'TRICYCLE', 'CAR', 'VAN'] as const

const adultBirthDate = z.coerce.date().refine((d) => {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 18)
  return d <= cutoff
}, 'Rider must be at least 18 years old')

// Every field is optional so the app can save one screen at a time
const profileBody = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    dateOfBirth: adultBirthDate,
    address: z.string().trim().min(5).max(300),
    vehicleType: z.enum(VEHICLE_TYPES),
    plateNumber: z.string().trim().toUpperCase().min(3).max(15),
    serviceArea: z.string().trim().min(2).max(100),
  })
  .partial()

const bankBody = z.object({
  bankName: z.string().trim().min(2).max(100),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
  accountName: z.string().trim().min(2).max(150),
})

export const riderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('RIDER'))

  app.get('/rider/onboarding', async (req) => riders.getOnboarding(req.user.sub))

  app.patch('/rider/profile', async (req) => {
    const body = profileBody.parse(req.body)
    return riders.updateProfile(req.user.sub, body)
  })

  app.put('/rider/bank', async (req) => {
    const body = bankBody.parse(req.body)
    return riders.updateBank(req.user.sub, body)
  })

  app.get('/rider/documents', async (req) => riders.listDocuments(req.user.sub))

  // The document type goes in the URL so it never depends on multipart field order
  app.post('/rider/documents/:type', async (req, reply) => {
    const { type } = z.object({ type: z.enum(DOCUMENT_TYPES) }).parse(req.params)
    const file = await req.file()
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Attach a file')
    const buffer = await file.toBuffer()
    const doc = await riders.uploadDocument(req.user.sub, type, buffer)
    return reply.code(201).send(doc)
  })

  app.post('/rider/submit', async (req) => riders.submitForReview(req.user.sub))
}
