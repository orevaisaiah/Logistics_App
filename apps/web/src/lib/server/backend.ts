import type { NextResponse } from 'next/server'
import { refreshOnce, type Tokens } from './refresh'

// Where the logistics API lives. Only the website's server uses this, never the browser.
export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const ACCESS_COOKIE = 'lg_access'
export const REFRESH_COOKIE = 'lg_refresh'

const secure = process.env.NODE_ENV === 'production'
const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' }

// The tokens live in httpOnly cookies: page scripts cannot read them, so a bug or a
// malicious script on the page cannot steal a session.
export function setAuthCookies(res: NextResponse, tokens: Tokens) {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: 15 * 60 })
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 })
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE, '', { ...base, maxAge: 0 })
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
