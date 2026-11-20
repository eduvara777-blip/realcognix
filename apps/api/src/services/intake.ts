import {
  isIndianMobile, parseBhk, parseBudgetInr, type LeadSourceKind, type NormalizedLead,
} from '@realcognix/core';
import type { AppContext } from '../context.js';
import { addLeadEvent, isUniqueViolation, type Q } from '../lib/db.js';
import { findDuplicate, identityOf, mergeInto } from './dedupe.js';
import { scoreAndSave } from './scoring.js';
import { assignLead } from './router.js';
import { enrollLead } from './cadence.js';

export interface ResolvedSource {
  id: string | null;
  orgId: string;
  clientId: string | null;
  projectId: string | null;
  campaignId: string | null;
}

/**
 * Find the lead_sources row for an inbound lead by intake key (forms) or external ref (Meta form id).
 * Runs before the org is known, so it goes through the SECURITY DEFINER lookup intake_resolve_source (003_app_role.sql),
 * which returns only ids. An external ref registered by more than one org is ambiguous and resolves to nothing.
 */
export async function resolveSource(ctx: AppContext, by: { intakeKey?: string; kind?: LeadSourceKind; externalRef?: string }): Promise<ResolvedSource | null> {
  if (!by.intakeKey && !by.externalRef) return null;
  const { rows } = await ctx.db.lookup<{ id: string; org_id: string; client_id: string | null; project_id: string | null; campaign_id: string | null }>(
    `SELECT * FROM intake_resolve_source($1, $2, $3::lead_source_kind)`,
    [by.intakeKey ?? null, by.intakeKey ? null : by.externalRef ?? null, by.kind ?? null],
  );
  const r = rows[0];
  return r ? { id: r.id, orgId: r.org_id, clientId: r.client_id, projectId: r.project_id, campaignId: r.campaign_id } : null;
}

export interface IntakeResult {
  leadId: string;
  orgId: string;
  duplicate: boolean;
}

/**
 * Lead capture pipeline (blueprint stages 6–9):
 * normalise → dedupe → store lead + consents + event → score → route (SLA timer) → enrol cadence
 * (cadence day-0 steps are the <1 min auto-response: WhatsApp template + brochure email + call task).
 */
export async function intakeLead(ctx: AppContext, n: NormalizedLead, source: ResolvedSource | null, opts: { orgId?: string } = {}): Promise<IntakeResult> {
  // Webhooks without a resolvable source fall back to DEFAULT_ORG_ID (single-agency default).
  const orgId = source?.orgId ?? opts.orgId ?? ctx.config.DEFAULT_ORG_ID;
  // Everything below runs scoped to the lead's org (throws if called inside a different org's scope).
  return ctx.db.withOrg(orgId, () => intakeScoped(ctx, orgId, n, source));
}

