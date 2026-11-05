import test from 'node:test'
import assert from 'node:assert/strict'
import { addDaysToDay, dayToInstant, lagosDayString, lagosDayStart, listDays, rangeInstants, ratio } from './reports.js'

test('a Lagos day starts at 23:00 UTC the evening before', () => {
  assert.equal(dayToInstant('2026-10-30').toISOString(), '2026-10-29T23:00:00.000Z')
})

test('lagosDayStart: late evening UTC is already the next day in Lagos', () => {
  assert.equal(lagosDayStart(new Date('2026-10-30T23:30:00Z')).toISOString(), '2026-10-30T23:00:00.000Z')
  assert.equal(lagosDayStart(new Date('2026-10-30T10:00:00Z')).toISOString(), '2026-10-29T23:00:00.000Z')
  assert.equal(lagosDayString(new Date('2026-10-30T23:30:00Z')), '2026-10-31')
  assert.equal(lagosDayString(new Date('2026-10-30T10:00:00Z')), '2026-10-30')
})

test('listDays is inclusive and crosses month and year ends', () => {
  assert.deepEqual(listDays('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  assert.deepEqual(listDays('2026-12-31', '2027-01-01'), ['2026-12-31', '2027-01-01'])
  assert.equal(listDays('2026-10-30', '2026-10-30').length, 1)
  assert.equal(listDays('2026-10-30', '2026-10-29').length, 0)
})

test('addDaysToDay', () => {
  assert.equal(addDaysToDay('2026-03-01', -1), '2026-02-28')
  assert.equal(addDaysToDay('2026-10-30', 6), '2026-11-05')
})

test('rangeInstants covers whole days', () => {
  const { start, end } = rangeInstants('2026-10-30', '2026-10-31')
  assert.equal(end.getTime() - start.getTime(), 2 * 24 * 60 * 60 * 1000)
})

test('ratio handles zero and rounds', () => {
  assert.equal(ratio(1, 0), null)
  assert.equal(ratio(2, 3), 0.667)
  assert.equal(ratio(0, 5), 0)
})
