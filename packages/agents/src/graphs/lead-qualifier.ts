import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import {
  OPT_OUT_PATTERN, formatInr, parseBhk, parseBudgetInr, scoreLead,
  type QualificationAnswers, type ScoreResult,
} from '@realcognix/core';
import { prompt } from '../prompts.js';
import { withRun, type AgentDeps, type RunTracer } from '../runtime.js';

/**
 * Lead Qualifier — WhatsApp Q&A that learns budget, BHK, timeline and loan need, then scores the lead.
 * Invoked once per inbound message; state is persisted on the lead row between turns.
 * Works without an LLM: extraction falls back to regex parsing and questions to fixed copy.
 */

export type QualField = 'budget' | 'bhk' | 'timeline' | 'loan';
const FIELD_ORDER: QualField[] = ['bhk', 'budget', 'timeline', 'loan'];

export interface QualifierInput {
  orgId: string;
  leadId: string;
  lead: { name?: string | null; language?: string | null; hasValidPhone: boolean; hasEmail: boolean; sourceQualityWeight?: number };
  project: { name: string; locality?: string | null; city?: string | null; priceMinInr?: number | null; priceMaxInr?: number | null; configurations: string[]; facts?: string };
  known: QualificationAnswers;
  /** Oldest first. */
  transcript: Array<{ from: 'lead' | 'agent'; text: string }>;
  /** Questions already asked in this conversation, to avoid nagging. */
  questionsAsked: number;
  maxQuestions?: number;
}

export interface QualifierOutput {
  outcome: 'ask' | 'scored' | 'handoff' | 'opted_out';
  reply?: string;
  answers: QualificationAnswers;
  score?: ScoreResult;
  wantsVisit: boolean;
  language?: string;
}

const ExtractSchema = z.object({
  budgetMinInr: z.number().nullable().optional(),
  budgetMaxInr: z.number().nullable().optional(),
  bhk: z.array(z.number()).nullable().optional(),
  timeline: z.enum(['immediate', 'within_3_months', 'within_6_months', 'within_12_months', 'just_exploring']).nullable().optional(),
  loanNeed: z.enum(['yes', 'no', 'maybe']).nullable().optional(),
  persona: z.enum(['end_user', 'investor', 'nri', 'upgrade', 'first_home']).nullable().optional(),
  wantsVisit: z.boolean().default(false),
  wantsHuman: z.boolean().default(false),
  optOut: z.boolean().default(false),
  language: z.string().nullable().optional(),
});

const State = Annotation.Root({
  input: Annotation<QualifierInput>(),
  answers: Annotation<QualificationAnswers>({ reducer: (a, b) => ({ ...a, ...stripNulls(b) }), default: () => ({}) }),
  wantsVisit: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  wantsHuman: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  optOut: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  language: Annotation<string | undefined>(),
  missing: Annotation<QualField[]>({ reducer: (_a, b) => b, default: () => [] }),
  reply: Annotation<string | undefined>(),
  score: Annotation<ScoreResult | undefined>(),
  outcome: Annotation<QualifierOutput['outcome'] | undefined>(),
});
type S = typeof State.State;
type U = typeof State.Update;

