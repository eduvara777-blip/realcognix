import { runLeadQualifier } from '@realcognix/agents';
import type { InboundEvent } from '@realcognix/adapters';
import { OPT_OUT_PATTERN } from '@realcognix/core';
import type { AppContext } from '../context.js';
import { addLeadEvent } from '../lib/db.js';
import type { LeadRow } from '../lib/types.js';
import { ensureConversation, sendOutbound } from './messaging.js';
import { intakeLead } from './intake.js';
import { scoreAndSave } from './scoring.js';
import { stopEnrollments } from './cadence.js';

/**
 * Worker handler for WhatsApp webhooks: store messages, update statuses, run the Lead Qualifier.
 * The payload carries no org, so each event is scoped on its own:
 *  - delivery receipts: the org that sent the message, via the SECURITY DEFINER lookup whatsapp_message_org;
 *  - inbound messages: DEFAULT_ORG_ID (one WhatsApp number per install). Multi-tenant WhatsApp needs the
 *    receiving phone_number_id mapped to an org (integrations.config) before this can change.
 */
export async function handleWhatsAppEvents(ctx: AppContext, events: InboundEvent[]) {
  for (const ev of events) {
    if (ev.type === 'status') {
      const { rows } = await ctx.db.lookup<{ org_id: string | null }>(`SELECT whatsapp_message_org($1) AS org_id`, [ev.providerMessageId]);
      const orgId = rows[0]?.org_id;
      if (!orgId) continue; // not ours (or not stored yet)
      await ctx.db.withOrg(orgId, () => ctx.db.query(
        `UPDATE messages SET status = $2, error = COALESCE($3, error) WHERE channel = 'whatsapp' AND provider_message_id = $1`,
        [ev.providerMessageId, ev.status, ev.error ?? null],
      ));
      continue;
    }
    const orgId = ctx.config.DEFAULT_ORG_ID;
    await ctx.db.withOrg(orgId, () => handleInboundMessage(ctx, orgId, ev));
  }
}

