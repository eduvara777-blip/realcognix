import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { findBannedClaims, formatInr, renderTemplate } from '@realcognix/core';
import { prompt } from '../prompts.js';
import { withRun, type AgentDeps, type RunTracer } from '../runtime.js';

/**
 * Follow-up drafter — personalises a pre-approved cadence message for one lead.
 * Steps flagged requires_approval create an approvals row instead of sending.
 */
export interface FollowUpInput {
  orgId: string;
  leadId: string;
  stepId: string;
  channel: 'whatsapp' | 'email';
  dayOffset: number;
  baseMessage: string; // cadence_steps.body with {{placeholders}}
  useAi: boolean;
  requiresApproval: boolean;
  lead: { name?: string | null; stage: string; bhk?: number[] | null; budgetMaxInr?: number | null; timeline?: string | null; language?: string | null };
  project: { name: string; locality?: string | null; city?: string | null; rera?: string | null };
  recent: Array<{ from: 'lead' | 'agent'; text: string }>;
}

export interface FollowUpOutput {
  draft: string;
  issues: string[];
  approvalId?: string;
  awaitingApproval: boolean;
}

const State = Annotation.Root({
  input: Annotation<FollowUpInput>(),
  draft: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  issues: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  approvalId: Annotation<string | undefined>(),
});
type S = typeof State.State;
type U = typeof State.Update;

export function buildFollowUpGraph(deps: AgentDeps, tracer: RunTracer) {
  const draft = async (s: S): Promise<U> => {
    const { input } = s;
    const vars = templateVars(input);
    const base = renderTemplate(input.baseMessage, vars);
    if (!input.useAi) {
      tracer.step('draft', { mode: 'template' });
      return { draft: base };
    }
    try {
      const res = await deps.llm.chat([{
        role: 'user',
        content: prompt('follow-up.draft', {
          ...vars,
          channel: input.channel,
          projectName: input.project.name,
          locality: input.project.locality ?? '',
          city: input.project.city ?? '',
          stage: input.lead.stage,
          timeline: input.lead.timeline ?? 'unknown',
          language: input.lead.language ?? 'en',
          dayOffset: input.dayOffset,
          baseMessage: base,
          recent: input.recent.slice(-6).map((m) => `${m.from}: ${m.text}`).join('\n') || '(none)',
        }),
      }], { temperature: 0.5, maxTokens: 400 });
      tracer.usage(res.tokensIn, res.tokensOut, res.model);
      tracer.step('draft', { mode: 'ai' });
      return { draft: res.text.trim() || base };
    } catch (err) {
      tracer.step('draft.llm_fallback', { error: (err as Error).message });
      return { draft: base };
    }
  };

  const check = async (s: S): Promise<U> => {
    const issues = findBannedClaims(s.draft);
    if (s.input.channel === 'whatsapp' && s.draft.length > 1000) issues.push('WhatsApp message too long');
    tracer.step('check', { issues });
    // A failing AI draft falls back to the approved base copy rather than going out.
    if (issues.length && s.input.useAi) {
      return { draft: renderTemplate(s.input.baseMessage, templateVars(s.input)), issues };
    }
    return { issues };
  };

  const approval = async (s: S): Promise<U> => {
    const { approvalId } = await deps.approvals.request({
      orgId: s.input.orgId,
      agentRunId: tracer.runId,
      kind: 'outbound_message',
      subjectType: 'lead',
      subjectId: s.input.leadId,
      title: `Day ${s.input.dayOffset} ${s.input.channel} follow-up for ${s.input.lead.name ?? 'lead'}`,
      payload: { stepId: s.input.stepId, channel: s.input.channel, body: s.draft },
      compliance: { issues: s.issues },
      assigneeRole: 'manager',
      expiresInHours: 24,
    });
    tracer.step('approval_requested', { approvalId });
    return { approvalId };
  };

  return new StateGraph(State)
    .addNode('compose', draft)
    .addNode('check', check)
    .addNode('approval', approval)
    .addEdge(START, 'compose')
    .addEdge('compose', 'check')
    .addConditionalEdges('check', (s: S) => (s.input.requiresApproval ? 'approval' : END), ['approval', END])
    .addEdge('approval', END)
    .compile();
}

export async function runFollowUpDrafter(deps: AgentDeps, input: FollowUpInput) {
  return withRun(deps, input.orgId, 'follow_up', { type: 'lead', id: input.leadId }, { stepId: input.stepId }, async (tracer) => {
    const s = await buildFollowUpGraph(deps, tracer).invoke({ input });
    const out: FollowUpOutput = { draft: s.draft, issues: s.issues, approvalId: s.approvalId, awaitingApproval: !!s.approvalId };
    return out;
  });
}

function templateVars(input: FollowUpInput): Record<string, string> {
  return {
    name: input.lead.name?.split(' ')[0] ?? 'there',
    project: input.project.name,
    rera: input.project.rera ?? '',
    bhk: input.lead.bhk?.length ? `${input.lead.bhk.join('/')} BHK` : 'your preferred',
    budget: input.lead.budgetMaxInr ? formatInr(input.lead.budgetMaxInr) : 'not shared',
    temperature: '',
    update: 'construction is progressing on schedule',
  };
}
