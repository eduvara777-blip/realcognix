import { loadConfig } from '@realcognix/core';
import { closeContext, consoleLogger, createContext } from './context.js';
import { startWorkers } from './queues/workers.js';

/** Standalone worker process (scale separately from the API: `node dist/worker.js`). */
const ctx = createContext(loadConfig(), consoleLogger);
const workers = await startWorkers(ctx);

const shutdown = async () => {
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeContext(ctx);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
