import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { UserRole } from '@prisma/client'
import { config } from '../config.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole }
    user: { sub: string; role: UserRole }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
    requireRole: (...roles: UserRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
  }
}

export function setupAuth(app: FastifyInstance) {
  app.register(jwt, { secret: config.JWT_SECRET })

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
    }
  })

  app.decorate('requireRole', (...roles: UserRole[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(req, reply)
      if (reply.sent) return
      if (!roles.includes(req.user.role)) {
        return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'You do not have access to this resource' } })
      }
    }
  })
}
