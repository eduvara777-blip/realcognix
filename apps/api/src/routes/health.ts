import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/health', async () => {
    const [db, redis] = await Promise.allSettled([ctx.db.query('SELECT 1'), ctx.redis.ping()]);
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
