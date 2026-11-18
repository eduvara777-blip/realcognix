import Fastify from 'fastify';
import { loadConfig } from '@realcognix/core';
import { buildApp } from './app.js';
import { closeContext, createContext } from './context.js';
import { startWorkers } from './queues/workers.js';

const config = loadConfig();
const fastify = Fastify({ logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' } });
const ctx = createContext(config, fastify.log);
const app = await buildApp(ctx, fastify);

const runWorkers = (process.env.RUN_WORKERS ?? 'true') === 'true';
const workers = runWorkers ? await startWorkers(ctx) : [];

await app.listen({ port: config.PORT, host: '0.0.0.0' });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeContext(ctx);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
