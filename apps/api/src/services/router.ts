import type { AppContext } from '../context.js';
import { addLeadEvent, notFound, requireVisible } from '../lib/db.js';
import { dispatchStaged, jobSpec, redisOr, stageJob } from '../queues/outbox.js';

export interface Candidate {
  userId: string;
  name: string;
  baseWeight: number; // users.routing_weight
  languages: string[];
  localities: string[];
  activeLeads: number;
  maxActiveLeads: number;
}

export interface RoutingNeeds {
  language: string;
  locality: string | null;
  temperature: 'hot' | 'warm' | 'cold';
}

/**
 * Effective weight = base × language match (×2) × locality match (×1.5) × spare capacity.
 * Hot leads amplify the capacity factor so they go to executives with the most headroom.
 */
export function effectiveWeight(c: Candidate, needs: RoutingNeeds): { weight: number; why: string[] } {
  const why: string[] = [];
  if (c.baseWeight <= 0 || c.activeLeads >= c.maxActiveLeads) return { weight: 0, why: ['at capacity or weight 0'] };
  let w = c.baseWeight;
  if (c.languages.includes(needs.language)) {
    w *= 2;
    why.push(`speaks ${needs.language}`);
  }
  if (needs.locality && c.localities.some((l) => l.toLowerCase() === needs.locality!.toLowerCase())) {
    w *= 1.5;
    why.push(`covers ${needs.locality}`);
  }
  const spare = 1 - c.activeLeads / c.maxActiveLeads;
  w *= needs.temperature === 'hot' ? spare * spare : spare;
  why.push(`${c.activeLeads}/${c.maxActiveLeads} active`);
  return { weight: Math.round(w * 1000) / 1000, why };
}

/**
 * Smooth weighted round-robin (nginx algorithm): deterministic, spreads picks evenly in proportion to weight.
 * `current` is the persisted running weight per user; returns the pick and the new running weights.
 */
export function smoothWeightedPick(
  weights: Array<{ id: string; weight: number }>,
  current: Record<string, number>,
): { pick: string | null; next: Record<string, number> } {
  const live = weights.filter((w) => w.weight > 0);
  if (!live.length) return { pick: null, next: current };
  const total = live.reduce((s, w) => s + w.weight, 0);
  const next: Record<string, number> = {};
  let best: string | null = null;
  for (const w of live) {
    next[w.id] = (current[w.id] ?? 0) + w.weight;
    if (best === null || next[w.id]! > next[best]!) best = w.id;
  }
  next[best!] = next[best!]! - total;
  return { pick: best, next };
}

/**
 * Assign a lead: pick an executive, close any previous assignment, open a new one with an SLA deadline,
 * create a call task, and schedule the SLA check (BullMQ delayed job, SLA_MINUTES).
 */
