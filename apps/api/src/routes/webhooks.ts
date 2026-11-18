import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { WebhookRequest } from '@realcognix/adapters';
import type { AppContext } from '../context.js';
import { requireIntakeSecret } from '../lib/auth.js';
import { enqueue } from '../queues/index.js';
import { intakeLead, resolveSource } from '../services/intake.js';

const toWebhookReq = (req: FastifyRequest): WebhookRequest => ({
  query: req.query as Record<string, string | undefined>,
  headers: req.headers,
  rawBody: req.rawBody,
  body: req.body,
});

/** Public intake endpoints. Heavy work goes to BullMQ so providers get a fast 200. */
export async function webhookRoutes(app: FastifyInstance, ctx: AppContext) {
  const { whatsapp } = ctx.adapters;
  const { metaLeadAds, websiteForm, portalEmail } = ctx.adapters.leadSources;

  // --- WhatsApp Cloud API ---------------------------------------------------
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const challenge = whatsapp.verifyChallenge(req.query as Record<string, string | undefined>);
    return challenge ? reply.type('text/plain').send(challenge) : reply.code(403).send('forbidden');
  });

  app.post('/webhooks/whatsapp', async (req, reply) => {
    const wr = toWebhookReq(req);
    if (!whatsapp.verifySignature(wr)) return reply.code(401).send({ error: 'bad signature' });
    await enqueue(ctx.queues, 'inbound', { channel: 'whatsapp', body: req.body });
    return reply.code(200).send({ ok: true });
  });

  // --- Meta Lead Ads (direct webhook; n8n path uses /webhooks/intake) --------
  app.get('/webhooks/meta-leadads', async (req, reply) => {
    const challenge = metaLeadAds.verifyChallenge(req.query as Record<string, string | undefined>);
    return challenge ? reply.type('text/plain').send(challenge) : reply.code(403).send('forbidden');
  });

  app.post('/webhooks/meta-leadads', async (req, reply) => {
    if (!metaLeadAds.verifySignature(toWebhookReq(req))) return reply.code(401).send({ error: 'bad signature' });
    await enqueue(ctx.queues, 'intake', { kind: 'meta_lead_ads', body: req.body });
    return reply.code(200).send({ ok: true });
  });

  // --- Website / microsite forms (public, keyed by lead_sources.intake_key) -
  app.post<{ Params: { intakeKey: string } }>('/webhooks/forms/:intakeKey', async (req, reply) => {
    const source = await resolveSource(ctx, { intakeKey: req.params.intakeKey });
    if (!source) return reply.code(404).send({ error: 'unknown form' });
    let leads;
    try {
      leads = await websiteForm.parse({ body: req.body, ip: req.ip, userAgent: req.headers['user-agent'], formKey: req.params.intakeKey });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.code(400).send({ error: 'invalid form', issues: err.issues });
      throw err;
    }
    const res = await intakeLead(ctx, leads[0]!, source);
    return reply.code(201).send({ ok: true, leadId: res.leadId, duplicate: res.duplicate });
  });

  // --- Server-to-server (n8n) ----------------------------------------------
  const secret = requireIntakeSecret(ctx.config);

  const PortalEmailBody = z.object({
    from: z.string(), subject: z.string(), text: z.string().optional(), html: z.string().optional(),
    messageId: z.string().optional(), receivedAt: z.string().optional(), intakeKey: z.string().optional(),
  });
  app.post('/webhooks/portal-email', { preHandler: secret }, async (req, reply) => {
    const body = PortalEmailBody.parse(req.body);
    const leads = await portalEmail.parse(body);
    if (!leads.length) return reply.code(200).send({ ok: true, leads: 0, note: 'no lead found in email' });
    const source = body.intakeKey ? await resolveSource(ctx, { intakeKey: body.intakeKey }) : null;
    const results = [];
    for (const lead of leads) results.push(await intakeLead(ctx, lead, source));
    return reply.code(201).send({ ok: true, leads: results });
  });

  const NormalizedBody = z.object({
    intakeKey: z.string().optional(),
    lead: z.object({
      sourceKind: z.string(),
      externalId: z.string().optional(),
      sourceRef: z.string().optional(),
      fullName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      city: z.string().optional(),
      message: z.string().optional(),
      projectHint: z.string().optional(),
      budgetText: z.string().optional(),
      bhkText: z.string().optional(),
      preferredLanguage: z.string().optional(),
      utm: z.record(z.string(), z.string()).optional(),
      consents: z.array(z.object({
        channel: z.enum(['whatsapp', 'email', 'sms', 'call']),
        purpose: z.enum(['transactional', 'marketing', 'calls']),
        source: z.string(),
      })).optional(),
      raw: z.unknown().optional(),
    }),
  });
  app.post('/webhooks/intake', { preHandler: secret }, async (req, reply) => {
    const { intakeKey, lead } = NormalizedBody.parse(req.body);
    const source = intakeKey
      ? await resolveSource(ctx, { intakeKey })
      : lead.sourceRef ? await resolveSource(ctx, { externalRef: lead.sourceRef }) : null;
    const res = await intakeLead(ctx, lead as Parameters<typeof intakeLead>[1], source);
    return reply.code(201).send({ ok: true, ...res });
  });
}
