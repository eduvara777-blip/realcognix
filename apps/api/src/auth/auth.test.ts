import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import Fastify from 'fastify';
import { loadConfig, parseTrustProxy } from '@realcognix/core';
import { hashPassword, verifyPassword } from './password.js';
import { JwtError, signHs256, verifyHs256 } from './jwt.js';
import { AuthError, LocalAuthProvider, OidcAuthProvider, createAuthProvider, signAccessToken } from './providers.js';
import { MemoryRefreshStore, issueRefresh, rotateRefresh } from './refresh.js';
import { LoginLimiter, RedisLoginLimiter, type RedisLike } from './rate-limit.js';
import { requireRole, useApiAuth } from '../lib/auth.js';
import type { Db } from '../lib/db.js';

const SECRET = 'test-secret-test-secret-test-secret-1234';
const ORG = '00000000-0000-0000-0000-000000000001';
const USER = '00000000-0000-0000-0002-000000000001';

test('scrypt password hash verifies, rejects wrong and tampered input', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.notEqual(h, await hashPassword('correct horse battery'), 'salted');
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('correct horse batterz', h), false);
  assert.equal(await verifyPassword('correct horse battery', h.slice(0, -2) + 'AA'), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
  await assert.rejects(hashPassword('short'));
});

test('HS256 JWT sign/verify, expiry, signature, alg and issuer checks', () => {
  const now = Math.floor(Date.now() / 1000);
  const t = signHs256({ sub: 'u1', iss: 'realcognix', iat: now, exp: now + 900 }, SECRET);
  assert.equal(verifyHs256(t, SECRET, { issuer: 'realcognix' }).sub, 'u1');
  const code = (fn: () => unknown) => { try { fn(); return 'ok'; } catch (e) { return (e as JwtError).code; } };
  assert.equal(code(() => verifyHs256(t, SECRET + 'x')), 'bad_signature');
  assert.equal(code(() => verifyHs256(t, SECRET, { issuer: 'other' })), 'bad_issuer');
  assert.equal(code(() => verifyHs256(t, SECRET, { now: now + 900 + 31 })), 'expired');
  assert.equal(code(() => verifyHs256(t, SECRET, { now: now + 900 + 10 })), 'ok', '30 s leeway');
  assert.equal(code(() => verifyHs256(signHs256({ sub: 'u1' }, SECRET), SECRET)), 'expired', 'exp is required');
  const [, body] = t.split('.');
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${body}.`;
  assert.equal(code(() => verifyHs256(none, SECRET)), 'bad_alg');
  assert.equal(code(() => verifyHs256('a.b', SECRET)), 'malformed');
});

test('local provider: access token round trip, 15 min expiry', async () => {
  const cfg = { JWT_SECRET: SECRET, JWT_ISSUER: 'realcognix', ACCESS_TOKEN_TTL_SECONDS: 900 };
  const now = Math.floor(Date.now() / 1000);
  const { token, expiresIn } = signAccessToken(cfg, { userId: USER, orgId: ORG, role: 'manager' }, now);
  assert.equal(expiresIn, 900);
  const p = await new LocalAuthProvider(cfg).authenticate(token);
  assert.deepEqual(p, { kind: 'user', orgId: ORG, userId: USER, role: 'manager' });
  const old = signAccessToken(cfg, { userId: USER, orgId: ORG, role: 'manager' }, now - 2000).token;
  await assert.rejects(new LocalAuthProvider(cfg).authenticate(old), (e) => e instanceof AuthError && e.message === 'expired');
  // A token without typ=access (e.g. some other HS256 JWT with the same secret) is refused.
  await assert.rejects(new LocalAuthProvider(cfg).authenticate(signHs256({ sub: USER, org: ORG, role: 'admin', iss: 'realcognix', exp: now + 60 }, SECRET)));
});

test('createAuthProvider refuses the dev JWT secret in production', () => {
  const base = loadConfig({});
  assert.equal(createAuthProvider(base, async () => null).name, 'local');
  assert.throws(() => createAuthProvider({ ...base, NODE_ENV: 'production' }, async () => null), /JWT_SECRET/);
  assert.throws(() => createAuthProvider({ ...base, AUTH_PROVIDER: 'oidc' }, async () => null), /OIDC_JWKS_URL/);
});

test('oidc provider: RS256 via JWKS, issuer/audience, sub -> user mapping', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const fetchFn = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as typeof fetch;
  const rs = (claims: object, kid = 'k1') => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const b = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${h}.${b}.${createSign('RSA-SHA256').update(`${h}.${b}`).sign(privateKey).toString('base64url')}`;
  };
  const exp = Math.floor(Date.now() / 1000) + 300;
  const iss = 'https://kc.example/realms/rc';
  const p = new OidcAuthProvider({
    issuer: iss, audience: 'realcognix-api', jwksUrl: 'https://kc.example/certs', fetchFn,
    lookup: async (sub) => (sub === 'kc-123' ? { userId: USER, orgId: ORG, role: 'admin', status: 'active' } : null),
  });
  assert.deepEqual(await p.authenticate(rs({ sub: 'kc-123', iss, aud: ['realcognix-api'], exp })), { kind: 'user', orgId: ORG, userId: USER, role: 'admin' });
  await assert.rejects(p.authenticate(rs({ sub: 'kc-123', iss, aud: 'other', exp })), (e) => e instanceof AuthError && e.status === 401);
  await assert.rejects(p.authenticate(rs({ sub: 'kc-999', iss, aud: 'realcognix-api', exp })), (e) => e instanceof AuthError && e.status === 403);
  await assert.rejects(p.authenticate(rs({ sub: 'kc-123', iss, aud: 'realcognix-api', exp }, 'unknown-kid')), (e) => e instanceof AuthError && e.message === 'unknown_key');
});

