import type { LeadTemperature, QualificationAnswers, ScoreResult } from './types.js';

export interface ScoreInput {
  answers: QualificationAnswers;
  hasValidPhone: boolean;
  hasEmail: boolean;
  projectPriceMinInr?: number | null;
  projectPriceMaxInr?: number | null;
  sourceQualityWeight?: number; // lead_sources.quality_weight (0.5–1.5)
  repliedOnWhatsApp?: boolean;
  visitRequested?: boolean;
}

/** Transparent rule-based score (0–100). Every point has a reason the executive can read. */
export function scoreLead(i: ScoreInput): ScoreResult {
  const reasons: string[] = [];
  let s = 10;
  const add = (pts: number, why: string) => {
    s += pts;
    reasons.push(`${pts >= 0 ? '+' : ''}${pts} ${why}`);
  };

  if (i.hasValidPhone) add(10, 'valid mobile');
  if (i.hasEmail) add(5, 'email given');

  const a = i.answers;
  if (a.budgetMinInr || a.budgetMaxInr) {
    add(10, 'budget shared');
    const bMax = a.budgetMaxInr ?? a.budgetMinInr ?? 0;
    const bMin = a.budgetMinInr ?? a.budgetMaxInr ?? 0;
    if (i.projectPriceMinInr) {
      const pMin = i.projectPriceMinInr;
      const pMax = i.projectPriceMaxInr ?? pMin * 2;
      if (bMax >= pMin && bMin <= pMax) add(15, 'budget fits project price range');
      else if (bMax < pMin * 0.8) add(-10, 'budget well below project entry price');
    }
  }
  if (a.bhk?.length) add(5, 'configuration known');

  switch (a.timeline) {
    case 'immediate': add(20, 'buying immediately'); break;
    case 'within_3_months': add(15, 'buying within 3 months'); break;
    case 'within_6_months': add(8, 'buying within 6 months'); break;
    case 'within_12_months': add(3, 'buying within 12 months'); break;
    case 'just_exploring': add(-5, 'just exploring'); break;
    default: break;
  }
  if (a.loanNeed === 'no') add(5, 'self-funded');
  else if (a.loanNeed === 'yes' || a.loanNeed === 'maybe') add(3, 'loan need known');

  if (i.repliedOnWhatsApp) add(10, 'engaged on WhatsApp');
  if (i.visitRequested) add(20, 'asked for a site visit');

  const weight = i.sourceQualityWeight ?? 1;
  if (weight !== 1) {
    const before = s;
    s = Math.round(s * weight);
    reasons.push(`×${weight} source quality (${before}→${s})`);
  }
  const score = Math.max(0, Math.min(100, s));
  return { score, temperature: temperatureFor(score), reasons };
}

export function temperatureFor(score: number): LeadTemperature {
  return score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
}
