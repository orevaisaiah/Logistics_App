import test from 'node:test'
import assert from 'node:assert/strict'
import { assignedMessage, autoOfflineMessage, naira, offerMessage, rejectedMessage, withdrawalPaidMessage } from './push-messages.js'
import { isExpoPushToken, sendToTokens } from './push-send.js'
import { shouldGoOffline } from './offline-rule.js'

const token = (n: number) => `ExponentPushToken[abc${n}]`

test('money in messages', () => {
  assert.equal(naira(96000), '₦960')
  assert.equal(naira(150050), '₦1,500.50')
  assert.equal(naira(0), '₦0')
})

test('an offer message carries the essentials, expires with the offer, and uses the loud channel', () => {
  const m = offerMessage({ payout: 96000, pickupAddress: '12 Herbert Macaulay Way, Yaba', distanceToPickupKm: 2.345, tripKm: 4.1, ttlSeconds: 30 })
  assert.equal(m.title, 'New delivery · ₦960')
  assert.match(m.body, /2\.3 km to pickup/)
  assert.match(m.body, /4\.1 km trip/)
  assert.match(m.body, /Herbert Macaulay/)
  assert.equal(m.channelId, 'offers')
  assert.equal(m.ttlSeconds, 30)
})

test('long addresses and reasons are shortened', () => {
  const long = 'A'.repeat(200)
  const m = assignedMessage({ payout: 1000, pickupAddress: long })
  assert.ok(m.body.length < 80)
  assert.ok(rejectedMessage(long).body.length <= 120)
  assert.match(withdrawalPaidMessage(250000).body, /₦2,500/)
  assert.match(autoOfflineMessage(3).body, /3 deliveries/)
})

test('only real Expo tokens are accepted', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[abcDEF123_-]'), true)
  assert.equal(isExpoPushToken('ExpoPushToken[abc]'), true)
  assert.equal(isExpoPushToken('not-a-token'), false)
  assert.equal(isExpoPushToken('ExponentPushToken[]'), false)
  assert.equal(isExpoPushToken('ExponentPushToken[abc"; DROP]'), false)
})

test('sending: batches of 100, duplicates and bad tokens dropped', async () => {
  const calls: { size: number }[] = []
  const fakeFetch = (async (_url: string, init: { body: string }) => {
    const sent = JSON.parse(init.body) as unknown[]
    calls.push({ size: sent.length })
    return { ok: true, json: async () => ({ data: sent.map(() => ({ status: 'ok' })) }) }
  }) as unknown as typeof fetch
  const tokens = Array.from({ length: 250 }, (_, i) => token(i))
  const result = await sendToTokens([...tokens, tokens[0], 'garbage'], { title: 't', body: 'b' }, { fetch: fakeFetch })
  assert.deepEqual(calls.map((c) => c.size), [100, 100, 50])
  assert.equal(result.sent, 250)
  assert.deepEqual(result.invalidTokens, [])
})

test('sending: phones Expo says are gone are reported so they can be forgotten', async () => {
  const fakeFetch = (async () => ({
    ok: true,
    json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageRateExceeded' } }] }),
  })) as unknown as typeof fetch
  const result = await sendToTokens([token(1), token(2), token(3)], { title: 't', body: 'b' }, { fetch: fakeFetch })
  assert.deepEqual(result.invalidTokens, [token(2)])
  assert.equal(result.sent, 1)
})

test('sending: a network failure or an error reply never throws', async () => {
  const broken = (async () => {
    throw new Error('offline')
  }) as unknown as typeof fetch
  assert.deepEqual(await sendToTokens([token(1)], { title: 't', body: 'b' }, { fetch: broken }), { invalidTokens: [], sent: 0 })
  const refused = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
  assert.deepEqual(await sendToTokens([token(1)], { title: 't', body: 'b' }, { fetch: refused }), { invalidTokens: [], sent: 0 })
})

test('sending: the access token is sent when one is configured', async () => {
  let auth: string | undefined
  const spy = (async (_url: string, init: { headers: Record<string, string> }) => {
    auth = init.headers.Authorization
    return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }
  }) as unknown as typeof fetch
  await sendToTokens([token(1)], { title: 't', body: 'b' }, { fetch: spy, accessToken: 'secret' })
  assert.equal(auth, 'Bearer secret')
})

test('three unanswered offers in a row take a rider offline; any answer breaks the run', () => {
  assert.equal(shouldGoOffline(['EXPIRED', 'EXPIRED', 'EXPIRED']), true)
  assert.equal(shouldGoOffline(['EXPIRED', 'EXPIRED', 'DECLINED']), false)
  assert.equal(shouldGoOffline(['EXPIRED', 'ACCEPTED', 'EXPIRED']), false)
  assert.equal(shouldGoOffline(['EXPIRED', 'EXPIRED']), false)
  assert.equal(shouldGoOffline([]), false)
  assert.equal(shouldGoOffline(['EXPIRED', 'EXPIRED', 'EXPIRED', 'ACCEPTED']), true)
})
