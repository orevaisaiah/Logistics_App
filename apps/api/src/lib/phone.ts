// Accepts 0803..., 234803..., +234803... and returns +234803..., or null if invalid
export function normalizeNgPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '')
  if (/^\+234\d{10}$/.test(digits)) return digits
  if (/^234\d{10}$/.test(digits)) return `+${digits}`
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`
  return null
}
