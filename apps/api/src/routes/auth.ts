import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { useApiAuth } from '../lib/auth.js';
import { dummyHash, verifyPassword } from '../auth/password.js';
import { signAccessToken } from '../auth/providers.js';
import { issueRefresh, rotateRefresh, hashToken } from '../auth/refresh.js';
import { LoginLimiter } from '../auth/rate-limit.js';
import { findLogin, PgRefreshStore, recordFailure, recordSuccess, type LoginRow } from '../auth/pg.js';

const Login = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
  org: z.string().trim().max(80).optional(), // org slug, only needed when one email exists in several orgs
});
const RefreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

/** POST /auth/login, /auth/refresh, /auth/logout (public) and GET /v1/me (authenticated). */
export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = ctx.config;
  const limiter = new LoginLimiter(c.LOGIN_MAX_ATTEMPTS, c.LOGIN_WINDOW_MINUTES * 60_000);
  const store = new PgRefreshStore(ctx.db);
  const tooMany = (reply: FastifyReply, seconds: number) =>
    reply.header('retry-after', String(Math.max(1, seconds))).code(429).send({ error: 'too_many_attempts', retryAfter: Math.max(1, seconds) });

  function session(u: { id: string; orgId: string; role: string; email: string; fullName: string }, refresh: { token: string; expiresAt: Date }) {
    const access = signAccessToken(c, { userId: u.id, orgId: u.orgId, role: u.role });
    return {
      accessToken: access.token, tokenType: 'Bearer', expiresIn: access.expiresIn,
      refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt.toISOString(),
      user: { id: u.id, orgId: u.orgId, role: u.role, email: u.email, fullName: u.fullName },
    };
  }
  const meta = (req: FastifyRequest) => ({ userAgent: req.headers['user-agent'] ?? null, ip: req.ip });

  app.post('/auth/login', async (req, reply) => {
    if (!ctx.auth.passwordLogin) return reply.code(400).send({ error: 'password_login_disabled', reason: `AUTH_PROVIDER=${ctx.auth.name}; sign in with your identity provider` });
    const b = Login.parse(req.body);
    const key = `${b.email.toLowerCase()}|${req.ip}`;
    const wait = limiter.blockedFor(key);
    if (wait) return tooMany(reply, wait);

    const rows = (await findLogin(ctx.db, b.email, b.org)).filter((r) => r.password_hash);
    if (!rows.length) {
      await verifyPassword(b.password, await dummyHash()); // same work as a real check
      limiter.fail(key);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const now = Date.now();
    const matches: LoginRow[] = [];
    for (const r of rows) if (await verifyPassword(b.password, r.password_hash!)) matches.push(r);

    const locked = rows.find((r) => r.locked_until && r.locked_until.getTime() > now && (!matches.length || matches.includes(r)));
    if (locked) {
      limiter.fail(key);
      return tooMany(reply, Math.ceil((locked.locked_until!.getTime() - now) / 1000));
    }
    if (!matches.length) {
      limiter.fail(key);
      for (const r of rows) await recordFailure(ctx.db, r, c.LOGIN_LOCK_THRESHOLD, c.LOGIN_LOCK_MINUTES);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    if (matches.length > 1) return reply.code(409).send({ error: 'org_required', orgs: matches.map((m) => m.org_slug) });
    const u = matches[0]!;
    if (u.status !== 'active') return reply.code(403).send({ error: 'account_disabled' });

    limiter.reset(key);
    await recordSuccess(ctx.db, u);
    const refresh = await issueRefresh(store, { orgId: u.org_id, userId: u.user_id, ttlDays: c.REFRESH_TOKEN_TTL_DAYS, ...meta(req) });
    req.log.info({ userId: u.user_id, orgId: u.org_id }, 'login');
    return session({ id: u.user_id, orgId: u.org_id, role: u.role_key, email: u.email, fullName: u.full_name }, { token: refresh.token, expiresAt: refresh.record.expiresAt });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const b = RefreshBody.parse(req.body);
    const r = await rotateRefresh(store, b.refreshToken, { ttlDays: c.REFRESH_TOKEN_TTL_DAYS, ...meta(req) });
    if (!r.ok) {
      if (r.reason === 'reused') req.log.warn({ reason: r.reason }, 'refresh token reuse: session revoked');
      return reply.code(401).send({ error: 'invalid_refresh_token', reason: r.reason });
    }
    // Re-read the user so role changes and disabling take effect at the next refresh.
    const u = await ctx.db.withOrg(r.record.orgId, () => ctx.db.one<{ id: string; status: string; role: string; email: string; full_name: string }>(
      `SELECT u.id, u.status, r.key AS role, u.email::text AS email, u.full_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [r.record.userId]));
    if (!u || u.status !== 'active') {
      await store.revokeFamily(r.record);
      return reply.code(401).send({ error: 'invalid_refresh_token', reason: 'user_inactive' });
    }
    return session({ id: u.id, orgId: r.record.orgId, role: u.role, email: u.email, fullName: u.full_name }, { token: r.token, expiresAt: r.record.expiresAt });
  });

  app.post('/auth/logout', async (req, reply) => {
    const b = RefreshBody.safeParse(req.body ?? {});
    if (b.success) {
      const rec = await store.find(hashToken(b.data.refreshToken));
      if (rec) await store.revokeFamily(rec);
    }
    return reply.code(204).send();
  });

  await app.register(async (v1) => {
    useApiAuth(v1, ctx);
    v1.get('/me', async (req, reply) => {
      if (req.auth.kind === 'service') return { kind: 'service', orgId: req.auth.orgId, role: 'service', userId: req.auth.userId };
      const u = await ctx.db.one(
        `SELECT u.id, u.full_name, u.email::text AS email, u.phone_e164, u.languages, r.key AS role, r.name AS role_name, r.permissions,
                o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.timezone
           FROM users u JOIN roles r ON r.id = u.role_id JOIN organizations o ON o.id = u.org_id WHERE u.id = $1 AND u.org_id = $2`,
        [req.auth.userId, req.auth.orgId]);
      if (!u) return reply.notFound();
      return {
        kind: 'user', id: u.id, fullName: u.full_name, email: u.email, phone: u.phone_e164, languages: u.languages,
        role: u.role, roleName: u.role_name, permissions: u.permissions,
        org: { id: u.org_id, name: u.org_name, slug: u.org_slug, timezone: u.timezone }, authProvider: ctx.auth.name,
      };
    });
  }, { prefix: '/v1' });
}
