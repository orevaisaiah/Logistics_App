import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { latSchema, lngSchema } from '../../lib/schemas.js'
import * as jobs from './rider-jobs.service.js'

const statusBody = z
  .object({ online: z.boolean(), lat: latSchema.optional(), lng: lngSchema.optional() })
  .refine((b) => !b.online || (b.lat !== undefined && b.lng !== undefined), {
    message: 'lat and lng are required when going online',
    path: ['lat'],
  })

const locationBody = z.object({ lat: latSchema, lng: lngSchema })

// Optional position attached to a job step, so the timeline records where it happened
const optionalLocation = z.object({ lat: latSchema.optional(), lng: lngSchema.optional() })

const declineBody = z.object({
  reason: z.enum(['TOO_FAR', 'LOW_PAY', 'CANNOT_CARRY', 'OFF_SHIFT', 'OTHER']).optional(),
})

const failBody = optionalLocation.extend({
  reason: z.enum(['RECIPIENT_UNREACHABLE', 'WRONG_ADDRESS', 'REFUSED', 'OTHER']),
  note: z.string().trim().max(300).optional(),
})

const deliverBody = optionalLocation.extend({ code: z.string().regex(/^\d{4}$/, 'The code has 4 digits') })
const cancelBody = z.object({ reason: z.string().trim().min(3).max(200) })

const assignmentParams = z.object({ assignmentId: z.string().uuid() })
const jobParams = z.object({ deliveryId: z.string().uuid() })

export const riderJobRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('RIDER'))

  app.post('/rider/status', async (req) => jobs.setOnlineStatus(req.user.sub, statusBody.parse(req.body)))

  app.post('/rider/location', async (req) => {
    const { lat, lng } = locationBody.parse(req.body)
    return jobs.updateLocation(req.user.sub, lat, lng)
  })

  // The app checks this every few seconds until push notifications are added
  app.get('/rider/offers/current', async (req) => jobs.getCurrentOffer(req.user.sub))

  app.post('/rider/offers/:assignmentId/accept', async (req) => {
    const { assignmentId } = assignmentParams.parse(req.params)
    return jobs.acceptOffer(req.user.sub, assignmentId)
  })

  app.post('/rider/offers/:assignmentId/decline', async (req) => {
    const { assignmentId } = assignmentParams.parse(req.params)
    const { reason } = declineBody.parse(req.body ?? {})
    return jobs.declineOffer(req.user.sub, assignmentId, reason)
  })

  app.get('/rider/jobs/current', async (req) => jobs.getCurrentJob(req.user.sub))

  app.post('/rider/jobs/:deliveryId/pickup', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    return jobs.pickup(req.user.sub, deliveryId, optionalLocation.parse(req.body ?? {}))
  })

  app.post('/rider/jobs/:deliveryId/start', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    return jobs.startTrip(req.user.sub, deliveryId, optionalLocation.parse(req.body ?? {}))
  })

  app.post('/rider/jobs/:deliveryId/resend-code', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    return jobs.resendCode(req.user.sub, deliveryId)
  })

  app.post('/rider/jobs/:deliveryId/deliver', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    const { code, lat, lng } = deliverBody.parse(req.body)
    return jobs.deliver(req.user.sub, deliveryId, code, { lat, lng })
  })

  app.post('/rider/jobs/:deliveryId/fail', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    const { reason, note, lat, lng } = failBody.parse(req.body)
    return jobs.failDelivery(req.user.sub, deliveryId, reason, note, { lat, lng })
  })

  app.post('/rider/jobs/:deliveryId/cancel', async (req) => {
    const { deliveryId } = jobParams.parse(req.params)
    const { reason } = cancelBody.parse(req.body)
    return jobs.riderCancel(req.user.sub, deliveryId, reason)
  })
}
