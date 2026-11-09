'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from './api'

type Result<T> = { path: string; data?: T; error?: ApiError }

// Loads data from the API, optionally refreshing it every few seconds. Pass null to skip loading.
// If the sign-in has expired, the visitor is sent to the sign-in page.
export function useApi<T>(path: string | null, options: { refreshMs?: number } = {}) {
  const router = useRouter()
  const [result, setResult] = useState<Result<T> | null>(null)
  const [tick, setTick] = useState(0)
  const { refreshMs } = options

  useEffect(() => {
    if (!path) return
    let cancelled = false

    const load = async () => {
      try {
        const data = await api<T>(path)
        if (!cancelled) setResult({ path, data })
      } catch (err) {
        if (cancelled) return
        const error = err instanceof ApiError ? err : new ApiError(0, 'ERROR', 'Something went wrong. Please try again.')
        if (error.status === 401) {
          router.replace('/login')
          return
        }
        setResult({ path, error })
      }
    }

    void load()
    const timer = refreshMs ? setInterval(() => void load(), refreshMs) : undefined
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [path, refreshMs, tick, router])

  // Results for an older path are ignored, so changing a filter never shows stale data
  const current = path && result && result.path === path ? result : null
  return {
    data: current?.data,
    error: current?.error,
    loading: path !== null && current === null,
    reload: () => setTick((t) => t + 1),
  }
}
