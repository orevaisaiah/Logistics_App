import { useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { api, ApiError } from '../api'
import { LOCATION_HEARTBEAT_MS } from '../config'

export type Coords = { latitude: number; longitude: number }

export class LocationDeniedError extends Error {
  constructor() {
    super('Location is switched off for this app. Turn it on in your phone settings so we can find deliveries near you.')
  }
}

// Asks for permission (the first time) and reads where the phone is right now
export async function getCurrentCoords(): Promise<Coords> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (permission.status !== 'granted') throw new LocationDeniedError()
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  return { latitude: position.coords.latitude, longitude: position.coords.longitude }
}

// While enabled, keeps the rider's position fresh and tells the server every few seconds.
// The server treats a position older than about two minutes as "offline", so a signal is sent even
// when the rider is standing still. Works while the app is open on screen.
export function useLocationSharing(enabled: boolean) {
  const latest = useRef<Coords | null>(null)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let subscription: Location.LocationSubscription | null = null
    let timer: ReturnType<typeof setInterval> | null = null

    const send = async () => {
      const here = latest.current
      if (!here) return
      try {
        await api('/v1/rider/location', { method: 'POST', body: { lat: here.latitude, lng: here.longitude } })
        if (!cancelled) {
          setLastSentAt(Date.now())
          setProblem(null)
        }
      } catch (err) {
        // NOT_ONLINE just means the rider is not working right now, which is fine
        if (!cancelled && !(err instanceof ApiError && err.code === 'NOT_ONLINE')) {
          setProblem('Your location is not reaching the server. Check your internet connection.')
        }
      }
    }

    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        if (!cancelled) setProblem('Location permission is off. Turn it on in your phone settings.')
        return
      }
      try {
        const first = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        latest.current = { latitude: first.coords.latitude, longitude: first.coords.longitude }
      } catch {
        // the watcher below will provide a position as soon as there is one
      }
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (position) => {
          latest.current = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        },
      )
      if (cancelled) {
        subscription.remove()
        return
      }
      void send()
      timer = setInterval(() => void send(), LOCATION_HEARTBEAT_MS)
    })()

    return () => {
      cancelled = true
      subscription?.remove()
      if (timer) clearInterval(timer)
    }
  }, [enabled])

  return { latest, lastSentAt, problem }
}