test('refresh tokens rotate on use; reuse revokes the whole session', async () => {
  const store = new MemoryRefreshStore();
  const first = await issueRefresh(store, { orgId: ORG, userId: USER, ttlDays: 30 });
  assert.equal(first.record.expiresAt.getTime() - Date.now() > 29 * 86_400_000, true);
  assert.equal([...store.rows.values()][0]!.tokenHash.includes(first.token), false, 'only the hash is stored');

  const second = await rotateRefresh(store, first.token, { ttlDays: 30 });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.notEqual(second.token, first.token);
  assert.equal(second.record.familyId, first.record.familyId);

  const third = await rotateRefresh(store, second.token, { ttlDays: 30 });
  assert.equal(third.ok, true);

  // Replaying an already-rotated token is treated as theft: the live token in that family dies too.
  assert.deepEqual(await rotateRefresh(store, first.token, { ttlDays: 30 }), { ok: false, reason: 'reused' });
  if (third.ok) assert.deepEqual(await rotateRefresh(store, third.token, { ttlDays: 30 }), { ok: false, reason: 'reused' });
  assert.deepEqual(await rotateRefresh(store, 'never-issued-token-xxxxxxxx', { ttlDays: 30 }), { ok: false, reason: 'unknown' });
});

test('refresh tokens expire after their TTL', async () => {
  const store = new MemoryRefreshStore();
  const t = await issueRefresh(store, { orgId: ORG, userId: USER, ttlDays: 30, now: new Date('2026-01-01T00:00:00Z') });
  assert.deepEqual(await rotateRefresh(store, t.token, { ttlDays: 30, now: new Date('2026-02-01T00:00:00Z') }), { ok: false, reason: 'expired' });
});

test('login limiter blocks after max failures and resets after the window', () => {
  let now = 0;
  const l = new LoginLimiter(3, 60_000, () => now);
  for (let i = 0; i < 3; i++) { assert.equal(l.blockedFor('a|ip'), 0); l.fail('a|ip'); }
  assert.equal(l.blockedFor('a|ip'), 60);
  assert.equal(l.blockedFor('b|ip'), 0, 'per key');
  now = 60_001;
  assert.equal(l.blockedFor('a|ip'), 0);
  l.fail('a|ip'); l.reset('a|ip');
  assert.equal(l.blockedFor('a|ip'), 0);
});

