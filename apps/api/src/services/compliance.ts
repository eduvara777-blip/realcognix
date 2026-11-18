import {
  checkPromotionalContent, isQuietHours, nextAllowedTime,
  type ChannelKind, type ComplianceResult, type ConsentPurpose, type QuietHours,
} from '@realcognix/core';
import type { Q } from '../lib/db.js';

/**
 * Compliance Guard. Every outbound message and every ad/microsite passes through here.
 *  - DPDP Act 2023: purpose-specific consent must be on record and not withdrawn.
 *  - Opt-out (STOP) blocks everything; DND blocks promotional calls/SMS (TRAI TCCCPR).
 *  - Quiet hours 21:00–09:00 IST for marketing messages and calls (transactional replies to an enquiry are exempt).
 *  - WhatsApp: free-form text only inside the 24h customer-service window, approved templates otherwise.
 *  - RERA: ads and microsites must show the project's RERA number; banned claims are rejected.
 */
export interface OutboundCheck {
  orgId: string;
  leadId: string;
  channel: ChannelKind;
  purpose: ConsentPurpose;
  at?: Date;
  whatsappTemplate?: string | null;
  quietHours: QuietHours;
}

export async function checkOutbound(q: Q, c: OutboundCheck): Promise<ComplianceResult> {
  const at = c.at ?? new Date();
  const reasons: string[] = [];
  const { rows } = await q.query<{ opted_out: boolean; dnd: boolean; last_inbound_at: Date | null }>(
    `SELECT opted_out, dnd, last_inbound_at FROM leads WHERE id = $1 AND org_id = $2`,
    [c.leadId, c.orgId],
  );
  const lead = rows[0];
  if (!lead) return { allowed: false, reasons: ['lead not found'] };

  if (lead.opted_out) reasons.push('lead opted out');
  if (lead.dnd && (c.channel === 'call' || c.channel === 'sms') && c.purpose !== 'transactional') {
    reasons.push('number is on DND / do-not-call');
  }

  // Effective consent = latest row per (channel, purpose). Transactional is also satisfied by marketing consent.
  const purposes = c.purpose === 'transactional' ? ['transactional', 'marketing'] : [c.purpose];
  const consent = await q.query<{ purpose: string; state: string }>(
    `SELECT DISTINCT ON (purpose) purpose, state FROM consents
      WHERE lead_id = $1 AND channel = $2 AND purpose = ANY($3::consent_purpose[])
      ORDER BY purpose, recorded_at DESC`,
    [c.leadId, c.channel === 'in_person' ? 'call' : c.channel, purposes],
  );
  if (!consent.rows.some((r) => r.state === 'granted')) {
    reasons.push(consent.rows.length ? `consent withdrawn for ${c.channel}/${c.purpose}` : `no ${c.purpose} consent on record for ${c.channel}`);
  }

  if (c.channel === 'whatsapp') {
    const sessionOpen = !!lead.last_inbound_at && at.getTime() - new Date(lead.last_inbound_at).getTime() < 24 * 3600 * 1000;
    if (!sessionOpen && !c.whatsappTemplate) reasons.push('outside WhatsApp 24h window: approved template required');
  }

  if (reasons.length) return { allowed: false, reasons };

  if ((c.purpose === 'marketing' || c.purpose === 'calls') && isQuietHours(at, c.quietHours)) {
    return { allowed: false, reasons: ['quiet hours (IST)'], retryAt: nextAllowedTime(at, c.quietHours) };
  }
  return { allowed: true, reasons: [] };
}

/** Ads, creatives and microsites: project must have a verified RERA number and content must show it. */
export async function checkPromotable(q: Q, orgId: string, projectId: string, text?: string): Promise<ComplianceResult> {
  const { rows } = await q.query<{ rera_number: string | null; rera_status: string }>(
    `SELECT rera_number, rera_status FROM projects WHERE id = $1 AND org_id = $2`,
    [projectId, orgId],
  );
  const p = rows[0];
  if (!p) return { allowed: false, reasons: ['project not found'] };
  const reasons: string[] = [];
  if (!p.rera_number) reasons.push('project has no RERA number');
  else if (p.rera_status === 'mismatch' || p.rera_status === 'expired') reasons.push(`RERA status is ${p.rera_status}`);
  if (text !== undefined) {
    reasons.push(...checkPromotionalContent(text, p.rera_number).reasons.filter((r) => !reasons.includes(r) && !r.startsWith('project has no')));
  }
  return { allowed: reasons.length === 0, reasons };
}
