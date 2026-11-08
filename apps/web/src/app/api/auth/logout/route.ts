import { NextRequest, NextResponse } from 'next/server'
import { API_URL, REFRESH_COOKIE, clearAuthCookies } from '@/lib/server/backend'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    // Ends the session on the API side too. If that fails, the cookies are still cleared.
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined)
  }
  const out = NextResponse.json({ ok: true })
  clearAuthCookies(out)
  return out
}
