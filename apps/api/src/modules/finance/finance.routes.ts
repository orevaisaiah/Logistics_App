import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'
import { withIdempotency } from '../../lib/idempotency.js'
import { pageQuery } from '../../lib/schemas.js'
import { completeTopup, createTopup, verifyOwnTopup } from './topup.service.js'
import { verifyPaystackSignature } from './signature.js'
import * as wallet from './wallet.service.js'
import * as withdrawals from './withdrawal.service.js'

// All amounts are integers in kobo (100 kobo = 1 naira)
const topupBody = z.object({
  amount: z.number().int().min(10_000, 'Minimum top-up is 100 naira').max(500_000_000, 'Maximum top-up is 5,000,000 naira'),
  email: z.string().trim().email().optional(),
})

const withdrawalBody = z.object({
  amount: z.number().int().min(withdrawals.MIN_WITHDRAWAL_KOBO, 'Minimum withdrawal is 1,000 naira').max(100_000_000_000),
})

const referenceParams = z.object({ reference: z.string().min(8).max(100) })
const paging = z.object(pageQuery)

export const businessWalletRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('BUSINESS_USER'))

  app.get('/wallet', async (req) => wallet.getMyBusinessWallet(req.user.sub))

  app.get('/wallet/entries', async (req) => wallet.getMyBusinessEntries(req.user.sub, paging.parse(req.query)))

  app.post('/wallet/topups', async (req, reply) => {
    const body = topupBody.parse(req.body)
    const topup = await withIdempotency(req, reply, 'topups.create', body, () => createTopup(req.user.sub, body))
    return reply.code(201).send(topup)
  })

  // Call this after paying (or let the webhook do it). Safe to call repeatedly.
  app.get('/wallet/topups/:reference/verify', async (req) => {
    const { reference } = referenceParams.parse(req.params)
    return verifyOwnTopup(req.user.sub, reference)
  })
}

export const riderWalletRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('RIDER'))

  app.get('/rider/wallet', async (req) => wallet.getMyRiderWallet(req.user.sub))

  app.get('/rider/wallet/entries', async (req) => wallet.getMyRiderEntries(req.user.sub, paging.parse(req.query)))

  app.post('/rider/withdrawals', async (req, reply) => {
    const { amount } = withdrawalBody.parse(req.body)
    const request = await withIdempotency(req, reply, 'withdrawals.create', { amount }, () => withdrawals.requestWithdrawal(req.user.sub, amount))
    return reply.code(201).send(request)
  })

  app.get('/rider/withdrawals', async (req) => withdrawals.listMyWithdrawals(req.user.sub))
}

// Paystack calls this when a payment succeeds. It lives in its own plugin because the
// signature is checked against the raw, unparsed request body.
export const paystackWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  app.post('/webhooks/paystack', { config: { rateLimit: false } }, async (req, reply) => {
    const secret = config.PAYSTACK_SECRET_KEY
    if (!secret) throw new AppError(404, 'NOT_FOUND', 'Not found')

    const signature = req.headers['x-paystack-signature']
    const raw = req.body as Buffer
    if (typeof signature !== 'string' || !Buffer.isBuffer(raw) || !verifyPaystackSignature(raw, signature, secret)) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid signature')
    }

    const event = JSON.parse(raw.toString('utf8')) as { event?: string; data?: { reference?: string } }
    if (event.event === 'charge.success' && typeof event.data?.reference === 'string') {
      try {
        // The amount is re-checked with Paystack directly, so the payload itself is never trusted
        await completeTopup(event.data.reference)
      } catch (err) {
        // A payment that is not ours is ignored; any other failure returns an error so Paystack retries
        if (!(err instanceof AppError && err.statusCode === 404)) throw err
      }
    }
    return reply.code(200).send({ ok: true })
  })
}
