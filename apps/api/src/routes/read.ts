import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { useApiAuth } from '../lib/auth.js';

/** Read endpoints for the web UI. Every query is org-scoped (org_id filter + app.org_id via useApiAuth). */
const ClientFilter = z.object({ clientId: z.guid().optional() });
const QUALIFIED_UP = `('qualified','visit_scheduled','visited','negotiation','booked')`;

export async function readRoutes(app: FastifyInstance, ctx: AppContext) {
  useApiAuth(app, ctx);

  const orgTz = async (orgId: string) =>
    (await ctx.db.one<{ timezone: string }>(`SELECT timezone FROM organizations WHERE id = $1`, [orgId]))?.timezone ?? 'Asia/Kolkata';

  // ---------------------------------------------------------------- dashboard
  app.get('/dashboard', async (req) => {
    const { clientId } = ClientFilter.parse(req.query);
    const org = req.auth.orgId;
    const tz = await orgTz(org);
    const cid = clientId ?? null;
    return ctx.db.tx(org, async (q) => {
      // $1 org, $2 client (nullable), $3 timezone. m0 = start of this month, m1 = last month, w0 = Monday of this week.
      const B = `WITH b AS (SELECT date_trunc('month', now() AT TIME ZONE $3) AT TIME ZONE $3 AS m0,
                                   (date_trunc('month', now() AT TIME ZONE $3) - interval '1 month') AT TIME ZONE $3 AS m1,
                                   date_trunc('week', now() AT TIME ZONE $3) AT TIME ZONE $3 AS w0)`;
      const P = [org, cid, tz];
      const stages = await q.query(
        `SELECT stage, count(*)::int AS n FROM leads
          WHERE org_id = $1 AND archived_at IS NULL AND merged_into_id IS NULL AND ($2::uuid IS NULL OR client_id = $2) GROUP BY stage`, [org, cid]);
      const k = (await q.query(`${B}
        SELECT
          (SELECT count(*) FROM leads l WHERE l.org_id = $1 AND l.merged_into_id IS NULL AND ($2::uuid IS NULL OR l.client_id = $2) AND l.created_at >= b.m0)::int AS leads_mtd,
          (SELECT count(*) FROM leads l WHERE l.org_id = $1 AND l.merged_into_id IS NULL AND ($2::uuid IS NULL OR l.client_id = $2) AND l.created_at >= b.m1 AND l.created_at < b.m0)::int AS leads_prev_month,
          (SELECT round(extract(epoch FROM avg(l.first_response_at - l.created_at)))::int FROM leads l
            WHERE l.org_id = $1 AND ($2::uuid IS NULL OR l.client_id = $2) AND l.created_at >= b.m0 AND l.first_response_at IS NOT NULL) AS speed_to_lead_s,
          (SELECT count(*) FROM assignments a JOIN leads l ON l.id = a.lead_id
            WHERE a.org_id = $1 AND ($2::uuid IS NULL OR l.client_id = $2) AND a.assigned_at >= b.m0
              AND (a.sla_breached OR a.first_contact_at > a.sla_due_at OR (a.status = 'active' AND a.first_contact_at IS NULL AND a.sla_due_at < now())))::int AS sla_breaches_mtd,
          (SELECT count(*) FROM assignments a JOIN leads l ON l.id = a.lead_id
            WHERE a.org_id = $1 AND ($2::uuid IS NULL OR l.client_id = $2) AND a.status = 'active' AND a.first_contact_at IS NULL AND a.sla_due_at < now())::int AS sla_overdue_now,
          (SELECT count(*) FROM site_visits v JOIN projects p ON p.id = v.project_id
            WHERE v.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND v.scheduled_at >= b.w0 AND v.scheduled_at < b.w0 + interval '7 days' AND v.status <> 'cancelled')::int AS visits_this_week,
          (SELECT count(*) FROM site_visits v JOIN projects p ON p.id = v.project_id
            WHERE v.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND v.status = 'completed' AND v.scheduled_at >= b.m0)::int AS visits_completed_mtd,
          (SELECT count(*) FROM bookings x JOIN projects p ON p.id = x.project_id
            WHERE x.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND x.status <> 'cancelled' AND x.created_at >= b.m0)::int AS bookings_mtd,
          (SELECT COALESCE(sum(x.agreed_price_inr), 0) FROM bookings x JOIN projects p ON p.id = x.project_id
            WHERE x.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND x.status <> 'cancelled' AND x.created_at >= b.m0) AS bookings_value_mtd_inr,
          (SELECT COALESCE(sum(COALESCE(l.budget_max_inr, l.budget_min_inr)), 0) FROM leads l
            WHERE l.org_id = $1 AND ($2::uuid IS NULL OR l.client_id = $2) AND l.archived_at IS NULL AND l.merged_into_id IS NULL
              AND l.stage IN ('qualified','visit_scheduled','visited','negotiation')) AS pipeline_value_inr,
          (SELECT COALESCE(sum(c.spend_inr), 0) FROM campaigns c WHERE c.org_id = $1 AND ($2::uuid IS NULL OR c.client_id = $2) AND c.status <> 'draft') AS spend_inr,
          (SELECT sum(c.monthly_budget_inr) FROM clients c WHERE c.org_id = $1 AND ($2::uuid IS NULL OR c.id = $2) AND c.status IN ('active','onboarding')) AS monthly_budget_inr,
          (SELECT count(*) FROM approvals a WHERE a.org_id = $1 AND a.status = 'pending')::int AS approvals_pending
        FROM b`, P)).rows[0];
      const weekly = await q.query(`
        WITH w AS (SELECT generate_series(date_trunc('week', now() AT TIME ZONE $3) - interval '7 weeks', date_trunc('week', now() AT TIME ZONE $3), interval '1 week') AS wk)
        SELECT to_char(w.wk, 'YYYY-MM-DD') AS week_start,
          (SELECT count(*) FROM leads l WHERE l.org_id = $1 AND l.merged_into_id IS NULL AND ($2::uuid IS NULL OR l.client_id = $2)
              AND l.created_at >= w.wk AT TIME ZONE $3 AND l.created_at < (w.wk + interval '1 week') AT TIME ZONE $3)::int AS leads,
          (SELECT count(*) FROM site_visits v JOIN projects p ON p.id = v.project_id WHERE v.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2)
              AND v.status = 'completed' AND v.scheduled_at >= w.wk AT TIME ZONE $3 AND v.scheduled_at < (w.wk + interval '1 week') AT TIME ZONE $3)::int AS site_visits
        FROM w ORDER BY w.wk`, P);
      const bySource = await q.query(`${B}
        SELECT l.source_kind, count(*)::int AS n FROM leads l, b
         WHERE l.org_id = $1 AND l.merged_into_id IS NULL AND ($2::uuid IS NULL OR l.client_id = $2) AND l.created_at >= b.m0
         GROUP BY 1 ORDER BY 2 DESC`, P);
      const funnel = (await q.query(`${B}
        SELECT count(*)::int AS leads,
               count(*) FILTER (WHERE l.stage IN ${QUALIFIED_UP})::int AS qualified,
               count(*) FILTER (WHERE l.stage IN ('visited','negotiation','booked'))::int AS site_visits,
               count(*) FILTER (WHERE l.stage IN ('negotiation','booked'))::int AS negotiation,
               count(*) FILTER (WHERE l.stage = 'booked')::int AS booked
          FROM leads l, b WHERE l.org_id = $1 AND l.merged_into_id IS NULL AND ($2::uuid IS NULL OR l.client_id = $2) AND l.created_at >= b.m0`, P)).rows[0];
      const runs = await q.query(
        `SELECT id, agent, status, subject_type, subject_id, model, started_at, finished_at FROM agent_runs WHERE org_id = $1 ORDER BY started_at DESC LIMIT 8`, [org]);
      return {
        timezone: tz,
        generatedAt: new Date().toISOString(),
        kpis: {
          leadsMtd: k.leads_mtd, leadsPrevMonth: k.leads_prev_month, speedToLeadSeconds: k.speed_to_lead_s,
          slaBreachesMtd: k.sla_breaches_mtd, slaOverdueNow: k.sla_overdue_now,
          siteVisitsThisWeek: k.visits_this_week, siteVisitsCompletedMtd: k.visits_completed_mtd,
          bookingsMtd: k.bookings_mtd, bookingsValueMtdInr: k.bookings_value_mtd_inr, pipelineValueInr: k.pipeline_value_inr,
          approvalsPending: k.approvals_pending,
        },
        // spend_inr is lifetime campaign spend from the ads sync; budget is the sum of client monthly budgets.
        spend: { spendInr: k.spend_inr, monthlyBudgetInr: k.monthly_budget_inr, basis: 'campaign lifetime spend vs monthly budget' },
        leadsByStage: Object.fromEntries(stages.rows.map((r) => [r.stage, r.n])),
        funnelMtd: funnel,
        weekly: weekly.rows,
        leadsBySourceMtd: bySource.rows,
        recentAgentRuns: runs.rows,
      };
    });
  });

  // ---------------------------------------------------------------- clients
  app.get('/clients', async (req) => {
    const tz = await orgTz(req.auth.orgId);
    const { rows } = await ctx.db.query(
      `WITH b AS (SELECT date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2 AS m0)
       SELECT c.id, c.legal_name, c.brand_name, c.client_type, c.status, c.city, c.state, c.kyc_status, c.website,
              c.monthly_budget_inr, c.target_leads, c.target_site_visits, c.target_bookings, c.created_at,
              c.account_owner_id, u.full_name AS account_owner_name,
              (SELECT count(*) FROM projects p WHERE p.client_id = c.id)::int AS project_count,
              (SELECT count(*) FROM projects p WHERE p.client_id = c.id AND p.rera_status = 'verified')::int AS projects_rera_verified,
              (SELECT count(*) FROM leads l WHERE l.client_id = c.id AND l.merged_into_id IS NULL AND l.created_at >= b.m0)::int AS leads_mtd,
              (SELECT count(*) FROM bookings x JOIN projects p ON p.id = x.project_id
                WHERE p.client_id = c.id AND x.status <> 'cancelled' AND x.created_at >= b.m0)::int AS bookings_mtd,
              (SELECT COALESCE(sum(k.spend_inr), 0) FROM campaigns k WHERE k.client_id = c.id) AS spend_inr,
              (SELECT a.fee_model FROM agreements a WHERE a.client_id = c.id ORDER BY (a.status = 'signed') DESC, a.created_at DESC LIMIT 1) AS fee_model
         FROM clients c CROSS JOIN b LEFT JOIN users u ON u.id = c.account_owner_id
        WHERE c.org_id = $1
        ORDER BY (c.status = 'active') DESC, c.legal_name`,
      [req.auth.orgId, tz],
    );
    return { data: rows };
  });

  // ---------------------------------------------------------------- projects
  app.get('/projects', async (req) => {
    const { clientId } = ClientFilter.parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT p.id, p.client_id, COALESCE(c.brand_name, c.legal_name) AS client_name, p.name, p.slug, p.status, p.property_type,
              p.rera_number, p.rera_state, p.rera_status, p.address_line, p.locality, p.city, p.possession_date::text AS possession_date,
              p.price_min_inr, p.price_max_inr, p.amenities, p.land_area_acres, p.description, p.created_at,
              (SELECT count(*) FROM units x WHERE x.project_id = p.id)::int AS units_total,
              (SELECT count(*) FROM units x WHERE x.project_id = p.id AND x.status = 'available')::int AS units_available,
              (SELECT count(*) FROM units x WHERE x.project_id = p.id AND x.status = 'blocked')::int AS units_blocked,
              (SELECT count(*) FROM units x WHERE x.project_id = p.id AND x.status IN ('booked','sold'))::int AS units_sold,
              (SELECT COALESCE(json_agg(json_build_object(
                        'id', t.id, 'name', t.name, 'bedrooms', t.bedrooms, 'carpetAreaSqft', t.carpet_area_sqft,
                        'superBuiltUpSqft', t.super_built_up_sqft,
                        'units', (SELECT count(*) FROM units x WHERE x.unit_type_id = t.id),
                        'fromPriceInr', (SELECT min(x.list_price_inr) FROM units x WHERE x.unit_type_id = t.id),
                        'facings', (SELECT string_agg(DISTINCT x.facing::text, ', ') FROM units x WHERE x.unit_type_id = t.id))
                      ORDER BY t.bedrooms, t.name), '[]'::json)
                 FROM unit_types t WHERE t.project_id = p.id) AS unit_types
         FROM projects p JOIN clients c ON c.id = p.client_id
        WHERE p.org_id = $1 AND ($2::uuid IS NULL OR p.client_id = $2) AND p.status <> 'archived'
        ORDER BY p.created_at`,
      [req.auth.orgId, clientId ?? null],
    );
    return { data: rows };
  });

  // ---------------------------------------------------------------- campaigns
  app.get('/campaigns', async (req) => {
    const { clientId } = ClientFilter.parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT k.id, k.client_id, COALESCE(c.brand_name, c.legal_name) AS client_name, k.project_id, p.name AS project_name,
              k.name, k.platform, k.objective, k.status, k.daily_budget_inr, k.total_budget_inr, k.spend_inr, k.impressions, k.clicks,
              k.metrics_synced_at, k.starts_at, k.ends_at,
              (SELECT count(*) FROM leads l WHERE l.campaign_id = k.id AND l.merged_into_id IS NULL)::int AS leads,
              (SELECT count(*) FROM leads l WHERE l.campaign_id = k.id AND l.merged_into_id IS NULL AND l.stage IN ${QUALIFIED_UP})::int AS qualified,
              (SELECT count(*) FROM site_visits v JOIN leads l ON l.id = v.lead_id WHERE l.campaign_id = k.id AND v.status = 'completed')::int AS site_visits,
              (SELECT count(*) FROM bookings x JOIN leads l ON l.id = x.lead_id WHERE l.campaign_id = k.id AND x.status <> 'cancelled')::int AS bookings
         FROM campaigns k JOIN clients c ON c.id = k.client_id LEFT JOIN projects p ON p.id = k.project_id
        WHERE k.org_id = $1 AND ($2::uuid IS NULL OR k.client_id = $2) AND k.status <> 'archived'
        ORDER BY (k.status = 'active') DESC, k.spend_inr DESC`,
      [req.auth.orgId, clientId ?? null],
    );
    return { data: rows };
  });

  // ---------------------------------------------------------------- conversations
  app.get('/conversations', async (req) => {
    const f = z.object({
      channel: z.enum(['whatsapp', 'email', 'sms', 'call', 'web_chat', 'in_person']).optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);
    const { rows } = await ctx.db.query(
      `SELECT cv.id, cv.lead_id, cv.channel, cv.is_open, cv.ai_enabled, cv.session_expires_at, cv.last_message_at,
              l.full_name AS lead_name, l.client_id, l.project_id, p.name AS project_name,
              m.body AS last_body, m.direction AS last_direction, m.created_at AS last_message_created_at
         FROM conversations cv JOIN leads l ON l.id = cv.lead_id LEFT JOIN projects p ON p.id = l.project_id
         LEFT JOIN LATERAL (SELECT body, direction, created_at FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) m ON true
        WHERE cv.org_id = $1 AND ($2::channel_kind IS NULL OR cv.channel = $2)
        ORDER BY cv.last_message_at DESC NULLS LAST LIMIT $3`,
      [req.auth.orgId, f.channel ?? null, f.limit],
    );
    return { data: rows };
  });

  app.get<{ Params: { leadId: string } }>('/conversations/:leadId', async (req, reply) => {
    const { leadId } = z.object({ leadId: z.guid() }).parse(req.params);
    const org = req.auth.orgId;
    const lead = await ctx.db.one(
      `SELECT l.id, l.full_name, l.phone_e164, l.email::text AS email, l.stage, l.score, l.temperature, l.budget_min_inr, l.budget_max_inr,
              l.preferred_language, l.dnd, l.opted_out, l.last_inbound_at, l.project_id, p.name AS project_name, u.full_name AS owner_name
         FROM leads l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN users u ON u.id = l.owner_id
        WHERE l.id = $1 AND l.org_id = $2`, [leadId, org]);
    if (!lead) return reply.notFound();
    const [convs, msgs, consents, draft] = await Promise.all([
      ctx.db.query(`SELECT id, channel, is_open, ai_enabled, session_expires_at, last_message_at FROM conversations WHERE lead_id = $1 AND org_id = $2 ORDER BY last_message_at DESC NULLS LAST`, [leadId, org]),
      ctx.db.query(
        `SELECT id, conversation_id, direction, channel, status, sender_type, sender_user_id, template_name, subject, body, blocked_reasons,
                COALESCE(sent_at, created_at) AS at
           FROM messages WHERE lead_id = $1 AND org_id = $2 ORDER BY COALESCE(sent_at, created_at) LIMIT 500`, [leadId, org]),
      ctx.db.query(`SELECT DISTINCT ON (channel, purpose) channel, purpose, state FROM consents WHERE lead_id = $1 AND org_id = $2 ORDER BY channel, purpose, recorded_at DESC`, [leadId, org]),
      ctx.db.one(`SELECT id, title, payload, created_at FROM approvals WHERE org_id = $1 AND kind = 'outbound_message' AND subject_id = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [org, leadId]),
    ]);
    return { lead, conversations: convs.rows, messages: msgs.rows, consents: consents.rows, pendingDraft: draft };
  });
}