test('bearer auth: service token may pick org; user tokens may not; requireRole', async () => {
  const config = { ...loadConfig({}), API_TOKEN: 'svc-token-123456', JWT_SECRET: SECRET };
  const seen: string[] = [];
  const db = { withOrg: (org: string, fn: () => unknown) => { seen.push(org); return fn(); } } as unknown as Db;
  const app = Fastify();
  await app.register(async (i) => {
    useApiAuth(i, { config, db, auth: new LocalAuthProvider(config) });
    i.get('/who', async (req) => req.auth);
    i.post('/decide', { preHandler: requireRole('admin', 'manager') }, async () => ({ ok: true }));
  });
  const other = '00000000-0000-0000-0000-0000000000ff';
  const exec = signAccessToken(config, { userId: USER, orgId: ORG, role: 'executive' }).token;
  const mgr = signAccessToken(config, { userId: USER, orgId: ORG, role: 'manager' }).token;

  assert.equal((await app.inject({ url: '/who' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/who', headers: { authorization: 'Bearer nope' } })).statusCode, 401);
  const svc = await app.inject({ url: '/who', headers: { authorization: 'Bearer svc-token-123456', 'x-org-id': other } });
  assert.deepEqual(svc.json(), { orgId: other, userId: null, role: 'service', kind: 'service' });
  const user = await app.inject({ url: '/who', headers: { authorization: `Bearer ${exec}` } });
  assert.deepEqual(user.json(), { orgId: ORG, userId: USER, role: 'executive', kind: 'user' });
  assert.equal((await app.inject({ url: '/who', headers: { authorization: `Bearer ${exec}`, 'x-org-id': other } })).statusCode, 403);
  assert.deepEqual(seen, [other, ORG], 'handlers run scoped to the principal org');

  assert.equal((await app.inject({ method: 'POST', url: '/decide', headers: { authorization: `Bearer ${exec}` } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/decide', headers: { authorization: `Bearer ${mgr}` } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/decide', headers: { authorization: 'Bearer svc-token-123456' } })).statusCode, 403);
  await app.close();
});

/** Minimal in-memory stand-in for the two Lua scripts and DEL the limiter uses. */
function fakeRedis(now: () => number) {
  const kv = new Map<string, { n: number; exp: number }>();
  const live = (k: string) => { const e = kv.get(k); if (e && now() >= e.exp) kv.delete(k); return kv.get(k); };
  const r: RedisLike & { kv: typeof kv; fail: boolean } = {
    status: 'ready', kv, fail: false,
    async eval(script: string, _n: number, key: string | number, ttl?: string | number) {
      if (r.fail) throw new Error('connection reset');
      const k = String(key);
      if (script.includes('INCR')) {
        const e = live(k);
        if (e) e.n++; else kv.set(k, { n: 1, exp: now() + Number(ttl) });
        return live(k)!.n;
      }
      const e = live(k);
      return e ? [e.n, e.exp - now()] : [0, -2];
    },
    async del(...keys: string[]) { keys.forEach((k) => kv.delete(k)); return keys.length; },
  };
  return r;
}

test('redis login limiter: shared across instances, hashed keys, falls back to memory when Redis is down', async () => {
  let now = 0;
  const redis = fakeRedis(() => now);
  const a = new RedisLoginLimiter(redis, 3, 60_000, { now: () => now });
  const b = new RedisLoginLimiter(redis, 3, 60_000, { now: () => now }); // a second API replica
  for (let i = 0; i < 3; i++) { assert.equal(await a.blockedFor('x@y.test|1.2.3.4'), 0); await (i % 2 ? b : a).fail('x@y.test|1.2.3.4'); }
  assert.equal(await b.blockedFor('x@y.test|1.2.3.4'), 60, 'replica b sees failures recorded by a');
  assert.ok([...redis.kv.keys()].every((k) => k.startsWith('rl:login:') && !k.includes('@')), 'no emails in Redis');
  now = 60_001;
  assert.equal(await a.blockedFor('x@y.test|1.2.3.4'), 0, 'window expires');
  await a.fail('k'); await a.reset('k');
  assert.equal(redis.kv.size, 0, 'reset deletes the key');

  // Not connected: in-memory per process.
  redis.status = 'reconnecting';
  for (let i = 0; i < 3; i++) await a.fail('m');
  assert.equal(await a.blockedFor('m'), 60);
  assert.equal(redis.kv.size, 0);
  // Connected but erroring: also memory, and the fallback is reported once.
  redis.status = 'ready'; redis.fail = true;
  const seen: unknown[] = [];
  const c = new RedisLoginLimiter(redis, 2, 60_000, { now: () => now, onFallback: (e) => seen.push(e) });
  await c.fail('e'); await c.fail('e');
  assert.equal(await c.blockedFor('e'), 60);
  assert.equal(seen.length, 1);
});

test('TRUST_PROXY: X-Forwarded-For is ignored by default and honoured only when configured', async () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.throws(() => parseTrustProxy('1'), /hop counts/);
  assert.deepEqual(parseTrustProxy('10.0.0.0/8, 127.0.0.1'), ['10.0.0.0/8', '127.0.0.1']);
  assert.equal(loadConfig({}).TRUST_PROXY, 'false');
  for (const [setting, expected] of [['false', '127.0.0.1'], ['true', '203.0.113.9'], ['loopback', '203.0.113.9'], ['10.0.0.0/8', '127.0.0.1']] as const) {
    const app = Fastify({ trustProxy: parseTrustProxy(setting) as boolean });
    app.get('/ip', async (req) => ({ ip: req.ip }));
    const r = await app.inject({ url: '/ip', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(r.json().ip, expected, `TRUST_PROXY=${setting}`);
    await app.close();
  }
});
