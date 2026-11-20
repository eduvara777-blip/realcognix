import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppContext } from '../context.js';
import { dispatchStaged, drainOutbox, enqueueJob, jobSpec, rawJobId, redisOr, redisUsable, stageJob } from './outbox.js';

const ORG = '00000000-0000-0000-0000-000000000001';

type Call = { sql: string; params?: unknown[]; org?: string };

/** Minimal AppContext: a Redis with a settable status, queues whose add() can succeed, fail or hang, and a Db that records SQL. */
function fakeCtx(opts: { status?: string; add?: 'ok' | 'hang' | 'fail'; orgs?: string[]; rows?: unknown[]; rawRows?: unknown[] } = {}) {
  const added: { queue: string; name: string; data: unknown; opts: { jobId?: string; delay?: number } }[] = [];
  const calls: Call[] = [];
  const logs: string[] = [];
  const mode = { add: opts.add ?? 'ok' };
  const queue = (q: string) => ({
    add(name: string, data: unknown, o: { jobId?: string; delay?: number }) {
      added.push({ queue: q, name, data, opts: o });
      if (mode.add === 'hang') return new Promise(() => undefined);
      if (mode.add === 'fail') return Promise.reject(new Error('Connection is closed.'));
      return Promise.resolve({ id: o.jobId });
    },
    remove: () => new Promise(() => undefined),
  });
  const qfor = (org?: string) => ({
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params, org });
      if (/^\s*INSERT INTO job_outbox/.test(sql)) return { rows: [{ id: 'outbox-1' }], rowCount: 1 };
      if (/^\s*SELECT id, queue, payload/.test(sql)) return { rows: opts.rows ?? [], rowCount: (opts.rows ?? []).length };
      return { rows: [], rowCount: 1 };
    },
  });
  const ctx = {
    config: { ENQUEUE_TIMEOUT_MS: 100, OUTBOX_MAX_ATTEMPTS: 3, OUTBOX_DRAIN_MS: 15_000 },
    redis: { status: opts.status ?? 'ready', hgetall: () => new Promise(() => undefined) },
    queues: Object.fromEntries(['intake', 'inbound', 'sla', 'cadence', 'visit-reminders', 'reports'].map((n) => [n, queue(n)])),
    db: {
      tx: async (org: string, fn: (q: unknown) => Promise<unknown>) => fn(qfor(org)),
      lookup: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (/outbox_put_raw/.test(sql)) return { rows: [{ id: 'raw-1' }] };
        if (/outbox_pending_orgs/.test(sql)) return { rows: (opts.orgs ?? []).map((o) => ({ org_id: o, pending: 1 })) };
        if (/outbox_raw_pending/.test(sql)) return { rows: opts.rawRows ?? [] };
        return { rows: [] };
      },
    },
    log: { info: (_o: unknown, m?: string) => logs.push(`info ${m}`), warn: (_o: unknown, m?: string) => logs.push(`warn ${m}`), error: (_o: unknown, m?: string) => logs.push(`error ${m}`) },
  };
  return { ctx: ctx as unknown as AppContext, added, calls, logs, mode, redis: ctx.redis };
}

test('outbox: jobSpec keeps the jobId, turns delay into runAt, rejects ids BullMQ refuses', () => {
  const s = jobSpec('sla', { orgId: ORG, assignmentId: 'a' }, { jobId: 'sla-a', delay: 60_000 }, 1_000);
  assert.equal(s.jobId, 'sla-a');
  assert.equal(s.runAt.getTime(), 61_000);
  assert.match(jobSpec('sla', { orgId: ORG, assignmentId: 'a' }).jobId, /^sla-[0-9a-f-]{36}$/, 'generated before the first attempt');
  assert.throws(() => jobSpec('sla', { orgId: ORG, assignmentId: 'a' }, { jobId: 'sla:a' }), /invalid BullMQ jobId/);
  assert.throws(() => jobSpec('sla', { orgId: ORG, assignmentId: 'a' }, { jobId: '42' }), /invalid BullMQ jobId/);
  assert.equal(rawJobId('wa', '{"a":1}', null), rawJobId('wa', '{"a":1}', { other: true }), 'raw body wins and is deterministic');
  assert.notEqual(rawJobId('wa', '{"a":1}', null), rawJobId('wa', '{"a":2}', null));
  assert.match(rawJobId('meta', undefined, { x: 1 }), /^meta-[0-9a-f]{64}$/);
});

