import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as admin from './admin-riders.service.js'

const riderParams = z.object({ riderId: z.string().uuid() })
const documentParams = z.object({ riderId: z.string().uuid(), docId: z.string().uuid() })

const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL']).default('PENDING'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const reviewBody = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status !== 'REJECTED' || Boolean(b.note), {
    message: 'A note is required when rejecting a document',
    path: ['note'],
  })

const rejectBody = z.object({ reason: z.string().trim().min(5).max(500) })

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAdmin('VERIFICATION'))

  app.get('/admin/riders', async (req) => admin.listRiders(listQuery.parse(req.query)))

  app.get('/admin/riders/:riderId', async (req) => {
    const { riderId } = riderParams.parse(req.params)
    return admin.getRiderDetail(riderId)
  })

  // Sensitive: served only to authenticated admins, never cached, and every view is logged
  app.get('/admin/riders/:riderId/documents/:docId/file', async (req, reply) => {
    const { riderId, docId } = documentParams.parse(req.params)
    const { buffer, contentType } = await admin.getDocumentFile(req.user.sub, riderId, docId)
    return reply
      .type(contentType)
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .send(buffer)
  })

  app.patch('/admin/riders/:riderId/documents/:docId', async (req) => {
    const { riderId, docId } = documentParams.parse(req.params)
    const body = reviewBody.parse(req.body)
    return admin.reviewDocument(req.user.sub, riderId, docId, body)
  })

  app.post('/admin/riders/:riderId/approve', async (req) => {
    const { riderId } = riderParams.parse(req.params)
    return admin.approveRider(req.user.sub, riderId)
  })

  app.post('/admin/riders/:riderId/reject', async (req) => {
    const { riderId } = riderParams.parse(req.params)
    const { reason } = rejectBody.parse(req.body)
    return admin.rejectRider(req.user.sub, riderId, reason)
  })
}