export async function assignLead(
  ctx: AppContext,
  orgId: string,
  leadId: string,
  opts: { method: 'auto' | 'manual' | 'sla_reassign'; userId?: string; exclude?: string[]; actorUserId?: string | null } = { method: 'auto' },
): Promise<{ assignmentId: string; userId: string } | null> {
  const lead = await ctx.db.one<{ preferred_language: string; preferred_locality: string | null; project_locality: string | null; temperature: 'hot' | 'warm' | 'cold'; full_name: string | null }>(
    `SELECT l.preferred_language, l.preferred_locality, p.locality AS project_locality, l.temperature, l.full_name
       FROM leads l LEFT JOIN projects p ON p.id = l.project_id WHERE l.id = $1 AND l.org_id = $2`,
    [leadId, orgId],
  );
  if (!lead) throw notFound('lead');

  await requireVisible(ctx.db, 'users', opts.userId, 'user'); // manual assignment: the user must be in this org
  let userId = opts.userId ?? null;
  let reason: Record<string, unknown> = { method: opts.method };

  if (!userId) {
    const { rows } = await ctx.db.query<Candidate & { user_id: string }>(
      `SELECT u.id AS "userId", u.full_name AS name, u.routing_weight AS "baseWeight", u.languages, u.localities,
              u.max_active_leads AS "maxActiveLeads",
              (SELECT count(*)::int FROM assignments a WHERE a.user_id = u.id AND a.status = 'active') AS "activeLeads"
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.org_id = $1 AND u.status = 'active' AND u.is_available AND r.key = 'executive'
          AND NOT (u.id = ANY($2::uuid[]))`,
      [orgId, opts.exclude ?? []],
    );
    const needs: RoutingNeeds = { language: lead.preferred_language, locality: lead.preferred_locality ?? lead.project_locality, temperature: lead.temperature };
    const scored = rows.map((c) => ({ c, ...effectiveWeight(c, needs) }));
    const key = `router:swrr:${orgId}`;
    // Round-robin state lives in Redis; if Redis is down, pick from a fresh state rather than hold up intake.
    const current = Object.fromEntries(Object.entries(await redisOr(ctx, () => ctx.redis.hgetall(key), {} as Record<string, string>)).map(([k, v]) => [k, Number(v)]));
    const { pick, next } = smoothWeightedPick(scored.map((s) => ({ id: s.c.userId, weight: s.weight })), current);
    if (!pick) {
      ctx.log.warn({ leadId }, 'router: no executive available');
      await addLeadEvent(ctx.db, { orgId, leadId, type: 'routing_failed', data: { reason: 'no available executive' } });
      return null;
    }
    if (Object.keys(next).length) await redisOr(ctx, () => ctx.redis.hset(key, Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)]))), 0);
    userId = pick;
    const chosen = scored.find((s) => s.c.userId === pick)!;
    reason = { ...reason, user: chosen.c.name, weight: chosen.weight, why: chosen.why };
  }

  const slaDueAt = new Date(Date.now() + ctx.config.SLA_MINUTES * 60_000);
  let sla: { spec: ReturnType<typeof jobSpec<'sla'>>; outboxId: string | null } | undefined;
  const assignmentId = await ctx.db.tx(orgId, async (q) => {
    await q.query(
      `UPDATE assignments SET status = 'reassigned', ended_at = now() WHERE lead_id = $1 AND status = 'active'`,
      [leadId],
    );
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO assignments (org_id, lead_id, user_id, method, reason, sla_due_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orgId, leadId, userId, opts.method, JSON.stringify(reason), slaDueAt],
    );
    await q.query(`UPDATE leads SET owner_id = $2 WHERE id = $1`, [leadId, userId]);
    await q.query(`UPDATE users SET last_assigned_at = now() WHERE id = $1`, [userId]);
    await q.query(
      `INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at) VALUES ($1,$2,$3,'call',$4,$5)`,
      [orgId, leadId, userId, `Call ${lead.full_name ?? 'new lead'} (${lead.temperature}) within ${ctx.config.SLA_MINUTES} min`, slaDueAt],
    );
    await addLeadEvent(q, { orgId, leadId, type: 'assigned', actorType: opts.actorUserId ? 'user' : 'system', actorId: opts.actorUserId ?? null, data: { userId, ...reason, slaDueAt } });
    const id = rows[0]!.id;
    // The SLA timer is written to job_outbox in this transaction: an assignment never exists without its SLA job.
    const spec = jobSpec('sla', { orgId, assignmentId: id }, { delay: slaDueAt.getTime() - Date.now(), jobId: `sla-${id}` });
    sla = { spec, outboxId: await stageJob(q, spec) };
    return id;
  });

  await dispatchStaged(ctx, sla!.spec, sla!.outboxId);
  ctx.log.info({ leadId, userId, assignmentId }, 'lead assigned');
  return { assignmentId, userId: userId! };
}

