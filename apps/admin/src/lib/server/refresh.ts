export type Tokens = { accessToken: string; refreshToken: string }

const inflight = new Map<string, Promise<Tokens | null>>()

// A refresh token can be used only once. When several requests find the access token expired at the
// same moment, they must share ONE refresh call. Otherwise the second use of the same refresh token
// would look like theft and the API would sign the person out everywhere.
export function refreshOnce(
  refreshToken: string,
  doRefresh: (refreshToken: string) => Promise<Tokens | null>,
  keepForMs = 10_000,
): Promise<Tokens | null> {
  let promise = inflight.get(refreshToken)
  if (!promise) {
    promise = doRefresh(refreshToken).finally(() => {
      // Requests that started just before the new cookie arrived still carry the old token
      setTimeout(() => inflight.delete(refreshToken), keepForMs).unref?.()
    })
    inflight.set(refreshToken, promise)
  }
  return promise
}
