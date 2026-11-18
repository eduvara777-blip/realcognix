import type { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '@realcognix/core';
import { AuthError, type AuthProvider } from '../auth/providers.js';
import type { Db } from './db.js';

export interface RequestAuth {
  orgId: string;
  userId: string | null;
  role: string; // roles.key (owner, admin, manager, executive, client_viewer, partner) or 'service'
  kind: 'user' | 'service';
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
    auth: RequestAuth;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type AuthCtx = { config: AppConfig; auth: AuthProvider; db: Db };

/**
 * Bearer auth for /v1:
 *  - API_TOKEN = service principal (n8n). Only it may pick the org with x-org-id (and act as x-user-id).
 *  - anything else = user access token, verified by the configured AuthProvider (local JWT or OIDC).
 */
export function requireApiAuth(ctx: AuthCtx) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return reply.code(401).send({ error: 'unauthorized' });

    if (safeEqual(token, ctx.config.API_TOKEN)) {
      const orgId = String(req.headers['x-org-id'] ?? ctx.config.DEFAULT_ORG_ID);
      const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null;
      if (!UUID.test(orgId) || (userId && !UUID.test(userId))) {
        return reply.code(400).send({ error: 'x-org-id / x-user-id must be UUIDs' });
      }
      req.auth = { orgId, userId, role: 'service', kind: 'service' };
      return;
    }

    try {
      const p = await ctx.auth.authenticate(token);
      const asked = req.headers['x-org-id'];
      if (asked && String(asked) !== p.orgId) return reply.code(403).send({ error: 'x-org-id is only accepted with the service token' });
      req.auth = { orgId: p.orgId, userId: p.userId, role: p.role, kind: 'user' };
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.status === 401 ? 'unauthorized' : 'forbidden', reason: e.message });
      throw e;
    }
  };
}

/** Protect every route in this plugin and run its handler with app.org_id = the caller's org. */
export function useApiAuth(app: FastifyInstance, ctx: AuthCtx) {
  app.addHook('preHandler', requireApiAuth(ctx));
  app.addHook('onRoute', (opts) => {
    const handler = opts.handler as RouteHandlerMethod;
    opts.handler = function (this: FastifyInstance, req, reply) {
      return ctx.db.withOrg(req.auth.orgId, () => handler.call(this, req, reply));
    } as RouteHandlerMethod;
  });
}

/** Route-level guard, e.g. { preHandler: requireRole('admin', 'manager') }. 'owner' always passes. */
export function requireRole(...roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const role = req.auth?.role;
    if (!role || (role !== 'owner' && !roles.includes(role))) {
      return reply.code(403).send({ error: 'forbidden', reason: `requires role: ${roles.join(' or ')}` });
    }
  };
}

/** Server-to-server intake (n8n): shared secret header. */
export function requireIntakeSecret(config: AppConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = String(req.headers['x-intake-secret'] ?? '');
    if (!secret || !safeEqual(secret, config.INTAKE_SHARED_SECRET)) {
      return reply.code(401).send({ error: 'invalid intake secret' });
    }
  };
}
