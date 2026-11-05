import test from 'node:test'
import assert from 'node:assert/strict'
import { isAdminAllowed } from './rbac.js'
import { clientKey } from './rate-limit.js'
import { checkNewPassword, generateTemporaryPassword } from './temp-password.js'

test('super admin is always allowed, others only when listed', () => {
  assert.equal(isAdminAllowed('SUPER_ADMIN', []), true)
  assert.equal(isAdminAllowed('SUPER_ADMIN', ['OPS']), true)
  assert.equal(isAdminAllowed('OPS', ['OPS', 'SUPPORT']), true)
  assert.equal(isAdminAllowed('FINANCE', ['OPS', 'SUPPORT']), false)
})

test('a route with an empty list is for super admins only', () => {
  assert.equal(isAdminAllowed('OPS', []), false)
  assert.equal(isAdminAllowed('FINANCE', []), false)
})

test('no role means no access', () => {
  assert.equal(isAdminAllowed(null, ['OPS']), false)
  assert.equal(isAdminAllowed(undefined, []), false)
})

const sub = '3f2b8c1e-5a7d-4e90-9b21-0c6d7e8f9a10'
const tokenFor = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`

test('clientKey uses the account from a bearer token', () => {
  assert.equal(clientKey(`Bearer ${tokenFor({ sub })}`, '1.2.3.4'), `user:${sub}`)
})

test('clientKey falls back to the IP for missing, malformed or odd tokens', () => {
  assert.equal(clientKey(undefined, '1.2.3.4'), 'ip:1.2.3.4')
  assert.equal(clientKey('Bearer nonsense', '1.2.3.4'), 'ip:1.2.3.4')
  assert.equal(clientKey('Basic abc', '1.2.3.4'), 'ip:1.2.3.4')
  assert.equal(clientKey(`Bearer ${tokenFor({ sub: 'not-a-uuid' })}`, '1.2.3.4'), 'ip:1.2.3.4')
  assert.equal(clientKey(`Bearer ${tokenFor({ other: 1 })}`, '1.2.3.4'), 'ip:1.2.3.4')
})

test('temporary passwords are long, varied and use no look-alike characters', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const p = generateTemporaryPassword()
    assert.equal(p.length, 16)
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]+$/)
    seen.add(p)
  }
  assert.equal(seen.size, 200)
})

test('password rules', () => {
  assert.match(checkNewPassword('old-password-123', 'short')!, /at least 12/)
  assert.match(checkNewPassword('same-password-1', 'same-password-1')!, /different/)
  assert.match(checkNewPassword('old-password-123', 'aaaaaaaaaaaaaaa')!, /repetitive/)
  assert.equal(checkNewPassword('old-password-123', 'a-better-passphrase-77'), null)
})
