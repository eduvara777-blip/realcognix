import { runFollowUpDrafter } from '@realcognix/agents';
import { isQuietHours, nextAllowedTime, renderTemplate, scheduleAtDayOffset, type QuietHours } from '@realcognix/core';
import type { AppContext } from '../context.js';
import { addLeadEvent } from '../lib/db.js';
import { enqueue } from '../queues/index.js';
import { sendOutbound } from './messaging.js';

interface StepRow {
  id: string;
  position: number;
  day_offset: number;
  send_at_local: string | null;
  channel: 'whatsapp' | 'email' | 'call' | 'sms';
  purpose: 'transactional' | 'marketing' | 'calls';
  template_name: string | null;
  subject: string | null;
  body: string | null;
  use_ai_draft: boolean;
  requires_approval: boolean;
}

const quiet = (ctx: AppContext): QuietHours => ({ startHour: ctx.config.QUIET_HOURS_START, endHour: ctx.config.QUIET_HOURS_END });

/** Enrol a lead and schedule its first step. Idempotent per (cadence, lead). */
export async function enrollLead(ctx: AppContext, orgId: string, leadId: string, cadenceId: string) {
  const { rows } = await ctx.db.query<{ id: string; enrolled_at: Date }>(
    `INSERT INTO cadence_enrollments (org_id, cadence_id, lead_id) VALUES ($1,$2,$3)
     ON CONFLICT (cadence_id, lead_id) DO NOTHING RETURNING id, enrolled_at`,
    [orgId, cadenceId, leadId],
  );
  const enr = rows[0];
  if (!enr) return null; // already enrolled
  await addLeadEvent(ctx.db, { orgId, leadId, type: 'cadence_enrolled', data: { cadenceId } });
  await scheduleNext(ctx, orgId, enr.id, 0);
  return enr.id;
}

/** Find the step after `afterPosition` and enqueue it at enrolled_at + day_offset (IST time, outside quiet hours). */
async function scheduleNext(ctx: AppContext, orgId: string, enrollmentId: string, afterPosition: number) {
  const next = await ctx.db.one<StepRow & { enrolled_at: Date }>(
    `SELECT s.*, e.enrolled_at FROM cadence_enrollments e
       JOIN cadence_steps s ON s.cadence_id = e.cadence_id
      WHERE e.id = $1 AND s.position > $2 ORDER BY s.position LIMIT 1`,
    [enrollmentId, afterPosition],
  );
  if (!next) {
    await ctx.db.query(`UPDATE cadence_enrollments SET status = 'completed', next_run_at = NULL WHERE id = $1`, [enrollmentId]);
    return null;
  }
  // Transactional day-0 replies go out immediately (that's the <1 min speed-to-lead); everything else respects quiet hours.
  const base = new Date(next.enrolled_at);
  const runAt = next.purpose === 'transactional' && next.day_offset === 0
    ? new Date()
    : scheduleAtDayOffset(base, next.day_offset, next.send_at_local, quiet(ctx));
  const effective = runAt.getTime() < Date.now() ? new Date() : runAt;
  await ctx.db.query(`UPDATE cadence_enrollments SET next_run_at = $2 WHERE id = $1`, [enrollmentId, effective]);
  await enqueue(ctx.queues, 'cadence', { orgId, enrollmentId, position: next.position }, {
    delay: Math.max(0, effective.getTime() - Date.now()),
    jobId: `cad-${enrollmentId}-${next.position}-${effective.getTime()}`,
  });
  return effective;
}

