'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, type FormEvent } from 'react'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { formatNaira, koboToNairaText, nairaToKobo, VEHICLE_LABELS, VEHICLE_TYPES } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import { parseCenter, parseCoord } from '@/lib/location'

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false, loading: () => <div className="map map-loading">Loading map...</div> })

interface Zone {
  id: string
  name: string
  centerLat: number
  centerLng: number
  radiusKm: number
  isActive: boolean
}
interface Rate {
  vehicleType: string
  baseFee: number
  perKmFee: number
  perKgFee: number
  includedWeightKg: number
  maxWeightKg: number
  minFee: number
  isActive: boolean
}

type ZoneForm = { name: string; lat: string; lng: string; radiusKm: string; isActive: boolean }

// Create or edit a service area: a circle on the map. Deliveries can only be booked when both
// the pickup and the drop-off are inside the same active zone.
function ZoneEditor({ initial, submitLabel, onSubmit, onCancel }: { initial: ZoneForm; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const center = useMemo(() => parseCenter(process.env.NEXT_PUBLIC_DEFAULT_CENTER), [])
  const lat = parseCoord(form.lat, -90, 90)
  const lng = parseCoord(form.lng, -180, 180)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const radius = Number(form.radiusKm)
    if (form.name.trim().length < 2) return setError('Give the zone a name.')
    if (lat === null || lng === null) return setError('Click the map to set the centre of the zone.')
    if (!(radius >= 0.5 && radius <= 200)) return setError('The radius must be between 0.5 and 200 km.')
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ name: form.name.trim(), centerLat: lat, centerLng: lng, radiusKm: radius, isActive: form.isActive })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={(e) => void submit(e)}>
      <h2>{submitLabel}</h2>
      <label className="field">
        <span>Zone name</span>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lagos Mainland" />
      </label>
      <div className="stack">
        <span className="muted small">Click the map to place the centre of the zone.</span>
        <MapPicker lat={lat} lng={lng} center={center} onPick={(la, ln) => setForm({ ...form, lat: la.toFixed(6), lng: ln.toFixed(6) })} />
      </div>
      <div className="two-col">
        <label className="field">
          <span>Radius (km)</span>
          <input className="input" inputMode="decimal" value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          <span>Active (accepting deliveries)</span>
        </label>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save zone'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function RatesTable({ zone, canEdit }: { zone: Zone; canEdit: boolean }) {
  const rates = useApi<Rate[]>(`/v1/admin/zones/${zone.id}/rates`)
  if (rates.loading) return <Spinner />
  if (rates.error || !rates.data) return <Notice tone="danger">{rates.error?.message ?? 'Could not load rates.'}</Notice>

  return (
    <div className="stack">
      {VEHICLE_TYPES.map((vehicle) => {
        const rate = rates.data?.find((r) => r.vehicleType === vehicle)
        return (
          <article key={vehicle} className="item stack">
            <div className="row row-between">
              <strong>{VEHICLE_LABELS[vehicle]}</strong>
              {rate ? <Badge tone={rate.isActive ? 'success' : 'neutral'}>{rate.isActive ? 'active' : 'switched off'}</Badge> : <Badge tone="warning">no rate set: not available here</Badge>}
            </div>
            {rate ? (
              <dl className="summary">
                <div><dt>Base fee</dt><dd>{formatNaira(rate.baseFee)}</dd></div>
                <div><dt>Per kilometre</dt><dd>{formatNaira(rate.perKmFee)}</dd></div>
                <div><dt>Per kg above {rate.includedWeightKg} kg</dt><dd>{formatNaira(rate.perKgFee)}</dd></div>
                <div><dt>Heaviest allowed</dt><dd>{rate.maxWeightKg} kg</dd></div>
                <div><dt>Minimum fee</dt><dd>{formatNaira(rate.minFee)}</dd></div>
              </dl>
            ) : null}
            {canEdit ? (
              <div>
                <ActionForm
                  label={rate ? 'Edit rate' : 'Set rate'}
                  small
                  tone={rate ? 'secondary' : 'primary'}
                  confirmLabel="Save rate"
                  fields={[
                    { name: 'baseFee', label: 'Base fee (naira)', required: true, initial: rate ? koboToNairaText(rate.baseFee) : '', placeholder: '800' },
                    { name: 'perKmFee', label: 'Fee per kilometre (naira)', required: true, initial: rate ? koboToNairaText(rate.perKmFee) : '', placeholder: '150' },
                    { name: 'perKgFee', label: 'Fee per extra kg (naira)', required: true, initial: rate ? koboToNairaText(rate.perKgFee) : '', placeholder: '50' },
                    { name: 'includedWeightKg', label: 'Weight included in the base fee (kg)', required: true, initial: rate ? String(rate.includedWeightKg) : '', placeholder: '5' },
                    { name: 'maxWeightKg', label: 'Heaviest package allowed (kg)', required: true, initial: rate ? String(rate.maxWeightKg) : '', placeholder: '30' },
                    { name: 'minFee', label: 'Minimum fee (naira)', required: true, initial: rate ? koboToNairaText(rate.minFee) : '', placeholder: '1200', help: 'Prices are rounded up to the next 50 naira. The placeholders are examples only.' },
                    { name: 'isActive', label: 'Available to customers', kind: 'select', initial: rate && !rate.isActive ? 'false' : 'true', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No, switch it off' }] },
                  ]}
                  onSubmit={async (v) => {
                    const money = (text: string, label: string) => {
                      const kobo = nairaToKobo(text)
                      if (kobo === null) throw new Error(`${label} must be an amount in naira, for example 800.`)
                      return kobo
                    }
                    const weight = (text: string, label: string) => {
                      const n = Number(text)
                      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of kilograms.`)
                      return n
                    }
                    const max = weight(v.maxWeightKg, 'Heaviest package')
                    if (max <= 0) throw new Error('The heaviest package must be more than 0 kg.')
                    await api(`/v1/admin/zones/${zone.id}/rates/${vehicle}`, {
                      method: 'PUT',
                      body: {
                        baseFee: money(v.baseFee, 'Base fee'),
                        perKmFee: money(v.perKmFee, 'Fee per kilometre'),
                        perKgFee: money(v.perKgFee, 'Fee per extra kg'),
                        includedWeightKg: weight(v.includedWeightKg, 'Included weight'),
                        maxWeightKg: max,
                        minFee: money(v.minFee, 'Minimum fee'),
                        isActive: v.isActive === 'true',
                      },
                    })
                  }}
                  onDone={rates.reload}
                />
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

export default function PricingPage() {
  const { can } = useSession()
  const zones = useApi<Zone[]>(can('pricing') ? '/v1/admin/zones' : null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')

  if (!can('pricing')) return <Notice tone="warning">Your role cannot change pricing.</Notice>
  if (zones.loading) return <Spinner label="Loading zones" />
  if (zones.error || !zones.data) return <Notice tone="danger">{zones.error?.message ?? 'Could not load zones.'}</Notice>

  const list = zones.data
  const selected = list.find((z) => z.id === selectedId) ?? list[0]

  return (
    <>
      <PageHeader title="Pricing" subtitle="A zone is a service area. Each zone has its own rates for each vehicle." actions={<button className="btn btn-primary" onClick={() => setMode('create')}>New zone</button>} />

      {list.length === 0 && mode !== 'create' ? <Notice tone="warning">There are no zones yet, so nobody can book a delivery. Create your first zone.</Notice> : null}

      <div className="two-col two-col-wide">
        <div className="stack">
          {mode === 'create' ? (
            <ZoneEditor
              initial={{ name: '', lat: '', lng: '', radiusKm: '25', isActive: true }}
              submitLabel="New zone"
              onCancel={() => setMode('view')}
              onSubmit={async (body) => {
                const created = await api<Zone>('/v1/admin/zones', { method: 'POST', body })
                setSelectedId(created.id)
                setMode('view')
                zones.reload()
              }}
            />
          ) : null}

          {mode === 'edit' && selected ? (
            <ZoneEditor
              initial={{ name: selected.name, lat: String(selected.centerLat), lng: String(selected.centerLng), radiusKm: String(selected.radiusKm), isActive: selected.isActive }}
              submitLabel={`Edit ${selected.name}`}
              onCancel={() => setMode('view')}
              onSubmit={async (body) => {
                await api(`/v1/admin/zones/${selected.id}`, { method: 'PATCH', body })
                setMode('view')
                zones.reload()
              }}
            />
          ) : null}

          {mode === 'view' && selected ? (
            <section className="card stack">
              <div className="row row-between">
                <h2>{selected.name}</h2>
                <div className="row">
                  <Badge tone={selected.isActive ? 'success' : 'neutral'}>{selected.isActive ? 'active' : 'switched off'}</Badge>
                  <button className="btn btn-secondary btn-sm" onClick={() => setMode('edit')}>Edit zone</button>
                </div>
              </div>
              <p className="muted small">Radius {selected.radiusKm} km around {selected.centerLat.toFixed(4)}, {selected.centerLng.toFixed(4)}</p>
              <h2>Rates</h2>
              <RatesTable zone={selected} canEdit />
            </section>
          ) : null}
        </div>

        <aside className="card stack">
          <h2>Zones</h2>
          {list.length === 0 ? <p className="muted">None yet.</p> : null}
          {list.map((z) => (
            <button key={z.id} className={selected?.id === z.id ? 'zone-button zone-active' : 'zone-button'} onClick={() => { setSelectedId(z.id); setMode('view') }}>
              <strong>{z.name}</strong>
              <span className="muted small">{z.radiusKm} km · {z.isActive ? 'active' : 'off'}</span>
            </button>
          ))}
        </aside>
      </div>
    </>
  )
}
