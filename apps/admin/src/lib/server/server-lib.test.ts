import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowed } from './rules'
import { refreshOnce } from './refresh'

test('the proxy allows admin calls', () => {
  assert.equal(isAllowed('GET', '/v1/admin/dashboard'), true)
  assert.equal(isAllowed('GET', '/v1/admin/auth/me'), true)
  assert.equal(isAllowed('POST', '/v1/admin/auth/change-password'), true)
  assert.equal(isAllowed('POST', '/v1/admin/deliveries/3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10/assign'), true)
  assert.equal(isAllowed('PUT', '/v1/admin/zones/3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10/rates/BIKE'), true)
  assert.equal(isAllowed('PATCH', '/v1/admin/staff/3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10'), true)
  assert.equal(isAllowed('GET', '/v1/admin/riders/3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10/documents/3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10/file'), true)
})

test('the proxy refuses everything else', () => {
  for (const [method, path] of [
    ['POST', '/v1/admin/auth/login'],
    ['GET', '/v1/wallet'],
    ['POST', '/v1/deliveries'],
    ['POST', '/v1/auth/refresh'],
    ['POST', '/v1/auth/logout'],
    ['POST', '/v1/rider/status'],
    ['POST', '/v1/webhooks/paystack'],
    ['GET', '/health'],
    ['DELETE', '/v1/admin/staff/x'],
    ['GET', '/v1/admin/../wallet'],
    ['GET', '/v1/admin/%2e%2e/wallet'],
    ['GET', '/v1//admin/dashboard'],
    ['GET', '/v1/admin/'],
  ])
    assert.equal(isAllowed(method, path), false, `${method} ${path}`)
})

test('simultaneous refreshes share a single call to the API', async () => {
  let calls = 0
  const slow = async () => {
    calls++
    await new Promise((r) => setTimeout(r, 20))
    return { accessToken: 'a', refreshToken: 'b' }
  }
  const results = await Promise.all([1, 2, 3].map(() => refreshOnce('old', slow, 50)))
  assert.equal(calls, 1)
  for (const r of results) assert.deepEqual(r, { accessToken: 'a', refreshToken: 'b' })
})
