import type { AppContext } from '../context.js';
import { addLeadEvent, requireVisible } from '../lib/db.js';
import { enqueueJob } from '../queues/outbox.js';
import { sendOutbound } from './messaging.js';

const fmtIst = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);

export interface ScheduleVisitInput {
  leadId: string;
  projectId?: string;
  scheduledAt: Date;
  hostUserId?: string | null;
  attendees?: number;
  pickupRequired?: boolean;
  pickupAddress?: string | null;
  channelPartnerId?: string | null;
  notes?: string | null;
}

/** Visit Concierge (rules version): book, confirm on WhatsApp, schedule 24h + 2h reminders. */
export async function scheduleVisit(ctx: AppContext, orgId: string, actorUserId: string | null, v: ScheduleVisitInput) {
  const lead = await ctx.db.one<{ project_id: string | null; owner_id: string | null; full_name: string | null }>(
    `SELECT project_id, owner_id, full_name FROM leads WHERE id = $1 AND org_id = $2`, [v.leadId, orgId],
  );
  if (!lead) throw Object.assign(new Error('lead not found'), { statusCode: 404 });
  const projectId = v.projectId ?? lead.project_id;
  if (!projectId) throw Object.assign(new Error('projectId required (lead has no project)'), { statusCode: 400 });
  if (v.scheduledAt.getTime() < Date.now()) throw Object.assign(new Error('scheduledAt is in the past'), { statusCode: 400 });
  // Caller-supplied ids must belong to this org (foreign keys alone would accept another org's ids).
  await requireVisible(ctx.db, 'projects', v.projectId, 'project');
  await requireVisible(ctx.db, 'users', v.hostUserId, 'host user');
  await requireVisible(ctx.db, 'channel_partners', v.channelPartnerId, 'channel partner');

  const visit = await ctx.db.tx(orgId, async (q) => {
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO site_visits (org_id, lead_id, project_id, host_user_id, channel_partner_id, status, scheduled_at, attendees, pickup_required, pickup_address, notes)
       VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10) RETURNING id`,
      [orgId, v.leadId, projectId, v.hostUserId ?? lead.owner_id, v.channelPartnerId ?? null, v.scheduledAt, v.attendees ?? 1,
       v.pickupRequired ?? false, v.pickupAddress ?? null, v.notes ?? null],
    );
    await q.query(
      `UPDATE leads SET stage = CASE WHEN stage IN ('new','contacted','qualified','nurture') THEN 'visit_scheduled'::lead_stage ELSE stage END,
              next_action_at = $2, last_activity_at = now() WHERE id = $1`,
      [v.leadId, v.scheduledAt],
    );
    await q.query(`UPDATE tasks SET status = 'done', completed_at = now() WHERE lead_id = $1 AND kind = 'site_visit' AND status = 'open'`, [v.leadId]);
    await addLeadEvent(q, { orgId, leadId: v.leadId, type: 'visit_scheduled', actorType: actorUserId ? 'user' : 'system', actorId: actorUserId, data: { visitId: rows[0]!.id, at: v.scheduledAt } });
    return rows[0]!;
  });

  await scheduleReminders(ctx, orgId, visit.id, v.scheduledAt);
  await sendVisitMessage(ctx, orgId, visit.id, 'confirmation');
  return visit;
}

export async function scheduleReminders(ctx: AppContext, orgId: string, visitId: string, at: Date) {
  for (const [kind, hours] of [['24h', 24], ['2h', 2]] as const) {
    const fireAt = at.getTime() - hours * 3600_000;
    if (fireAt <= Date.now()) continue;
    await enqueueJob(ctx, 'visit-reminders', { orgId, visitId, kind, scheduledAt: at.toISOString() }, {
      delay: fireAt - Date.now(), jobId: `visit-${visitId}-${kind}-${at.getTime()}`,
    });
  }
}

/** Reminder worker. A rescheduled visit carries a new scheduledAt, so stale reminder jobs no-op. */
export async function handleVisitReminder(ctx: AppContext, orgId: string, visitId: string, kind: '24h' | '2h', scheduledAt: string) {
  const v = await ctx.db.one<{ status: string; scheduled_at: Date }>(`SELECT status, scheduled_at FROM site_visits WHERE id = $1`, [visitId]);
  if (!v || !['scheduled', 'confirmed'].includes(v.status)) return { sent: false, reason: 'not active' };
  if (new Date(v.scheduled_at).toISOString() !== new Date(scheduledAt).toISOString()) return { sent: false, reason: 'rescheduled' };
  await sendVisitMessage(ctx, orgId, visitId, kind === '24h' ? 'reminder_24h' : 'reminder_2h');
  await ctx.db.query(`UPDATE site_visits SET reminders_sent = reminders_sent || $2::jsonb WHERE id = $1`, [visitId, JSON.stringify([{ kind, at: new Date() }])]);
  return { sent: true };
}

async function sendVisitMessage(ctx: AppContext, orgId: string, visitId: string, kind: 'confirmation' | 'reminder_24h' | 'reminder_2h') {
  const d = await ctx.db.one<{ lead_id: string; scheduled_at: Date; full_name: string | null; project: string; latitude: number | null; longitude: number | null; host: string | null; host_phone: string | null }>(
    `SELECT v.lead_id, v.scheduled_at, l.full_name, p.name AS project, p.latitude, p.longitude, u.full_name AS host, u.phone_e164 AS host_phone
       FROM site_visits v JOIN leads l ON l.id = v.lead_id JOIN projects p ON p.id = v.project_id LEFT JOIN users u ON u.id = v.host_user_id
      WHERE v.id = $1`, [visitId],
  );
  if (!d) return;
  const when = fmtIst(new Date(d.scheduled_at));
  const pin = d.latitude && d.longitude ? `https://maps.google.com/?q=${d.latitude},${d.longitude}` : '';
  const name = d.full_name?.split(' ')[0] ?? 'there';
  const body = kind === 'confirmation'
    ? `Hi ${name}, your visit to ${d.project} is booked for ${when} IST. ${d.host ? `${d.host} (${d.host_phone ?? ''}) will host you. ` : ''}Location: ${pin}`
    : `Reminder: your visit to ${d.project} is ${kind === 'reminder_2h' ? 'in 2 hours' : 'tomorrow'} — ${when} IST. Location: ${pin}`;
  await sendOutbound(ctx, {
    orgId, leadId: d.lead_id, channel: 'whatsapp', purpose: 'transactional', body,
    templateName: kind === 'confirmation' ? 'visit_confirmation' : 'visit_reminder',
    templateParams: [name, d.project, when, pin],
  });
}
