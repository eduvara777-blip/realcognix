import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/**
 * Job payloads, one per queue. Every job that touches one org's data carries orgId, and its processor runs inside
 * db.withOrg(orgId). The exceptions are raw provider webhooks (intake, inbound), whose org is only known after parsing:
 * their processors resolve it per lead/event through a SECURITY DEFINER lookup and then run scoped.
 */
export interface JobData {
  intake: { kind: 'meta_lead_ads'; body: unknown };
  inbound: { channel: 'whatsapp'; body: unknown };
  sla: { orgId: string; assignmentId: string };
  cadence: { orgId: string; enrollmentId: string; position: number };
  'visit-reminders': { orgId: string; visitId: string; kind: '24h' | '2h'; scheduledAt: string };
  /** 'weekly' = the Monday scheduler tick (fans out); 'client' = one client's report, scoped to its org. */
  reports: { kind: 'weekly' } | { kind: 'client'; orgId: string; clientId: string; periodStart: string; periodEnd: string };
}

export type QueueName = keyof JobData;
export const QUEUE_NAMES: QueueName[] = ['intake', 'inbound', 'sla', 'cadence', 'visit-reminders', 'reports'];

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

export type Queues = { [K in QueueName]: Queue<JobData[K]> };

export function createQueues(connection: Redis): Queues {
  const make = <K extends QueueName>(name: K) => new Queue<JobData[K]>(name, { connection, defaultJobOptions });
  return {
    intake: make('intake'),
    inbound: make('inbound'),
    sla: make('sla'),
    cadence: make('cadence'),
    'visit-reminders': make('visit-reminders'),
    reports: make('reports'),
  };
}

/** Typed direct add (no outbox fallback; may wait on Redis). Request paths use enqueueJob() from ./outbox.js instead. */
export function enqueue<K extends QueueName>(queues: Queues, name: K, data: JobData[K], opts?: JobsOptions) {
  const q = queues[name] as unknown as Queue<JobData[K]>;
  return (q as Queue).add(name, data, opts);
}
