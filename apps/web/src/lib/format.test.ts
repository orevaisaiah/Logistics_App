import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateTime, formatNaira, googleMapsLink, nairaToKobo, newIdempotencyKey, statusTone } from './format'

test('formatNaira shows whole naira without decimals and keeps kobo when present', () => {
  assert.match(formatNaira(120000), /1,200$/)
  assert.doesNotMatch(formatNaira(120000), /\./)
  assert.match(formatNaira(150050), /1,500\.50$/)
  assert.match(formatNaira(0), /0$/)
})

test('nairaToKobo reads typed amounts exactly', () => {
  assert.equal(nairaToKobo('1500'), 150000)
  assert.equal(nairaToKobo('1,500.5'), 150050)
  assert.equal(nairaToKobo('₦ 1,500.50'), 150050)
  assert.equal(nairaToKobo('0.07'), 7)
  assert.equal(nairaToKobo('19.99'), 1999)
})

test('nairaToKobo refuses anything that is not an amount', () => {
  for (const bad of ['', 'abc', '-5', '1.234', '1..2', '1e5', '12.', '.5']) assert.equal(nairaToKobo(bad), null, bad)
})

test('dates are shown in Lagos time', () => {
  // 23:30 UTC is already half past midnight in Lagos (UTC+1)
  assert.match(formatDateTime('2026-10-30T23:30:00Z'), /31/)
  assert.equal(formatDateTime(null), '')
  assert.equal(formatDateTime('not a date'), '')
})

test('status tones and map links', () => {
  assert.equal(statusTone('DELIVERED'), 'success')
  assert.equal(statusTone('CANCELLED'), 'danger')
  assert.equal(statusTone('SEARCHING_RIDER'), 'warning')
  assert.equal(statusTone('IN_TRANSIT'), 'info')
  assert.equal(googleMapsLink(6.5, 3.3), 'https://www.google.com/maps?q=6.5,3.3')
})

test('idempotency keys have the shape the API accepts', () => {
  const key = newIdempotencyKey()
  assert.match(key, /^[A-Za-z0-9_-]{8,100}$/)
  assert.notEqual(key, newIdempotencyKey())
})
