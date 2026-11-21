import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceForAddress, hostOf } from './connection'

test('the host is read from the address', () => {
  assert.equal(hostOf('http://192.168.1.20:3000'), '192.168.1.20')
  assert.equal(hostOf('https://api.example.com/v1'), 'api.example.com')
  assert.equal(hostOf('HTTP://LOCALHOST:3000'), 'localhost')
  assert.equal(hostOf('nonsense'), '')
})

test('addresses that cannot work from a real phone are explained', () => {
  assert.match(adviceForAddress('http://10.0.2.2:3000') ?? '', /emulator/)
  assert.match(adviceForAddress('http://localhost:3000') ?? '', /this phone itself/)
  assert.match(adviceForAddress('http://127.0.0.1:3000') ?? '', /this phone itself/)
  assert.match(adviceForAddress('') ?? '', /empty/)
})

test('an ordinary Wi-Fi address raises no complaint', () => {
  assert.equal(adviceForAddress('http://192.168.1.20:3000'), null)
  assert.equal(adviceForAddress('http://10.22.196.89:3000'), null)
  assert.equal(adviceForAddress('https://api.example.com'), null)
})