async function handleInboundMessage(ctx: AppContext, orgId: string, ev: Extract<InboundEvent, { type: 'message' }>) {
  let lead = await ctx.db.one<LeadRow>(
    `SELECT * FROM leads WHERE org_id = $1 AND phone_e164 = $2 AND merged_into_id IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [orgId, ev.from],
  );
  if (!lead) {
    // Click-to-WhatsApp / organic: the buyer messaged first, which is a transactional basis to reply.
    const res = await intakeLead(ctx, {
      sourceKind: 'whatsapp_click', fullName: ev.profileName, phone: ev.from, message: ev.text,
      consents: [{ channel: 'whatsapp', purpose: 'transactional', source: 'whatsapp_inbound' }],
    }, null, { orgId });
    lead = await ctx.db.one<LeadRow>(`SELECT * FROM leads WHERE id = $1`, [res.leadId]);
    if (!lead) return;
  }

  const conversationId = await ensureConversation(ctx.db, orgId, lead.id, 'whatsapp', ev.from.replace('+', ''));
  const inserted = await ctx.db.query(
    `INSERT INTO messages (org_id, conversation_id, lead_id, direction, channel, status, sender_type, body, provider_message_id, sent_at)
     VALUES ($1,$2,$3,'inbound','whatsapp','received','lead',$4,$5,$6)
     ON CONFLICT (channel, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING RETURNING id`,
    [orgId, conversationId, lead.id, ev.text ?? `[${ev.messageType}]`, ev.providerMessageId, ev.timestamp],
  );
  if (!inserted.rowCount) return; // webhook retry — already processed

  await ctx.db.query(`UPDATE leads SET last_inbound_at = $2, last_activity_at = now() WHERE id = $1`, [lead.id, ev.timestamp]);
  await ctx.db.query(
    `UPDATE conversations SET last_message_at = $2, session_expires_at = $2::timestamptz + interval '24 hours' WHERE id = $1`,
    [conversationId, ev.timestamp],
  );
  await addLeadEvent(ctx.db, { orgId, leadId: lead.id, type: 'message_in', actorType: 'lead', data: { channel: 'whatsapp', text: ev.text?.slice(0, 500) } });

  // Opt-out is honoured before anything else (DPDP: withdrawal as easy as giving consent).
  if (ev.text && OPT_OUT_PATTERN.test(ev.text)) {
    await recordOptOut(ctx, orgId, lead.id, ev.providerMessageId);
  }

  const convo = await ctx.db.one<{ ai_enabled: boolean }>(`SELECT ai_enabled FROM conversations WHERE id = $1`, [conversationId]);
  if (!convo?.ai_enabled || !ev.text) return;

  const project = lead.project_id
    ? await ctx.db.one<{ name: string; locality: string | null; city: string; price_min_inr: number | null; price_max_inr: number | null; configs: string[] | null; amenities: string[] }>(
        `SELECT p.name, p.locality, p.city, p.price_min_inr, p.price_max_inr, p.amenities,
                (SELECT array_agg(name ORDER BY bedrooms) FROM unit_types WHERE project_id = p.id) AS configs
           FROM projects p WHERE p.id = $1`, [lead.project_id])
    : null;
  const history = await ctx.db.query<{ direction: string; body: string; sender_type: string }>(
    `SELECT direction, body, sender_type FROM messages WHERE conversation_id = $1 AND body IS NOT NULL ORDER BY created_at DESC LIMIT 12`,
    [conversationId],
  );
  const transcript = history.rows.reverse().map((m) => ({ from: m.direction === 'inbound' ? 'lead' as const : 'agent' as const, text: m.body }));
  const questionsAsked = history.rows.filter((m) => m.sender_type === 'agent').length;

  const out = await runLeadQualifier(ctx.agents, {
    orgId, leadId: lead.id,
    lead: { name: lead.full_name, language: lead.preferred_language, hasValidPhone: !!lead.phone_e164, hasEmail: !!lead.email },
    project: {
      name: project?.name ?? 'our project', locality: project?.locality, city: project?.city,
      priceMinInr: project?.price_min_inr, priceMaxInr: project?.price_max_inr, configurations: project?.configs ?? [],
      facts: project ? `Amenities: ${project.amenities.join(', ')}` : undefined,
    },
    known: {
      budgetMinInr: lead.budget_min_inr, budgetMaxInr: lead.budget_max_inr, bhk: lead.bhk_preference,
      timeline: lead.timeline === 'unknown' ? null : lead.timeline, loanNeed: lead.loan_need === 'unknown' ? null : lead.loan_need,
    },
    transcript, questionsAsked,
  });

  const a = out.answers;
  await ctx.db.query(
    `UPDATE leads SET budget_min_inr = $2, budget_max_inr = $3, bhk_preference = $4,
            timeline = COALESCE($5::purchase_timeline, timeline), loan_need = COALESCE($6::loan_need, loan_need),
            persona = COALESCE($7::buyer_persona, persona), preferred_language = COALESCE($8, preferred_language),
            stage = CASE WHEN $9 AND stage IN ('new','contacted') THEN 'qualified'::lead_stage ELSE stage END
      WHERE id = $1`,
    [lead.id, a.budgetMinInr ?? null, a.budgetMaxInr ?? null, a.bhk ?? null, a.timeline ?? null, a.loanNeed ?? null, a.persona ?? null,
     out.language ?? null, out.outcome === 'scored'],
  );
  await scoreAndSave(ctx, ctx.db, lead.id, { repliedOnWhatsApp: true, visitRequested: out.wantsVisit, freeText: ev.text });

  if (out.outcome === 'handoff' || out.wantsVisit) {
    if (out.outcome === 'handoff') await ctx.db.query(`UPDATE conversations SET ai_enabled = false WHERE id = $1`, [conversationId]);
    await ctx.db.query(
      `INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at) VALUES ($1,$2,$3,$4,$5, now() + interval '5 minutes')`,
      [orgId, lead.id, lead.owner_id, out.wantsVisit ? 'site_visit' : 'call',
       out.wantsVisit ? `Confirm site visit with ${lead.full_name ?? 'lead'}` : `${lead.full_name ?? 'Lead'} asked for a person — call now`],
    );
  }
  if (out.reply && out.outcome !== 'opted_out') {
    await sendOutbound(ctx, { orgId, leadId: lead.id, channel: 'whatsapp', purpose: 'transactional', body: out.reply, senderType: 'agent' });
  } else if (out.reply && out.outcome === 'opted_out') {
    // Confirmation of opt-out is the one message allowed after STOP; send directly and log.
    await ctx.adapters.whatsapp.sendText({ to: lead.phone_e164!, body: out.reply }).catch(() => undefined);
  }
}

export async function recordOptOut(ctx: AppContext, orgId: string, leadId: string, evidenceId: string) {
  await ctx.db.tx(orgId, async (q) => {
    await q.query(`UPDATE leads SET opted_out = true WHERE id = $1`, [leadId]);
    for (const [channel, purpose] of [['whatsapp', 'marketing'], ['whatsapp', 'transactional'], ['email', 'marketing'], ['call', 'calls']] as const) {
      await q.query(
        `INSERT INTO consents (org_id, lead_id, channel, purpose, state, source, evidence) VALUES ($1,$2,$3,$4,'withdrawn','STOP_keyword',$5)`,
        [orgId, leadId, channel, purpose, JSON.stringify({ messageId: evidenceId })],
      );
    }
    await addLeadEvent(q, { orgId, leadId, type: 'consent_changed', actorType: 'lead', data: { optedOut: true } });
  });
  await stopEnrollments(ctx, leadId, 'opted_out');
}
