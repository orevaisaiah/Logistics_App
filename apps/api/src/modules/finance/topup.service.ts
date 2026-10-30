import crypto from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { getGateway } from './gateway.js'
import { getBusinessWallet, post } from './ledger.js'
import { getBusinessContext } from './membership.js'

export async function createTopup(userId: string, input: { amount: number; email?: string }) {
  const { businessId } = await getBusinessContext(userId, ['OWNER', 'FINANCE'])

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
  const email = input.email ?? user.email
  if (!email) throw new AppError(400, 'EMAIL_REQUIRED', 'Provide an email address for the payment receipt')

  const gateway = getGateway()
  const reference = `LGP-${crypto.randomBytes(12).toString('hex')}`
  const amount = BigInt(input.amount)

  const payment = await prisma.payment.create({
    data: { businessId, reference, amount, email, gateway: gateway.name },
  })

  try {
    const { authorizationUrl } = await gateway.initialize({ email, amount, reference })
    return { reference, amount: payment.amount, gateway: gateway.name, authorizationUrl, status: payment.status }
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    throw err
  }
}

// Asks the payment provider what really happened, then credits the wallet exactly once.
// Safe to call any number of times, from the redirect, the webhook, or both.
export async function completeTopup(reference: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } })
  if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment not found')
  if (payment.status === 'SUCCESS') return { reference, status: 'SUCCESS' as const, amount: payment.amount }

  const result = await getGateway().verify(reference, payment.amount)
  if (result.status === 'pending') return { reference, status: 'PENDING' as const, amount: payment.amount }
  if (result.status === 'failed') {
    await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } })
    return { reference, status: 'FAILED' as const, amount: payment.amount }
  }

  // Never trust the redirect alone: the amount and currency must match what we asked for
  if (result.amount !== payment.amount || result.currency !== 'NGN') {
    throw new AppError(409, 'AMOUNT_MISMATCH', 'The amount paid does not match this top-up. Contact support.')
  }

  await prisma.$transaction(async (tx) => {
    const wallet = await getBusinessWallet(tx, payment.businessId)
    await post(tx, {
      walletId: wallet.id,
      type: 'TOPUP',
      direction: 'CREDIT',
      amount: payment.amount,
      reference: `topup:${reference}`,
      note: `Top-up via ${payment.gateway}`,
    })
    await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUCCESS', paidAt: new Date() },
    })
  })
  return { reference, status: 'SUCCESS' as const, amount: payment.amount }
}

// For the business: only its own payments can be checked
export async function verifyOwnTopup(userId: string, reference: string) {
  const { businessId } = await getBusinessContext(userId)
  const payment = await prisma.payment.findUnique({ where: { reference } })
  if (!payment || payment.businessId !== businessId) throw new AppError(404, 'NOT_FOUND', 'Payment not found')
  return completeTopup(reference)
}
