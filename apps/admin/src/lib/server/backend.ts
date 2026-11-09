import type { NextResponse } from 'next/server'
import { refreshOnce, type Tokens } from './refresh'

// Where the logistics API lives. Only this website's server uses it, never the browser.
export const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')

// Different names from the business dashboard, because cookies on "localhost" are shared between ports
export const ACCESS_COOKIE = 'lga_access'
export const REFRESH_COOKIE = 'lga_refresh'

const secure = process.env.NODE_ENV === 'production'
const base = { httpOnly: true, sameSite: 'strict' as const, secure, path: '/' }

export function setAuthCookies(res: NextResponse, tokens: Tokens) {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: 15 * 60 })
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 })
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 })
}

// Prints the real reason in the terminal where "pnpm dev" runs (ECONNREFUSED = nothing is listening there)
export function logUnreachable(err: unknown) {
  const cause = (err as { cause?: { code?: string; message?: string } } | null)?.cause
  console.error(
    `[admin] Could not reach the logistics API at ${API_URL}${cause?.code ? ` (${cause.code})` : ''}. Is it running, and is API_URL correct?`,
    cause?.message ?? err,
  )
}

async function callRefresh(refreshToken: string): Promise<Tokens | null> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as Partial<Tokens>
    return json.accessToken && json.refreshToken ? { accessToken: json.accessToken, refreshToken: json.refreshToken } : null
  } catch {
    return null
  }
}

export const refreshTokens = (refreshToken: string) => refreshOnce(refreshToken, callRefresh)
