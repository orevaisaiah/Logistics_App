import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed } from './rules'
import { refreshOnce } from './refresh'

const id = '3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10'

test('the proxy allows the business dashboard calls', () => {
  assert.equal(isAllowed('GET', '/v1/me'), true)
  assert.equal(isAllowed('GET', '/v1/business'), true)
  assert.equal(isAllowed('PATCH', '/v1/business'), true)
  assert.equal(isAllowed('POST', '/v1/deliveries'), true)
  assert.equal(isAllowed('POST', '/v1/deliveries/quote'), true)
  assert.equal(isAllowed('GET', `/v1/deliveries/${id}`), true)
  assert.equal(isAllowed('POST', `/v1/deliveries/${id}/cancel`), true)
  assert.equal(isAllowed('GET', '/v1/wallet/entries'), true)
  assert.equal(isAllowed('POST', '/v1/wallet/topups'), true)
  assert.equal(isAllowed('GET', '/v1/wallet/topups/LGP-abcdef123456/verify'), true)
  assert.equal(isAllowed('GET', '/v1/track/LG-7K2M9XQD'), true)
  assert.equal(isAllowed('POST', '/v1/auth/otp/request'), true)
})

test('the proxy refuses admin, rider and token endpoints', () => {
  for (const [method, path] of [
    ['POST', '/v1/auth/otp/verify'],
    ['POST', '/v1/auth/refresh'],
    ['POST', '/v1/auth/logout'],
    ['GET', '/v1/admin/finance/summary'],
    ['POST', '/v1/admin/auth/login'],
    ['POST', '/v1/rider/status'],
    ['GET', '/v1/rider/wallet'],
    ['POST', '/v1/webhooks/paystack'],
    ['GET', '/health'],
  ])
    assert.equal(isAllowed(method, path), false, `${method} ${path}`)
})

test('the proxy refuses the wrong method and path tricks', () => {
  assert.equal(isAllowed('DELETE', '/v1/business'), false)
  assert.equal(isAllowed('PATCH', '/v1/deliveries'), false)
  assert.equal(isAllowed('GET', '/v1/deliveries/not-an-id'), false)
  assert.equal(isAllowed('GET', `/v1/deliveries/${id}/../../admin/riders`), false)
  assert.equal(isAllowed('GET', `/v1/deliveries/${id}%2f..%2fadmin`), false)
  assert.equal(isAllowed('GET', '/v1//admin/riders'), false)
})

test('simultaneous refreshes share a single call to the API', async () => {
  let calls = 0
  const slowRefresh = async () => {
    calls++
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { accessToken: 'new-access', refreshToken: 'new-refresh' }
  }
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => refreshOnce('old-token', slowRefresh, 50)))
  assert.equal(calls, 1)
  for (const r of results) assert.deepEqual(r, { accessToken: 'new-access', refreshToken: 'new-refresh' })
})

test('a different refresh token gets its own call', async () => {
  let calls = 0
  const refresh = async () => {
    calls++
    return null
  }
  await Promise.all([refreshOnce('token-a', refresh, 50), refreshOnce('token-b', refresh, 50)])
  assert.equal(calls, 2)
})
