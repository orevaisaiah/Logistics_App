import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { isExpoPushToken } from '../../lib/push-send.js'

const MAX_PHONES_PER_USER = 5

const registerBody = z.object({
  token: z.string().max(200).refine(isExpoPushToken, 'Not a valid push token'),
  platform: z.enum(['android', 'ios']),
})
const removeBody = z.object({ token: z.string().max(200) })

export const pushRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole('RIDER'))

  // The app calls this every time it opens. A token that moves to a different account (a phone passed
  // to another rider) moves with it, so alerts never reach the previous owner.
  app.post('/rider/push-token', async (req) => {
    const { token, platform } = registerBody.parse(req.body)
    const userId = req.user.sub
    await prisma.pushToken.upsert({ where: { token }, create: { userId, token, platform }, update: { userId, platform } })

    // Keep only the most recently used phones
    const all = await prisma.pushToken.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    if (all.length > MAX_PHONES_PER_USER) {
      await prisma.pushToken.deleteMany({ where: { id: { in: all.slice(MAX_PHONES_PER_USER).map((t) => t.id) } } })
    }
    return { ok: true }
  })

  app.post('/rider/push-token/remove', async (req) => {
    const { token } = removeBody.parse(req.body)
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user.sub } })
    return { ok: true }
  })
}
