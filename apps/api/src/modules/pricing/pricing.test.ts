import test from 'node:test'
import assert from 'node:assert/strict'
import { computePrice, findZone, haversineKm, splitCommission } from './pricing.js'

const rate = { baseFee: 80000, perKmFee: 12000, perKgFee: 5000, includedWeightKg: 5, minFee: 120000 }

test('haversine: same point is zero, known distance is close', () => {
  assert.equal(haversineKm({ lat: 6.5, lng: 3.3 }, { lat: 6.5, lng: 3.3 }), 0)
  // One degree of latitude is about 111 km
  const d = haversineKm({ lat: 6, lng: 3 }, { lat: 7, lng: 3 })
  assert.ok(d > 110 && d < 112)
})

test('computePrice: distance fee added and total rounded up to 50 naira', () => {
  const p = computePrice(rate, 5, 2)
  // 80000 + 60000 = 140000, already a multiple of 5000
  assert.equal(p.distanceFee, 60000)
  assert.equal(p.weightFee, 0)
  assert.equal(p.total, 140000)
  const q = computePrice(rate, 5.3, 2)
  // 80000 + 63600 = 143600, rounds up to 145000
  assert.equal(q.total, 145000)
})

test('computePrice: minimum fee applies to short trips', () => {
  const p = computePrice(rate, 0.5, 1)
  assert.equal(p.minFeeApplied, true)
  assert.equal(p.total, 120000)
})

test('computePrice: weight fee only above the included weight', () => {
  assert.equal(computePrice(rate, 5, 5).weightFee, 0)
  assert.equal(computePrice(rate, 5, 8).weightFee, 15000)
})

test('splitCommission: parts always add up to the price', () => {
  for (const price of [145000, 120005, 99999]) {
    const s = splitCommission(price, 20)
    assert.equal(s.commissionAmount + s.riderPayoutAmount, price)
  }
  assert.deepEqual(splitCommission(100000, 20), { commissionAmount: 20000, riderPayoutAmount: 80000 })
})

test('findZone: picks the containing zone, nearest centre wins, none when outside', () => {
  const zones = [
    { id: 'a', name: 'A', centerLat: 6.5244, centerLng: 3.3792, radiusKm: 25 },
    { id: 'b', name: 'B', centerLat: 6.6, centerLng: 3.35, radiusKm: 25 },
  ]
  assert.equal(findZone(zones, { lat: 6.5244, lng: 3.3792 })?.id, 'a')
  assert.equal(findZone(zones, { lat: 6.6, lng: 3.35 })?.id, 'b')
  assert.equal(findZone(zones, { lat: 9.0, lng: 7.4 }), null)
})
