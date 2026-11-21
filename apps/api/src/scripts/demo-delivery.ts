import { prisma } from '../lib/prisma.js'
import { createDelivery } from '../modules/deliveries/delivery.service.js'
import { explainDispatch } from '../modules/dispatch/dispatch.explain.js'
import { getBusinessWallet, post } from '../modules/finance/ledger.js'
import { findZone } from '../modules/pricing/pricing.js'
import { DEMO, refuseInProduction } from './demo-shared.js'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Books a test delivery whose pickup is exactly where the demo rider's phone is right now,
// so an offer appears on the phone wherever you happen to be testing.
async function main() {
  refuseInProduction()
  if (!DEMO.riderPhone || !DEMO.businessPhone) throw new Error('The demo phone numbers are not valid. Check .env.')

  const riderUser = await prisma.user.findUnique({ where: { phone: DEMO.riderPhone }, include: { rider: true } })
  const owner = await prisma.user.findUnique({ where: { phone: DEMO.businessPhone }, include: { ownedBusiness: true } })
  if (!riderUser?.rider || !owner?.ownedBusiness) {
    console.error('The demo accounts do not exist yet. Run this first:  pnpm demo:setup')
    process.exit(1)
  }
  const rider = riderUser.rider

  if (!rider.isOnline || rider.currentLat === null || rider.currentLng === null) {
    console.error('The demo rider is not online yet.')
    console.error('On the phone: sign in as the rider, open the Work tab, tap "Go online" and allow location. Then run this again.')
    process.exit(1)
  }
  const here = { lat: rider.currentLat, lng: rider.currentLng }
  console.log(`Rider is online at ${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}.`)

  /* ---------- make sure this place is a service area with a motorbike price ---------- */
  const zones = await prisma.zone.findMany({ where: { isActive: true } })
  let zone = findZone(zones, here)
  if (!zone) {
    zone = await prisma.zone.create({
      data: { name: `Demo zone ${here.lat.toFixed(2)},${here.lng.toFixed(2)}`, centerLat: here.lat, centerLng: here.lng, radiusKm: 20 },
    })
    console.log(`Created a test service area around the rider: "${zone.name}".`)
  }
  const rate = await prisma.rateCard.findUnique({ where: { zoneId_vehicleType: { zoneId: zone.id, vehicleType: 'BIKE' } } })
  if (!rate || !rate.isActive) {
    await prisma.rateCard.upsert({
      where: { zoneId_vehicleType: { zoneId: zone.id, vehicleType: 'BIKE' } },
      create: { zoneId: zone.id, vehicleType: 'BIKE', baseFee: 80_000, perKmFee: 12_000, perKgFee: 5_000, includedWeightKg: 5, maxWeightKg: 30, minFee: 120_000 },
      update: { isActive: true },
    })
    console.log('Added a sample motorbike price to that service area.')
  }

  /* ---------- make sure the business can pay ---------- */
  const businessId = owner.ownedBusiness.id
  await prisma.$transaction(async (tx) => {
    const wallet = await getBusinessWallet(tx, businessId)
    if (wallet.balance >= 500_000n) return
    await post(tx, { walletId: wallet.id, type: 'TOPUP', direction: 'CREDIT', amount: 5_000_000n, reference: `demo:topup:${Date.now()}`, note: 'Demo money' })
    console.log('Topped up the demo business wallet with N50,000 of test money.')
  })

  /* ---------- book it ---------- */
  const delivery = await createDelivery(owner.id, {
    pickup: { address: 'Demo pickup, right where the rider is', ...here, contactName: 'Demo Shop', contactPhone: DEMO.businessLocal },
    dropoff: { address: 'Demo drop-off, about 2 km away', lat: here.lat + 0.018, lng: here.lng, recipientName: 'Demo Customer', recipientPhone: DEMO.recipientPhone },
    package: { description: 'Test package', weightKg: 1, isFragile: false },
    vehicleType: 'BIKE',
  })
  console.log('')
  console.log(`Booked delivery ${delivery.trackingCode} for N${delivery.price / 100}.`)

  // Give dispatch a moment, then say what happened in plain words
  await sleep(2500)
  const offers = await prisma.deliveryAssignment.findMany({ where: { deliveryId: delivery.id } })
  if (offers.length > 0) {
    console.log('An offer was sent to the demo rider. Look at the phone now: you have about 30 seconds to accept.')
    console.log('When you collect the package, the 4-digit delivery code is printed in the terminal where the API is running.')
  } else {
    console.log('No offer was sent. Here is why:')
    const report = await explainDispatch(delivery.id)
    const mine = report.riders.find((r) => r.phone === DEMO.riderPhone)
    for (const problem of mine?.problems ?? ['(no reason found. Is the API running, with the dispatch worker on?)']) console.log(`  - ${problem}`)
  }
  console.log('')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    // Some background connections would otherwise keep the command from finishing
    setTimeout(() => process.exit(process.exitCode ?? 0), 500)
  })
