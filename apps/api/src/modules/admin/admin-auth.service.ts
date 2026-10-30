import { prisma } from '../../lib/prisma.js'
import { redis } from '../../lib/redis.js'
import { AppError } from '../../lib/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { issueTokens, type SignFn } from '../auth/auth.service.js'

const MAX_FAILURES = 5
const LOCK_WINDOW_SECONDS = 900

// Checked against when the phone number does not exist, so response time
// does not reveal which numbers belong to admins
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password'))

export async function adminLogin(phone: string, password: string, sign: SignFn) {
  const failKey = `admin:login:fail:${phone}`
  const failures = Number((await redis.get(failKey)) ?? 0)
  if (failures >= MAX_FAILURES) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in 15 minutes.')
  }

  const user = await prisma.user.findUnique({ where: { phone } })
  const isAdmin = user?.role === 'ADMIN' && Boolean(user.passwordHash)
  const passwordOk = await verifyPassword(password, isAdmin ? user!.passwordHash! : await getDummyHash())

  if (!user || !isAdmin || !passwordOk) {
    const count = await redis.incr(failKey)
    if (count === 1) await redis.expire(failKey, LOCK_WINDOW_SECONDS)
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect phone number or password')
  }
  if (user.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended')

  await redis.del(failKey)
  const tokens = await issueTokens(user, sign)
  return { user: { id: user.id, phone: user.phone, fullName: user.fullName, role: user.role }, ...tokens }
}
