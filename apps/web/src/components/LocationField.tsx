'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { addSavedPlace, loadSavedPlaces, locationPoint, savePlaces, type LocationValue, type SavedPlace } from '@/lib/location'

const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="map map-loading">Loading map...</div>,
})

type SearchResult = { lat: string; lon: string; display_name: string }

type Props = {
  title: string
  value: LocationValue
  onChange: (value: LocationValue) => void
  center: [number, number]
}

export default function LocationField({ title, value, onChange, center }: Props) {
  const [showMap, setShowMap] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedPlace[]>([])
  const point = locationPoint(value)

  // Saved places live in this browser's storage, which is only available once the page has loaded
  useEffect(() => {
    const timer = setTimeout(() => setSaved(loadSavedPlaces()), 0)
    return () => clearTimeout(timer)
  }, [])

  const setPin = (lat: number, lng: number, address?: string) =>
    onChange({ address: address ?? value.address, lat: lat.toFixed(6), lng: lng.toFixed(6) })

  async function search() {
    setSearching(true)
    setMessage(null)
    setResults([])
    try {
      // OpenStreetMap's free address search. Fine for getting started; for heavy use, switch to Google Places or Mapbox.
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ng&q=${encodeURIComponent(value.address.trim())}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const found = (await res.json()) as SearchResult[]
      setResults(found)
      if (found.length === 0) setMessage('No match. Try a nearby landmark or area name, or pick the spot on the map.')
    } catch {
      setMessage('Address search is not available right now. Pick the spot on the map instead.')
    } finally {
      setSearching(false)
    }
  }

  function locateMe() {
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage('Your browser cannot share its location. Pick the spot on the map instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setPin(position.coords.latitude, position.coords.longitude),
      () => setMessage('Could not get your location. Allow location access, or pick the spot on the map.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  function rememberPlace() {
    if (!point) return
    const name = value.address.trim().slice(0, 50) || `${value.lat}, ${value.lng}`
    const next = addSavedPlace(saved, { name, address: value.address, lat: value.lat, lng: value.lng })
    setSaved(next)
    savePlaces(next)
  }

  function forgetPlace(place: SavedPlace) {
    const next = saved.filter((p) => p !== place)
    setSaved(next)
    savePlaces(next)
  }

  return (
    <fieldset className="location">
      <legend>{title}</legend>

      {saved.length > 0 ? (
        <div className="saved">
          <span className="muted small">Saved places</span>
          <div className="chips">
            {saved.map((place) => (
              <span key={`${place.lat}-${place.lng}`} className="chip chip-saved">
                <button type="button" onClick={() => onChange({ address: place.address, lat: place.lat, lng: place.lng })}>
                  {place.name}
                </button>
                <button type="button" aria-label={`Remove ${place.name}`} onClick={() => forgetPlace(place)}>
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <label className="field">
        <span>Address</span>
        <input
          className="input"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="Street, area, city"
          autoComplete="off"
        />
      </label>

      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => void search()} disabled={searching || value.address.trim().length < 3}>
          {searching ? 'Searching...' : 'Search address'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={locateMe}>
          Use my location
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowMap((s) => !s)}>
          {showMap ? 'Hide map' : 'Pick on map'}
        </button>
      </div>

      {message ? <p className="hint">{message}</p> : null}

      {results.length > 0 ? (
        <ul className="results">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lon}-${r.display_name}`}>
              <button
                type="button"
                onClick={() => {
                  setPin(Number(r.lat), Number(r.lon), r.display_name)
                  setResults([])
                  setShowMap(true)
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showMap ? (
        <MapPicker lat={point?.lat ?? null} lng={point?.lng ?? null} center={center} onPick={(lat, lng) => setPin(lat, lng)} />
      ) : null}

      <p className={point ? 'pin-ok small' : 'hint small'}>
        {point ? `Pin set at ${value.lat}, ${value.lng}` : 'No pin yet. Search the address, use your location, or click the map.'}
        {point ? (
          <button type="button" className="link-button" onClick={rememberPlace}>
            Save this place
          </button>
        ) : null}
      </p>

      <details>
        <summary>Enter coordinates manually</summary>
        <div className="two-col">
          <label className="field">
            <span>Latitude</span>
            <input className="input" inputMode="decimal" value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} placeholder="6.5244" />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input className="input" inputMode="decimal" value={value.lng} onChange={(e) => onChange({ ...value, lng: e.target.value })} placeholder="3.3792" />
          </label>
        </div>
      </details>
    </fieldset>
  )
}
