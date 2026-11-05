import type { PayoutStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { audit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'
import { getRiderWallet, post } from './ledger.js'

// Smallest withdrawal: 1,000 naira
export const MIN_WITHDRAWAL_KOBO = 100_000

// The money leaves the rider's wallet the moment they ask, so it cannot be spent twice.
// A rejection puts it back.
export async function requestWithdrawal(userId: string, amountKobo: number) {
  const rider = await prisma.rider.findUnique({ where: { userId } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')
  if (rider.verificationStatus !== 'APPROVED') throw new AppError(403, 'NOT_APPROVED', 'Your account has not been approved yet')
  if (!rider.bankName || !rider.accountNumber || !rider.accountName) {
    throw new AppError(400, 'BANK_DETAILS_REQUIRED', 'Add your bank details before withdrawing')
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await getRiderWallet(tx, rider.id)
    const request = await tx.payoutRequest.create({
      data: {
        riderId: rider.id,
        amount: BigInt(amountKobo),
        // A copy of the bank details at the time of the request, so later edits cannot redirect it
        bankName: rider.bankName!,
        accountNumber: rider.accountNumber!,
        accountName: rider.accountName!,
      },
    })
    await post(tx, {
      walletId: wallet.id,
      type: 'WITHDRAWAL',
      direction: 'DEBIT',
      amount: BigInt(amountKobo),
      reference: `payout:${request.id}:hold`,
      note: 'Withdrawal requested',
    })
    return request
  })
}

export async function listMyWithdrawals(userId: string) {
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')
  return prisma.payoutRequest.findMany({
    where: { riderId: rider.id },
    orderBy: { requestedAt: 'desc' },
    take: 50,
    select: { id: true, amount: true, status: true, rejectionReason: true, requestedAt: true, paidAt: true },
  })
}

/* ---------- admin ---------- */

export async function adminListWithdrawals(q: { status?: PayoutStatus; page: number; limit: number }) {
  const where = q.status ? { status: q.status } : {}
  const [items, total] = await prisma.$transaction([
    prisma.payoutRequest.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { rider: { select: { id: true, user: { select: { fullName: true, phone: true } } } } },
    }),
    prisma.payoutRequest.count({ where }),
  ])
  return { items, total, page: q.page, limit: q.limit }
}

// Step 1: a finance admin confirms the request looks right
export async function approveWithdrawal(adminId: string, id: string) {
  const result = await prisma.payoutRequest.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date() },
  })
  if (result.count === 0) throw new AppError(409, 'INVALID_STATE', 'Only a requested withdrawal can be approved')
  await audit(adminId, 'WITHDRAWAL_APPROVED', 'PayoutRequest', id)
  return prisma.payoutRequest.findUniqueOrThrow({ where: { id } })
}

// Step 2: after the bank transfer has actually been made, record it
export async function markWithdrawalPaid(adminId: string, id: string, bankReference: string) {
  // Two-person rule: whoever approved a payout cannot be the one who records it as paid
  if (config.PAYOUT_TWO_PERSON_RULE) {
    const request = await prisma.payoutRequest.findUnique({ where: { id }, select: { status: true, reviewedById: true } })
    if (request?.status === 'APPROVED' && request.reviewedById === adminId) {
      throw new AppError(403, 'SAME_ADMIN', 'A different admin must record the payment of a withdrawal that you approved')
    }
  }
  const result = await prisma.payoutRequest.updateMany({
    where: { id, status: 'APPROVED' },
    data: { status: 'PAID', bankReference, paidAt: new Date() },
  })
  if (result.count === 0) throw new AppError(409, 'INVALID_STATE', 'Only an approved withdrawal can be marked as paid')
  await audit(adminId, 'WITHDRAWAL_PAID', 'PayoutRequest', id, { bankReference })
  return prisma.payoutRequest.findUniqueOrThrow({ where: { id } })
}

// Declining returns the money to the rider's wallet
export async function rejectWithdrawal(adminId: string, id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.payoutRequest.updateMany({
      where: { id, status: { in: ['REQUESTED', 'APPROVED'] } },
      data: { status: 'REJECTED', rejectionReason: reason, reviewedById: adminId, reviewedAt: new Date() },
    })
    if (result.count === 0) throw new AppError(409, 'INVALID_STATE', 'This withdrawal can no longer be rejected')

    const request = await tx.payoutRequest.findUniqueOrThrow({ where: { id } })
    const wallet = await getRiderWallet(tx, request.riderId)
    await post(tx, {
      walletId: wallet.id,
      type: 'WITHDRAWAL_REVERSAL',
      direction: 'CREDIT',
      amount: request.amount,
      reference: `payout:${id}:reversal`,
      note: `Withdrawal rejected: ${reason}`,
    })
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'WITHDRAWAL_REJECTED', entityType: 'PayoutRequest', entityId: id, meta: { reason } },
    })
  })
  return prisma.payoutRequest.findUniqueOrThrow({ where: { id } })
}
