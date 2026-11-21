import type { PushMessage } from './push-messages.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/

export const isExpoPushToken = (token: string) => EXPO_TOKEN.test(token)

type Ticket = { status: 'ok'; id?: string } | { status: 'error'; message?: string; details?: { error?: string } }

export type SendDeps = { fetch: typeof fetch; accessToken?: string }

// Sends one message to many phones. Returns the tokens Expo says no longer work, so they can be forgotten.
// Push is best effort: a failure here must never break the action that caused it.
export async function sendToTokens(tokens: string[], message: PushMessage, deps: SendDeps): Promise<{ invalidTokens: string[]; sent: number }> {
  const valid = [...new Set(tokens)].filter(isExpoPushToken)
  const invalidTokens: string[] = []
  let sent = 0

  // Expo accepts at most 100 messages per request
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100)
    const payload = batch.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: 'default',
      priority: 'high',
      channelId: message.channelId ?? 'default',
      ttl: message.ttlSeconds,
    }))

    try {
      const res = await deps.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(deps.accessToken ? { Authorization: `Bearer ${deps.accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { data?: Ticket[] }
      json.data?.forEach((ticket, index) => {
        if (ticket.status === 'ok') sent += 1
        else if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[index])
      })
    } catch {
      // network trouble: skip this batch
    }
  }
  return { invalidTokens, sent }
}
