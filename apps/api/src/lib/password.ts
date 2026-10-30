import crypto from 'node:crypto'

// scrypt is built into Node, so no extra package is needed.
// These cost settings follow current OWASP guidance and take a few hundred milliseconds,
// which is fine for admin logins.
const options = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

const derive = (password: string, salt: Buffer, keyLength: number) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)))
  })

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16)
  const hash = await derive(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split('$')
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await derive(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}
