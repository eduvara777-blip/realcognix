import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** Opaque refresh tokens: random, stored only as sha256, rotated on every use, reuse revokes the session family. */
export interface RefreshRecord {
  id: string;
  orgId: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshStore {
  find(tokenHash: string): Promise<RefreshRecord | null>;
  insert(r: { id: string; orgId: string; userId: string; familyId: string; tokenHash: string; expiresAt: Date; userAgent?: string | null; ip?: string | null }): Promise<void>;
  /** Atomically revoke one token; false if it was already revoked. */
  consume(rec: RefreshRecord, replacedBy: string | null): Promise<boolean>;
  revokeFamily(rec: Pick<RefreshRecord, 'orgId' | 'familyId'>): Promise<void>;
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newRefreshToken = () => randomBytes(32).toString('base64url');

export interface Issued { token: string; record: RefreshRecord }

export async function issueRefresh(store: RefreshStore, p: { orgId: string; userId: string; familyId?: string; ttlDays: number; now?: Date; userAgent?: string | null; ip?: string | null }): Promise<Issued> {
  const now = p.now ?? new Date();
  const token = newRefreshToken();
  const record: RefreshRecord = {
    id: randomUUID(), orgId: p.orgId, userId: p.userId, familyId: p.familyId ?? randomUUID(),
    expiresAt: new Date(now.getTime() + p.ttlDays * 86_400_000), revokedAt: null,
  };
  await store.insert({ ...record, tokenHash: hashToken(token), userAgent: p.userAgent, ip: p.ip });
  return { token, record };
}

export type RotateResult =
  | { ok: true; token: string; record: RefreshRecord }
  | { ok: false; reason: 'unknown' | 'expired' | 'reused' };

export async function rotateRefresh(store: RefreshStore, token: string, o: { ttlDays: number; now?: Date; userAgent?: string | null; ip?: string | null }): Promise<RotateResult> {
  const now = o.now ?? new Date();
  const rec = await store.find(hashToken(token));
  if (!rec) return { ok: false, reason: 'unknown' };
  if (rec.revokedAt) {
    // A rotated token came back: assume theft, end the whole session.
    await store.revokeFamily(rec);
    return { ok: false, reason: 'reused' };
  }
  if (rec.expiresAt.getTime() <= now.getTime()) {
    await store.consume(rec, null);
    return { ok: false, reason: 'expired' };
  }
  const nextId = randomUUID();
  if (!(await store.consume(rec, nextId))) {
    await store.revokeFamily(rec); // lost a race with another use of the same token
    return { ok: false, reason: 'reused' };
  }
  const token2 = newRefreshToken();
  const record: RefreshRecord = { id: nextId, orgId: rec.orgId, userId: rec.userId, familyId: rec.familyId, expiresAt: new Date(now.getTime() + o.ttlDays * 86_400_000), revokedAt: null };
  await store.insert({ ...record, tokenHash: hashToken(token2), userAgent: o.userAgent, ip: o.ip });
  return { ok: true, token: token2, record };
}

/** In-memory store for tests and local experiments. */
export class MemoryRefreshStore implements RefreshStore {
  readonly rows = new Map<string, RefreshRecord & { tokenHash: string }>();
  async find(h: string) {
    for (const r of this.rows.values()) if (r.tokenHash === h) return { ...r };
    return null;
  }
  async insert(r: Parameters<RefreshStore['insert']>[0]) {
    this.rows.set(r.id, { id: r.id, orgId: r.orgId, userId: r.userId, familyId: r.familyId, expiresAt: r.expiresAt, revokedAt: null, tokenHash: r.tokenHash });
  }
  async consume(rec: RefreshRecord) {
    const row = this.rows.get(rec.id);
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date();
    return true;
  }
  async revokeFamily(rec: Pick<RefreshRecord, 'familyId'>) {
    for (const r of this.rows.values()) if (r.familyId === rec.familyId && !r.revokedAt) r.revokedAt = new Date();
  }
}
