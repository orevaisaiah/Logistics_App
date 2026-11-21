// Checks on what the rider types. The API checks everything again; these give instant, plain feedback.

const pad = (n: number) => String(n).padStart(2, '0')

// "12/03/1995", "12-3-1995" or "1995-03-12" -> "1995-03-12", or an error message
export function validateDob(input: string, now: Date): { iso: string } | { error: string } {
  const text = input.trim()
  let year: number, month: number, day: number
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text)
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])]
  else if (ymd) [year, month, day] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])]
  else return { error: 'Enter your date of birth like 12/03/1995 (day/month/year).' }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: 'That date does not exist. Check the day and month.' }
  }
  let age = now.getUTCFullYear() - year
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1
  if (age < 18) return { error: 'You must be at least 18 years old to ride.' }
  if (age > 80) return { error: 'Check the year of birth.' }
  return { iso: `${year}-${pad(month)}-${pad(day)}` }
}

export const isAccountNumber = (text: string) => /^\d{10}$/.test(text.trim())

// "1,500.50" -> 150050 (kobo), or null. Works on the text, so there are no rounding surprises.
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return Number.isSafeInteger(kobo) ? kobo : null
}

export function validateWithdrawal(amountText: string, balanceKobo: number, minKobo: number): { kobo: number } | { error: string } {
  const kobo = nairaToKobo(amountText)
  if (kobo === null) return { error: 'Enter the amount in naira, for example 2500.' }
  if (kobo < minKobo) return { error: `The smallest withdrawal is ${Math.round(minKobo / 100).toLocaleString('en-US')} naira.` }
  if (kobo > balanceKobo) return { error: 'You do not have that much in your wallet.' }
  return { kobo }
}

export const isDeliveryCode = (text: string) => /^\d{4}$/.test(text.trim())
