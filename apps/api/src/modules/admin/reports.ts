// Pure helpers for reports. Nigeria has no daylight saving, so Lagos is always UTC+1.
const LAGOS_OFFSET_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Midnight (Lagos time) at the start of the day that contains "date", as a real moment in time
export function lagosDayStart(date: Date): Date {
  const shifted = new Date(date.getTime() + LAGOS_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - LAGOS_OFFSET_MS)
}

// "2026-10-30" as seen in Lagos
export function lagosDayString(date: Date): string {
  return new Date(date.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
}

// The moment a Lagos calendar day begins
export function dayToInstant(day: string): Date {
  return new Date(`${day}T00:00:00+01:00`)
}

export function addDaysToDay(day: string, days: number): string {
  return new Date(dayToInstant(day).getTime() + days * DAY_MS + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
}

// Every day from "from" to "to", inclusive
export function listDays(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDaysToDay(day, 1)) days.push(day)
  return days
}

// Start of "from" up to the end of "to" (exclusive)
export function rangeInstants(from: string, to: string) {
  return { start: dayToInstant(from), end: new Date(dayToInstant(to).getTime() + DAY_MS) }
}

// a / b as a number between 0 and 1, or null when there is nothing to divide by
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : Math.round((a / b) * 1000) / 1000
}
