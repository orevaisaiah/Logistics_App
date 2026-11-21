export type Tokens = { accessToken: string; refreshToken: string }

export interface TokenStore {
  read(): Promise<Tokens | null>
  write(tokens: Tokens): Promise<void>
  clear(): Promise<void>
}

export type RefreshResult = { ok: true; tokens: Tokens } | { ok: false; reason: 'rejected' | 'network' }

// Keeps the rider signed in. The access token lasts 15 minutes; a refresh token can be used ONCE,
// so when many requests find the access token expired at the same moment they must share a single
// refresh. A second use of the same refresh token looks like theft and would sign the rider out everywhere.
export function createSession(deps: {
  store: TokenStore
  refresh: (refreshToken: string) => Promise<RefreshResult>
  onSignedOut: () => void
}) {
  const { store } = deps
  let inflight: Promise<string | null> | null = null

  async function getAccessToken(): Promise<string | null> {
    return (await store.read())?.accessToken ?? null
  }

  // Called after a request was refused for an expired token. Returns a fresh access token, or null.
  async function renew(failedAccessToken: string | null): Promise<string | null> {
    const current = await store.read()
    if (!current) return null
    // Another request already renewed it while this one was waiting
    if (failedAccessToken && current.accessToken !== failedAccessToken) return current.accessToken

    if (!inflight) {
      inflight = (async () => {
        const result = await deps.refresh(current.refreshToken)
        if (result.ok) {
          await store.write(result.tokens)
          return result.tokens.accessToken
        }
        // Refused: the session is really over. A network problem is not: the rider stays signed in and retries later.
        if (result.reason === 'rejected') {
          await store.clear()
          deps.onSignedOut()
        }
        return null
      })().finally(() => {
        inflight = null
      })
    }
    return inflight
  }

  return { getAccessToken, renew, setTokens: (t: Tokens) => store.write(t), clear: () => store.clear(), readTokens: () => store.read() }
}
