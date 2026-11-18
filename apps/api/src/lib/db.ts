import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export type Q = Pick<pg.PoolClient, 'query'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thin wrapper over pg.Pool.
 * tx(orgId, fn) runs fn in a transaction with app.org_id set, which the RLS policies in schema.sql key on.
 * Inside withOrg() (every authenticated request), query()/one() also run with app.org_id set to the caller's org.
 * Code that uses db.pool directly is not scoped and must filter by org_id itself.
 */
export class Db {
  readonly pool: pg.Pool;
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

  /** Run fn with every query()/one() scoped to orgId (app.org_id), e.g. for the life of a request. */
  withOrg<T>(orgId: string, fn: () => T): T {
    if (!UUID.test(orgId)) throw new Error('withOrg: orgId must be a UUID');
    return this.scope.run({ orgId }, fn);
  }

  get currentOrg(): string | null {
    return this.scope.getStore()?.orgId ?? null;
  }

  async query<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<pg.QueryResult<R>> {
    const org = this.currentOrg;
    if (!org) return this.pool.query<R>(sql, params);
    return this.tx(org, (q) => q.query<R>(sql, params));
  }

  async one<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<R | null> {
    const { rows } = await this.query<R>(sql, params);
    return rows[0] ?? null;
  }

  async tx<T>(orgId: string, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
    const scoped = this.currentOrg;
    if (scoped && scoped !== orgId) throw new Error('tx: orgId differs from the request org');
    if (!UUID.test(orgId)) throw new Error('tx: orgId must be a UUID');
    const client = await this.pool.connect();
    try {
      // orgId is a validated UUID, so it is safe inline; saves a round trip per transaction.
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
