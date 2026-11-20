import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

/** Rejects after ms. The Redis client queues commands while disconnected (BullMQ needs maxRetriesPerRequest: null),
 *  so an unguarded ping() would hang /health for as long as Redis is down. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/health', async () => {
    const [db, redis] = await Promise.allSettled([
      withTimeout(ctx.db.lookup('SELECT 1'), 2_000),
      ctx.redis.status === 'ready' ? withTimeout(ctx.redis.ping(), 1_000) : Promise.reject(new Error(`redis ${ctx.redis.status}`)),
    ]);
    return {
      ok: db.status === 'fulfilled' && redis.status === 'fulfilled',
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
      providers: {
        llm: ctx.adapters.llm.name,
        whatsapp: ctx.adapters.whatsapp.name,
        email: ctx.adapters.email.name,
        ads: Object.keys(ctx.adapters.ads),
        storage: ctx.adapters.storage.name,
      },
    };
  });
}
