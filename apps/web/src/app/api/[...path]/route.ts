import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE, clearAuthCookies, refreshTokens, setAuthCookies } from '@/lib/server/backend'
import { isAllowed } from '@/lib/server/rules'
import type { Tokens } from '@/lib/server/refresh'

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function callBackend(req: NextRequest, path: string, body: string | undefined, access: string | undefined) {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (access) headers.Authorization = `Bearer ${access}`

  const idempotencyKey = req.headers.get('idempotency-key')
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  // Lets the API apply its rate limits per visitor rather than per website server
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) headers['X-Forwarded-For'] = forwarded

  return fetch(`${API_URL}${path}${req.nextUrl.search}`, { method: req.method, headers, body, cache: 'no-store' })
}

// Passes an allowed call to the logistics API, adding the visitor's sign-in from their cookie.
// If the access token has expired, it is renewed once and the call is retried.
async function handle(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api/, '')
  if (!isAllowed(req.method, path)) return fail(404, 'NOT_FOUND', 'Not found')

  const body = req.method === 'GET' ? undefined : await req.text()
  let access = req.cookies.get(ACCESS_COOKIE)?.value
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value
  let renewed: Tokens | null = null
  let renewalFailed = false

  try {
    if (!access && refresh) {
      renewed = await refreshTokens(refresh)
      renewalFailed = renewed === null
      access = renewed?.accessToken
    }

    let res = await callBackend(req, path, body, access)

    if (res.status === 401 && refresh && !renewed && !renewalFailed) {
      renewed = await refreshTokens(refresh)
      renewalFailed = renewed === null
      if (renewed) res = await callBackend(req, path, body, renewed.accessToken)
    }

    const out = new NextResponse(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
    for (const name of ['idempotent-replay', 'retry-after']) {
      const value = res.headers.get(name)
      if (value) out.headers.set(name, value)
    }
    if (renewed) setAuthCookies(out, renewed)
    else if (renewalFailed) clearAuthCookies(out)
    return out
  } catch {
    return fail(502, 'API_UNREACHABLE', 'The service is not reachable right now. Please try again in a moment.')
  }
}

export const GET = handle
export const POST = handle
export const PATCH = handle
