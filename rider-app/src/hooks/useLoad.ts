import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api'

type Result<T> = { path: string; data?: T; error?: ApiError }

// Loads data from the API. Call reload() to fetch it again.
export function useLoad<T>(path: string | null) {
  const [result, setResult] = useState<Result<T> | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    void (async () => {
      try {
        const data = await api<T>(path)
        if (!cancelled) setResult({ path, data })
      } catch (err) {
        if (!cancelled) setResult({ path, error: err instanceof ApiError ? err : new ApiError(0, 'ERROR', 'Something went wrong. Please try again.') })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path, tick])

  // Results for an older path are ignored
  const current = path && result && result.path === path ? result : null
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data: current?.data, error: current?.error, loading: path !== null && current === null, reload }
}
