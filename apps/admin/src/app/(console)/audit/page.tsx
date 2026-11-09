'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useSession } from '@/components/SessionProvider'
import { Notice, PageHeader, Pager, Spinner } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import type { Page } from '@/lib/types'

const PAGE_SIZE = 25

interface Entry {
  id: string
  action: string
  entityType: string
  entityId: string
  meta: unknown
  createdAt: string
  admin: { fullName: string | null; phone: string }
}

function entityLink(type: string, id: string): string | null {
  if (type === 'Delivery') return `/deliveries/${id}`
  if (type === 'Rider') return `/riders/${id}`
  if (type === 'Business') return `/businesses/${id}`
  if (type === 'Wallet') return `/finance/wallets/${id}`
  return null
}

export default function AuditPage() {
  const { can } = useSession()
  const [filters, setFilters] = useState({ action: '', entityType: '', entityId: '' })
  const [applied, setApplied] = useState({ action: '', entityType: '', entityId: '' })
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) })
  for (const [key, value] of Object.entries(applied)) if (value) params.set(key, value)
  const list = useApi<Page<Entry>>(can('audit') ? `/v1/admin/audit-logs?${params.toString()}` : null)

  if (!can('audit')) return <Notice tone="warning">Only super admins can read the audit log.</Notice>

  function apply(event: FormEvent) {
    event.preventDefault()
    setApplied({ action: filters.action.trim(), entityType: filters.entityType.trim(), entityId: filters.entityId.trim() })
    setPage(1)
  }

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what. Entries cannot be edited or deleted." />
      <form className="card row" onSubmit={apply}>
        <label className="field"><span>Action</span><input className="input" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="RIDER_APPROVED" /></label>
        <label className="field"><span>Record type</span><input className="input" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} placeholder="Delivery" /></label>
        <label className="field"><span>Record id</span><input className="input" value={filters.entityId} onChange={(e) => setFilters({ ...filters, entityId: e.target.value })} /></label>
        <button className="btn btn-primary">Filter</button>
      </form>

      <section className="card">
        {list.loading ? <Spinner /> : null}
        {list.error ? <Notice tone="danger">{list.error.message}</Notice> : null}
        {list.data && list.data.items.length === 0 ? <p className="muted">No entries match.</p> : null}
        {list.data && list.data.items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {list.data.items.map((e) => {
                  const link = entityLink(e.entityType, e.entityId)
                  return (
                    <tr key={e.id}>
                      <td className="small">{formatDateTime(e.createdAt)}</td>
                      <td>{e.admin.fullName ?? e.admin.phone}</td>
                      <td className="mono small">{e.action}</td>
                      <td className="small">{e.entityType}{link ? <> · <Link href={link}>open</Link></> : null}<div className="muted ellipsis">{e.entityId}</div></td>
                      <td>{e.meta ? <details><summary>View</summary><pre className="pre">{JSON.stringify(e.meta, null, 2)}</pre></details> : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {list.data ? <Pager page={page} total={list.data.total} limit={PAGE_SIZE} onChange={setPage} /> : null}
      </section>
    </>
  )
}
