import { prisma } from '../../lib/prisma.js'
import { audit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { checkNewPassword, generateTemporaryPassword } from '../../lib/temp-password.js'
import type { AdminRole, UserStatus } from '@prisma/client'

const staffSelect = {
  id: true,
  fullName: true,
  phone: true,
  adminRole: true,
  status: true,
  mustChangePassword: true,
  createdAt: true,
} as const

export const listStaff = () =>
  prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: staffSelect })

// Returns a temporary password exactly once. The new admin must replace it at first sign-in.
export async function createStaff(superAdminId: string, input: { phone: string; fullName: string; adminRole: AdminRole }) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } })
  if (existing) throw new AppError(409, 'ALREADY_EXISTS', 'An account with this phone number already exists')

  const temporaryPassword = generateTemporaryPassword()
  const user = await prisma.user.create({
    data: {
      phone: input.phone,
      fullName: input.fullName,
      role: 'ADMIN',
      adminRole: input.adminRole,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      phoneVerifiedAt: new Date(),
    },
    select: staffSelect,
  })
  await audit(superAdminId, 'STAFF_CREATED', 'User', user.id, { adminRole: input.adminRole })
  return { ...user, temporaryPassword }
}

async function activeSuperAdminCount() {
  return prisma.user.count({ where: { role: 'ADMIN', adminRole: 'SUPER_ADMIN', status: 'ACTIVE' } })
}

export async function updateStaff(
  superAdminId: string,
  userId: string,
  input: { adminRole?: AdminRole; status?: UserStatus },
) {
  if (userId === superAdminId) {
    throw new AppError(409, 'CANNOT_EDIT_SELF', 'You cannot change your own role or status')
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: staffSelect })
  if (!target || !target.adminRole) throw new AppError(404, 'NOT_FOUND', 'Staff member not found')

  // Never leave the system without a working super admin
  const losesSuperPower =
    target.adminRole === 'SUPER_ADMIN' &&
    target.status === 'ACTIVE' &&
    ((input.adminRole !== undefined && input.adminRole !== 'SUPER_ADMIN') || input.status === 'SUSPENDED')
  if (losesSuperPower && (await activeSuperAdminCount()) <= 1) {
    throw new AppError(409, 'LAST_SUPER_ADMIN', 'There must always be at least one active super admin')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: userId }, data: input, select: staffSelect })
    // A suspended admin is signed out everywhere straight away
    if (input.status === 'SUSPENDED') {
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    }
    await tx.auditLog.create({
      data: {
        adminUserId: superAdminId,
        action: 'STAFF_UPDATED',
        entityType: 'User',
        entityId: userId,
        meta: { before: { adminRole: target.adminRole, status: target.status }, after: { adminRole: user.adminRole, status: user.status } },
      },
    })
    return user
  })
  return updated
}

// For a staff member who is locked out or forgot their password
export async function resetStaffPassword(superAdminId: string, userId: string) {
  if (userId === superAdminId) throw new AppError(409, 'CANNOT_EDIT_SELF', 'Use change-password for your own account')
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!target || target.role !== 'ADMIN') throw new AppError(404, 'NOT_FOUND', 'Staff member not found')

  const temporaryPassword = generateTemporaryPassword()
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true } })
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.auditLog.create({
      data: { adminUserId: superAdminId, action: 'STAFF_PASSWORD_RESET', entityType: 'User', entityId: userId },
    })
  })
  return { temporaryPassword }
}

export async function adminMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: staffSelect })
  if (!user?.adminRole) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource')
  return user
}

// Works even while a temporary password is still active, because that is how it gets replaced.
// All other sessions are signed out.
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'ADMIN' || !user.passwordHash || user.status !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource')
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The current password is incorrect')
  }
  const problem = checkNewPassword(currentPassword, newPassword)
  if (problem) throw new AppError(400, 'WEAK_PASSWORD', problem)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } })
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.auditLog.create({
      data: { adminUserId: userId, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId },
    })
  })
  return { ok: true, message: 'Password changed. Sign in again with the new password.' }
}
