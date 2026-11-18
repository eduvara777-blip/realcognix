import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';
import type { AppContext } from './context.js';
import { healthRoutes } from './routes/health.js';
import { webhookRoutes } from './routes/webhooks.js';
import { leadRoutes } from './routes/leads.js';
import { siteVisitRoutes } from './routes/site-visits.js';
import { complianceRoutes } from './routes/compliance.js';
import { agentRoutes } from './routes/agents.js';

export async function buildApp(ctx: AppContext, app: FastifyInstance = Fastify({ logger: true })) {
  await app.register(sensible);
  await app.register(cors, { origin: true });

  // Keep the raw body for webhook signature checks (Meta X-Hub-Signature-256).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body as string;
    try {
      done(null, (body as string).length ? JSON.parse(body as string) : {});
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation_failed', issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'internal_error' : (err as Error).message });
  });

  await app.register(async (i) => healthRoutes(i, ctx));
  await app.register(async (i) => webhookRoutes(i, ctx));
  // Authenticated API under /v1
  await app.register(async (i) => leadRoutes(i, ctx), { prefix: '/v1' });
  await app.register(async (i) => siteVisitRoutes(i, ctx), { prefix: '/v1' });
  await app.register(async (i) => complianceRoutes(i, ctx), { prefix: '/v1' });
  await app.register(async (i) => agentRoutes(i, ctx), { prefix: '/v1' });
  return app;
}
