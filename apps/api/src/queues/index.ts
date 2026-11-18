import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/** Job payloads, one per queue. */
export interface JobData {
  intake: { kind: 'meta_lead_ads'; body: unknown };
  inbound: { channel: 'whatsapp'; body: unknown };
  sla: { orgId: string; assignmentId: string };
  cadence: { orgId: string; enrollmentId: string; position: number };
  'visit-reminders': { orgId: string; visitId: string; kind: '24h' | '2h'; scheduledAt: string };
  reports: { kind: 'weekly' };
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

/** Typed add helper (BullMQ's generic name typing is awkward). */
export function enqueue<K extends QueueName>(queues: Queues, name: K, data: JobData[K], opts?: JobsOptions) {
  const q = queues[name] as unknown as Queue<JobData[K]>;
  return (q as Queue).add(name, data, opts);
}
