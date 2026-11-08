export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  idempotencyKey?: string
  signal?: AbortSignal
}

// Every call goes to this website's own server (/api/...), which adds the sign-in cookie and
// forwards the request to the logistics API. The browser never sees the access tokens.
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET'
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      // The server rejects a JSON request with an empty body, so write requests always send one
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your internet connection and try again.')
  }

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, error?.code ?? 'ERROR', error?.message ?? 'Something went wrong. Please try again.')
  }
  return data as T
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export function isAborted(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
