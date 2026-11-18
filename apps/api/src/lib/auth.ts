import type { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '@realcognix/core';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
    auth: { orgId: string; userId: string | null };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * STARTER AUTH — static bearer token + x-org-id / x-user-id headers.
 * Replace with Supabase Auth or Keycloak JWT verification (map the JWT subject to users.auth_subject,
 * take org_id and role from the users row). The rest of the API only reads request.auth.
 */
export function requireApiAuth(config: AppConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, config.API_TOKEN)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const orgId = String(req.headers['x-org-id'] ?? config.DEFAULT_ORG_ID);
    const userId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null;
    if (!UUID.test(orgId) || (userId && !UUID.test(userId))) {
      return reply.code(400).send({ error: 'x-org-id / x-user-id must be UUIDs' });
    }
    req.auth = { orgId, userId };
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
