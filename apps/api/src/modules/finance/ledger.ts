import type { EntryDirection, EntryType, Prisma, WalletEntry } from '@prisma/client'
import { AppError } from '../../lib/errors.js'

export type Tx = Prisma.TransactionClient
type WalletDb = Pick<Tx, 'wallet'>

export type Leg = {
  walletId: string
  type: EntryType
  direction: EntryDirection
  amount: bigint
  // Unique per money movement. Posting the same reference twice does nothing the second time.
  reference: string
  deliveryId?: string
  note?: string
  // How far below zero this wallet may go (credit terms for businesses). Defaults to none.
  overdraftLimit?: bigint
}

// The one rule that decides whether a balance may change. Pure, so it is easy to test.
export function applyToBalance(balance: bigint, direction: EntryDirection, amount: bigint, overdraftLimit = 0n): bigint {
  if (amount <= 0n) throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be greater than zero')
  if (direction === 'CREDIT') return balance + amount
  const next = balance - amount
  if (next < -overdraftLimit) throw new AppError(402, 'INSUFFICIENT_FUNDS', 'Insufficient wallet balance')
  return next
}

// Must run inside a transaction. Locks the wallet row so postings to one wallet happen one at a time.
export async function post(tx: Tx, leg: Leg): Promise<{ entry: WalletEntry; created: boolean }> {
  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    SELECT "balance" FROM "Wallet" WHERE "id" = ${leg.walletId}::uuid FOR UPDATE
  `
  if (rows.length === 0) throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found')

  const existing = await tx.walletEntry.findUnique({ where: { reference: leg.reference } })
  if (existing) {
    const same = existing.walletId === leg.walletId && existing.amount === leg.amount && existing.direction === leg.direction
    if (!same) throw new AppError(409, 'REFERENCE_CONFLICT', 'This reference was already used for a different entry')
    return { entry: existing, created: false }
  }

  const balanceAfter = applyToBalance(rows[0].balance, leg.direction, leg.amount, leg.overdraftLimit)
  const entry = await tx.walletEntry.create({
    data: {
      walletId: leg.walletId,
      type: leg.type,
      direction: leg.direction,
      amount: leg.amount,
      balanceAfter,
      reference: leg.reference,
      deliveryId: leg.deliveryId,
      note: leg.note,
    },
  })
  await tx.wallet.update({ where: { id: leg.walletId }, data: { balance: balanceAfter } })
  return { entry, created: true }
}

// Posts several legs as one unit. Wallets are always locked in the same order,
// so two transactions can never wait on each other.
export async function postAll(tx: Tx, legs: Leg[]) {
  const ordered = [...legs].sort((a, b) => a.walletId.localeCompare(b.walletId))
  for (const leg of ordered) await post(tx, leg)
}

export const getBusinessWallet = (db: WalletDb, businessId: string) =>
  db.wallet.upsert({
    where: { businessId },
    create: { ownerType: 'BUSINESS', businessId },
    update: {},
  })

export const getRiderWallet = (db: WalletDb, riderId: string) =>
  db.wallet.upsert({
    where: { riderId },
    create: { ownerType: 'RIDER', riderId },
    update: {},
  })

export const getSystemWallet = (db: WalletDb, key: 'PLATFORM' | 'ESCROW') =>
  db.wallet.upsert({
    where: { systemKey: key },
    create: { ownerType: key, systemKey: key },
    update: {},
  })

// Stops a refund and a settlement running on the same delivery at the same moment
export async function lockDelivery(tx: Tx, deliveryId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Delivery" WHERE "id" = ${deliveryId}::uuid FOR UPDATE`
}
