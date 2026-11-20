import type { ConsentPurpose } from '@realcognix/core';
import type { AppContext } from '../context.js';
import { addLeadEvent, notFound, type Q } from '../lib/db.js';
import { checkOutbound } from './compliance.js';

export interface OutboundRequest {
  orgId: string;
  leadId: string;
  channel: 'whatsapp' | 'email';
  purpose: ConsentPurpose;
  body: string;
  subject?: string;
  /** WhatsApp approved template (required outside the 24h window). */
  templateName?: string | null;
  templateParams?: string[];
  templateLanguage?: string;
  senderType?: 'system' | 'agent' | 'user';
  senderUserId?: string | null;
}

export type OutboundResult =
  | { status: 'sent'; messageId: string; providerMessageId: string }
  | { status: 'blocked'; messageId: string; reasons: string[] }
  | { status: 'deferred'; retryAt: Date; reasons: string[] }
  | { status: 'failed'; messageId: string; error: string };

async function ensureConversation(q: Q, orgId: string, leadId: string, channel: string, threadId: string | null): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO conversations (org_id, lead_id, channel, external_thread_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (lead_id, channel) DO UPDATE SET is_open = true RETURNING id`,
    [orgId, leadId, channel, threadId],
  );
  return rows[0]!.id;
}

/**
 * The only path for outbound buyer messages. Runs the Compliance Guard, picks template vs free text for WhatsApp,
 * sends through the configured adapter, and records everything (including blocked attempts) in messages.
 */
export async function sendOutbound(ctx: AppContext, r: OutboundRequest): Promise<OutboundResult> {
  const lead = await ctx.db.one<{ phone_e164: string | null; email: string | null; last_inbound_at: Date | null; full_name: string | null }>(
    `SELECT phone_e164, email, last_inbound_at, full_name FROM leads WHERE id = $1 AND org_id = $2`,
    [r.leadId, r.orgId],
  );
  if (!lead) throw notFound('lead');

  const sessionOpen = !!lead.last_inbound_at && Date.now() - new Date(lead.last_inbound_at).getTime() < 24 * 3600 * 1000;
  const useTemplate = r.channel === 'whatsapp' && !sessionOpen;
  const verdict = await checkOutbound(ctx.db, {
    orgId: r.orgId, leadId: r.leadId, channel: r.channel, purpose: r.purpose,
    whatsappTemplate: useTemplate ? r.templateName : 'session',
    quietHours: { startHour: ctx.config.QUIET_HOURS_START, endHour: ctx.config.QUIET_HOURS_END },
  });
  if (!verdict.allowed && verdict.retryAt) return { status: 'deferred', retryAt: verdict.retryAt, reasons: verdict.reasons };

  const to = r.channel === 'whatsapp' ? lead.phone_e164 : lead.email;
  const missingAddress = !to ? [`lead has no ${r.channel === 'whatsapp' ? 'phone' : 'email'}`] : [];
  const blockedReasons = [...verdict.reasons, ...missingAddress];

  const conversationId = await ensureConversation(ctx.db, r.orgId, r.leadId, r.channel, to ?? null);
  const insert = await ctx.db.query<{ id: string }>(
    `INSERT INTO messages (org_id, conversation_id, lead_id, direction, channel, status, sender_type, sender_user_id, template_name, subject, body, blocked_reasons)
     VALUES ($1,$2,$3,'outbound',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [r.orgId, conversationId, r.leadId, r.channel, blockedReasons.length ? 'blocked' : 'queued', r.senderType ?? 'system', r.senderUserId ?? null,
     useTemplate ? r.templateName ?? null : null, r.subject ?? null, r.body, blockedReasons.length ? blockedReasons : null],
  );
  const messageId = insert.rows[0]!.id;

  if (blockedReasons.length) {
    await addLeadEvent(ctx.db, { orgId: r.orgId, leadId: r.leadId, type: 'message_blocked', data: { channel: r.channel, reasons: blockedReasons } });
    return { status: 'blocked', messageId, reasons: blockedReasons };
  }

  try {
    let providerMessageId: string;
    if (r.channel === 'whatsapp') {
      providerMessageId = useTemplate
        ? (await ctx.adapters.whatsapp.sendTemplate({ to: to!, templateName: r.templateName!, bodyParams: r.templateParams, language: r.templateLanguage })).providerMessageId
        : (await ctx.adapters.whatsapp.sendText({ to: to!, body: r.body })).providerMessageId;
    } else {
      providerMessageId = (await ctx.adapters.email.send({
        to: to!, subject: r.subject ?? 'Update from our team', text: r.body,
        headers: r.purpose === 'marketing' ? { 'List-Unsubscribe': `<${ctx.config.PUBLIC_API_URL}/unsubscribe/${r.leadId}>` } : undefined,
      })).providerMessageId;
    }
    await ctx.db.tx(r.orgId, async (q) => {
      await q.query(`UPDATE messages SET status = 'sent', provider_message_id = $2, sent_at = now() WHERE id = $1`, [messageId, providerMessageId]);
      await q.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [conversationId]);
      await q.query(`UPDATE leads SET last_activity_at = now(), first_response_at = COALESCE(first_response_at, now()) WHERE id = $1`, [r.leadId]);
      await addLeadEvent(q, {
        orgId: r.orgId, leadId: r.leadId, type: 'message_out',
        actorType: r.senderType === 'user' ? 'user' : r.senderType === 'agent' ? 'agent' : 'system', actorId: r.senderUserId ?? null,
        data: { channel: r.channel, template: useTemplate ? r.templateName : null, messageId },
      });
    });
    return { status: 'sent', messageId, providerMessageId };
  } catch (err) {
    const error = (err as Error).message;
    await ctx.db.query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1`, [messageId, error]);
    ctx.log.error({ leadId: r.leadId, channel: r.channel, error }, 'outbound send failed');
    return { status: 'failed', messageId, error };
  }
}

export { ensureConversation };
