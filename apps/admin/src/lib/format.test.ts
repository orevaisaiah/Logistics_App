import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateTime, formatDuration, formatNaira, formatPercent, koboToNairaText, nairaToKobo, statusTone } from './format'
import { ACCESS, canAccess, isAllowed } from './roles'
import { eligibleRiders, type BoardRider } from './riders'
import { toCsv } from './csv'

test('money: formatting, parsing and round trips', () => {
  assert.match(formatNaira(120000), /1,200$/)
  assert.match(formatNaira(150050), /1,500\.50$/)
  assert.match(formatNaira(-5000), /^-.*50$/)
  assert.equal(nairaToKobo('1,500.5'), 150050)
  assert.equal(nairaToKobo('0.07'), 7)
  for (const bad of ['', 'abc', '-5', '1.234', '1e5', '.5']) assert.equal(nairaToKobo(bad), null, bad)
  for (const kobo of [0, 7, 150000, 150050, 1999]) assert.equal(nairaToKobo(koboToNairaText(kobo)), kobo)
})

test('durations, percentages, dates', () => {
  assert.equal(formatDuration(45), '45 sec')
  assert.equal(formatDuration(180), '3 min')
  assert.equal(formatDuration(3600), '1 h')
  assert.equal(formatDuration(3900), '1 h 5 min')
  assert.equal(formatPercent(0.8333), '83.3%')
  assert.equal(formatPercent(null), 'n/a')
  assert.match(formatDateTime('2026-10-30T23:30:00Z'), /31/)
  assert.equal(statusTone('FAILED'), 'danger')
})

test('role access matches what the API allows', () => {
  assert.equal(canAccess('SUPER_ADMIN', 'staff'), true)
  assert.equal(canAccess('OPS', 'staff'), false)
  assert.equal(canAccess('OPS', 'dispatchActions'), true)
  assert.equal(canAccess('SUPPORT', 'dispatchActions'), false)
  assert.equal(canAccess('SUPPORT', 'dispatchBoard'), true)
  assert.equal(canAccess('FINANCE', 'finance'), true)
  assert.equal(canAccess('OPS', 'finance'), false)
  assert.equal(canAccess('VERIFICATION', 'riderReview'), true)
  assert.equal(canAccess('OPS', 'riderReview'), false)
  assert.equal(canAccess('VERIFICATION', 'deliveries'), false)
  assert.equal(canAccess(null, 'overview'), false)
  assert.equal(isAllowed('FINANCE', []), false)
  for (const area of Object.keys(ACCESS) as (keyof typeof ACCESS)[]) assert.equal(canAccess('SUPER_ADMIN', area), true, area)
})

test('riders offered for a delivery: right vehicle, not on a job, nearest first', () => {
  const rider = (id: string, over: Partial<BoardRider>): BoardRider => ({
    id, name: id, phone: '0', vehicleType: 'BIKE', lat: 6.5, lng: 3.3, lastSeenAt: null, state: 'IDLE', currentDelivery: null, ...over,
  })
  const pickup = { lat: 6.5, lng: 3.3 }
  const list = eligibleRiders(
    [
      rider('far', { lat: 6.6 }),
      rider('near', { lat: 6.501 }),
      rider('busy', { state: 'ON_JOB' }),
      rider('car', { vehicleType: 'CAR' }),
      rider('nopos', { lat: null, lng: null, state: 'LOCATION_STALE' }),
    ],
    'BIKE',
    pickup,
  )
  assert.deepEqual(list.map((c) => c.rider.id), ['near', 'far', 'nopos'])
  assert.equal(list[2].distanceKm, null)
})

test('csv export quotes values and neutralises spreadsheet formulas', () => {
  const csv = toCsv(
    [{ header: 'name', value: (r) => r.name }, { header: 'note', value: (r) => r.note }],
    [{ name: 'Ada, Obi', note: 'said "hi"' }, { name: '=SUM(A1)', note: null }],
  )
  assert.equal(csv, 'name,note\r\n"Ada, Obi","said ""hi"""\r\n\'=SUM(A1),')
})
