import pg from 'pg';

export type Q = Pick<pg.PoolClient, 'query'>;

/**
 * Thin wrapper over pg.Pool.
 * tx(orgId, fn) runs fn in a transaction with app.org_id set, which the RLS policies in schema.sql key on.
 */
export class Db {
  readonly pool: pg.Pool;

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

  query<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]) {
    return this.pool.query<R>(sql, params);
  }

  async one<R extends pg.QueryResultRow = any>(sql: string, params?: unknown[]): Promise<R | null> {
    const { rows } = await this.pool.query<R>(sql, params);
    return rows[0] ?? null;
  }

  async tx<T>(orgId: string, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
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
