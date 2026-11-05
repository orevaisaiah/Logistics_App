import crypto from 'node:crypto'
import type { EntryDirection, WalletOwnerType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../lib/errors.js'
import { getBusinessWallet, getRiderWallet, post } from './ledger.js'
import { getBusinessContext } from './membership.js'

type Page = { page: number; limit: number }

const entrySelect = {
  id: true,
  type: true,
  direction: true,
  amount: true,
  balanceAfter: true,
  deliveryId: true,
  note: true,
  createdAt: true,
} as const

async function listEntries(walletId: string, { page, limit }: Page) {
  const [items, total] = await prisma.$transaction([
    prisma.walletEntry.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: entrySelect,
    }),
    prisma.walletEntry.count({ where: { walletId } }),
  ])
  return { items, total, page, limit }
}

/* ---------- business ---------- */

export async function getMyBusinessWallet(userId: string) {
  const { businessId } = await getBusinessContext(userId)
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { creditLimit: true } })
  const wallet = await getBusinessWallet(prisma, businessId)
  return {
    currency: 'NGN',
    unit: 'kobo',
    balance: wallet.balance,
    creditLimit: business.creditLimit,
    availableToSpend: wallet.balance + BigInt(business.creditLimit),
  }
}

export async function getMyBusinessEntries(userId: string, page: Page) {
  const { businessId } = await getBusinessContext(userId)
  const wallet = await getBusinessWallet(prisma, businessId)
  return listEntries(wallet.id, page)
}

/* ---------- rider ---------- */

async function getRiderId(userId: string) {
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')
  return rider.id
}

export async function getMyRiderWallet(userId: string) {
  const riderId = await getRiderId(userId)
  const wallet = await getRiderWallet(prisma, riderId)
  const pending = await prisma.payoutRequest.aggregate({
    where: { riderId, status: { in: ['REQUESTED', 'APPROVED'] } },
    _sum: { amount: true },
  })
  return {
    currency: 'NGN',
    unit: 'kobo',
    balance: wallet.balance,
    withdrawalsInProgress: pending._sum.amount ?? 0n,
  }
}

export async function getMyRiderEntries(userId: string, page: Page) {
  const riderId = await getRiderId(userId)
  const wallet = await getRiderWallet(prisma, riderId)
  return listEntries(wallet.id, page)
}

/* ---------- admin ---------- */

export async function adminListWallets(q: Page & { ownerType?: WalletOwnerType }) {
  const where = q.ownerType ? { ownerType: q.ownerType } : {}
  const [items, total] = await prisma.$transaction([
    prisma.wallet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        business: { select: { companyName: true } },
        rider: { select: { user: { select: { fullName: true, phone: true } } } },
      },
    }),
    prisma.wallet.count({ where }),
  ])
  return { items, total, page: q.page, limit: q.limit }
}

export async function adminListEntries(walletId: string, page: Page) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new AppError(404, 'NOT_FOUND', 'Wallet not found')
  return { wallet, ...(await listEntries(walletId, page)) }
}

// Manual correction by an admin. Always needs a reason and is recorded in the audit log.
export async function adminAdjust(
  adminId: string,
  walletId: string,
  input: { direction: EntryDirection; amount: number; reason: string },
) {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) throw new AppError(404, 'NOT_FOUND', 'Wallet not found')

  const reference = `adjust:${crypto.randomUUID()}`
  const result = await prisma.$transaction(async (tx) => {
    const posted = await post(tx, {
      walletId,
      type: 'ADJUSTMENT',
      direction: input.direction,
      amount: BigInt(input.amount),
      reference,
      note: input.reason,
    })
    await tx.auditLog.create({
      data: {
        adminUserId: adminId,
        action: 'WALLET_ADJUSTED',
        entityType: 'Wallet',
        entityId: walletId,
        meta: { direction: input.direction, amount: input.amount, reason: input.reason, reference },
      },
    })
    return posted.entry
  })
  return result
}

// The health check for your money:
//  1. every wallet's balance must equal what its ledger entries add up to
//  2. all balances together must equal the money that crossed the system boundary
//     (top-ups in, withdrawals out, manual adjustments); everything else moves between wallets
export async function financeSummary() {
  const [byOwner, entryTotals, pending, perWallet] = await Promise.all([
    prisma.wallet.groupBy({ by: ['ownerType'], _sum: { balance: true }, _count: true }),
    prisma.walletEntry.groupBy({ by: ['type', 'direction'], _sum: { amount: true } }),
    prisma.payoutRequest.aggregate({
      where: { status: { in: ['REQUESTED', 'APPROVED'] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.$queryRaw<{ id: string; balance: bigint; ledger: bigint }[]>`
      SELECT w."id", w."balance",
             COALESCE(SUM(CASE WHEN e."direction" = 'CREDIT' THEN e."amount" ELSE -e."amount" END), 0)::bigint AS ledger
      FROM "Wallet" w
      LEFT JOIN "WalletEntry" e ON e."walletId" = w."id"
      GROUP BY w."id", w."balance"
    `,
  ])

  const balances = Object.fromEntries(byOwner.map((g) => [g.ownerType, { wallets: g._count, balance: g._sum.balance ?? 0n }]))
  const totalBalances = byOwner.reduce((sum, g) => sum + (g._sum.balance ?? 0n), 0n)

  const boundaryTypes = ['TOPUP', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT']
  const expectedTotal = entryTotals
    .filter((g) => boundaryTypes.includes(g.type))
    .reduce((sum, g) => sum + (g.direction === 'CREDIT' ? 1n : -1n) * (g._sum.amount ?? 0n), 0n)

  const mismatchedWallets = perWallet.filter((w) => w.balance !== w.ledger)

  return {
    unit: 'kobo',
    balances,
    pendingWithdrawals: { count: pending._count, amount: pending._sum.amount ?? 0n },
    integrity: {
      ok: mismatchedWallets.length === 0 && totalBalances === expectedTotal,
      walletsWithBalanceNotMatchingLedger: mismatchedWallets,
      totalBalances,
      expectedFromBoundaryEntries: expectedTotal,
      difference: totalBalances - expectedTotal,
    },
  }
}
