export type LocationValue = { address: string; lat: string; lng: string }
export const emptyLocation: LocationValue = { address: '', lat: '', lng: '' }

// Coordinates are typed or picked as text. This turns them into numbers, or null if they are not valid.
export function parseCoord(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function locationPoint(v: LocationValue): { lat: number; lng: number } | null {
  const lat = parseCoord(v.lat, -90, 90)
  const lng = parseCoord(v.lng, -180, 180)
  return lat !== null && lng !== null ? { lat, lng } : null
}

// "6.5244,3.3792" -> [6.5244, 3.3792]. Falls back to Lagos.
export function parseCenter(value: string | undefined): [number, number] {
  const fallback: [number, number] = [6.5244, 3.3792]
  if (!value) return fallback
  const [lat, lng] = value.split(',').map((part) => Number(part.trim()))
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : fallback
}

export type SavedPlace = { name: string; address: string; lat: string; lng: string }
const STORAGE_KEY = 'lg_saved_places_v1'
const MAX_SAVED = 20

function isSavedPlace(value: unknown): value is SavedPlace {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return ['name', 'address', 'lat', 'lng'].every((k) => typeof v[k] === 'string')
}

// Frequently used pickup points are remembered in this browser only
export function loadSavedPlaces(): SavedPlace[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSavedPlace) : []
  } catch {
    return []
  }
}

export function savePlaces(places: SavedPlace[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(places.slice(0, MAX_SAVED)))
  } catch {
    // storage is full or blocked: the feature simply does not remember
  }
}

export function addSavedPlace(existing: SavedPlace[], place: SavedPlace): SavedPlace[] {
  const others = existing.filter((p) => !(p.lat === place.lat && p.lng === place.lng))
  return [place, ...others].slice(0, MAX_SAVED)
}
