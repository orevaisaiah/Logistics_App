import crypto from 'node:crypto'
import type { User, UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { redis } from '../../lib/redis.js'
import { sendSms } from '../../lib/sms.js'
import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'

const OTP_TTL_SECONDS = 300
const OTP_MAX_ATTEMPTS = 5
const OTP_REQUESTS_PER_WINDOW = 3
const OTP_REQUEST_WINDOW_SECONDS = 600
const REFRESH_TOKEN_DAYS = 30

export type SignFn = (payload: { sub: string; role: UserRole }) => string

const hmac = (value: string) => crypto.createHmac('sha256', config.OTP_SECRET).update(value).digest('hex')
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const codeKey = (phone: string) => `otp:code:${phone}`
const triesKey = (phone: string) => `otp:tries:${phone}`
const rateKey = (phone: string) => `otp:rate:${phone}`

const publicUser = (u: User) => ({ id: u.id, phone: u.phone, fullName: u.fullName, role: u.role })

export async function requestOtp(phone: string) {
  const count = await redis.incr(rateKey(phone))
  if (count === 1) await redis.expire(rateKey(phone), OTP_REQUEST_WINDOW_SECONDS)
  if (count > OTP_REQUESTS_PER_WINDOW) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many code requests. Try again in a few minutes.')
  }

  const code = crypto.randomInt(100000, 1000000).toString()
  await redis
    .multi()
    .set(codeKey(phone), hmac(`${phone}:${code}`), 'EX', OTP_TTL_SECONDS)
    .del(triesKey(phone))
    .exec()

  await sendSms(phone, `Your verification code is ${code}. It expires in 5 minutes.`)
}

export async function verifyOtp(
  input: { phone: string; code: string; role?: 'BUSINESS_USER' | 'RIDER'; fullName?: string },
  sign: SignFn,
) {
  const { phone, code, role, fullName } = input

  const stored = await redis.get(codeKey(phone))
  if (!stored) throw new AppError(400, 'OTP_EXPIRED', 'Code expired or not requested')

  const tries = await redis.incr(triesKey(phone))
  if (tries === 1) await redis.expire(triesKey(phone), OTP_TTL_SECONDS)
  if (tries > OTP_MAX_ATTEMPTS) {
    await redis.del(codeKey(phone), triesKey(phone))
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Request a new code.')
  }

  const given = hmac(`${phone}:${code}`)
  if (!crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(given))) {
    throw new AppError(400, 'OTP_INVALID', 'Invalid code')
  }

  let user = await prisma.user.findUnique({ where: { phone } })
  let isNewUser = false

  if (!user) {
    if (!role) throw new AppError(400, 'ROLE_REQUIRED', 'role is required to create a new account')
    user = await prisma.user.create({
      data: {
        phone,
        role,
        fullName,
        phoneVerifiedAt: new Date(),
        ...(role === 'RIDER' ? { rider: { create: {} } } : {}),
      },
    })
    isNewUser = true
  } else {
    if (user.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended')
    if (!user.phoneVerifiedAt) {
      user = await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } })
    }
  }

  await redis.del(codeKey(phone), triesKey(phone))

  const tokens = await issueTokens(user, sign)
  return { user: publicUser(user), isNewUser, ...tokens }
}

export async function refreshSession(refreshToken: string, sign: SignFn) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  })

  if (!record) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token')

  // A token that was already used being presented again suggests theft: end all sessions
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.')
  }

  if (record.expiresAt < new Date()) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired. Please log in again.')
  if (record.user.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended')

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })
  return issueTokens(record.user, sign)
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function issueTokens(user: Pick<User, 'id' | 'role'>, sign: SignFn) {
  const accessToken = sign({ sub: user.id, role: user.role })
  const refreshToken = crypto.randomBytes(48).toString('base64url')

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  })

  return { accessToken, refreshToken }
}
