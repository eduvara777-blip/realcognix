import { Worker, type Job } from 'bullmq';
import type { AppContext } from '../context.js';
import type { JobData, QueueName } from './index.js';
import { intakeLead, resolveSource } from '../services/intake.js';
import { handleSlaCheck } from '../services/router.js';
import { runCadenceStep } from '../services/cadence.js';
import { handleWhatsAppEvents } from '../services/conversation.js';
import { handleVisitReminder } from '../services/site-visits.js';
import { runWeeklyReport } from '../routes/agents.js';

type Processor<K extends QueueName> = (job: Job<JobData[K]>) => Promise<unknown>;

/** All background processing. Run in-process (RUN_WORKERS=true) or as `node dist/worker.js`. */
export async function startWorkers(ctx: AppContext): Promise<Worker[]> {
  const processors: { [K in Exclude<QueueName, never>]: Processor<K> } = {
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
    inbound: async (job) => {
      const events = ctx.adapters.whatsapp.parseWebhook({ headers: {}, body: job.data.body });
      await handleWhatsAppEvents(ctx, events);
      return { events: events.length };
    },
    sla: (job) => handleSlaCheck(ctx, job.data.orgId, job.data.assignmentId),
    cadence: (job) => runCadenceStep(ctx, job.data.orgId, job.data.enrollmentId, job.data.position),
    'visit-reminders': (job) => handleVisitReminder(ctx, job.data.orgId, job.data.visitId, job.data.kind, job.data.scheduledAt),
    reports: async () => {
      // Previous Monday–Sunday (IST) for every active client.
      const { rows } = await ctx.db.query<{ id: string; org_id: string; start: string; end: string }>(
        `SELECT id, org_id,
                (date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '7 days')::date::text AS start,
                (date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')) - interval '1 day')::date::text AS end
           FROM clients WHERE status = 'active'`,
      );
      for (const c of rows) await runWeeklyReport(ctx, c.org_id, c.id, c.start, c.end);
      return { clients: rows.length };
    },
  };

  const concurrency: Partial<Record<QueueName, number>> = { inbound: 10, cadence: 10, intake: 5 };
  const workers = (Object.keys(processors) as QueueName[]).map((name) => {
    const w = new Worker(name, processors[name] as Processor<typeof name>, { connection: ctx.redis.duplicate(), concurrency: concurrency[name] ?? 3 });
    w.on('failed', (job, err) => ctx.log.error({ queue: name, jobId: job?.id, err: err.message }, 'job failed'));
    return w;
  });

  // Weekly client reports: Monday 09:00 IST.
  await ctx.queues.reports.upsertJobScheduler('weekly-client-reports', { pattern: '0 9 * * 1', tz: 'Asia/Kolkata' }, { name: 'reports', data: { kind: 'weekly' } });

  ctx.log.info({ queues: workers.length }, 'workers started');
  return workers;
}
