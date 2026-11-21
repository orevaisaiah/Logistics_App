import { config } from '../config.js'
import { prisma } from './prisma.js'
import type { PushMessage } from './push-messages.js'
import { sendToTokens } from './push-send.js'

// Tells a user's phones something happened. Always call it without waiting for it: `void notifyUser(...)`.
// It never throws, so a push problem cannot break the action that triggered it.
export async function notifyUser(userId: string, message: PushMessage): Promise<void> {
  try {
    const rows = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
    if (rows.length === 0) return
    const { invalidTokens } = await sendToTokens(
      rows.map((r) => r.token),
      message,
      { fetch, accessToken: config.EXPO_ACCESS_TOKEN },
    )
    if (invalidTokens.length > 0) await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } })
  } catch (err) {
    console.error('push notification failed', err)
  }
}

export async function notifyRider(riderId: string, message: PushMessage): Promise<void> {
  try {
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, select: { userId: true } })
    if (rider) await notifyUser(rider.userId, message)
  } catch (err) {
    console.error('push notification failed', err)
  }
}
