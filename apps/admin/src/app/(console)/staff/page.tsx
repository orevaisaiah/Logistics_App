'use client'

import { useState } from 'react'
import ActionForm from '@/components/ActionForm'
import { useSession } from '@/components/SessionProvider'
import { Badge, Notice, PageHeader, Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useApi } from '@/lib/hooks'
import { ROLE_LABELS, type AdminRole } from '@/lib/roles'

interface Member {
  id: string
  fullName: string | null
  phone: string
  adminRole: AdminRole
  status: 'ACTIVE' | 'SUSPENDED'
  mustChangePassword: boolean
  createdAt: string
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))

export default function StaffPage() {
  const { can, me } = useSession()
  const staff = useApi<Member[]>(can('staff') ? '/v1/admin/staff' : null)
  // A temporary password is shown once, here, and never again
  const [credential, setCredential] = useState<{ name: string; phone: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  if (!can('staff')) return <Notice tone="warning">Only super admins can manage staff.</Notice>

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this password', text)
    }
  }

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Give each person the narrowest role that lets them do their job."
        actions={
          <ActionForm
            label="Add staff member"
            tone="primary"
            confirmLabel="Create account"
            fields={[
              { name: 'fullName', label: 'Full name', required: true, minLength: 2 },
              { name: 'phone', label: 'Phone number', required: true, placeholder: '08000000002' },
              { name: 'adminRole', label: 'Role', kind: 'select', initial: 'SUPPORT', options: ROLE_OPTIONS },
            ]}
            onSubmit={async (v) => {
              const created = await api<{ fullName: string | null; phone: string; temporaryPassword: string }>('/v1/admin/staff', { method: 'POST', body: { fullName: v.fullName, phone: v.phone, adminRole: v.adminRole } })
              setCredential({ name: created.fullName ?? created.phone, phone: created.phone, password: created.temporaryPassword })
            }}
            onDone={staff.reload}
          />
        }
      />

      {credential ? (
        <Notice tone="warning">
          <div className="stack">
            <strong>Temporary password for {credential.name} ({credential.phone})</strong>
            <code className="secret">{credential.password}</code>
            <span>This is shown only once. Send it to them privately. They must replace it the first time they sign in.</span>
            <div className="row">
              <button className="btn btn-secondary btn-sm" onClick={() => void copy(credential.password)}>{copied ? 'Copied' : 'Copy password'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCredential(null)}>I have passed it on</button>
            </div>
          </div>
        </Notice>
      ) : null}

      <section className="card">
        {staff.loading ? <Spinner /> : null}
        {staff.error ? <Notice tone="danger">{staff.error.message}</Notice> : null}
        {staff.data ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Added</th><th /></tr></thead>
              <tbody>
                {staff.data.map((m) => {
                  const self = m.id === me.id
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.fullName ?? 'No name'}</strong> {self ? <span className="muted small">(you)</span> : null}
                        <div className="muted small">{m.phone}</div>
                      </td>
                      <td>{ROLE_LABELS[m.adminRole]}</td>
                      <td>
                        <Badge tone={m.status === 'ACTIVE' ? 'success' : 'danger'}>{m.status.toLowerCase()}</Badge>
                        {m.mustChangePassword ? <div className="muted small">Has not set a password yet</div> : null}
                      </td>
                      <td className="small">{formatDateTime(m.createdAt)}</td>
                      <td>
                        {self ? null : (
                          <div className="stack">
                            <ActionForm label="Change role" small confirmLabel="Save role" fields={[{ name: 'adminRole', label: 'Role', kind: 'select', initial: m.adminRole, options: ROLE_OPTIONS }]} onSubmit={(v) => api(`/v1/admin/staff/${m.id}`, { method: 'PATCH', body: { adminRole: v.adminRole } })} onDone={staff.reload} />
                            {m.status === 'ACTIVE' ? (
                              <ActionForm label="Suspend" small tone="danger" confirmText="They are signed out everywhere straight away and cannot sign in until reactivated." confirmLabel="Suspend" onSubmit={() => api(`/v1/admin/staff/${m.id}`, { method: 'PATCH', body: { status: 'SUSPENDED' } })} onDone={staff.reload} />
                            ) : (
                              <ActionForm label="Reactivate" small tone="primary" confirmLabel="Reactivate" onSubmit={() => api(`/v1/admin/staff/${m.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } })} onDone={staff.reload} />
                            )}
                            <ActionForm
                              label="Reset password"
                              small
                              confirmText="They are signed out and given a new temporary password."
                              confirmLabel="Reset"
                              onSubmit={async () => {
                                const result = await api<{ temporaryPassword: string }>(`/v1/admin/staff/${m.id}/reset-password`, { method: 'POST' })
                                setCredential({ name: m.fullName ?? m.phone, phone: m.phone, password: result.temporaryPassword })
                              }}
                              onDone={staff.reload}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}