test('outbox: Redis up -> BullMQ add with the stored jobId and delay, nothing written', async () => {
  const f = fakeCtx();
  const r = await enqueueJob(f.ctx, 'cadence', { orgId: ORG, enrollmentId: 'e', position: 1 }, { jobId: 'cad-e-1-5', delay: 5_000 });
  assert.deepEqual(r, { via: 'queue', jobId: 'cad-e-1-5' });
  assert.equal(f.added.length, 1);
  assert.equal(f.added[0]!.opts.jobId, 'cad-e-1-5');
  assert.ok(f.added[0]!.opts.delay! > 4_000 && f.added[0]!.opts.delay! <= 5_000);
  assert.equal(f.calls.length, 0);
});

test('outbox: Redis disconnected -> straight to job_outbox in the job\'s org, no add attempted', async () => {
  for (const status of ['reconnecting', 'connecting', 'end', 'close']) {
    const f = fakeCtx({ status });
    const t = Date.now();
    const r = await enqueueJob(f.ctx, 'sla', { orgId: ORG, assignmentId: 'a1' }, { jobId: 'sla-a1', delay: 300_000 });
    assert.ok(Date.now() - t < 50, 'no wait');
    assert.equal(r.via, 'outbox');
    assert.equal(r.outboxId, 'outbox-1');
    assert.equal(f.added.length, 0, status);
    const ins = f.calls.find((c) => c.sql.includes('INSERT INTO job_outbox'))!;
    assert.equal(ins.org, ORG, 'written inside withOrg/tx for that org (RLS)');
    assert.deepEqual(ins.params!.slice(0, 3), [ORG, 'sla', 'sla']);
    assert.equal(ins.params![4], 'sla-a1');
    assert.match(ins.sql, /ON CONFLICT ON CONSTRAINT job_outbox_job DO NOTHING/);
    assert.ok((ins.params![5] as Date).getTime() > Date.now() + 290_000, 'run_at keeps the delay');
  }
});

test('outbox: a hanging add times out (ENQUEUE_TIMEOUT_MS) -> outbox; the breaker skips Redis for the next jobs', async () => {
  const f = fakeCtx({ add: 'hang' });
  const t = Date.now();
  const r = await enqueueJob(f.ctx, 'visit-reminders', { orgId: ORG, visitId: 'v', kind: '2h', scheduledAt: 'x' }, { jobId: 'visit-v-2h-1' });
  const ms = Date.now() - t;
  assert.equal(r.via, 'outbox');
  assert.ok(ms >= 90 && ms < 400, `returned after ${ms}ms`);
  assert.equal(redisUsable(f.ctx), false, 'breaker open');
  const t2 = Date.now();
  const r2 = await enqueueJob(f.ctx, 'visit-reminders', { orgId: ORG, visitId: 'v', kind: '24h', scheduledAt: 'x' }, { jobId: 'visit-v-24h-1' });
  assert.ok(Date.now() - t2 < 50 && r2.via === 'outbox' && f.added.length === 1, 'second job did not wait on Redis');
  assert.ok(f.logs.filter((l) => l.startsWith('warn redis unavailable')).length === 1, 'warned once');
});

test('outbox: a failing add (connection error) -> outbox', async () => {
  const f = fakeCtx({ add: 'fail' });
  assert.equal((await enqueueJob(f.ctx, 'sla', { orgId: ORG, assignmentId: 'b' }, { jobId: 'sla-b' })).via, 'outbox');
});