export function buildLeadQualifierGraph(deps: AgentDeps, tracer: RunTracer) {
  const extract = async (s: S): Promise<U> => {
    const { input } = s;
    const lastLead = [...input.transcript].reverse().find((m) => m.from === 'lead')?.text ?? '';
    // Deterministic pass first: cheap, and the fallback when the LLM is down.
    const rules: QualificationAnswers = {};
    const budget = parseBudgetInr(lastLead);
    if (budget) Object.assign(rules, { budgetMinInr: budget.min ?? null, budgetMaxInr: budget.max ?? null });
    const bhk = parseBhk(lastLead);
    if (bhk) rules.bhk = bhk;
    if (/\bloan\b/i.test(lastLead)) rules.loanNeed = /\b(no|not|without|self)\b/i.test(lastLead) ? 'no' : 'yes';
    let update: U = {
      answers: { ...input.known, ...rules },
      optOut: OPT_OUT_PATTERN.test(lastLead),
      wantsVisit: /\b(visit|site|see the (flat|property|project)|come (on|this)|saturday|sunday)\b/i.test(lastLead),
      language: input.lead.language ?? 'en',
    };

    try {
      const { data, result } = await deps.llm.json(
        [{
          role: 'user',
          content: prompt('lead-qualifier.extract', {
            ...projectVars(input),
            known: JSON.stringify({ ...input.known, ...rules }),
            transcript: input.transcript.slice(-12).map((m) => `${m.from}: ${m.text}`).join('\n'),
          }),
        }],
        ExtractSchema,
      );
      tracer.usage(result.tokensIn, result.tokensOut, result.model);
      update = {
        answers: { ...input.known, ...rules, ...stripNulls(data as QualificationAnswers) },
        optOut: update.optOut || data.optOut,
        wantsVisit: update.wantsVisit || data.wantsVisit,
        wantsHuman: data.wantsHuman,
        language: data.language ?? update.language,
      };
    } catch (err) {
      tracer.step('extract.llm_fallback', { error: (err as Error).message });
    }
    const answers = update.answers as QualificationAnswers;
    const missing = FIELD_ORDER.filter((f) => !hasField(answers, f));
    tracer.step('extract', { answers, missing, optOut: update.optOut, wantsVisit: update.wantsVisit });
    return { ...update, missing };
  };

  const route = (s: S): 'optout' | 'handoff' | 'ask' | 'scoreLead' => {
    if (s.optOut) return 'optout';
    if (s.wantsHuman) return 'handoff';
    const max = s.input.maxQuestions ?? 4;
    if (s.missing.length > 0 && !s.wantsVisit && s.input.questionsAsked < max) return 'ask';
    return 'scoreLead';
  };

  const ask = async (s: S): Promise<U> => {
    const field = s.missing[0]!;
    const { input } = s;
    let reply = FALLBACK_QUESTIONS[field](input.lead.name ?? '');
    try {
      const res = await deps.llm.chat([{
        role: 'user',
        content: prompt('lead-qualifier.ask', {
          ...projectVars(input),
          name: input.lead.name ?? 'there',
          language: s.language ?? 'en',
          field: FIELD_LABELS[field],
          known: JSON.stringify(s.answers),
          lastMessage: [...input.transcript].reverse().find((m) => m.from === 'lead')?.text ?? '',
          facts: input.project.facts ?? 'none',
        }),
      }], { temperature: 0.4, maxTokens: 200 });
      tracer.usage(res.tokensIn, res.tokensOut, res.model);
      if (res.text.trim()) reply = res.text.trim();
    } catch (err) {
      tracer.step('ask.llm_fallback', { error: (err as Error).message });
    }
    tracer.step('ask', { field, reply });
    return { reply, outcome: 'ask' };
  };

  const score = async (s: S): Promise<U> => {
    const { input } = s;
    const result = scoreLead({
      answers: s.answers,
      hasValidPhone: input.lead.hasValidPhone,
      hasEmail: input.lead.hasEmail,
      projectPriceMinInr: input.project.priceMinInr,
      projectPriceMaxInr: input.project.priceMaxInr,
      sourceQualityWeight: input.lead.sourceQualityWeight,
      repliedOnWhatsApp: true,
      visitRequested: s.wantsVisit,
    });
    const name = input.lead.name ? ` ${input.lead.name.split(' ')[0]}` : '';
    const reply = s.wantsVisit
      ? `Thanks${name}! Our advisor will call you shortly to confirm your site visit to ${input.project.name}.`
      : `Thanks${name}, that helps. Would you like to visit ${input.project.name} this weekend? Reply with a day and time that suits you.`;
    tracer.step('score', result);
    return { score: result, reply, outcome: 'scored' };
  };

  const handoff = async (_s: S): Promise<U> => {
    tracer.step('handoff');
    return { reply: 'Sure — one of our property advisors will call you in the next few minutes.', outcome: 'handoff' };
  };

  const optout = async (_s: S): Promise<U> => {
    tracer.step('opt_out');
    return { reply: "Understood. You won't receive further messages from us. Reply START anytime to resume.", outcome: 'opted_out' };
  };

  return new StateGraph(State)
    .addNode('extract', extract)
    .addNode('ask', ask)
    .addNode('scoreLead', score)
    .addNode('handoff', handoff)
    .addNode('optout', optout)
    .addEdge(START, 'extract')
    .addConditionalEdges('extract', route, ['ask', 'scoreLead', 'handoff', 'optout'])
    .addEdge('ask', END)
    .addEdge('scoreLead', END)
    .addEdge('handoff', END)
    .addEdge('optout', END)
    .compile();
}

export async function runLeadQualifier(deps: AgentDeps, input: QualifierInput) {
  return withRun(deps, input.orgId, 'lead_qualifier', { type: 'lead', id: input.leadId }, { known: input.known, turns: input.transcript.length }, async (tracer) => {
    const graph = buildLeadQualifierGraph(deps, tracer);
    const s = await graph.invoke({ input });
    const out: QualifierOutput = {
      outcome: s.outcome ?? 'ask',
      reply: s.reply,
      answers: s.answers,
      score: s.score,
      wantsVisit: s.wantsVisit,
      language: s.language,
    };
    return out;
  });
}

// ---------------------------------------------------------------------------
const FIELD_LABELS: Record<QualField, string> = {
  bhk: 'which configuration they want (2 BHK / 3 BHK…)',
  budget: 'their budget range in ₹ (lakhs or crores)',
  timeline: 'when they plan to buy',
  loan: 'whether they will need a home loan',
};

const FALLBACK_QUESTIONS: Record<QualField, (name: string) => string> = {
  bhk: (n) => `Hi${n ? ' ' + n.split(' ')[0] : ''}! Are you looking for a 2 BHK or 3 BHK home?`,
  budget: () => 'Got it. What budget range do you have in mind? (e.g. 90 L – 1.2 Cr)',
  timeline: () => 'When are you planning to buy — in the next 3 months, 6 months, or later?',
  loan: () => 'Will you be taking a home loan? We can help with bank tie-ups.',
};

function hasField(a: QualificationAnswers, f: QualField): boolean {
  switch (f) {
    case 'budget': return !!(a.budgetMinInr || a.budgetMaxInr);
    case 'bhk': return !!a.bhk?.length;
    case 'timeline': return !!a.timeline && a.timeline !== 'unknown';
    case 'loan': return !!a.loanNeed && a.loanNeed !== 'unknown';
  }
}

function projectVars(input: QualifierInput) {
  const p = input.project;
  const range = p.priceMinInr ? `${formatInr(p.priceMinInr)}${p.priceMaxInr ? ' – ' + formatInr(p.priceMaxInr) : '+'}` : 'on request';
  return {
    projectName: p.name,
    locality: p.locality ?? '',
    city: p.city ?? '',
    priceRange: range,
    configurations: p.configurations.join(', ') || 'see brochure',
  };
}

function stripNulls<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}
