import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { addLeadEvent } from '../lib/db.js';
import { requireApiAuth } from '../lib/auth.js';
import { scheduleReminders, scheduleVisit } from '../services/site-visits.js';

const VisitStatus = z.enum(['requested', 'scheduled', 'confirmed', 'completed', 'no_show', 'cancelled', 'rescheduled']);

export async function siteVisitRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook('preHandler', requireApiAuth(ctx.config));

  app.post('/site-visits', async (req, reply) => {
    const b = z.object({
      leadId: z.string().uuid(),
      projectId: z.string().uuid().optional(),
      scheduledAt: z.coerce.date(), // ISO with offset, e.g. 2026-11-21T11:00:00+05:30
      hostUserId: z.string().uuid().optional(),
      attendees: z.number().int().min(1).max(20).optional(),
      pickupRequired: z.boolean().optional(),
      pickupAddress: z.string().optional(),
      channelPartnerId: z.string().uuid().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const visit = await scheduleVisit(ctx, req.auth.orgId, req.auth.userId, b);
    return reply.code(201).send(visit);
  });

  app.get('/site-visits', async (req) => {
    const f = z.object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      status: VisitStatus.optional(),
      projectId: z.string().uuid().optional(),
      hostUserId: z.string().uuid().optional(),
    }).parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT v.*, l.full_name AS lead_name, l.phone_e164, p.name AS project_name, u.full_name AS host_name
         FROM site_visits v JOIN leads l ON l.id = v.lead_id JOIN projects p ON p.id = v.project_id LEFT JOIN users u ON u.id = v.host_user_id
        WHERE v.org_id = $1 AND v.scheduled_at >= COALESCE($2, now() - interval '1 day') AND v.scheduled_at < COALESCE($3, now() + interval '30 days')
          AND ($4::visit_status IS NULL OR v.status = $4) AND ($5::uuid IS NULL OR v.project_id = $5) AND ($6::uuid IS NULL OR v.host_user_id = $6)
        ORDER BY v.scheduled_at`,
      [req.auth.orgId, f.from ?? null, f.to ?? null, f.status ?? null, f.projectId ?? null, f.hostUserId ?? null],
    );
    return { data: rows };
  });

  app.patch<{ Params: { id: string } }>('/site-visits/:id', async (req, reply) => {
    const b = z.object({
      status: VisitStatus.optional(),
      scheduledAt: z.coerce.date().optional(),
      hostUserId: z.string().uuid().optional(),
      feedback: z.object({
        rating: z.number().int().min(1).max(5).optional(),
        liked: z.array(z.string()).optional(),
        concerns: z.array(z.string()).optional(),
        nextStep: z.enum(['negotiation', 'second_visit', 'thinking', 'not_interested']).optional(),
      }).optional(),
      interestLevel: z.enum(['hot', 'warm', 'cold']).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const v = await ctx.db.one<{ lead_id: string; status: string }>(`SELECT lead_id, status FROM site_visits WHERE id = $1 AND org_id = $2`, [req.params.id, req.auth.orgId]);
    if (!v) return reply.notFound();
    const orgId = req.auth.orgId;

    await ctx.db.tx(orgId, async (q) => {
      await q.query(
        `UPDATE site_visits SET status = COALESCE($2, status), scheduled_at = COALESCE($3, scheduled_at), host_user_id = COALESCE($4, host_user_id),
                feedback = COALESCE($5, feedback), interest_level = COALESCE($6, interest_level), notes = COALESCE($7, notes),
                checked_in_at = CASE WHEN $2 = 'completed' THEN COALESCE(checked_in_at, now()) ELSE checked_in_at END
          WHERE id = $1`,
        [req.params.id, b.scheduledAt && !b.status ? 'rescheduled' : b.status ?? null, b.scheduledAt ?? null, b.hostUserId ?? null,
         b.feedback ? JSON.stringify(b.feedback) : null, b.interestLevel ?? null, b.notes ?? null],
      );
      if (b.status === 'completed') {
        const next = b.feedback?.nextStep === 'negotiation' ? 'negotiation' : b.feedback?.nextStep === 'not_interested' ? 'nurture' : 'visited';
        await q.query(`UPDATE leads SET stage = $2::lead_stage, temperature = COALESCE($3::lead_temperature, temperature) WHERE id = $1`, [v.lead_id, next, b.interestLevel ?? null]);
        await addLeadEvent(q, { orgId, leadId: v.lead_id, type: 'visit_completed', actorType: 'user', actorId: req.auth.userId, data: { visitId: req.params.id, feedback: b.feedback } });
      } else if (b.status === 'no_show') {
        await q.query(
          `INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at)
           SELECT $1, $2, owner_id, 'follow_up', 'Visit no-show — call to reschedule', now() + interval '2 hours' FROM leads WHERE id = $2`,
          [orgId, v.lead_id],
        );
        await addLeadEvent(q, { orgId, leadId: v.lead_id, type: 'visit_no_show', data: { visitId: req.params.id } });
      } else if (b.status === 'cancelled') {
        await addLeadEvent(q, { orgId, leadId: v.lead_id, type: 'visit_cancelled', actorType: 'user', actorId: req.auth.userId, data: { visitId: req.params.id } });
      }
      if (b.scheduledAt) {
        await addLeadEvent(q, { orgId, leadId: v.lead_id, type: 'visit_rescheduled', actorType: 'user', actorId: req.auth.userId, data: { visitId: req.params.id, at: b.scheduledAt } });
      }
    });
    // New time → new reminder jobs; old ones see a different scheduledAt and no-op.
    if (b.scheduledAt) await scheduleReminders(ctx, orgId, req.params.id, b.scheduledAt);
    return ctx.db.one(`SELECT * FROM site_visits WHERE id = $1`, [req.params.id]);
  });
}
