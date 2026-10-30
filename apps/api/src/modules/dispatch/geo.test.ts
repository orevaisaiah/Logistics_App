import test from 'node:test'
import assert from 'node:assert/strict'
import { boundingBox, rankByDistance } from './geo.js'
import { haversineKm } from '../pricing/pricing.js'

const center = { lat: 6.5244, lng: 3.3792 }

test('boundingBox contains every point within the radius', () => {
  const box = boundingBox(center, 8)
  // Points roughly 7 km away in each direction must fall inside the box
  const probes = [
    { lat: center.lat + 0.063, lng: center.lng },
    { lat: center.lat - 0.063, lng: center.lng },
    { lat: center.lat, lng: center.lng + 0.063 },
    { lat: center.lat, lng: center.lng - 0.063 },
  ]
  for (const p of probes) {
    assert.ok(haversineKm(center, p) < 8)
    assert.ok(p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng)
  }
})

test('rankByDistance sorts nearest first and drops riders beyond the limit', () => {
  const riders = [
    { id: 'far', lat: center.lat + 0.2, lng: center.lng },
    { id: 'near', lat: center.lat + 0.005, lng: center.lng },
    { id: 'mid', lat: center.lat + 0.03, lng: center.lng },
  ]
  const ranked = rankByDistance(riders, center, 8)
  assert.deepEqual(ranked.map((r) => r.id), ['near', 'mid'])
  assert.ok(ranked[0].distanceKm < ranked[1].distanceKm)
})
