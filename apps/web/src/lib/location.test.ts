import test from 'node:test'
import assert from 'node:assert/strict'
import { addSavedPlace, locationPoint, parseCenter, parseCoord } from './location'

test('coordinates are checked for range and format', () => {
  assert.equal(parseCoord('6.5244', -90, 90), 6.5244)
  assert.equal(parseCoord(' 3.3792 ', -180, 180), 3.3792)
  assert.equal(parseCoord('', -90, 90), null)
  assert.equal(parseCoord('abc', -90, 90), null)
  assert.equal(parseCoord('91', -90, 90), null)
  assert.equal(parseCoord('-181', -180, 180), null)
})

test('a location is only usable when both coordinates are valid', () => {
  assert.deepEqual(locationPoint({ address: 'x', lat: '6.5', lng: '3.3' }), { lat: 6.5, lng: 3.3 })
  assert.equal(locationPoint({ address: 'x', lat: '6.5', lng: '' }), null)
  assert.equal(locationPoint({ address: 'x', lat: 'north', lng: '3.3' }), null)
})

test('the default map centre falls back to Lagos', () => {
  assert.deepEqual(parseCenter('9.0765, 7.3986'), [9.0765, 7.3986])
  assert.deepEqual(parseCenter(undefined), [6.5244, 3.3792])
  assert.deepEqual(parseCenter('nonsense'), [6.5244, 3.3792])
  assert.deepEqual(parseCenter('200,3'), [6.5244, 3.3792])
})

test('saving a place again replaces the old entry and keeps the newest first', () => {
  const a = { name: 'Shop', address: 'A', lat: '6.5', lng: '3.3' }
  const b = { name: 'Depot', address: 'B', lat: '6.6', lng: '3.4' }
  const updated = addSavedPlace([a, b], { ...a, name: 'Main shop' })
  assert.deepEqual(updated.map((p) => p.name), ['Main shop', 'Depot'])
  const many = Array.from({ length: 25 }, (_, i) => ({ name: `p${i}`, address: '', lat: String(i), lng: '0' }))
  assert.equal(many.reduce((acc, p) => addSavedPlace(acc, p), [] as typeof many).length, 20)
})
