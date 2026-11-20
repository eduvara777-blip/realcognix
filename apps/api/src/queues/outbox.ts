import { createHash, randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { AppContext } from '../context.js';
import type { Q } from '../lib/db.js';
import type { JobData, QueueName, Queues } from './index.js';

/**
 * Queue-later when Redis is down (transactional outbox, db/migrations/004_job_outbox.sql).
 *
 * Request paths never wait on Redis for longer than ENQUEUE_TIMEOUT_MS. enqueueJob() tries BullMQ first; if Redis is
 * not connected, errors, or is slow, the job is written to job_outbox (scoped to its org) and the caller carries on.
 * stageJob() + dispatchStaged() write the outbox row inside the caller's own transaction (so the row that needs the job
 * and the job commit together), then push it to BullMQ after commit and mark it sent.
 * The worker's drainer (startOutboxDrainer) moves unsent rows into BullMQ once Redis is reachable.
 *
 * Every job gets its BullMQ jobId before the first attempt and keeps it in the outbox row, so a job that reached Redis
 * late (an add that timed out but went through) and the drained copy are the same BullMQ job: it runs once.
 */

/** Raw provider webhooks: their org is resolved by the job itself, so their outbox rows have no org (definer-only). */
const RAW: ReadonlySet<QueueName> = new Set<QueueName>(['intake', 'inbound']);
/** ioredis states in which a command would sit in the offline queue instead of running. */
const DOWN_STATES = new Set(['connecting', 'reconnecting', 'close', 'end']);
const BREAKER_MS = 5_000;

export interface JobSpec<K extends QueueName = QueueName> {
  queue: K;
  data: JobData[K];
  jobId: string;
  /** Not before: the delay as an absolute time, so a job drained later still fires when it was meant to. */
  runAt: Date;
}

export type EnqueueResult = { via: 'queue' | 'outbox'; jobId: string; outboxId?: string };

export function jobSpec<K extends QueueName>(queue: K, data: JobData[K], opts: { jobId?: string; delay?: number } = {}, now = Date.now()): JobSpec<K> {
  const jobId = opts.jobId ?? `${queue}-${randomUUID()}`;
  if (jobId.includes(':') || /^\d+$/.test(jobId)) throw new Error(`jobSpec: invalid BullMQ jobId ${jobId}`);
  return { queue, data, jobId, runAt: new Date(now + Math.max(0, opts.delay ?? 0)) };
}

/** Deterministic jobId for a raw provider webhook: a provider retry of the same payload is the same job. */
export function rawJobId(prefix: 'wa' | 'meta', rawBody: string | undefined, body: unknown): string {
  return `${prefix}-${createHash('sha256').update(rawBody ?? JSON.stringify(body ?? null)).digest('hex')}`;
}

function orgOf(spec: JobSpec): string | null {
  const orgId = (spec.data as { orgId?: unknown }).orgId;
  return typeof orgId === 'string' ? orgId : null;
}

// ------------------------------------------------------------------ Redis gate
type Gate = { downUntil: number; warned: boolean };
const gates = new WeakMap<object, Gate>();
const gateOf = (queues: Queues): Gate => {
  let g = gates.get(queues);
  if (!g) gates.set(queues, (g = { downUntil: 0, warned: false }));
  return g;
};

/** False while Redis is known to be unreachable (not connected, or a recent command timed out). */
export function redisUsable(ctx: Pick<AppContext, 'redis' | 'queues'>): boolean {
  if (DOWN_STATES.has(ctx.redis.status)) return false;
  return Date.now() >= gateOf(ctx.queues).downUntil;
}

export function withTimeout<T>(p: Promise<T>, ms: number, what = 'redis'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  p.catch(() => undefined); // a command that finishes after the timeout must not become an unhandled rejection
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timeout after ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Run a Redis command for a request path, or return `fallback` when Redis is down, errors, or is slower than ms.
 * Used for the routing round-robin state and SLA timer removal, which must never hold up a request.
 */
export async function redisOr<T>(ctx: Pick<AppContext, 'redis' | 'queues' | 'log'>, fn: () => Promise<T>, fallback: T, ms = 500): Promise<T> {
  if (!redisUsable(ctx)) return fallback;
  try {
    return await withTimeout(fn(), ms);
  } catch (err) {
    tripBreaker(ctx, err);
    return fallback;
  }
}

function tripBreaker(ctx: Pick<AppContext, 'queues' | 'log'>, err: unknown) {
  const g = gateOf(ctx.queues);
  g.downUntil = Date.now() + BREAKER_MS;
  if (!g.warned) {
    g.warned = true;
    ctx.log.warn({ err: (err as Error)?.message }, 'redis unavailable: jobs go to job_outbox until it is back');
  }
}

/** One BullMQ add with the timeout. True = the job is in Redis (or already was, same jobId). */
async function tryAdd(ctx: Pick<AppContext, 'redis' | 'queues' | 'log' | 'config'>, spec: JobSpec): Promise<boolean> {
  if (!redisUsable(ctx)) return false;
  const q = ctx.queues[spec.queue] as unknown as Queue;
  try {
    await withTimeout(q.add(spec.queue, spec.data, { jobId: spec.jobId, delay: Math.max(0, spec.runAt.getTime() - Date.now()) }), ctx.config.ENQUEUE_TIMEOUT_MS);
    const g = gateOf(ctx.queues);
    if (g.warned) { g.warned = false; ctx.log.info({}, 'redis reachable again'); }
    return true;
  } catch (err) {
    tripBreaker(ctx, err);
    return false;
  }
}

// ------------------------------------------------------------------ outbox writes
const INSERT = `INSERT INTO job_outbox (org_id, queue, name, payload, job_id, run_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
  ON CONFLICT ON CONSTRAINT job_outbox_job DO NOTHING RETURNING id`;

/** Write the job to job_outbox inside the caller's transaction (q is scoped to the job's org). Returns the row id. */
export async function stageJob(q: Q, spec: JobSpec): Promise<string | null> {
  const orgId = orgOf(spec);
  if (!orgId) throw new Error(`stageJob: ${spec.queue} job has no orgId`);
  const { rows } = await q.query<{ id: string }>(INSERT, [orgId, spec.queue, spec.queue, JSON.stringify(spec.data), spec.jobId, spec.runAt]);
  return rows[0]?.id ?? null;
}

async function writeOutbox(ctx: AppContext, spec: JobSpec): Promise<string | null> {
  const orgId = orgOf(spec);
  if (orgId) return ctx.db.tx(orgId, (q) => stageJob(q, spec));
  if (!RAW.has(spec.queue)) throw new Error(`outbox: ${spec.queue} job has no orgId`);
  const { rows } = await ctx.db.lookup<{ id: string }>(`SELECT outbox_put_raw($1, $2, $3::jsonb, $4) AS id`,
    [spec.queue, spec.queue, JSON.stringify(spec.data), spec.jobId]);
  return rows[0]?.id ?? null;
}

/** Add a job from a request path: BullMQ if Redis answers in time, else job_outbox. Never hangs on Redis. */
export async function enqueueJob<K extends QueueName>(ctx: AppContext, queue: K, data: JobData[K], opts: { jobId?: string; delay?: number } = {}): Promise<EnqueueResult> {
  const spec = jobSpec(queue, data, opts);
  if (await tryAdd(ctx, spec)) return { via: 'queue', jobId: spec.jobId };
  const outboxId = await writeOutbox(ctx, spec);
  ctx.log.warn({ queue, jobId: spec.jobId, outboxId }, 'job written to outbox (redis unavailable)');
  return { via: 'outbox', jobId: spec.jobId, outboxId: outboxId ?? undefined };
}

/** After the transaction that staged it commits: push to BullMQ and mark sent; if Redis is down the drainer does it. */
export async function dispatchStaged(ctx: AppContext, spec: JobSpec, outboxId: string | null): Promise<EnqueueResult> {
  if (!(await tryAdd(ctx, spec))) {
    ctx.log.warn({ queue: spec.queue, jobId: spec.jobId, outboxId }, 'job left in outbox (redis unavailable)');
    return { via: 'outbox', jobId: spec.jobId, outboxId: outboxId ?? undefined };
  }
  const orgId = orgOf(spec)!;
  if (outboxId) {
    await ctx.db.tx(orgId, (q) => q.query(`UPDATE job_outbox SET sent_at = now(), attempts = attempts + 1 WHERE id = $1 AND sent_at IS NULL`, [outboxId]))
      .catch((err: Error) => ctx.log.warn({ outboxId, err: err.message }, 'outbox: could not mark sent; the drainer re-adds it (same jobId, no-op)'));
  }
  return { via: 'queue', jobId: spec.jobId, outboxId: outboxId ?? undefined };
}

// ------------------------------------------------------------------ drainer (worker)
interface OutboxRow { id: string; queue: QueueName; payload: unknown; job_id: string; run_at: Date; attempts: number }
export interface DrainResult { skipped?: string; sent: number; failed: number; gaveUp: number; orgs: number }

/**
 * Move unsent job_outbox rows into BullMQ. Per org under RLS: outbox_pending_orgs() (SECURITY DEFINER, ids only) says
 * which orgs have work, then each org's rows are locked (FOR UPDATE SKIP LOCKED, so two workers never take the same row),
 * added with their stored jobId and marked sent in that org's transaction. Raw webhook rows (no org) go through the
 * outbox_raw_* definer functions. Rows younger than minAgeMs are left alone (their request may still be pushing them).
 */
export async function drainOutbox(ctx: AppContext, opts: { maxAttempts?: number; batch?: number; minAgeMs?: number } = {}): Promise<DrainResult> {
  const maxAttempts = opts.maxAttempts ?? ctx.config.OUTBOX_MAX_ATTEMPTS;
  const batch = opts.batch ?? 100;
  const minAgeMs = opts.minAgeMs ?? 5_000;
  const res: DrainResult = { sent: 0, failed: 0, gaveUp: 0, orgs: 0 };
  if (ctx.redis.status !== 'ready') return { ...res, skipped: `redis ${ctx.redis.status}` };
  let redisFailed = false;

  const push = async (row: OutboxRow): Promise<string | null> => {
    const spec: JobSpec = { queue: row.queue, data: row.payload as JobData[QueueName], jobId: row.job_id, runAt: new Date(row.run_at) };
    if (redisFailed || !(await tryAdd(ctx, spec))) { redisFailed = true; return 'redis unavailable'; }
    return null;
  };
  const tally = (err: string | null, attempts: number) => {
    if (!err) res.sent++;
    else { res.failed++; if (attempts + 1 >= maxAttempts) res.gaveUp++; }
  };

  const { rows: orgs } = await ctx.db.lookup<{ org_id: string; pending: number }>(`SELECT * FROM outbox_pending_orgs($1)`, [maxAttempts]);
  for (const { org_id } of orgs) {
    if (redisFailed) break;
    res.orgs++;
    await ctx.db.tx(org_id, async (q) => {
      const { rows } = await q.query<OutboxRow>(
        `SELECT id, queue, payload, job_id, run_at, attempts FROM job_outbox
          WHERE sent_at IS NULL AND attempts < $1 AND created_at < now() - make_interval(secs => $2::double precision / 1000)
          ORDER BY created_at LIMIT $3 FOR UPDATE SKIP LOCKED`,
        [maxAttempts, minAgeMs, batch],
      );
      for (const row of rows) {
        if (redisFailed) break;
        const err = await push(row);
        await q.query(
          `UPDATE job_outbox SET attempts = attempts + 1, sent_at = CASE WHEN $2::text IS NULL THEN now() END,
                  last_error = COALESCE($2::text, last_error) WHERE id = $1`,
          [row.id, err],
        );
        tally(err, row.attempts);
      }
    });
  }

  if (!redisFailed) {
    const { rows } = await ctx.db.lookup<OutboxRow>(`SELECT * FROM outbox_raw_pending($1, $2, $3)`, [batch, maxAttempts, new Date(Date.now() - minAgeMs)]);
    for (const row of rows) {
      if (redisFailed) break;
      const err = await push(row);
      await ctx.db.lookup(`SELECT outbox_raw_mark($1, $2)`, [row.id, err]);
      tally(err, row.attempts);
    }
  }
  if (res.gaveUp) ctx.log.error({ gaveUp: res.gaveUp, maxAttempts }, 'outbox: rows reached the attempt cap and will not be retried (see job_outbox.last_error)');
  if (res.sent || res.failed) ctx.log.info({ ...res }, 'outbox drained');
  return res;
}

/** Periodic drainer for the worker process. Ticks never overlap; stop() waits for a running tick. */
export function startOutboxDrainer(ctx: AppContext, intervalMs = ctx.config.OUTBOX_DRAIN_MS) {
  let running: Promise<unknown> | null = null;
  let stopped = false;
  const tick = () => {
    if (running || stopped) return;
    running = drainOutbox(ctx)
      .catch((err: Error) => ctx.log.error({ err: err.message }, 'outbox drain failed'))
      .finally(() => { running = null; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 1_000).unref?.(); // first pass soon after start
  return {
    async stop() { stopped = true; clearInterval(timer); await running; },
  };
}
