import test from 'node:test'
import assert from 'node:assert/strict'
import { createSession, type RefreshResult, type Tokens, type TokenStore } from './session'
import { isAccountNumber, isDeliveryCode, nairaToKobo, validateDob, validateWithdrawal } from './validate'
import { formatDateTime, formatNaira, newIdempotencyKey, remainingSeconds } from './format'

function memoryStore(initial: Tokens | null): TokenStore & { current: Tokens | null } {
  const store = {
    current: initial,
    read: async () => store.current,
    write: async (t: Tokens) => void (store.current = t),
    clear: async () => void (store.current = null),
  }
  return store
}

test('many requests that find the token expired share ONE refresh', async () => {
  const store = memoryStore({ accessToken: 'old-access', refreshToken: 'old-refresh' })
  let calls = 0
  const session = createSession({
    store,
    refresh: async (): Promise<RefreshResult> => {
      calls++
      await new Promise((r) => setTimeout(r, 20))
      return { ok: true, tokens: { accessToken: 'new-access', refreshToken: 'new-refresh' } }
    },
    onSignedOut: () => assert.fail('must not sign out'),
  })
  const results = await Promise.all([1, 2, 3, 4].map(() => session.renew('old-access')))
  assert.equal(calls, 1)
  assert.deepEqual(results, ['new-access', 'new-access', 'new-access', 'new-access'])
  assert.equal(store.current?.refreshToken, 'new-refresh')
})

test('a request holding a stale token just picks up the already-renewed one', async () => {
  const store = memoryStore({ accessToken: 'newer', refreshToken: 'r' })
  const session = createSession({ store, refresh: async () => assert.fail('no refresh needed'), onSignedOut: () => assert.fail('no') })
  assert.equal(await session.renew('older'), 'newer')
})

test('a refused refresh ends the session', async () => {
  const store = memoryStore({ accessToken: 'a', refreshToken: 'r' })
  let signedOut = 0
  const session = createSession({ store, refresh: async () => ({ ok: false, reason: 'rejected' }), onSignedOut: () => signedOut++ })
  assert.equal(await session.renew('a'), null)
  assert.equal(store.current, null)
  assert.equal(signedOut, 1)
})

test('a network problem during refresh keeps the rider signed in', async () => {
  const store = memoryStore({ accessToken: 'a', refreshToken: 'r' })
  const session = createSession({ store, refresh: async () => ({ ok: false, reason: 'network' }), onSignedOut: () => assert.fail('must not sign out') })
  assert.equal(await session.renew('a'), null)
  assert.deepEqual(store.current, { accessToken: 'a', refreshToken: 'r' })
})

test('nothing to renew when there are no tokens', async () => {
  const session = createSession({ store: memoryStore(null), refresh: async () => assert.fail('no'), onSignedOut: () => assert.fail('no') })
  assert.equal(await session.renew('a'), null)
  assert.equal(await session.getAccessToken(), null)
})

test('date of birth: formats, real dates, and the 18-year rule', () => {
  const now = new Date('2026-11-09T10:00:00Z')
  assert.deepEqual(validateDob('12/03/1995', now), { iso: '1995-03-12' })
  assert.deepEqual(validateDob('1-3-1995', now), { iso: '1995-03-01' })
  assert.deepEqual(validateDob('1995-03-12', now), { iso: '1995-03-12' })
  assert.ok('error' in validateDob('31/02/1995', now))
  assert.ok('error' in validateDob('tomorrow', now))
  assert.ok('error' in validateDob('10/11/2008', now)) // 17 years old
  assert.deepEqual(validateDob('09/11/2008', now), { iso: '2008-11-09' }) // turns 18 today
  assert.ok('error' in validateDob('01/01/1900', now))
})

test('bank account numbers, delivery codes and amounts', () => {
  assert.equal(isAccountNumber('0123456789'), true)
  assert.equal(isAccountNumber('12345'), false)
  assert.equal(isAccountNumber('01234567890'), false)
  assert.equal(isDeliveryCode('4821'), true)
  assert.equal(isDeliveryCode('482'), false)
  assert.equal(nairaToKobo('1,500.5'), 150050)
  assert.equal(nairaToKobo('abc'), null)
  assert.deepEqual(validateWithdrawal('1000', 500000, 100000), { kobo: 100000 })
  assert.ok('error' in validateWithdrawal('500', 500000, 100000))
  assert.ok('error' in validateWithdrawal('6000', 500000, 100000))
  assert.ok('error' in validateWithdrawal('', 500000, 100000))
})

test('money, Lagos time, countdown and keys', () => {
  assert.equal(formatNaira(96000), '₦960')
  assert.equal(formatNaira(150050), '₦1,500.50')
  assert.equal(formatNaira(123456789), '₦1,234,567.89')
  assert.equal(formatNaira(0), '₦0')
  assert.equal(formatNaira(-5000), '-₦50')
  assert.equal(formatDateTime('2026-10-30T23:30:00Z'), '31 Oct 2026, 12:30 am')
  assert.equal(formatDateTime('2026-10-30T13:05:00Z'), '30 Oct 2026, 2:05 pm')
  assert.equal(formatDateTime(null), '')
  assert.equal(remainingSeconds(10_000, 4_500), 6)
  assert.equal(remainingSeconds(10_000, 12_000), 0)
  const key = newIdempotencyKey()
  assert.match(key, /^[A-Za-z0-9_-]{8,100}$/)
  assert.notEqual(key, newIdempotencyKey())
})
