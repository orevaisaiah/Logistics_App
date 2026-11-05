import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AdminRole, UserRole } from '@prisma/client'
import { config } from '../config.js'
import { prisma } from '../lib/prisma.js'
import { isAdminAllowed } from '../lib/rbac.js'

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
    // Only admins whose role is listed (super admins always pass). No roles listed = super admins only.
    requireAdmin: (...roles: AdminRole[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
  }
  interface FastifyRequest {
    // Filled in by requireAdmin, so a route can make finer decisions
    adminRole: AdminRole | null
  }
}

export function setupAuth(app: FastifyInstance) {
  app.register(jwt, { secret: config.JWT_SECRET })
  app.decorateRequest('adminRole', null)

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

  // The admin's role and status are read from the database on every request, not from the token.
  // So a role change, a suspension or a forced password change takes effect immediately.
  app.decorate('requireAdmin', (...roles: AdminRole[]) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(req, reply)
      if (reply.sent) return
      const forbidden = (code: string, message: string) => reply.code(403).send({ error: { code, message } })

      if (req.user.role !== 'ADMIN') return forbidden('FORBIDDEN', 'You do not have access to this resource')

      const admin = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { role: true, status: true, adminRole: true, mustChangePassword: true },
      })
      if (!admin || admin.role !== 'ADMIN' || admin.status !== 'ACTIVE' || !admin.adminRole) {
        return forbidden('FORBIDDEN', 'You do not have access to this resource')
      }
      if (admin.mustChangePassword) {
        return forbidden('PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing')
      }
      if (!isAdminAllowed(admin.adminRole, roles)) {
        return forbidden('FORBIDDEN', 'Your admin role does not allow this action')
      }
      req.adminRole = admin.adminRole
    }
  })
}
