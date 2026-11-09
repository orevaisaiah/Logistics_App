import { haversineKm } from './geo'

export type BoardRider = {
  id: string
  name: string | null
  phone: string
  vehicleType: string | null
  lat: number | null
  lng: number | null
  lastSeenAt: string | null
  state: 'IDLE' | 'HAS_OFFER' | 'ON_JOB' | 'LOCATION_STALE'
  currentDelivery: { id: string; status: string } | null
}

export type Choice = { rider: BoardRider; distanceKm: number | null }

// Riders who could take a delivery: right vehicle, not already on a job. Nearest first;
// riders with no known position go last.
export function eligibleRiders(riders: BoardRider[], vehicleType: string, pickup: { lat: number; lng: number }): Choice[] {
  return riders
    .filter((r) => r.vehicleType === vehicleType && r.state !== 'ON_JOB')
    .map((rider) => ({
      rider,
      distanceKm: rider.lat !== null && rider.lng !== null ? Math.round(haversineKm({ lat: rider.lat, lng: rider.lng }, pickup) * 10) / 10 : null,
    }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}
