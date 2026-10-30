// Money is stored as BigInt (kobo) so it can never overflow. JSON cannot carry BigInt,
// so every BigInt in an API response is written as a plain number. That is exact for any
// value below about 90 trillion naira, and larger values are refused instead of rounded.
declare global {
  interface BigInt {
    toJSON(): number
  }
}

BigInt.prototype.toJSON = function (this: bigint) {
  if (this > BigInt(Number.MAX_SAFE_INTEGER) || this < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Money value is too large to send as JSON')
  }
  return Number(this)
}

export {}
