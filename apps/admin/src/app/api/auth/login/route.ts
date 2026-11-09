import { NextRequest, NextResponse } from 'next/server'
import { API_URL, logUnreachable, setAuthCookies } from '@/lib/server/backend'

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Signs a staff member in. The API's tokens go into httpOnly cookies and are never sent to the page.
export async function POST(req: NextRequest) {
  const input = (await req.json().catch(() => null)) as { phone?: unknown; password?: unknown } | null
  if (!input || typeof input.phone !== 'string' || typeof input.password !== 'string') {
    return fail(400, 'VALIDATION_ERROR', 'Enter your phone number and password.')
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/v1/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(req.headers.get('x-forwarded-for') ? { 'X-Forwarded-For': req.headers.get('x-forwarded-for') as string } : {}) },
      body: JSON.stringify({ phone: input.phone, password: input.password }),
      cache: 'no-store',
    })
  } catch (err) {
    logUnreachable(err)
    return fail(502, 'API_UNREACHABLE', 'The service is not reachable right now. Please try again in a moment.')
  }

  const data = (await res.json().catch(() => null)) as {
    user?: { adminRole?: string }
    mustChangePassword?: boolean
    accessToken?: string
    refreshToken?: string
  } | null
  if (!res.ok || !data) return NextResponse.json(data ?? { error: { code: 'ERROR', message: 'Could not sign in.' } }, { status: res.status })
  if (!data.accessToken || !data.refreshToken) return fail(502, 'API_ERROR', 'Unexpected reply from the service.')

  const out = NextResponse.json({ user: data.user, mustChangePassword: data.mustChangePassword === true })
  setAuthCookies(out, { accessToken: data.accessToken, refreshToken: data.refreshToken })
  return out
}
