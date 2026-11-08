'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError, errorMessage } from '@/lib/api'
import type { Business, Me } from '@/lib/types'
import { Notice, Spinner } from './ui'

type Session = {
  me: Me
  business: Business
  can: { createDeliveries: boolean; topUp: boolean; editBusiness: boolean }
  reload: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

// Checks who is signed in before showing any page. Anyone who is not signed in, or who has no
// business profile yet, is sent to the right place.
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [loaded, setLoaded] = useState<{ me: Me; business: Business } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const me = await api<Me>('/v1/me')
        if (me.role !== 'BUSINESS_USER') {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
          router.replace('/login')
          return
        }
        const business = await api<Business>('/v1/business')
        if (!cancelled) {
          setFailure(null)
          setLoaded({ me, business })
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) router.replace('/login')
        else if (err instanceof ApiError && err.code === 'NO_BUSINESS') router.replace('/onboarding')
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
        <div className="card narrow">
          <Notice tone="danger">{failure}</Notice>
          <button className="btn btn-primary" onClick={() => setTick((t) => t + 1)}>
            Try again
          </button>
        </div>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div className="center-screen">
        <Spinner label="Loading your account" />
      </div>
    )
  }

  const role = loaded.business.myRole
  const session: Session = {
    me: loaded.me,
    business: loaded.business,
    can: {
      createDeliveries: role === 'OWNER' || role === 'DISPATCHER',
      topUp: role === 'OWNER' || role === 'FINANCE',
      editBusiness: role === 'OWNER',
    },
    reload: () => setTick((t) => t + 1),
  }
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
