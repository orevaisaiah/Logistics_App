'use client'

import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Leaflet = typeof import('leaflet')

// Leaflet is loaded only in the browser. Depending on the bundler, the library arrives either
// directly or under ".default", so both are handled.
async function loadLeaflet(): Promise<Leaflet> {
  const mod = (await import('leaflet')) as unknown as { default?: Leaflet } & Leaflet
  return mod.default ?? mod
}

type Props = {
  lat: number | null
  lng: number | null
  center: [number, number]
  onPick: (lat: number, lng: number) => void
}

export default function MapPicker({ lat, lng, center, onPick }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<CircleMarker | null>(null)
  const leaflet = useRef<Leaflet | null>(null)
  const pickHandler = useRef(onPick)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    pickHandler.current = onPick
  }, [onPick])

  // Build the map once
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const L = await loadLeaflet()
      if (cancelled || !container.current || map.current) return
      leaflet.current = L
      const created = L.map(container.current).setView(lat !== null && lng !== null ? [lat, lng] : center, lat !== null ? 15 : 12)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(created)
      created.on('click', (event) => pickHandler.current(event.latlng.lat, event.latlng.lng))
      map.current = created
      setReady(true)
    })()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      marker.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const L = leaflet.current
    const current = map.current
    if (!ready || !L || !current || lat === null || lng === null) return
    if (marker.current) {
      marker.current.setLatLng([lat, lng])
    } else {
      marker.current = L.circleMarker([lat, lng], { radius: 10, color: '#0f766e', fillColor: '#0f766e', fillOpacity: 0.85 }).addTo(current)
    }
    current.setView([lat, lng], Math.max(current.getZoom(), 15))
  }, [ready, lat, lng])

  return <div ref={container} className="map" aria-label="Map. Click to place the pin." />
}
