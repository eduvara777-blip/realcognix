import type { Db } from '../lib/db.js';
import type { RefreshRecord, RefreshStore } from './refresh.js';
import type { SubjectLookup } from './providers.js';

/** Postgres side of auth. Pre-tenant reads go through the SECURITY DEFINER functions in 002_auth.sql. */
export interface LoginRow {
  user_id: string; org_id: string; org_slug: string; role_key: string; status: string; full_name: string; email: string;
  password_hash: string | null; failed_attempts: number; locked_until: Date | null;
}

export function findLogin(db: Db, email: string, orgSlug?: string) {
  return db.query<LoginRow>(`SELECT * FROM auth_login_lookup($1, $2)`, [email, orgSlug ?? null]).then((r) => r.rows);
}

export const subjectLookup = (db: Db): SubjectLookup => async (sub) => {
  const r = await db.one<{ user_id: string; org_id: string; role_key: string; status: string }>(`SELECT * FROM auth_subject_lookup($1)`, [sub]);
  return r && { userId: r.user_id, orgId: r.org_id, role: r.role_key, status: r.status };
};

/** Records a failed password; locks the account for lockMinutes once threshold consecutive failures are reached. */
export async function recordFailure(db: Db, row: LoginRow, threshold: number, lockMinutes: number) {
  await db.tx(row.org_id, (q) => q.query(
    `UPDATE user_credentials SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3::int) ELSE locked_until END
      WHERE user_id = $1`, [row.user_id, threshold, lockMinutes]));
}

export async function recordSuccess(db: Db, row: LoginRow) {
  await db.tx(row.org_id, (q) => q.query(
    `UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1`, [row.user_id]));
}

export async function setPassword(db: Db, p: { orgId: string; userId: string; hash: string }) {
  await db.tx(p.orgId, async (q) => {
    await q.query(
      `INSERT INTO user_credentials (user_id, org_id, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, password_changed_at = now()`,
      [p.userId, p.orgId, p.hash]);
    // A new password ends every existing session.
    await q.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [p.userId]);
  });
}

export class PgRefreshStore implements RefreshStore {
  constructor(private readonly db: Db) {}

  async find(tokenHash: string): Promise<RefreshRecord | null> {
    const r = await this.db.one(`SELECT * FROM auth_refresh_lookup($1)`, [tokenHash]);
    return r && { id: r.id, orgId: r.org_id, userId: r.user_id, familyId: r.family_id, expiresAt: new Date(r.expires_at), revokedAt: r.revoked_at ? new Date(r.revoked_at) : null };
  }

  async insert(r: Parameters<RefreshStore['insert']>[0]) {
    await this.db.tx(r.orgId, (q) => q.query(
      `INSERT INTO refresh_tokens (id, org_id, user_id, family_id, token_hash, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.id, r.orgId, r.userId, r.familyId, r.tokenHash, r.expiresAt, r.userAgent?.slice(0, 300) ?? null, r.ip ?? null]));
  }

  async consume(rec: RefreshRecord, replacedBy: string | null) {
    const res = await this.db.tx(rec.orgId, (q) => q.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1 AND revoked_at IS NULL`, [rec.id, replacedBy]));
    return res.rowCount === 1;
  }

  async revokeFamily(rec: Pick<RefreshRecord, 'orgId' | 'familyId'>) {
    await this.db.tx(rec.orgId, (q) => q.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [rec.familyId]));
  }
}
