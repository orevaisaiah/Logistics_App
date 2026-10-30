import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { applyToBalance } from './ledger.js'
import { verifyPaystackSignature } from './signature.js'

test('credits add to the balance', () => {
  assert.equal(applyToBalance(1000n, 'CREDIT', 500n), 1500n)
})

test('debits subtract, and may use the whole balance', () => {
  assert.equal(applyToBalance(1000n, 'DEBIT', 400n), 600n)
  assert.equal(applyToBalance(1000n, 'DEBIT', 1000n), 0n)
})

test('a debit that would overdraw is refused', () => {
  assert.throws(() => applyToBalance(1000n, 'DEBIT', 1001n), (e: any) => e.code === 'INSUFFICIENT_FUNDS')
})

test('an overdraft limit allows a negative balance, but only up to the limit', () => {
  assert.equal(applyToBalance(1000n, 'DEBIT', 6000n, 5000n), -5000n)
  assert.throws(() => applyToBalance(1000n, 'DEBIT', 6001n, 5000n), (e: any) => e.code === 'INSUFFICIENT_FUNDS')
})

test('zero and negative amounts are refused', () => {
  assert.throws(() => applyToBalance(1000n, 'CREDIT', 0n), (e: any) => e.code === 'INVALID_AMOUNT')
  assert.throws(() => applyToBalance(1000n, 'DEBIT', -5n), (e: any) => e.code === 'INVALID_AMOUNT')
})

test('large amounts keep full precision', () => {
  const big = 9_000_000_000_000_000n
  assert.equal(applyToBalance(big, 'CREDIT', 1n), big + 1n)
})

test('paystack signature: valid, tampered body, wrong length', () => {
  const secret = 'sk_test_example'
  const body = Buffer.from('{"event":"charge.success","data":{"reference":"abc"}}')
  const sig = crypto.createHmac('sha512', secret).update(body).digest('hex')
  assert.equal(verifyPaystackSignature(body, sig, secret), true)
  assert.equal(verifyPaystackSignature(Buffer.from('{"event":"charge.success","data":{"reference":"xyz"}}'), sig, secret), false)
  assert.equal(verifyPaystackSignature(body, 'short', secret), false)
  assert.equal(verifyPaystackSignature(body, sig, 'another_secret'), false)
})
