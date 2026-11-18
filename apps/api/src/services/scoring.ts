import { z } from 'zod';
import { isIndianMobile, scoreLead, temperatureFor, type QualificationAnswers, type ScoreResult } from '@realcognix/core';
import type { AppContext } from '../context.js';
import type { Q } from '../lib/db.js';
import type { LeadRow } from '../lib/types.js';

const LlmAdjust = z.object({ adjustment: z.number().min(-15).max(15), reason: z.string().max(200) });

/**
 * Rules first (transparent, always available). If LLM_SCORING_ENABLED, the LLM may nudge the score by ±15
 * based on free-text signals (e.g. "need to shift before school starts") — never more.
 */
export async function scoreAndSave(ctx: AppContext, q: Q, leadId: string, extra: { repliedOnWhatsApp?: boolean; visitRequested?: boolean; freeText?: string } = {}): Promise<ScoreResult> {
  const { rows } = await q.query<LeadRow & { price_min_inr: number | null; price_max_inr: number | null; quality_weight: number | null }>(
    `SELECT l.*, p.price_min_inr, p.price_max_inr, s.quality_weight
       FROM leads l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN lead_sources s ON s.id = l.source_id
      WHERE l.id = $1`,
    [leadId],
  );
  const l = rows[0];
  if (!l) throw new Error(`lead ${leadId} not found`);

  const inbound = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM messages WHERE lead_id = $1 AND direction = 'inbound'`, [leadId],
  );
  const answers: QualificationAnswers = {
    budgetMinInr: l.budget_min_inr, budgetMaxInr: l.budget_max_inr, bhk: l.bhk_preference,
    timeline: l.timeline, loanNeed: l.loan_need, persona: l.persona,
  };
  const result = scoreLead({
    answers,
    hasValidPhone: isIndianMobile(l.phone_e164) || !!l.phone_e164,
    hasEmail: !!l.email,
    projectPriceMinInr: l.price_min_inr,
    projectPriceMaxInr: l.price_max_inr,
    sourceQualityWeight: l.quality_weight ?? 1,
    repliedOnWhatsApp: extra.repliedOnWhatsApp ?? (inbound.rows[0]?.n ?? 0) > 0,
    visitRequested: extra.visitRequested,
  });

  if (ctx.config.LLM_SCORING_ENABLED && extra.freeText) {
    try {
      const { data } = await ctx.adapters.llm.json(
        [
          { role: 'system', content: 'You adjust a real-estate lead score. Reply JSON {"adjustment": -15..15, "reason": string}. Positive for urgency/intent, negative for disinterest. 0 if unclear.' },
          { role: 'user', content: `Rule score ${result.score}. Buyer said: """${extra.freeText.slice(0, 1500)}"""` },
        ],
        LlmAdjust,
      );
      if (data.adjustment) {
        result.score = Math.max(0, Math.min(100, result.score + Math.round(data.adjustment)));
        result.temperature = temperatureFor(result.score);
        result.reasons.push(`${data.adjustment > 0 ? '+' : ''}${data.adjustment} AI: ${data.reason}`);
      }
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'LLM scoring skipped');
    }
  }

  await q.query(`UPDATE leads SET score = $2, temperature = $3, score_reasons = $4 WHERE id = $1`, [
    leadId, result.score, result.temperature, JSON.stringify(result.reasons),
  ]);
  await q.query(
    `INSERT INTO lead_events (org_id, lead_id, type, data) VALUES ($1,$2,'scored',$3)`,
    [l.org_id, leadId, JSON.stringify(result)],
  );
  return result;
}