test('outbox: raw webhooks (no org) go through outbox_put_raw; org jobs without orgId are refused', async () => {
  const f = fakeCtx({ status: 'reconnecting' });
  const r = await enqueueJob(f.ctx, 'inbound', { channel: 'whatsapp', body: { entry: [] } }, { jobId: 'wa-abc' });
  assert.equal(r.via, 'outbox');
  const c = f.calls.find((x) => /outbox_put_raw/.test(x.sql))!;
  assert.match(c.sql, /^SELECT outbox_put_raw\(/);
  assert.deepEqual(c.params, ['inbound', 'inbound', JSON.stringify({ channel: 'whatsapp', body: { entry: [] } }), 'wa-abc']);
  assert.equal(f.calls.some((x) => x.sql.includes('INSERT INTO job_outbox')), false, 'never a direct unscoped insert');
  await assert.rejects(enqueueJob(f.ctx, 'reports', { kind: 'weekly' }), /has no orgId/);
});

test('outbox: staged in the caller\'s transaction, then dispatched and marked sent (or left for the drainer)', async () => {
  const up = fakeCtx();
  const spec = jobSpec('sla', { orgId: ORG, assignmentId: 'c' }, { jobId: 'sla-c' });
  const id = await up.ctx.db.tx(ORG, (q) => stageJob(q, spec));
  const r = await dispatchStaged(up.ctx, spec, id);
  assert.equal(r.via, 'queue');
  assert.ok(up.calls.some((c) => /UPDATE job_outbox SET sent_at = now\(\)/.test(c.sql) && c.org === ORG && (c.params as unknown[])[0] === 'outbox-1'));

  const down = fakeCtx({ status: 'reconnecting' });
  const r2 = await dispatchStaged(down.ctx, spec, 'outbox-9');
  assert.equal(r2.via, 'outbox');
  assert.equal(down.calls.length, 0, 'row stays unsent');
});

test('outbox: drainer skips while Redis is down; pushes rows with their stored jobId and marks them; stops on failure', async () => {
  const down = fakeCtx({ status: 'reconnecting', orgs: [ORG] });
  assert.equal((await drainOutbox(down.ctx)).skipped, 'redis reconnecting');
  assert.equal(down.calls.length, 0);

  const rows = [
    { id: 'r1', queue: 'sla', payload: { orgId: ORG, assignmentId: 'x' }, job_id: 'sla-x', run_at: new Date(Date.now() + 120_000), attempts: 0 },
    { id: 'r2', queue: 'cadence', payload: { orgId: ORG, enrollmentId: 'e', position: 2 }, job_id: 'cad-e-2-9', run_at: new Date(Date.now() - 1_000), attempts: 1 },
  ];
  const rawRows = [{ id: 'w1', queue: 'inbound', payload: { channel: 'whatsapp', body: {} }, job_id: 'wa-1', run_at: new Date(), attempts: 0 }];
  const up = fakeCtx({ orgs: [ORG], rows, rawRows });
  const res = await drainOutbox(up.ctx);
  assert.deepEqual(res, { sent: 3, failed: 0, gaveUp: 0, orgs: 1 });
  assert.deepEqual(up.added.map((a) => a.opts.jobId), ['sla-x', 'cad-e-2-9', 'wa-1'], 'same jobIds as stored');
  assert.ok(up.added[0]!.opts.delay! > 100_000, 'remaining delay kept');
  assert.equal(up.added[1]!.opts.delay, 0, 'overdue job runs now');
  const sel = up.calls.find((c) => /FOR UPDATE SKIP LOCKED/.test(c.sql))!;
  assert.equal(sel.org, ORG, 'per-org read under RLS');
  assert.equal(up.calls.filter((c) => /UPDATE job_outbox SET attempts/.test(c.sql) && (c.params as unknown[])[1] === null).length, 2);
  assert.ok(up.calls.some((c) => /SELECT outbox_raw_mark/.test(c.sql) && (c.params as unknown[])[1] === null));

  const failing = fakeCtx({ orgs: [ORG], rows: [{ ...rows[0], attempts: 2 }, rows[1]], rawRows, add: 'fail' });
  const r2 = await drainOutbox(failing.ctx);
  assert.deepEqual(r2, { sent: 0, failed: 1, gaveUp: 1, orgs: 1 }, 'first failure stops the pass; attempt 3 of 3 gives up');
  assert.equal(failing.added.length, 1);
  const mark = failing.calls.find((c) => /UPDATE job_outbox SET attempts/.test(c.sql))!;
  assert.equal((mark.params as unknown[])[1], 'redis unavailable', 'last_error recorded');
  assert.ok(failing.logs.some((l) => l.startsWith('error outbox: rows reached the attempt cap')));
});

test('outbox: redisOr returns the fallback instead of hanging', async () => {
  const f = fakeCtx();
  const t = Date.now();
  assert.deepEqual(await redisOr(f.ctx, () => (f.redis.hgetall as () => Promise<Record<string, string>>)(), {}, 50), {});
  assert.ok(Date.now() - t < 200);
  assert.equal(await redisOr(fakeCtx({ status: 'reconnecting' }).ctx, async () => 1, 0), 0);
});