/** BullMQ processor for one cadence step. */
export async function runCadenceStep(ctx: AppContext, orgId: string, enrollmentId: string, position: number) {
  const row = await ctx.db.one<{
    status: string; lead_id: string; stop_on_stages: string[]; stage: string; opted_out: boolean; owner_id: string | null;
    full_name: string | null; bhk_preference: number[] | null; budget_max_inr: number | null; timeline: string; preferred_language: string;
    temperature: string; project_name: string | null; locality: string | null; city: string | null; rera_number: string | null;
  }>(
    `SELECT e.status, e.lead_id, c.stop_on_stages::text[] AS stop_on_stages, l.stage, l.opted_out, l.owner_id, l.full_name, l.bhk_preference,
            l.budget_max_inr, l.timeline, l.preferred_language, l.temperature,
            p.name AS project_name, p.locality, p.city, p.rera_number
       FROM cadence_enrollments e JOIN cadences c ON c.id = e.cadence_id JOIN leads l ON l.id = e.lead_id
       LEFT JOIN projects p ON p.id = l.project_id
      WHERE e.id = $1`,
    [enrollmentId],
  );
  if (!row || row.status !== 'active') return { result: 'inactive' };
  const leadId = row.lead_id;

  if (row.opted_out || row.stop_on_stages.includes(row.stage)) {
    await ctx.db.query(`UPDATE cadence_enrollments SET status = 'stopped', stopped_reason = $2 WHERE id = $1`, [enrollmentId, row.opted_out ? 'opted_out' : `stage ${row.stage}`]);
    return { result: 'stopped' };
  }

  const step = await ctx.db.one<StepRow>(
    `SELECT s.* FROM cadence_steps s JOIN cadence_enrollments e ON e.cadence_id = s.cadence_id WHERE e.id = $1 AND s.position = $2`,
    [enrollmentId, position],
  );
  if (!step) return { result: 'missing_step' };

  const vars = {
    name: row.full_name?.split(' ')[0] ?? 'there',
    project: row.project_name ?? 'our project',
    rera: row.rera_number ?? '',
    bhk: row.bhk_preference?.length ? `${row.bhk_preference.join('/')} BHK` : '',
    temperature: row.temperature,
  };
  let outcome: string;

  if (step.channel === 'call') {
    // Calls become tasks for the owner. Quiet hours push the due time to the morning.
    const due = isQuietHours(new Date(), quiet(ctx)) ? nextAllowedTime(new Date(), quiet(ctx)) : new Date();
    await ctx.db.query(
      `INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at) VALUES ($1,$2,$3,'follow_up',$4,$5)`,
      [orgId, leadId, row.owner_id, renderTemplate(step.body ?? 'Follow-up call with {{name}}', vars), due],
    );
    outcome = 'task_created';
  } else if (step.channel === 'whatsapp' || step.channel === 'email') {
    let body = renderTemplate(step.body ?? '', vars);
    if (step.use_ai_draft || step.requires_approval) {
      const recent = await ctx.db.query<{ direction: string; body: string }>(
        `SELECT direction, body FROM messages WHERE lead_id = $1 AND body IS NOT NULL ORDER BY created_at DESC LIMIT 6`, [leadId],
      );
      const draft = await runFollowUpDrafter(ctx.agents, {
        orgId, leadId, stepId: step.id, channel: step.channel, dayOffset: step.day_offset, baseMessage: step.body ?? '',
        useAi: step.use_ai_draft, requiresApproval: step.requires_approval,
        lead: { name: row.full_name, stage: row.stage, bhk: row.bhk_preference, budgetMaxInr: row.budget_max_inr, timeline: row.timeline, language: row.preferred_language },
        project: { name: row.project_name ?? '', locality: row.locality, city: row.city, rera: row.rera_number },
        recent: recent.rows.reverse().map((m) => ({ from: m.direction === 'inbound' ? 'lead' as const : 'agent' as const, text: m.body })),
      });
      if (draft.awaitingApproval) {
        await addLeadEvent(ctx.db, { orgId, leadId, type: 'cadence_step_awaiting_approval', actorType: 'agent', data: { stepId: step.id, approvalId: draft.approvalId } });
        await advance(ctx, orgId, enrollmentId, position);
        return { result: 'awaiting_approval', approvalId: draft.approvalId };
      }
      body = draft.draft;
    }
    const res = await sendOutbound(ctx, {
      orgId, leadId, channel: step.channel, purpose: step.purpose, body, subject: step.subject ? renderTemplate(step.subject, vars) : undefined,
      templateName: step.template_name, templateParams: [vars.name, vars.project], senderType: step.use_ai_draft ? 'agent' : 'system',
    });
    if (res.status === 'deferred') {
      // Quiet hours: re-queue the same step at 09:00 IST.
      await enqueue(ctx.queues, 'cadence', { orgId, enrollmentId, position }, { delay: res.retryAt.getTime() - Date.now(), jobId: `cad-${enrollmentId}-${position}-${res.retryAt.getTime()}` });
      return { result: 'deferred', retryAt: res.retryAt };
    }
    outcome = res.status;
  } else {
    outcome = 'unsupported_channel';
  }

  await addLeadEvent(ctx.db, { orgId, leadId, type: 'cadence_step', data: { position, dayOffset: step.day_offset, channel: step.channel, outcome } });
  await advance(ctx, orgId, enrollmentId, position);
  return { result: outcome };
}

async function advance(ctx: AppContext, orgId: string, enrollmentId: string, position: number) {
  await ctx.db.query(`UPDATE cadence_enrollments SET current_position = $2 WHERE id = $1`, [enrollmentId, position]);
  await scheduleNext(ctx, orgId, enrollmentId, position);
}

export async function stopEnrollments(ctx: AppContext, leadId: string, reason: string) {
  await ctx.db.query(
    `UPDATE cadence_enrollments SET status = 'stopped', stopped_reason = $2, next_run_at = NULL WHERE lead_id = $1 AND status = 'active'`,
    [leadId, reason],
  );
}
