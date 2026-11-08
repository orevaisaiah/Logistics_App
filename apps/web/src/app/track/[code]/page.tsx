'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Notice, Spinner, StatusBadge, Timeline } from '@/components/ui'
import { STATUS_LABELS } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { PublicTracking } from '@/lib/types'

// Open to anyone with the code: it shows progress only, never addresses, names or prices
export default function TrackPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(String(params.code))
  const tracking = useApi<PublicTracking>(`/v1/track/${encodeURIComponent(code)}`, { refreshMs: 10_000 })
  const t = tracking.data

  return (
    <div className="center-screen">
      <div className="card narrow stack">
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true" />
          <strong>Delivery tracking</strong>
        </div>

        {tracking.loading ? <Spinner label="Looking up your delivery" /> : null}
        {tracking.error ? (
          <Notice tone="danger">
            {tracking.error.status === 404 ? 'We could not find a delivery with that code. Check the code and try again.' : tracking.error.message}
          </Notice>
        ) : null}

        {t ? (
          <>
            <div>
              <span className="muted small">Tracking code</span>
              <h1 className="mono">{t.trackingCode}</h1>
              <StatusBadge status={t.status} />
            </div>
            <p className="muted">
              {t.status === 'DELIVERED' ? 'Your package has been delivered.' : `Current status: ${STATUS_LABELS[t.status]}. This page updates by itself.`}
            </p>
            <Timeline events={t.events} />
          </>
        ) : null}

        <Link href="/track" className="small">
          Track another delivery
        </Link>
      </div>
    </div>
  )
}
