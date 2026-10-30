import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'
import { pageQuery } from '../../lib/schemas.js'
import { refundDelivery, settleDelivery } from './settlement.js'
import * as wallet from './wallet.service.js'
import * as withdrawals from './withdrawal.service.js'

const idParams = z.object({ id: z.string().uuid() })
const walletParams = z.object({ walletId: z.string().uuid() })
const paging = z.object(pageQuery)

const walletListQuery = z.object({
  ...pageQuery,
  ownerType: z.enum(['BUSINESS', 'RIDER', 'PLATFORM', 'ESCROW']).optional(),
})

const adjustBody = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amount: z.number().int().positive().max(100_000_000_000),
  reason: z.string().trim().min(5).max(300),
})

const withdrawalListQuery = z.object({
  ...pageQuery,
  status: z.enum(['REQUESTED', 'APPROVED', 'PAID', 'REJECTED']).optional(),
})

const rejectBody = z.object({ reason: z.string().trim().min(5).max(300) })
const paidBody = z.object({ bankReference: z.string().trim().min(3).max(100) })

export const financeAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('ADMIN'))

  app.get('/admin/finance/summary', async () => wallet.financeSummary())

  app.get('/admin/wallets', async (req) => wallet.adminListWallets(walletListQuery.parse(req.query)))

  app.get('/admin/wallets/:walletId/entries', async (req) => {
    const { walletId } = walletParams.parse(req.params)
    return wallet.adminListEntries(walletId, paging.parse(req.query))
  })

  app.post('/admin/wallets/:walletId/adjust', async (req, reply) => {
    const { walletId } = walletParams.parse(req.params)
    const body = adjustBody.parse(req.body)
    return reply.code(201).send(await wallet.adminAdjust(req.user.sub, walletId, body))
  })

  app.get('/admin/withdrawals', async (req) => withdrawals.adminListWithdrawals(withdrawalListQuery.parse(req.query)))

  app.post('/admin/withdrawals/:id/approve', async (req) => {
    const { id } = idParams.parse(req.params)
    return withdrawals.approveWithdrawal(req.user.sub, id)
  })

  app.post('/admin/withdrawals/:id/mark-paid', async (req) => {
    const { id } = idParams.parse(req.params)
    const { bankReference } = paidBody.parse(req.body)
    return withdrawals.markWithdrawalPaid(req.user.sub, id, bankReference)
  })

  app.post('/admin/withdrawals/:id/reject', async (req) => {
    const { id } = idParams.parse(req.params)
    const { reason } = rejectBody.parse(req.body)
    return withdrawals.rejectWithdrawal(req.user.sub, id, reason)
  })

  // For deliveries stuck as FAILED (or RETURNED): the admin decides who ends up with the money
  app.post('/admin/deliveries/:id/refund', async (req) => {
    const { id } = idParams.parse(req.params)
    const done = await refundDelivery(id, { allowedStatuses: ['CANCELLED', 'FAILED', 'RETURNED'] })
    if (!done) throw new AppError(409, 'NOTHING_TO_DO', 'This delivery was never charged, or is already refunded or paid out')
    await audit(req.user.sub, 'DELIVERY_REFUNDED', 'Delivery', id)
    return { ok: true }
  })

  app.post('/admin/deliveries/:id/settle', async (req) => {
    const { id } = idParams.parse(req.params)
    const done = await settleDelivery(id, { allowFailed: true })
    if (!done) throw new AppError(409, 'NOTHING_TO_DO', 'This delivery was never charged, or is already refunded or paid out')
    await audit(req.user.sub, 'DELIVERY_SETTLED', 'Delivery', id)
    return { ok: true }
  })
}
