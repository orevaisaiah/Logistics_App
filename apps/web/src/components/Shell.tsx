'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { useSession } from './SessionProvider'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deliveries', label: 'Deliveries' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/settings', label: 'Settings' },
]

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { business, me, can } = useSession()

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    router.replace('/login')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>{business.companyName}</strong>
            <div className="muted small">{me.fullName ?? me.phone}</div>
          </div>
        </div>

        {can.createDeliveries ? (
          <Link href="/deliveries/new" className="btn btn-primary btn-block">
            New delivery
          </Link>
        ) : null}

        <nav aria-label="Main">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link key={item.href} href={item.href} className={active ? 'nav-link nav-active' : 'nav-link'} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button className="btn btn-ghost sidebar-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
