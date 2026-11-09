import type { ReactNode } from 'react'
import { STATUS_LABELS, statusTone, type DeliveryStatus, type Tone } from '@/lib/format'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>
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

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className={tone ? `card stat stat-${tone}` : 'card stat'}>
      <span className="muted small">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  )
}

export function Pager({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  return (
    <div className="row row-between pager">
      <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className="muted small">
        Page {page} of {pages}
      </span>
      <button className="btn btn-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'chip chip-active' : 'chip'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Timeline({ events }: { events: { status: DeliveryStatus; createdAt: string; note?: string | null; actorType?: string }[] }) {
  const format = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })
  return (
    <ol className="timeline">
      {events.map((event, index) => (
        <li key={`${event.status}-${event.createdAt}-${index}`} className={index === events.length - 1 ? 'timeline-current' : ''}>
          <span className="timeline-dot" aria-hidden="true" />
          <div>
            <strong>{STATUS_LABELS[event.status]}</strong>
            {event.actorType ? <span className="muted small"> · {event.actorType.toLowerCase()}</span> : null}
            {event.note ? <div className="muted small">{event.note}</div> : null}
            <time className="muted small" dateTime={event.createdAt}>
              {format.format(new Date(event.createdAt))}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
