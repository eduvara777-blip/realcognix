import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Anything that runs a query: a scoped Db or a transaction client. */
export interface Q {
  query<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** lookup() may only call the SECURITY DEFINER functions from 002/003/004 (or SELECT 1 for health). Never a table. */
const LOOKUP = /^\s*SELECT\s+(1|\*\s+FROM\s+(auth_login_lookup|auth_subject_lookup|auth_refresh_lookup|intake_resolve_source|system_active_clients|outbox_pending_orgs|outbox_raw_pending)\s*\(|(whatsapp_message_org|outbox_put_raw|outbox_raw_mark)\s*\()/i;

export class UnscopedQueryError extends Error {
  constructor() {
    super('db: query outside an org scope. Wrap it in db.withOrg(orgId, fn) or use db.tx(orgId, fn).');
    this.name = 'UnscopedQueryError';
  }
}

/**
 * Org-scoped access to Postgres. The API and worker connect as realcognix_app (NOBYPASSRLS, not a table owner),
 * so the RLS policies on app.org_id decide what every statement can see or write.
 *
 *  - withOrg(orgId, fn): every query()/one() inside fn runs in its own transaction with SET LOCAL app.org_id.
 *    Requests (useApiAuth), worker jobs and webhook intake all run inside one.
 *  - tx(orgId, fn): one transaction with app.org_id set, for multi-statement writes.
 *  - lookup(sql): the pre-tenant SECURITY DEFINER lookups only (sign-in, webhook org resolution, the report scheduler,
 *    the job outbox's raw-webhook rows and its per-org drain list).
 *
 * query()/one() outside withOrg throw; there is no unscoped path to a table. Each statement gets its own transaction
 * on purpose: a scope often spans LLM and WhatsApp calls, which must not hold a transaction open.
 */
export class Db {
  // Not part of the API: all access goes through the scoped helpers. (Test harnesses may swap it.)
  private pool: pg.Pool;
  private readonly scope = new AsyncLocalStorage<{ orgId: string }>();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
    // numeric -> number (amounts fit comfortably in a double); bigint counts -> number
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
    // numeric[] (OID 1231, e.g. bhk_preference) -> number[]; array OIDs are missing from pg's TypeId enum
    const types = pg.types as unknown as { getTypeParser(oid: number): (v: string) => unknown; setTypeParser(oid: number, fn: (v: string) => unknown): void };
    const textArray = types.getTypeParser(1009);
    types.setTypeParser(1231, (v) => (v === null ? null : (textArray(v) as string[]).map(Number)));
  }

  /** Run fn with every query()/one() scoped to orgId (app.org_id). Nesting is allowed only for the same org. */
  withOrg<T>(orgId: string, fn: () => T): T {
    if (!UUID.test(orgId)) throw new Error('withOrg: orgId must be a UUID');
    const current = this.currentOrg;
    if (current && current !== orgId) throw new Error('withOrg: already scoped to a different org');
    return this.scope.run({ orgId }, fn);
  }

  get currentOrg(): string | null {
    return this.scope.getStore()?.orgId ?? null;
  }

  async query<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<pg.QueryResult<R>> {
    const org = this.currentOrg;
    if (!org) throw new UnscopedQueryError();
    return this.tx(org, (q) => q.query<R>(sql, params));
  }

  async one<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<R | null> {
    const { rows } = await this.query<R>(sql, params);
    return rows[0] ?? null;
  }

  /** Pre-tenant lookups through the SECURITY DEFINER functions. Runs with no app.org_id, so tables stay invisible. */
  async lookup<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<pg.QueryResult<R>> {
    if (!LOOKUP.test(sql) || sql.includes(';')) throw new Error('db.lookup: only the SECURITY DEFINER lookup functions are allowed');
    return this.pool.query<R>(sql, params);
  }

  async tx<T>(orgId: string, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
    const scoped = this.currentOrg;
    if (scoped && scoped !== orgId) throw new Error('tx: orgId differs from the request org');
    if (!UUID.test(orgId)) throw new Error('tx: orgId must be a UUID');
    const client = await this.pool.connect();
    try {
      // orgId is a validated UUID, so it is safe inline; saves a round trip per transaction.
      // set_config(..., true) = SET LOCAL: it ends with the transaction, so pooled connections never leak a scope.
      await client.query(`BEGIN; SELECT set_config('app.org_id', '${orgId}', true)`);
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

/**
 * Foreign keys are checked without RLS, so a scoped write can still *reference* another org's row by id
 * (e.g. lead_events.lead_id). Services that take an id from the caller confirm it is visible in the current org first.
 */
export const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

/** Throws 404 unless the row is visible in the current org scope (RLS hides other orgs' rows). */
export async function requireVisible(q: Q, table: 'leads' | 'projects' | 'users' | 'channel_partners', id: string | null | undefined, what: string = table) {
  if (!id) return;
  const r = await q.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (!r.rowCount) throw notFound(what);
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

export async function addLeadEvent(
  q: Q,
  e: { orgId: string; leadId: string; type: string; actorType?: 'system' | 'user' | 'agent' | 'lead' | 'partner'; actorId?: string | null; data?: unknown },
) {
  await q.query(
    `INSERT INTO lead_events (org_id, lead_id, type, actor_type, actor_id, data) VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.orgId, e.leadId, e.type, e.actorType ?? 'system', e.actorId ?? null, JSON.stringify(e.data ?? {})],
  );
}
