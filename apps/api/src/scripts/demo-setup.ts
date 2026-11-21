import { prisma } from '../lib/prisma.js'
import { getBusinessWallet, post } from '../modules/finance/ledger.js'
import { DEMO, refuseInProduction } from './demo-shared.js'

// Creates (or repairs) a test rider who is already approved, and a test business with money in its wallet.
// Safe to run again and again.
async function main() {
  refuseInProduction()
  if (!DEMO.riderPhone || !DEMO.businessPhone) {
    console.error('The demo phone numbers are not valid Nigerian numbers. Check DEMO_RIDER_PHONE and DEMO_BUSINESS_PHONE.')
    process.exit(1)
  }

  /* ---------- the rider ---------- */
  const existingRider = await prisma.user.findUnique({ where: { phone: DEMO.riderPhone } })
  if (existingRider && existingRider.role !== 'RIDER') {
    console.error(`${DEMO.riderLocal} already belongs to a ${existingRider.role} account. Set DEMO_RIDER_PHONE in .env to a different number.`)
    process.exit(1)
  }
  const riderDetails = {
    verificationStatus: 'APPROVED' as const,
    submittedAt: new Date(),
    dateOfBirth: new Date('1995-01-01T00:00:00Z'),
    address: '1 Demo Street, Demo City',
    vehicleType: 'BIKE' as const,
    plateNumber: 'DEMO123',
    serviceArea: 'Demo area',
    bankName: 'GTBank',
    accountNumber: '0123456789',
    accountName: 'Demo Rider',
  }
  if (!existingRider) {
    await prisma.user.create({
      data: { phone: DEMO.riderPhone, role: 'RIDER', fullName: 'Demo Rider', phoneVerifiedAt: new Date(), rider: { create: riderDetails } },
    })
  } else {
    await prisma.user.update({ where: { id: existingRider.id }, data: { status: 'ACTIVE', fullName: existingRider.fullName ?? 'Demo Rider' } })
    await prisma.rider.upsert({ where: { userId: existingRider.id }, create: { userId: existingRider.id, ...riderDetails }, update: riderDetails })
  }

  /* ---------- the business ---------- */
  const existingOwner = await prisma.user.findUnique({ where: { phone: DEMO.businessPhone } })
  if (existingOwner && existingOwner.role !== 'BUSINESS_USER') {
    console.error(`${DEMO.businessLocal} already belongs to a ${existingOwner.role} account. Set DEMO_BUSINESS_PHONE in .env to a different number.`)
    process.exit(1)
  }
  const owner =
    existingOwner ??
    (await prisma.user.create({
      data: { phone: DEMO.businessPhone, role: 'BUSINESS_USER', fullName: 'Demo Business Owner', phoneVerifiedAt: new Date() },
    }))

  let business = await prisma.business.findUnique({ where: { ownerUserId: owner.id } })
  if (!business) {
    business = await prisma.business.create({
      data: {
        ownerUserId: owner.id,
        companyName: 'Demo Store',
        businessType: 'Retail',
        verificationStatus: 'APPROVED',
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
    })
  } else if (business.verificationStatus !== 'APPROVED') {
    business = await prisma.business.update({ where: { id: business.id }, data: { verificationStatus: 'APPROVED' } })
  }

  // Free test money, recorded as an ordinary top-up so the finance "books balance" check still passes
  const businessId = business.id
  const balance = await prisma.$transaction(async (tx) => {
    const wallet = await getBusinessWallet(tx, businessId)
    if (wallet.balance >= 1_000_000n) return wallet.balance
    await post(tx, {
      walletId: wallet.id,
      type: 'TOPUP',
      direction: 'CREDIT',
      amount: 5_000_000n, // 50,000 naira
      reference: `demo:topup:${Date.now()}`,
      note: 'Demo money',
    })
    return wallet.balance + 5_000_000n
  })

  console.log('')
  console.log('Demo accounts are ready.')
  console.log('')
  console.log(`  Rider     ${DEMO.riderLocal}   already approved, so it skips the sign-up steps`)
  console.log(`  Business  ${DEMO.businessLocal}   wallet balance about N${Number(balance) / 100}`)
  console.log('')
  console.log('Next: sign in to the rider app with the rider number, tap "Go online", then run:  pnpm demo:delivery')
  console.log('')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
