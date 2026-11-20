import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { useApiAuth } from '../lib/auth.js';
import { checkPromotable } from '../services/compliance.js';

/** Publishing gates: nothing promotional goes live without a RERA number (and visible RERA text). */
export async function complianceRoutes(app: FastifyInstance, ctx: AppContext) {
  useApiAuth(app, ctx);

  app.post('/compliance/check-content', async (req) => {
    const b = z.object({ projectId: z.guid(), text: z.string().min(1) }).parse(req.body);
    return checkPromotable(ctx.db, req.auth.orgId, b.projectId, b.text);
  });

  app.post<{ Params: { id: string } }>('/microsites/:id/publish', async (req, reply) => {
    const m = await ctx.db.one<{ project_id: string; rera_disclaimer: string | null; content: unknown }>(
      `SELECT project_id, rera_disclaimer, content FROM microsites WHERE id = $1 AND org_id = $2`, [req.params.id, req.auth.orgId],
    );
    if (!m) return reply.notFound();
    const verdict = await checkPromotable(ctx.db, req.auth.orgId, m.project_id, `${m.rera_disclaimer ?? ''}\n${JSON.stringify(m.content)}`);
    if (!verdict.allowed) return reply.code(422).send({ error: 'compliance_blocked', reasons: verdict.reasons });
    await ctx.db.query(`UPDATE microsites SET status = 'published', published_at = now() WHERE id = $1`, [req.params.id]);
    return { ok: true, status: 'published' };
  });

  app.post<{ Params: { id: string } }>('/creatives/:id/submit', async (req, reply) => {
    const c = await ctx.db.one<{ project_id: string; headline: string | null; primary_text: string | null; description: string | null }>(
      `SELECT project_id, headline, primary_text, description FROM creatives WHERE id = $1 AND org_id = $2`, [req.params.id, req.auth.orgId],
    );
    if (!c) return reply.notFound();
    const verdict = await checkPromotable(ctx.db, req.auth.orgId, c.project_id, [c.headline, c.primary_text, c.description].filter(Boolean).join('\n'));
    await ctx.db.query(`UPDATE creatives SET compliance = $2, status = $3 WHERE id = $1`, [req.params.id, JSON.stringify(verdict), verdict.allowed ? 'pending_approval' : 'rejected']);
    if (!verdict.allowed) return reply.code(422).send({ error: 'compliance_blocked', reasons: verdict.reasons });
    const { rows } = await ctx.db.query<{ id: string }>(
      `INSERT INTO approvals (org_id, kind, subject_type, subject_id, title, payload, compliance, requested_by_type, assignee_role)
       VALUES ($1,'creative','creative',$2,'Creative ready for review',$3,$4,'user','manager') RETURNING id`,
      [req.auth.orgId, req.params.id, JSON.stringify(c), JSON.stringify(verdict)],
    );
    return { ok: true, approvalId: rows[0]!.id };
  });
}
