import { NextRequest, NextResponse } from 'next/server'
import { API_URL, setAuthCookies } from '@/lib/server/backend'

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Signs a business user in. The API's tokens are put in httpOnly cookies and never sent to the page.
export async function POST(req: NextRequest) {
  const input = (await req.json().catch(() => null)) as { phone?: unknown; code?: unknown; fullName?: unknown } | null
  if (!input || typeof input.phone !== 'string' || typeof input.code !== 'string') {
    return fail(400, 'VALIDATION_ERROR', 'Enter your phone number and the code you received.')
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: input.phone,
        code: input.code,
        role: 'BUSINESS_USER',
        ...(typeof input.fullName === 'string' && input.fullName.trim() ? { fullName: input.fullName.trim() } : {}),
      }),
      cache: 'no-store',
    })
  } catch {
    return fail(502, 'API_UNREACHABLE', 'The service is not reachable right now. Please try again in a moment.')
  }

  const data = (await res.json().catch(() => null)) as {
    user?: { role?: string }
    isNewUser?: boolean
    accessToken?: string
    refreshToken?: string
    error?: unknown
  } | null
  if (!res.ok || !data) return NextResponse.json(data ?? { error: { code: 'ERROR', message: 'Could not sign in.' } }, { status: res.status })

  // A number that already belongs to a rider or an admin must not get a business session
  if (data.user?.role !== 'BUSINESS_USER' || !data.accessToken || !data.refreshToken) {
    if (data.refreshToken) {
      await fetch(`${API_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: data.refreshToken }),
      }).catch(() => undefined)
    }
    return fail(403, 'WRONG_ACCOUNT_TYPE', 'This phone number belongs to a rider or staff account. Use a different number for your business.')
  }

  const out = NextResponse.json({ user: data.user, isNewUser: data.isNewUser === true })
  setAuthCookies(out, { accessToken: data.accessToken, refreshToken: data.refreshToken })
  return out
}
