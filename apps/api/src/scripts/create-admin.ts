import readline from 'node:readline/promises'
import { prisma } from '../lib/prisma.js'
import { normalizeNgPhone } from '../lib/phone.js'
import { hashPassword } from '../lib/password.js'

async function main() {
  const [phoneArg, ...nameParts] = process.argv.slice(2)
  const phone = phoneArg ? normalizeNgPhone(phoneArg) : null
  if (!phone) {
    console.error('Usage: pnpm admin:create <phone> "<Full Name>"')
    process.exit(1)
  }
  const fullName = nameParts.join(' ').trim() || undefined

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
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, ...(fullName ? { fullName } : {}) } })
    console.log(`Updated password for admin ${phone}`)
  } else {
    await prisma.user.create({
      data: { phone, fullName, role: 'ADMIN', passwordHash, phoneVerifiedAt: new Date() },
    })
    console.log(`Created admin ${phone}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
