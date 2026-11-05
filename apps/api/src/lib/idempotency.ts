import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'
import { AppError } from './errors.js'

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/
const KEEP_HOURS = 48

// Makes a request safe to retry. If the caller sends an "Idempotency-Key" header, the first
// request does the work and its result is remembered. Any retry with the same key gets that same
// result back, and the work (a charge, a payout) is not done twice. Without the header, the request
// runs normally.
//
// Failed attempts are forgotten, so the same key may be used again after an error.
export async function withIdempotency<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  scope: string,
  payload: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const header = req.headers['idempotency-key']
  if (header === undefined) return run()
  if (typeof header !== 'string' || !KEY_PATTERN.test(header)) {
    throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8 to 100 letters, numbers, dashes or underscores')
  }

  const userId = req.user.sub
  const where = { userId_scope_key: { userId, scope, key: header } }
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')

  try {
    await prisma.idempotencyRecord.create({ data: { userId, scope, key: header, requestHash } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.idempotencyRecord.findUnique({ where })
      if (existing && existing.requestHash !== requestHash) {
        throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request')
      }
      if (existing?.response != null) {
        reply.header('Idempotent-Replay', 'true')
        return existing.response as T
      }
      throw new AppError(409, 'REQUEST_IN_PROGRESS', 'The first request with this Idempotency-Key is still being processed')
    }
    throw err
  }

  try {
    const result = await run()
    // Round-trip through JSON so large numbers and dates are stored exactly as they are sent
    await prisma.idempotencyRecord.update({ where, data: { response: JSON.parse(JSON.stringify(result)) } })
    return result
  } catch (err) {
    await prisma.idempotencyRecord.delete({ where }).catch(() => undefined)
    throw err
  }
}

export async function purgeIdempotencyRecords() {
  const before = new Date(Date.now() - KEEP_HOURS * 60 * 60 * 1000)
  await prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: before } } })
}
