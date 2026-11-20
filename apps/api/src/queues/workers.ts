import { Worker, type Job } from 'bullmq';
import type { AppContext } from '../context.js';
import type { JobData, QueueName } from './index.js';
import { enqueueJob, startOutboxDrainer } from './outbox.js';
import { intakeLead, resolveSource } from '../services/intake.js';
import { handleSlaCheck } from '../services/router.js';
import { runCadenceStep } from '../services/cadence.js';
import { handleWhatsAppEvents } from '../services/conversation.js';
import { handleVisitReminder } from '../services/site-visits.js';
import { runWeeklyReport } from '../routes/agents.js';

type Processor<K extends QueueName> = (job: Pick<Job<JobData[K]>, 'data'>) => Promise<unknown>;
export type Processors = { [K in QueueName]: Processor<K> };

/** Last Monday–Sunday in IST, as YYYY-MM-DD. */
export function lastWeekIst(now = new Date()): { start: string; end: string } {
  const ist = new Date(now.getTime() + 330 * 60_000); // IST has no DST
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow);
  const day = (d: number) => new Date(monday + d * 86_400_000).toISOString().slice(0, 10);
  return { start: day(-7), end: day(-1) };
}

/** The job handlers, separate from BullMQ so tests can run them directly. */
export function buildProcessors(ctx: AppContext): Processors {
  // Jobs that carry orgId: the whole handler runs with app.org_id = that org (RLS does the rest).
  const scoped = <K extends 'sla' | 'cadence' | 'visit-reminders'>(fn: (d: JobData[K]) => Promise<unknown>): Processor<K> =>
    async (job) => ctx.db.withOrg(job.data.orgId, () => fn(job.data));

  return {
    // Raw Meta payload: each lead's org comes from its form id (intake_resolve_source); intakeLead runs scoped.
    intake: async (job) => {
      const req = { headers: {}, body: job.data.body };
      const leads = await ctx.adapters.leadSources.metaLeadAds.parse(req);
      const out = [];
      for (const lead of leads) {
        const source = await resolveSource(ctx, { kind: 'meta_lead_ads', externalRef: lead.sourceRef });
        out.push(await intakeLead(ctx, lead, source));
      }
      return out;
    },
    // Raw WhatsApp payload: scoped per event inside handleWhatsAppEvents.
    inbound: async (job) => {
      const events = ctx.adapters.whatsapp.parseWebhook({ headers: {}, body: job.data.body });
      await handleWhatsAppEvents(ctx, events);
      return { events: events.length };
    },
    sla: scoped<'sla'>((d) => handleSlaCheck(ctx, d.orgId, d.assignmentId)),
    cadence: scoped<'cadence'>((d) => runCadenceStep(ctx, d.orgId, d.enrollmentId, d.position)),
    'visit-reminders': scoped<'visit-reminders'>((d) => handleVisitReminder(ctx, d.orgId, d.visitId, d.kind, d.scheduledAt)),
    reports: async (job) => {
      const d = job.data;
      if (d.kind === 'client') return ctx.db.withOrg(d.orgId, () => runWeeklyReport(ctx, d.orgId, d.clientId, d.periodStart, d.periodEnd));
      // Scheduler tick: the one deliberate cross-org read. system_active_clients() (SECURITY DEFINER) returns ids only;
      // each client's report is its own job, carrying its orgId.
      const { start, end } = lastWeekIst();
      const { rows } = await ctx.db.lookup<{ org_id: string; client_id: string }>(`SELECT * FROM system_active_clients()`);
      for (const c of rows) {
        await enqueueJob(ctx, 'reports', { kind: 'client', orgId: c.org_id, clientId: c.client_id, periodStart: start, periodEnd: end },
          { jobId: `report-${c.client_id}-${start}` });
      }
      return { clients: rows.length };
    },
  };
}

/** All background processing. Run in-process (RUN_WORKERS=true) or as `node dist/worker.js`. */
export async function startWorkers(ctx: AppContext): Promise<Array<Pick<Worker, 'close'>>> {
  const processors = buildProcessors(ctx);
  const concurrency: Partial<Record<QueueName, number>> = { inbound: 10, cadence: 10, intake: 5 };
  const workers = (Object.keys(processors) as QueueName[]).map((name) => {
    const w = new Worker(name, processors[name] as (job: Job) => Promise<unknown>, { connection: ctx.redis.duplicate(), concurrency: concurrency[name] ?? 3 });
    w.on('failed', (job, err) => ctx.log.error({ queue: name, jobId: job?.id, err: err.message }, 'job failed'));
    return w;
  });

  // Weekly client reports: Monday 09:00 IST.
  await ctx.queues.reports.upsertJobScheduler('weekly-client-reports', { pattern: '0 9 * * 1', tz: 'Asia/Kolkata' }, { name: 'reports', data: { kind: 'weekly' } });

  // Jobs written to job_outbox while Redis was down: moved into BullMQ every OUTBOX_DRAIN_MS once it is back.
  const drainer = startOutboxDrainer(ctx);

  ctx.log.info({ queues: workers.length, outboxDrainMs: ctx.config.OUTBOX_DRAIN_MS }, 'workers started');
  return [...workers, { close: () => drainer.stop() }];
}
