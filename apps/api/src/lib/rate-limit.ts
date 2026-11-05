const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Who a request counts as, for the general rate limit. Many phones on one mobile network share
// a single IP address, so a signed-in caller is counted by their account instead of their IP.
// The token is only read here, not verified, so a forged one just earns the caller a fresh
// bucket. That is acceptable because this limit is a safety net: the sensitive routes
// (sign-in, codes, tracking) always count by IP.
export function clientKey(authorization: string | undefined, ip: string): string {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
  const payload = token?.split('.')[1]
  if (payload) {
    try {
      const sub = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.sub
      if (typeof sub === 'string' && UUID.test(sub)) return `user:${sub}`
    } catch {
      // not a readable token: fall through to the IP
    }
  }
  return `ip:${ip}`
}
