import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { addLeadEvent } from '../lib/db.js';
import { useApiAuth } from '../lib/auth.js';
import { intakeLead } from '../services/intake.js';
import { assignLead, markContacted } from '../services/router.js';
import { scoreAndSave } from '../services/scoring.js';
import { sendOutbound } from '../services/messaging.js';
import { stopEnrollments } from '../services/cadence.js';

const Stage = z.enum(['new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiation', 'booked', 'lost', 'nurture']);

const ListQuery = z.object({
  stage: Stage.optional(),
  temperature: z.enum(['hot', 'warm', 'cold']).optional(),
  projectId: z.guid().optional(),
  ownerId: z.guid().optional(),
  clientId: z.guid().optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const CreateLead = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  projectId: z.guid().optional(),
  sourceKind: z.enum(['manual', 'walk_in', 'referral', 'channel_partner', 'missed_call', 'event']).default('manual'),
  city: z.string().optional(),
  message: z.string().optional(),
  budget: z.string().optional(),
  bhk: z.string().optional(),
  preferredLanguage: z.string().optional(),
  consents: z.array(z.object({ channel: z.enum(['whatsapp', 'email', 'call']), purpose: z.enum(['transactional', 'marketing', 'calls']) })).default([]),
});

const PatchLead = z.object({
  stage: Stage.optional(),
  lostReason: z.string().optional(),
  fullName: z.string().optional(),
  preferredLanguage: z.string().optional(),
  preferredLocality: z.string().optional(),
  budgetMinInr: z.number().nullable().optional(),
  budgetMaxInr: z.number().nullable().optional(),
  bhkPreference: z.array(z.number()).nullable().optional(),
  timeline: z.enum(['immediate', 'within_3_months', 'within_6_months', 'within_12_months', 'just_exploring', 'unknown']).optional(),
  loanNeed: z.enum(['yes', 'no', 'maybe', 'unknown']).optional(),
  persona: z.enum(['end_user', 'investor', 'nri', 'upgrade', 'first_home', 'unknown']).optional(),
  dnd: z.boolean().optional(),
});

const COLUMN: Record<keyof z.infer<typeof PatchLead>, string> = {
  stage: 'stage', lostReason: 'lost_reason', fullName: 'full_name', preferredLanguage: 'preferred_language',
  preferredLocality: 'preferred_locality', budgetMinInr: 'budget_min_inr', budgetMaxInr: 'budget_max_inr',
  bhkPreference: 'bhk_preference', timeline: 'timeline', loanNeed: 'loan_need', persona: 'persona', dnd: 'dnd',
};
const RESCORE_FIELDS = new Set(['budgetMinInr', 'budgetMaxInr', 'bhkPreference', 'timeline', 'loanNeed']);

