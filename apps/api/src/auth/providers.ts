import type { AppConfig } from '@realcognix/core';
import { JwksCache, JwtError, signHs256, verifyHs256, verifyRs256 } from './jwt.js';

/** Who is calling. kind 'service' = the API_TOKEN (n8n and other server-to-server callers). */
export interface Principal {
  kind: 'user' | 'service';
  orgId: string;
  userId: string | null;
  role: string;
}

/**
 * AuthProvider adapter: turns a bearer access token into a Principal.
 * 'local' verifies our own HS256 tokens (issued by POST /auth/login); 'oidc' verifies RS256 tokens from
 * Keycloak / Supabase / any OIDC issuer via JWKS and maps sub -> users.auth_subject.
 */
export interface AuthProvider {
  readonly name: 'local' | 'oidc';
  readonly passwordLogin: boolean;
  authenticate(token: string): Promise<Principal>;
}

export class AuthError extends Error {
  constructor(readonly status: 401 | 403, msg: string) { super(msg); }
}

export const DEV_JWT_SECRET = 'dev-only-jwt-secret-change-me-0000000000';

export function signAccessToken(config: Pick<AppConfig, 'JWT_SECRET' | 'JWT_ISSUER' | 'ACCESS_TOKEN_TTL_SECONDS'>, p: { userId: string; orgId: string; role: string }, now = Math.floor(Date.now() / 1000)) {
  const exp = now + config.ACCESS_TOKEN_TTL_SECONDS;
  return { token: signHs256({ iss: config.JWT_ISSUER, sub: p.userId, org: p.orgId, role: p.role, typ: 'access', iat: now, exp }, config.JWT_SECRET), expiresIn: config.ACCESS_TOKEN_TTL_SECONDS };
}

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local' as const;
  readonly passwordLogin = true;
  constructor(private readonly config: Pick<AppConfig, 'JWT_SECRET' | 'JWT_ISSUER'>) {}

  async authenticate(token: string): Promise<Principal> {
    try {
      const c = verifyHs256(token, this.config.JWT_SECRET, { issuer: this.config.JWT_ISSUER });
      if (c.typ !== 'access' || typeof c.sub !== 'string' || typeof c.org !== 'string' || typeof c.role !== 'string') throw new JwtError('malformed');
      return { kind: 'user', orgId: c.org, userId: c.sub, role: c.role };
    } catch (e) {
      throw new AuthError(401, e instanceof JwtError ? e.code : 'invalid_token');
    }
  }
}

export interface SubjectLookup {
  (subject: string): Promise<{ userId: string; orgId: string; role: string; status: string } | null>;
}

export class OidcAuthProvider implements AuthProvider {
  readonly name = 'oidc' as const;
  readonly passwordLogin = false;
  private readonly jwks: JwksCache;
  private readonly cache = new Map<string, { p: Principal; until: number }>();

  constructor(private readonly o: { issuer?: string; audience?: string; jwksUrl: string; lookup: SubjectLookup; fetchFn?: typeof fetch }) {
    this.jwks = new JwksCache(o.jwksUrl, undefined, o.fetchFn);
  }

  async authenticate(token: string): Promise<Principal> {
    let sub: string;
    try {
      const c = await verifyRs256(token, (kid) => this.jwks.get(kid), { issuer: this.o.issuer, audience: this.o.audience });
      if (typeof c.sub !== 'string' || !c.sub) throw new JwtError('malformed');
      sub = c.sub;
    } catch (e) {
      throw new AuthError(401, e instanceof JwtError ? e.code : 'invalid_token');
    }
    const hit = this.cache.get(sub);
    if (hit && hit.until > Date.now()) return hit.p;
    const u = await this.o.lookup(sub);
    if (!u) throw new AuthError(403, 'no user is linked to this identity (users.auth_subject)');
    if (u.status !== 'active') throw new AuthError(403, 'user is not active');
    const p: Principal = { kind: 'user', orgId: u.orgId, userId: u.userId, role: u.role };
    this.cache.set(sub, { p, until: Date.now() + 60_000 });
    return p;
  }
}

export function createAuthProvider(config: AppConfig, lookup: SubjectLookup): AuthProvider {
  if (config.AUTH_PROVIDER === 'oidc') {
    if (!config.OIDC_JWKS_URL) throw new Error('AUTH_PROVIDER=oidc needs OIDC_JWKS_URL (and should set OIDC_ISSUER, OIDC_AUDIENCE)');
    return new OidcAuthProvider({ issuer: config.OIDC_ISSUER, audience: config.OIDC_AUDIENCE, jwksUrl: config.OIDC_JWKS_URL, lookup });
  }
  if (config.NODE_ENV === 'production' && (config.JWT_SECRET === DEV_JWT_SECRET || /change-me/i.test(config.JWT_SECRET))) {
    throw new Error('Set JWT_SECRET (openssl rand -hex 32) before running in production');
  }
  return new LocalAuthProvider(config);
}
