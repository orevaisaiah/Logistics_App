import type { ReactNode } from 'react'
import { STATUS_LABELS, statusTone, type Tone } from '@/lib/format'
import type { DeliveryStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={`badge badge-${statusTone(status)}`}>{STATUS_LABELS[status]}</span>
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function Timeline({ events }: { events: { status: DeliveryStatus; createdAt: string; note?: string | null }[] }) {
  return (
    <ol className="timeline">
      {events.map((event, index) => (
        <li key={`${event.status}-${event.createdAt}-${index}`} className={index === events.length - 1 ? 'timeline-current' : ''}>
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <strong>{STATUS_LABELS[event.status]}</strong>
            {event.note ? <div className="muted small">{event.note}</div> : null}
            <time className="muted small" dateTime={event.createdAt}>
              {new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(event.createdAt))}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
