import Fastify, { type FastifyServerOptions } from 'fastify';
import { loadConfig, parseTrustProxy } from '@realcognix/core';
import { buildApp } from './app.js';
import { closeContext, createContext } from './context.js';
import { startWorkers } from './queues/workers.js';

const config = loadConfig();
const opts: FastifyServerOptions = {
  trustProxy: parseTrustProxy(config.TRUST_PROXY), // default false: req.ip is the socket peer, X-Forwarded-For ignored
  logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.authorization', 'req.headers["x-intake-secret"]'] },
};
const fastify = Fastify(opts);
const ctx = createContext(config, fastify.log);
fastify.log.info({ provider: ctx.auth.name }, 'auth provider ready'); // fail fast on bad auth settings
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