async function intakeScoped(ctx: AppContext, orgId: string, n: NormalizedLead, source: ResolvedSource | null): Promise<IntakeResult> {
  const identity = identityOf(n.phone, n.email);
  if (!identity.phoneE164 && !identity.emailNormalized) {
    throw Object.assign(new Error('lead needs a valid phone or email'), { statusCode: 422 });
  }

  let projectId = source?.projectId ?? null;
  let clientId = source?.clientId ?? null;
  if (!projectId && n.projectHint) {
    const p = await ctx.db.one<{ id: string; client_id: string }>(
      `SELECT id, client_id FROM projects WHERE org_id = $1 AND $2 ILIKE '%' || name || '%' ORDER BY length(name) DESC LIMIT 1`,
      [orgId, n.projectHint],
    );
    if (p) ({ id: projectId, client_id: clientId } = p);
  }

  const budget = parseBudgetInr(n.budgetText ?? n.message);
  const bhk = parseBhk(n.bhkText ?? n.message);
  const isNri = !!identity.phoneE164 && !identity.phoneE164.startsWith('+91');

  const { leadId, duplicate } = await ctx.db.tx(orgId, async (q) => {
    const existing = await findDuplicate(q, orgId, projectId, identity);
    if (existing) {
      await mergeInto(q, existing, { fullName: n.fullName, email: n.email, emailNormalized: identity.emailNormalized, city: n.city });
      await addLeadEvent(q, { orgId, leadId: existing.id, type: 'duplicate_inquiry', data: { source: n.sourceKind, utm: n.utm, message: n.message } });
      await storeConsents(q, orgId, existing.id, n);
      return { leadId: existing.id, duplicate: true };
    }
    try {
      await q.query('SAVEPOINT ins');
      const { rows } = await q.query<{ id: string }>(
        `INSERT INTO leads (org_id, client_id, project_id, source_id, source_kind, campaign_id, external_id, full_name, phone_raw, phone_e164,
                            email, email_normalized, city, preferred_language, budget_min_inr, budget_max_inr, bhk_preference, is_nri, persona,
                            utm, raw_payload, last_activity_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now()) RETURNING id`,
        [orgId, clientId, projectId, source?.id ?? null, n.sourceKind, source?.campaignId ?? null, n.externalId ?? null, n.fullName ?? null,
         n.phone ?? null, identity.phoneE164, n.email ?? null, identity.emailNormalized, n.city ?? null, n.preferredLanguage ?? 'en',
         budget?.min ?? null, budget?.max ?? null, bhk, isNri, isNri ? 'nri' : 'unknown', JSON.stringify(n.utm ?? {}), JSON.stringify(n.raw ?? null)],
      );
      const id = rows[0]!.id;
      await addLeadEvent(q, { orgId, leadId: id, type: 'created', data: { source: n.sourceKind, sourceId: source?.id, utm: n.utm } });
      await storeConsents(q, orgId, id, n);
      return { leadId: id, duplicate: false };
    } catch (err) {
      // Concurrent webhook retries (same phone or same Meta leadgen_id): treat as duplicate.
      if (!isUniqueViolation(err)) throw err;
      await q.query('ROLLBACK TO SAVEPOINT ins');
      const again = await findDuplicate(q, orgId, projectId, identity)
        ?? (await q.query<{ id: string }>(`SELECT id FROM leads WHERE org_id = $1 AND source_kind = $2 AND external_id = $3`, [orgId, n.sourceKind, n.externalId])).rows[0];
      if (!again) throw err;
      return { leadId: (again as { id: string }).id, duplicate: true };
    }
  });

  if (duplicate) {
    ctx.log.info({ leadId, source: n.sourceKind }, 'duplicate enquiry merged');
    return { leadId, orgId, duplicate };
  }

  await scoreAndSave(ctx, ctx.db, leadId, { freeText: n.message });
  await assignLead(ctx, orgId, leadId, { method: 'auto' }).catch((err) => ctx.log.error({ err: err.message, leadId }, 'routing failed'));

  const cadence = projectId
    ? await ctx.db.one<{ default_cadence_id: string | null }>(`SELECT default_cadence_id FROM projects WHERE id = $1`, [projectId])
    : null;
  if (cadence?.default_cadence_id) await enrollLead(ctx, orgId, leadId, cadence.default_cadence_id);
  else ctx.log.warn({ leadId }, 'no cadence configured for project; no auto-response sent');

  ctx.log.info({ leadId, source: n.sourceKind, validMobile: isIndianMobile(identity.phoneE164) }, 'lead captured');
  return { leadId, orgId, duplicate };
}

async function storeConsents(q: Q, orgId: string, leadId: string, n: NormalizedLead) {
  for (const c of n.consents ?? []) {
    await q.query(
      `INSERT INTO consents (org_id, lead_id, channel, purpose, state, source, notice_version, evidence)
       VALUES ($1,$2,$3,$4,'granted',$5,$6,$7)`,
      [orgId, leadId, c.channel, c.purpose, c.source, c.noticeVersion ?? null, JSON.stringify({ sourceKind: n.sourceKind, receivedAt: n.receivedAt })],
    );
  }
}
