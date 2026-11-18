import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runCreativeAgent, runReportingAgent } from '@realcognix/agents';
import type { AppContext } from '../context.js';
import { requireRole, useApiAuth } from '../lib/auth.js';
import { fetchClientMetrics } from '../services/reports.js';
import { sendOutbound } from '../services/messaging.js';

/** Agent console: trigger agents, review the approvals queue, decide. */
export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  useApiAuth(app, ctx);

  app.post('/agents/creative', async (req, reply) => {
    const b = z.object({
      projectId: z.guid(),
      persona: z.enum(['end_user', 'investor', 'nri', 'upgrade', 'first_home']).default('end_user'),
      language: z.string().default('en'),
      format: z.enum(['meta_single_image', 'google_search', 'whatsapp_template']).default('meta_single_image'),
      count: z.number().int().min(1).max(8).default(4),
    }).parse(req.body);
    const p = await ctx.db.one<{ name: string; property_type: string; locality: string | null; city: string; price_min_inr: number | null; possession_date: string | null; amenities: string[]; rera_number: string | null; configs: string[] | null }>(
      `SELECT p.name, p.property_type, p.locality, p.city, p.price_min_inr, p.possession_date::text, p.amenities, p.rera_number,
              (SELECT array_agg(name ORDER BY bedrooms) FROM unit_types WHERE project_id = p.id) AS configs
         FROM projects p WHERE p.id = $1 AND p.org_id = $2`, [b.projectId, req.auth.orgId],
    );
    if (!p) return reply.notFound();
    if (!p.rera_number) return reply.code(422).send({ error: 'compliance_blocked', reasons: ['project has no RERA number'] });
    const out = await runCreativeAgent(ctx.agents, {
      orgId: req.auth.orgId, projectId: b.projectId, persona: b.persona, language: b.language, format: b.format, count: b.count,
      project: { name: p.name, propertyType: p.property_type, locality: p.locality, city: p.city, priceFromInr: p.price_min_inr,
        configurations: p.configs ?? [], possession: p.possession_date, usps: p.amenities, reraNumber: p.rera_number },
    });
    return reply.code(201).send(out);
  });

  app.post<{ Params: { clientId: string } }>('/agents/reporting/:clientId', async (req, reply) => {
    const b = z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const out = await runWeeklyReport(ctx, req.auth.orgId, req.params.clientId, b.periodStart, b.periodEnd);
    return out ? reply.code(201).send(out) : reply.notFound();
  });

  app.get('/approvals', async (req) => {
    const f = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'expired']).default('pending') }).parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT a.*, r.agent FROM approvals a LEFT JOIN agent_runs r ON r.id = a.agent_run_id
        WHERE a.org_id = $1 AND a.status = $2 ORDER BY a.created_at DESC LIMIT 200`, [req.auth.orgId, f.status],
    );
    return { data: rows };
  });

  // Decisions: admins and managers only (owner always passes). The service token cannot decide.
  app.post<{ Params: { id: string } }>('/approvals/:id/decision', { preHandler: requireRole('admin', 'manager') }, async (req, reply) => {
    const b = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().optional(), editedPayload: z.unknown().optional() }).parse(req.body);
    const a = await ctx.db.one<{ id: string; kind: string; subject_id: string | null; payload: any; status: string }>(
      `UPDATE approvals SET status = $3, decided_by = $4, decided_at = now(), decision_note = $5,
              payload = COALESCE($6::jsonb, payload)
        WHERE id = $1 AND org_id = $2 AND status = 'pending' RETURNING id, kind, subject_id, payload, status`,
      [req.params.id, req.auth.orgId, b.decision, req.auth.userId, b.note ?? null, b.editedPayload ? JSON.stringify(b.editedPayload) : null],
    );
    if (!a) return reply.code(409).send({ error: 'approval not pending or not found' });
    if (b.decision === 'rejected') return { ok: true, status: 'rejected' };

    // Approved: carry out the proposed action.
    switch (a.kind) {
      case 'outbound_message': {
        const step = a.payload.stepId
          ? await ctx.db.one<{ template_name: string | null; purpose: 'transactional' | 'marketing' }>(`SELECT template_name, purpose FROM cadence_steps WHERE id = $1`, [a.payload.stepId])
          : null;
        const res = await sendOutbound(ctx, {
          orgId: req.auth.orgId, leadId: a.subject_id!, channel: a.payload.channel, purpose: step?.purpose ?? 'marketing', body: a.payload.body,
          templateName: step?.template_name ?? a.payload.templateName ?? null, templateParams: a.payload.templateParams, senderType: 'agent', senderUserId: req.auth.userId,
        });
        return { ok: true, status: 'approved', send: res };
      }
      case 'creative': {
        for (const v of a.payload.variants ?? []) {
          await ctx.db.query(
            `INSERT INTO creatives (org_id, project_id, persona, format, language, headline, primary_text, description, cta, rera_number_shown, status, compliance)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, p.rera_number, 'approved', $10 FROM projects p WHERE p.id = $2`,
            [req.auth.orgId, a.subject_id, a.payload.persona ?? 'unknown', a.payload.format ?? 'single_image', a.payload.language ?? 'en',
             v.headline, v.primaryText, v.description, v.cta, JSON.stringify(v.compliance ?? {})],
          );
        }
        return { ok: true, status: 'approved', creatives: (a.payload.variants ?? []).length };
      }
      case 'client_report': {
        await ctx.db.query(`UPDATE reports SET status = 'approved', narrative = $2 WHERE approval_id = $1`, [a.id, a.payload.narrative]);
        return { ok: true, status: 'approved', note: 'report approved; delivery to client contacts is a Phase 2 step' };
      }
      default:
        return { ok: true, status: 'approved' };
    }
  });
}

export async function runWeeklyReport(ctx: AppContext, orgId: string, clientId: string, periodStart: string, periodEnd: string) {
  const c = await ctx.db.one<{ brand_name: string | null; legal_name: string; target_leads: number | null; target_site_visits: number | null; target_bookings: number | null; monthly_budget_inr: number | null; projects: string[] | null }>(
    `SELECT c.brand_name, c.legal_name, c.target_leads, c.target_site_visits, c.target_bookings, c.monthly_budget_inr,
            (SELECT array_agg(name) FROM projects WHERE client_id = c.id) AS projects
       FROM clients c WHERE c.id = $1 AND c.org_id = $2`, [clientId, orgId],
  );
  if (!c) return null;
  const out = await runReportingAgent(ctx.agents, {
    orgId, clientId, clientName: c.brand_name ?? c.legal_name, projects: c.projects ?? [], periodStart, periodEnd,
    targets: { leads: c.target_leads, siteVisits: c.target_site_visits, bookings: c.target_bookings, budgetInr: c.monthly_budget_inr },
    fetchMetrics: (s, e) => fetchClientMetrics(ctx, clientId, s, e),
  });
  await ctx.db.query(
    `INSERT INTO reports (org_id, client_id, kind, period_start, period_end, metrics, narrative, status, approval_id)
     VALUES ($1,$2,'weekly_client',$3,$4,$5,$6,'pending_approval',$7)
     ON CONFLICT (client_id, project_id, kind, period_start) DO UPDATE SET metrics = EXCLUDED.metrics, narrative = EXCLUDED.narrative, approval_id = EXCLUDED.approval_id`,
    [orgId, clientId, periodStart, periodEnd, JSON.stringify(out.metrics), out.narrative, out.approvalId ?? null],
  );
  return out;
}