export async function leadRoutes(app: FastifyInstance, ctx: AppContext) {
  useApiAuth(app, ctx);

  app.get('/leads', async (req) => {
    const f = ListQuery.parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT l.id, l.full_name, l.phone_e164, l.email, l.stage, l.score, l.temperature, l.source_kind, l.project_id, p.name AS project_name,
              l.owner_id, u.full_name AS owner_name, l.created_at, l.last_activity_at, l.next_action_at,
              l.client_id, l.budget_min_inr, l.budget_max_inr, l.bhk_preference, l.is_nri, l.preferred_language, l.timeline, l.loan_need,
              l.persona, l.first_contact_at, a.sla_due_at, a.sla_breached,
              EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (channel, purpose) state FROM consents
                                      WHERE lead_id = l.id ORDER BY channel, purpose, recorded_at DESC) k WHERE k.state = 'granted') AS has_consent,
              count(*) OVER () AS total
         FROM leads l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN users u ON u.id = l.owner_id
         LEFT JOIN assignments a ON a.lead_id = l.id AND a.status = 'active'
        WHERE l.org_id = $1 AND l.archived_at IS NULL AND l.merged_into_id IS NULL
          AND ($2::lead_stage IS NULL OR l.stage = $2) AND ($3::lead_temperature IS NULL OR l.temperature = $3)
          AND ($4::uuid IS NULL OR l.project_id = $4) AND ($5::uuid IS NULL OR l.owner_id = $5)
          AND ($6::text IS NULL OR l.full_name ILIKE '%' || $6 || '%' OR l.phone_e164 LIKE '%' || $6 || '%' OR l.email ILIKE '%' || $6 || '%')
          AND ($9::uuid IS NULL OR l.client_id = $9)
        ORDER BY l.created_at DESC LIMIT $7 OFFSET $8`,
      [req.auth.orgId, f.stage ?? null, f.temperature ?? null, f.projectId ?? null, f.ownerId ?? null, f.q ?? null, f.limit, f.offset, f.clientId ?? null],
    );
    const total = rows[0]?.total ?? 0;
    return { data: rows.map(({ total: _t, ...r }) => r), total, limit: f.limit, offset: f.offset };
  });

  app.get<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const lead = await ctx.db.one(
      `SELECT l.*, p.name AS project_name, u.full_name AS owner_name, COALESCE(c.brand_name, c.legal_name) AS client_name
         FROM leads l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN clients c ON c.id = l.client_id
        WHERE l.id = $1 AND l.org_id = $2`, [req.params.id, req.auth.orgId]);
    if (!lead) return reply.notFound();
    const [events, assignment, consents, visits, tasks] = await Promise.all([
      ctx.db.query(`SELECT type, actor_type, actor_id, data, occurred_at FROM lead_events WHERE lead_id = $1 ORDER BY occurred_at DESC LIMIT 100`, [req.params.id]),
      ctx.db.one(`SELECT a.*, u.full_name FROM assignments a JOIN users u ON u.id = a.user_id WHERE a.lead_id = $1 AND a.status = 'active'`, [req.params.id]),
      ctx.db.query(`SELECT DISTINCT ON (channel, purpose) channel, purpose, state, source, recorded_at FROM consents WHERE lead_id = $1 ORDER BY channel, purpose, recorded_at DESC`, [req.params.id]),
      ctx.db.query(`SELECT * FROM site_visits WHERE lead_id = $1 ORDER BY scheduled_at DESC`, [req.params.id]),
      ctx.db.query(`SELECT * FROM tasks WHERE lead_id = $1 AND status IN ('open','in_progress') ORDER BY due_at`, [req.params.id]),
    ]);
    return { lead, assignment, consents: consents.rows, visits: visits.rows, openTasks: tasks.rows, timeline: events.rows };
  });

  app.post('/leads', async (req, reply) => {
    const b = CreateLead.parse(req.body);
    const source = b.projectId
      ? await ctx.db.one<{ client_id: string }>(`SELECT client_id FROM projects WHERE id = $1 AND org_id = $2`, [b.projectId, req.auth.orgId])
      : null;
    const res = await intakeLead(ctx, {
      sourceKind: b.sourceKind, fullName: b.fullName, phone: b.phone, email: b.email, city: b.city, message: b.message,
      budgetText: b.budget, bhkText: b.bhk, preferredLanguage: b.preferredLanguage,
      consents: b.consents.map((c) => ({ ...c, source: `${b.sourceKind}:recorded_by_user` })),
    }, b.projectId && source ? { id: null, orgId: req.auth.orgId, clientId: source.client_id, projectId: b.projectId, campaignId: null } : null, { orgId: req.auth.orgId });
    return reply.code(201).send(res);
  });

  app.patch<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const b = PatchLead.parse(req.body);
    const entries = Object.entries(b).filter(([, v]) => v !== undefined) as Array<[keyof typeof COLUMN, unknown]>;
    if (!entries.length) return reply.badRequest('nothing to update');
    const sets = entries.map(([k], i) => `${COLUMN[k]} = $${i + 3}`).join(', ');
    const before = await ctx.db.one<{ stage: string }>(`SELECT stage FROM leads WHERE id = $1 AND org_id = $2`, [req.params.id, req.auth.orgId]);
    if (!before) return reply.notFound();
    await ctx.db.tx(req.auth.orgId, async (q) => {
      await q.query(`UPDATE leads SET ${sets}, last_activity_at = now() WHERE id = $1 AND org_id = $2`, [req.params.id, req.auth.orgId, ...entries.map(([, v]) => v)]);
      if (b.stage && b.stage !== before.stage) {
        await addLeadEvent(q, { orgId: req.auth.orgId, leadId: req.params.id, type: 'stage_changed', actorType: 'user', actorId: req.auth.userId, data: { from: before.stage, to: b.stage, lostReason: b.lostReason } });
      }
      if (b.dnd !== undefined) await addLeadEvent(q, { orgId: req.auth.orgId, leadId: req.params.id, type: 'dnd_changed', actorType: 'user', actorId: req.auth.userId, data: { dnd: b.dnd } });
    });
    if (b.stage === 'lost') await stopEnrollments(ctx, req.params.id, 'lost');
    const score = entries.some(([k]) => RESCORE_FIELDS.has(k)) ? await scoreAndSave(ctx, ctx.db.pool, req.params.id) : undefined;
    return { ok: true, score };
  });

  app.delete<{ Params: { id: string } }>('/leads/:id', async (req, reply) => {
    const res = await ctx.db.query(`UPDATE leads SET archived_at = now() WHERE id = $1 AND org_id = $2 AND archived_at IS NULL`, [req.params.id, req.auth.orgId]);
    if (!res.rowCount) return reply.notFound();
    await stopEnrollments(ctx, req.params.id, 'archived');
    return reply.code(204).send();
  });

  // --- Assignment ----------------------------------------------------------
  app.post<{ Params: { id: string } }>('/leads/:id/assign', async (req) => {
    const b = z.object({ userId: z.guid().optional() }).parse(req.body ?? {});
    const res = await assignLead(ctx, req.auth.orgId, req.params.id, { method: b.userId ? 'manual' : 'auto', userId: b.userId, actorUserId: req.auth.userId });
    return res ?? { assigned: false, reason: 'no available executive' };
  });

  app.post<{ Params: { id: string } }>('/leads/:id/contacted', async (req) => {
    const b = z.object({ channel: z.enum(['call', 'whatsapp', 'email', 'in_person']).default('call'), outcome: z.string().optional(), notes: z.string().optional() }).parse(req.body ?? {});
    await markContacted(ctx, req.auth.orgId, req.params.id, req.auth.userId, b);
    return { ok: true };
  });

  // --- Manual outbound (still passes the Compliance Guard) -------------------
  app.post<{ Params: { id: string } }>('/leads/:id/messages', async (req, reply) => {
    const b = z.object({
      channel: z.enum(['whatsapp', 'email']),
      body: z.string().min(1).max(4000),
      subject: z.string().optional(),
      templateName: z.string().optional(),
      templateParams: z.array(z.string()).optional(),
      purpose: z.enum(['transactional', 'marketing']).default('transactional'),
    }).parse(req.body);
    const res = await sendOutbound(ctx, { orgId: req.auth.orgId, leadId: req.params.id, ...b, senderType: 'user', senderUserId: req.auth.userId });
    return reply.code(res.status === 'sent' ? 201 : res.status === 'blocked' ? 422 : 202).send(res);
  });
}
