'use client'

import { useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Leaflet = typeof import('leaflet')

async function loadLeaflet(): Promise<Leaflet> {
  const mod = (await import('leaflet')) as unknown as { default?: Leaflet } & Leaflet
  return mod.default ?? mod
}

export type MapMarker = { lat: number; lng: number; color: string; label: string; big?: boolean }

// Riders and waiting pickups on one map. Names come from the database, so tooltips are built
// as plain text and never as HTML.
export default function BoardMap({ markers, center }: { markers: MapMarker[]; center: [number, number] }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const leaflet = useRef<Leaflet | null>(null)
  const fitted = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const L = await loadLeaflet()
      if (cancelled || !container.current || map.current) return
      leaflet.current = L
      const created = L.map(container.current).setView(center, 12)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(created)
      layer.current = L.layerGroup().addTo(created)
      map.current = created
      setReady(true)
    })()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      layer.current = null
      fitted.current = false
      setReady(false)
    }
    // The map is created once. Markers are redrawn by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const L = leaflet.current
    const group = layer.current
    const current = map.current
    if (!ready || !L || !group || !current) return
    group.clearLayers()
    for (const m of markers) {
      const tip = document.createElement('div')
      tip.textContent = m.label
      L.circleMarker([m.lat, m.lng], { radius: m.big ? 11 : 8, color: m.color, fillColor: m.color, fillOpacity: 0.85, weight: 2 })
        .bindTooltip(tip)
        .addTo(group)
    }
    // Zoom to fit the first time there is something to show; after that, leave the view where the admin put it
    if (!fitted.current && markers.length > 0) {
      current.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 })
      fitted.current = true
    }
  }, [ready, markers])

  return <div ref={container} className="map map-tall" aria-label="Map of riders and waiting pickups" />
}
