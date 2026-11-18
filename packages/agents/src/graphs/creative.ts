import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { checkPromotionalContent, formatInr, type BuyerPersona } from '@realcognix/core';
import { prompt } from '../prompts.js';
import { withRun, type AgentDeps, type RunTracer } from '../runtime.js';

/**
 * Creative Agent — ad copy variants per persona. RERA number is mandatory and enforced in code,
 * not just in the prompt. Output always goes to the approvals queue before anything is live.
 */
export interface CreativeInput {
  orgId: string;
  projectId: string;
  project: {
    name: string; propertyType: string; locality?: string | null; city: string; priceFromInr?: number | null;
    configurations: string[]; possession?: string | null; usps: string[]; reraNumber: string | null;
  };
  persona: BuyerPersona;
  language: string;
  format: 'meta_single_image' | 'google_search' | 'whatsapp_template';
  count: number;
}

const VariantSchema = z.object({
  angle: z.string(),
  headline: z.string(),
  primaryText: z.string(),
  description: z.string().default(''),
  cta: z.enum(['SIGN_UP', 'LEARN_MORE', 'GET_QUOTE', 'CONTACT_US']).default('SIGN_UP'),
});
export type CreativeVariant = z.infer<typeof VariantSchema> & { compliance: { allowed: boolean; reasons: string[] } };
const OutputSchema = z.object({ variants: z.array(VariantSchema).min(1) });

export interface CreativeOutput {
  variants: CreativeVariant[];
  rejected: CreativeVariant[];
  approvalId?: string;
  awaitingApproval: boolean;
}

const MAX_ATTEMPTS = 2;

const State = Annotation.Root({
  input: Annotation<CreativeInput>(),
  attempts: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  accepted: Annotation<CreativeVariant[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  rejected: Annotation<CreativeVariant[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  candidates: Annotation<z.infer<typeof VariantSchema>[]>({ reducer: (_a, b) => b, default: () => [] }),
  approvalId: Annotation<string | undefined>(),
});
type S = typeof State.State;
type U = typeof State.Update;

export function buildCreativeGraph(deps: AgentDeps, tracer: RunTracer) {
  const guard = async (s: S): Promise<U> => {
    if (!s.input.project.reraNumber) throw new Error('Creative Agent blocked: project has no RERA number on file');
    return {};
  };

  const generate = async (s: S): Promise<U> => {
    const { input } = s;
    const p = input.project;
    const need = input.count - s.accepted.length;
    const feedback = s.rejected.length
      ? `Previous variants were rejected for: ${[...new Set(s.rejected.flatMap((r) => r.compliance.reasons))].join('; ')}. Fix these.`
      : '';
    const { data, result } = await deps.llm.json([{
      role: 'user',
      content: prompt('creative.variants', {
        projectName: p.name,
        propertyType: p.propertyType,
        locality: p.locality ?? '',
        city: p.city,
        priceFrom: p.priceFromInr ? formatInr(p.priceFromInr) : 'on request',
        configurations: p.configurations.join(', '),
        possession: p.possession ?? 'as per RERA',
        usps: p.usps.join(', '),
        rera: p.reraNumber,
        persona: input.persona,
        language: input.language,
        format: input.format,
        count: need,
        feedback,
      }),
    }], OutputSchema, { temperature: 0.8 });
    tracer.usage(result.tokensIn, result.tokensOut, result.model);
    tracer.step('generate', { attempt: s.attempts + 1, got: data.variants.length });
    return { candidates: data.variants, attempts: 1 };
  };

  const enforce = async (s: S): Promise<U> => {
    const rera = s.input.project.reraNumber!;
    const accepted: CreativeVariant[] = [];
    const rejected: CreativeVariant[] = [];
    for (const v of s.candidates) {
      // Deterministic fix-up: append the RERA line if the model forgot it, then re-check claims.
      const primaryText = checkPromotionalContent(v.primaryText, rera).reasons.some((r) => r.startsWith('RERA'))
        ? `${v.primaryText.trim()} RERA: ${rera}`
        : v.primaryText;
      const compliance = checkPromotionalContent(`${v.headline}\n${primaryText}\n${v.description}`, rera);
      const tooLong = v.headline.length > 40 || primaryText.length > 360;
      const out = { ...v, primaryText, compliance: tooLong ? { allowed: false, reasons: [...compliance.reasons, 'length limits exceeded'] } : compliance };
      (out.compliance.allowed ? accepted : rejected).push(out);
    }
    tracer.step('enforce', { accepted: accepted.length, rejected: rejected.map((r) => r.compliance.reasons) });
    return { accepted: accepted.slice(0, s.input.count - s.accepted.length), rejected };
  };

  const approval = async (s: S): Promise<U> => {
    if (!s.accepted.length) return {};
    const { approvalId } = await deps.approvals.request({
      orgId: s.input.orgId,
      agentRunId: tracer.runId,
      kind: 'creative',
      subjectType: 'project',
      subjectId: s.input.projectId,
      title: `${s.accepted.length} ad variants for ${s.input.project.name} (${s.input.persona}, ${s.input.language})`,
      payload: { format: s.input.format, persona: s.input.persona, language: s.input.language, variants: s.accepted },
      compliance: { rera: s.input.project.reraNumber, rejectedCount: s.rejected.length },
      assigneeRole: 'manager',
    });
    tracer.step('approval_requested', { approvalId });
    return { approvalId };
  };

  return new StateGraph(State)
    .addNode('guard', guard)
    .addNode('generate', generate)
    .addNode('enforce', enforce)
    .addNode('approval', approval)
    .addEdge(START, 'guard')
    .addEdge('guard', 'generate')
    .addEdge('generate', 'enforce')
    .addConditionalEdges(
      'enforce',
      (s: S) => (s.accepted.length < s.input.count && s.attempts < MAX_ATTEMPTS ? 'generate' : 'approval'),
      ['generate', 'approval'],
    )
    .addEdge('approval', END)
    .compile();
}

export async function runCreativeAgent(deps: AgentDeps, input: CreativeInput) {
  return withRun(deps, input.orgId, 'creative', { type: 'project', id: input.projectId }, input, async (tracer) => {
    const s = await buildCreativeGraph(deps, tracer).invoke({ input });
    const out: CreativeOutput = { variants: s.accepted, rejected: s.rejected, approvalId: s.approvalId, awaitingApproval: !!s.approvalId };
    return out;
  });
}
