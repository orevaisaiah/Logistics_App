import readline from 'node:readline/promises'
import type { AdminRole } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { normalizeNgPhone } from '../lib/phone.js'
import { hashPassword } from '../lib/password.js'

const ROLES: AdminRole[] = ['SUPER_ADMIN', 'OPS', 'FINANCE', 'SUPPORT', 'VERIFICATION']

// Usage: pnpm admin:create <phone> "<Full Name>" [ROLE]
// ROLE is one of SUPER_ADMIN (the default), OPS, FINANCE, SUPPORT, VERIFICATION.
// This is how the first super admin is made. After that, super admins create staff through the API.
async function main() {
  const [phoneArg, ...rest] = process.argv.slice(2)
  const phone = phoneArg ? normalizeNgPhone(phoneArg) : null
  const roleArg = rest.find((a) => ROLES.includes(a.toUpperCase() as AdminRole))
  const adminRole = (roleArg?.toUpperCase() as AdminRole | undefined) ?? 'SUPER_ADMIN'
  const fullName = rest.filter((a) => a !== roleArg).join(' ').trim() || undefined

  if (!phone) {
    console.error('Usage: pnpm admin:create <phone> "<Full Name>" [SUPER_ADMIN|OPS|FINANCE|SUPPORT|VERIFICATION]')
    process.exit(1)
  }

  // The password is typed at the prompt so it never lands in your shell history
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const password = (await rl.question('Password (at least 12 characters): ')).trim()
  rl.close()
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing && existing.role !== 'ADMIN') {
    console.error(`${phone} already belongs to a ${existing.role} account. Use a different phone number for the admin.`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, adminRole, mustChangePassword: false, ...(fullName ? { fullName } : {}) },
    })
    console.log(`Updated admin ${phone} (${adminRole})`)
  } else {
    await prisma.user.create({
      data: { phone, fullName, role: 'ADMIN', adminRole, passwordHash, phoneVerifiedAt: new Date() },
    })
    console.log(`Created admin ${phone} (${adminRole})`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
