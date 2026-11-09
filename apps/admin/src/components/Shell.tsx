'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { ROLE_LABELS, type Area } from '@/lib/roles'
import { useSession } from './SessionProvider'

type NavItem = { href: string; label: string; area: Area }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ href: '/overview', label: 'Overview', area: 'overview' }] },
  {
    group: 'Operations',
    items: [
      { href: '/dispatch', label: 'Dispatch board', area: 'dispatchBoard' },
      { href: '/deliveries', label: 'Deliveries', area: 'deliveries' },
      { href: '/riders', label: 'Riders', area: 'riderReview' },
      { href: '/businesses', label: 'Businesses', area: 'businesses' },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/finance', label: 'Finance', area: 'finance' },
      { href: '/finance/withdrawals', label: 'Withdrawals', area: 'finance' },
      { href: '/finance/wallets', label: 'Wallets', area: 'finance' },
    ],
  },
  {
    group: 'Setup and insight',
    items: [
      { href: '/pricing', label: 'Pricing', area: 'pricing' },
      { href: '/reports', label: 'Reports', area: 'reports' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { href: '/staff', label: 'Staff', area: 'staff' },
      { href: '/audit', label: 'Audit log', area: 'audit' },
    ],
  },
]

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { me, can } = useSession()

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login')
  }

  // The most specific matching link is the active one (so "Finance" is not lit up on the Withdrawals page)
  const links = NAV.flatMap((g) => g.items)
  const active = links
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Admin panel</strong>
            <div className="muted small">
              {me.fullName ?? me.phone} · {ROLE_LABELS[me.adminRole]}
            </div>
          </div>
        </div>

        <nav aria-label="Main">
          {NAV.map((group) => {
            const visible = group.items.filter((i) => can(i.area))
            if (visible.length === 0) return null
            return (
              <div key={group.group} className="nav-group">
                <span className="nav-heading">{group.group}</span>
                {visible.map((item) => (
                  <Link key={item.href} href={item.href} className={active === item.href ? 'nav-link nav-active' : 'nav-link'} aria-current={active === item.href ? 'page' : undefined}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <Link href="/change-password" className="nav-link">
            Change password
          </Link>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
