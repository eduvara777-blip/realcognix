import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify, type JsonWebKey, type KeyObject } from 'node:crypto';

/** Minimal JWT (HS256 sign/verify, RS256 verify) on node:crypto. */
export interface JwtClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [k: string]: unknown;
}

export class JwtError extends Error {
  constructor(readonly code: 'malformed' | 'bad_alg' | 'bad_signature' | 'expired' | 'not_yet_valid' | 'bad_issuer' | 'bad_audience' | 'unknown_key', msg?: string) {
    super(msg ?? code);
  }
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const LEEWAY_S = 30;

export function signHs256(claims: JwtClaims, secret: string): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(claims);
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function decode(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new JwtError('malformed');
  try {
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as JwtClaims;
    if (typeof claims !== 'object' || claims === null) throw new Error();
    return { header, claims, signingInput: `${parts[0]}.${parts[1]}`, sig: Buffer.from(parts[2]!, 'base64url') };
  } catch {
    throw new JwtError('malformed');
  }
}

export interface VerifyOptions { issuer?: string; audience?: string; now?: number }

function checkClaims(c: JwtClaims, o: VerifyOptions) {
  const now = o.now ?? Math.floor(Date.now() / 1000);
  if (typeof c.exp !== 'number' || now > c.exp + LEEWAY_S) throw new JwtError('expired');
  if (typeof c.nbf === 'number' && now + LEEWAY_S < c.nbf) throw new JwtError('not_yet_valid');
  if (o.issuer && c.iss !== o.issuer) throw new JwtError('bad_issuer');
  if (o.audience) {
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(o.audience)) throw new JwtError('bad_audience');
  }
  return c;
}

export function verifyHs256(token: string, secret: string, o: VerifyOptions = {}): JwtClaims {
  const { header, claims, signingInput, sig } = decode(token);
  if (header.alg !== 'HS256') throw new JwtError('bad_alg');
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) throw new JwtError('bad_signature');
  return checkClaims(claims, o);
}

/** RS256 verify; getKey resolves the header kid to a public key (see JwksCache). */
export async function verifyRs256(token: string, getKey: (kid: string | undefined) => Promise<KeyObject | null>, o: VerifyOptions = {}): Promise<JwtClaims> {
  const { header, claims, signingInput, sig } = decode(token);
  if (header.alg !== 'RS256') throw new JwtError('bad_alg');
  const key = await getKey(header.kid);
  if (!key) throw new JwtError('unknown_key');
  if (!cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, sig)) throw new JwtError('bad_signature');
  return checkClaims(claims, o);
}

/** Fetches and caches a JWKS (Keycloak: <realm>/protocol/openid-connect/certs; Supabase: <project>/auth/v1/.well-known/jwks.json). */
export class JwksCache {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  constructor(private readonly url: string, private readonly ttlMs = 10 * 60_000, private readonly fetchFn: typeof fetch = fetch) {}

  async get(kid: string | undefined): Promise<KeyObject | null> {
    const stale = Date.now() - this.fetchedAt > this.ttlMs;
    if (stale || (kid && !this.keys.has(kid) && Date.now() - this.fetchedAt > 30_000)) await this.refresh();
    if (kid) return this.keys.get(kid) ?? null;
    return this.keys.size === 1 ? [...this.keys.values()][0]! : null;
  }

  private async refresh() {
    const res = await this.fetchFn(this.url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string; use?: string }> };
    const next = new Map<string, KeyObject>();
    for (const k of body.keys ?? []) {
      if (k.kty !== 'RSA' || (k.use && k.use !== 'sig')) continue;
      next.set(k.kid ?? `idx-${next.size}`, createPublicKey({ key: k, format: 'jwk' }));
    }
    this.keys = next;
    this.fetchedAt = Date.now();
  }
}
