import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
import { pageQuery } from '../../lib/schemas.js'
import * as business from './admin-business.service.js'
import * as dispatch from './admin-dispatch.service.js'
import * as ops from './admin-ops.service.js'
import * as riders from './admin-rider-ops.service.js'

const uuid = z.string().uuid()
const idParams = z.object({ id: uuid })
const riderParams = z.object({ riderId: uuid })

const reason = z.string().trim().min(5).max(300)

const assignBody = z.object({ riderId: uuid, note: z.string().trim().max(200).optional() })
const reasonBody = z.object({ reason })

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date')

const rangeQuery = z
  .object({ from: day.optional(), to: day.optional() })
  .transform((q) => ({ ...ops.defaultRange(), ...Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) }) as { from: string; to: string })
  .refine((r) => r.from <= r.to, 'from must not be after to')
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= 92, 'Choose a range of at most 92 days')

const businessListQuery = z.object({
  ...pageQuery,
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
})

// creditLimit is stored as a 32-bit number of kobo, so 1,000,000,000 kobo (10 million naira) is the ceiling
const businessUpdateBody = z
  .object({
    creditLimit: z.number().int().min(0).max(1_000_000_000).optional(),
    verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
    reason,
  })
  .refine((b) => b.creditLimit !== undefined || b.verificationStatus !== undefined, {
    message: 'Provide creditLimit, verificationStatus, or both',
  })

const auditQuery = z.object({
  ...pageQuery,
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  adminUserId: uuid.optional(),
  action: z.string().trim().max(60).optional(),
})

export const adminOpsRoutes: FastifyPluginAsync = async (app) => {
  /* overview */
  app.get('/admin/dashboard', { preHandler: app.requireAdmin('OPS', 'FINANCE', 'SUPPORT', 'VERIFICATION') }, async () => ops.getDashboard())
  app.get('/admin/dispatch/board', { preHandler: app.requireAdmin('OPS', 'SUPPORT') }, async () => ops.getDispatchBoard())

  /* manual dispatch */
  app.post('/admin/deliveries/:id/assign', { preHandler: app.requireAdmin('OPS') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const { riderId, note } = assignBody.parse(req.body)
    return dispatch.assignRider(req.user.sub, id, riderId, note)
  })

  app.post('/admin/deliveries/:id/unassign', { preHandler: app.requireAdmin('OPS') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const body = reasonBody.parse(req.body)
    return dispatch.unassignRider(req.user.sub, id, body.reason)
  })

  app.post('/admin/deliveries/:id/cancel', { preHandler: app.requireAdmin('OPS') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const body = reasonBody.parse(req.body)
    return dispatch.adminCancelDelivery(req.user.sub, id, body.reason)
  })

  /* riders */
  app.get('/admin/riders/:riderId/performance', { preHandler: app.requireAdmin('OPS', 'SUPPORT') }, async (req) => {
    const { riderId } = riderParams.parse(req.params)
    return riders.riderPerformance(riderId)
  })

  app.post('/admin/riders/:riderId/suspend', { preHandler: app.requireAdmin('OPS') }, async (req) => {
    const { riderId } = riderParams.parse(req.params)
    const body = reasonBody.parse(req.body)
    return riders.suspendRider(req.user.sub, riderId, body.reason)
  })

  app.post('/admin/riders/:riderId/reinstate', { preHandler: app.requireAdmin('OPS') }, async (req) => {
    const { riderId } = riderParams.parse(req.params)
    return riders.reinstateRider(req.user.sub, riderId)
  })

  /* businesses */
  app.get('/admin/businesses', { preHandler: app.requireAdmin('OPS', 'SUPPORT', 'FINANCE') }, async (req) => business.listBusinesses(businessListQuery.parse(req.query)))

  app.get('/admin/businesses/:id', { preHandler: app.requireAdmin('OPS', 'SUPPORT', 'FINANCE') }, async (req) => {
    const { id } = idParams.parse(req.params)
    return business.getBusiness(id)
  })

  app.patch('/admin/businesses/:id', { preHandler: app.requireAdmin('OPS', 'FINANCE') }, async (req) => {
    const { id } = idParams.parse(req.params)
    const body = businessUpdateBody.parse(req.body)
    // Credit limits let a business owe money, so only finance (or a super admin) may change them
    if (body.creditLimit !== undefined && req.adminRole !== 'FINANCE' && req.adminRole !== 'SUPER_ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only finance can change credit limits')
    }
    return business.updateBusiness(req.user.sub, id, body)
  })

  /* reports and audit trail */
  app.get('/admin/reports/daily', { preHandler: app.requireAdmin('OPS', 'FINANCE') }, async (req) => {
    const { from, to } = rangeQuery.parse(req.query)
    return ops.dailyReport(from, to)
  })

  app.get('/admin/reports/leaders', { preHandler: app.requireAdmin('OPS', 'FINANCE') }, async (req) => {
    const { from, to } = rangeQuery.parse(req.query)
    return ops.leaders(from, to)
  })

  app.get('/admin/audit-logs', { preHandler: app.requireAdmin() }, async (req) => ops.listAuditLogs(auditQuery.parse(req.query)))
}
