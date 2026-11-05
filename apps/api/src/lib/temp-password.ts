import crypto from 'node:crypto'

// No look-alike characters (0/O, 1/l/I), so it can be read out or typed from a message
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generateTemporaryPassword(length = 16): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)]
  return out
}

// Rules for a password an admin chooses
export function checkNewPassword(current: string, next: string): string | null {
  if (next.length < 12) return 'The new password must be at least 12 characters'
  if (next.length > 200) return 'The new password is too long'
  if (next === current) return 'The new password must be different from the current one'
  if (new Set(next).size < 5) return 'The new password is too repetitive'
  return null
}
