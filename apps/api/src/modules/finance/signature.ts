import crypto from 'node:crypto'

// Paystack signs the exact bytes of each webhook with HMAC-SHA512 and your secret key
export function verifyPaystackSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')
  const given = Buffer.from(signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted)
}