/** SLA worker: if nobody called within SLA, reassign (up to SLA_MAX_REASSIGNS), then escalate to the manager. */
export async function handleSlaCheck(ctx: AppContext, orgId: string, assignmentId: string) {
  const a = await ctx.db.one<{ lead_id: string; user_id: string; status: string; first_contact_at: Date | null; manager_id: string | null; exec_name: string }>(
    `SELECT a.lead_id, a.user_id, a.status, a.first_contact_at, u.manager_id, u.full_name AS exec_name
       FROM assignments a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [assignmentId],
  );
  if (!a || a.status !== 'active' || a.first_contact_at) return { action: 'none' as const };

  const lead = await ctx.db.one<{ first_contact_at: Date | null; stage: string }>(`SELECT first_contact_at, stage FROM leads WHERE id = $1`, [a.lead_id]);
  if (lead?.first_contact_at || lead?.stage === 'booked' || lead?.stage === 'lost') return { action: 'none' as const };

  await ctx.db.tx(orgId, async (q) => {
    await q.query(`UPDATE assignments SET sla_breached = true WHERE id = $1`, [assignmentId]);
    await addLeadEvent(q, { orgId, leadId: a.lead_id, type: 'sla_breach', data: { assignmentId, userId: a.user_id, exec: a.exec_name } });
  });

  const prior = await ctx.db.query<{ user_id: string; method: string }>(`SELECT user_id, method FROM assignments WHERE lead_id = $1`, [a.lead_id]);
  const reassigns = prior.rows.filter((r) => r.method === 'sla_reassign').length;
  if (reassigns < ctx.config.SLA_MAX_REASSIGNS) {
    const res = await assignLead(ctx, orgId, a.lead_id, { method: 'sla_reassign', exclude: prior.rows.map((r) => r.user_id) });
    if (res) return { action: 'reassigned' as const, to: res.userId };
  }
  // Escalate: manager gets a task; lead stays with the current executive.
  await ctx.db.query(
    `INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at) VALUES ($1,$2,$3,'escalation',$4, now() + interval '10 minutes')`,
    [orgId, a.lead_id, a.manager_id, `SLA breached ${reassigns + 1}× — lead not called. Take over or reassign.`],
  );
  await addLeadEvent(ctx.db, { orgId, leadId: a.lead_id, type: 'sla_escalated', data: { managerId: a.manager_id } });
  return { action: 'escalated' as const };
}

/** Called when an executive logs the first call/contact; stops the SLA clock. */
export async function markContacted(ctx: AppContext, orgId: string, leadId: string, userId: string | null, data: { channel: string; outcome?: string; notes?: string }) {
  await ctx.db.tx(orgId, async (q) => {
    const lead = await q.query(
      `UPDATE leads SET first_contact_at = COALESCE(first_contact_at, now()), last_activity_at = now(),
              stage = CASE WHEN stage = 'new' THEN 'contacted'::lead_stage ELSE stage END
        WHERE id = $1 AND org_id = $2 RETURNING id`,
      [leadId, orgId],
    );
    if (!lead.rowCount) throw notFound('lead'); // not in this org (RLS) — write nothing that points at it
    await q.query(`UPDATE assignments SET first_contact_at = COALESCE(first_contact_at, now()) WHERE lead_id = $1 AND status = 'active'`, [leadId]);
    await q.query(`UPDATE tasks SET status = 'done', completed_at = now() WHERE lead_id = $1 AND kind = 'call' AND status = 'open'`, [leadId]);
    await addLeadEvent(q, { orgId, leadId, type: data.channel === 'call' ? 'call_logged' : 'contacted', actorType: userId ? 'user' : 'system', actorId: userId, data });
  });
  const active = await ctx.db.one<{ id: string }>(`SELECT id FROM assignments WHERE lead_id = $1 AND status = 'active'`, [leadId]);
  // Best effort: if Redis is down the SLA job still runs later and sees first_contact_at (no-op).
  if (active) await redisOr(ctx, () => ctx.queues.sla.remove(`sla-${active.id}`), 0);
}
