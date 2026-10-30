import { haversineKm, type LatLng } from '../pricing/pricing.js'

// A cheap rectangle around a point, used to narrow the database query
// before the exact distance is calculated in code
export function boundingBox(center: LatLng, radiusKm: number) {
  const latDelta = radiusKm / 111.32
  const lngDelta = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  }
}

// Keeps points within maxKm of "from" and sorts them nearest first
export function rankByDistance<T extends LatLng>(points: T[], from: LatLng, maxKm: number) {
  return points
    .map((point) => ({ ...point, distanceKm: haversineKm(from, point) }))
    .filter((p) => p.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}
