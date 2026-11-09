'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/api'
import { canAccess, type AdminRole, type Area } from '@/lib/roles'
import { Notice, Spinner } from './ui'

export interface Staff {
  id: string
  fullName: string | null
  phone: string
  adminRole: AdminRole
  status: 'ACTIVE' | 'SUSPENDED'
  mustChangePassword: boolean
}

type Session = { me: Staff; can: (area: Area) => boolean }
const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

// Checks who is signed in before showing any page
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [me, setMe] = useState<Staff | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const staff = await api<Staff>('/v1/admin/auth/me')
        if (cancelled) return
        if (staff.mustChangePassword) router.replace('/change-password')
        else {
          setFailure(null)
          setMe(staff)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace('/login')
        else setFailure(errorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick, router])

  if (failure) {
    return (
      <div className="center-screen">
        <div className="card narrow stack">
          <Notice tone="danger">{failure}</Notice>
          <button className="btn btn-primary" onClick={() => setTick((t) => t + 1)}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!me) {
    return (
      <div className="center-screen">
        <Spinner label="Checking your sign-in" />
      </div>
    )
  }
  return <SessionContext.Provider value={{ me, can: (area) => canAccess(me.adminRole, area) }}>{children}</SessionContext.Provider>
}
