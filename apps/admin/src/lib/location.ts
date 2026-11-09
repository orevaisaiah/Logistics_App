export function parseCoord(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

// "6.5244,3.3792" -> [6.5244, 3.3792]. Falls back to Lagos.
export function parseCenter(value: string | undefined): [number, number] {
  const fallback: [number, number] = [6.5244, 3.3792]
  if (!value) return fallback
  const [lat, lng] = value.split(',').map((part) => Number(part.trim()))
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : fallback
}
