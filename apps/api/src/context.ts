import { Redis } from 'ioredis';
import { createAdapters, type Adapters } from '@realcognix/adapters';
import { PgAgentStore, type AgentDeps } from '@realcognix/agents';
import type { AppConfig } from '@realcognix/core';
import { Db } from './lib/db.js';
import { createQueues, type Queues } from './queues/index.js';
import { createAuthProvider, type AuthProvider } from './auth/providers.js';
import { subjectLookup } from './auth/pg.js';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface AppContext {
  config: AppConfig;
  db: Db;
  redis: Redis;
  adapters: Adapters;
  queues: Queues;
  agents: AgentDeps;
  /** Built on first use, so the worker never needs auth settings. */
  readonly auth: AuthProvider;
  log: Logger;
}

export function createContext(config: AppConfig, log: Logger): AppContext {
  const db = new Db(config.DATABASE_URL);
  // BullMQ requires maxRetriesPerRequest: null on its connections
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const adapters = createAdapters(config);
  const store = new PgAgentStore(db); // scoped: agents only run inside db.withOrg (requests, worker jobs)
  let auth: AuthProvider | undefined;
  return {
    config,
    db,
    redis,
    adapters,
    queues: createQueues(redis),
    agents: { llm: adapters.llm, approvals: store, runs: store },
    get auth() {
      return (auth ??= createAuthProvider(config, subjectLookup(db)));
    },
    log,
  };
}

export async function closeContext(ctx: AppContext) {
  await Promise.allSettled(Object.values(ctx.queues).map((q) => q.close()));
  await ctx.redis.quit().catch(() => undefined);
  await ctx.db.close();
}

export const consoleLogger: Logger = {
  info: (o, m) => console.log(JSON.stringify({ level: 'info', msg: m, ...(typeof o === 'object' ? o : { data: o }) })),
  warn: (o, m) => console.warn(JSON.stringify({ level: 'warn', msg: m, ...(typeof o === 'object' ? o : { data: o }) })),
  error: (o, m) => console.error(JSON.stringify({ level: 'error', msg: m, ...(typeof o === 'object' ? o : { data: o }) })),
};
