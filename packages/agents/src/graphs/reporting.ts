import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { formatInr } from '@realcognix/core';
import { prompt } from '../prompts.js';
import { withRun, type AgentDeps, type RunTracer } from '../runtime.js';

/**
 * Reporting Agent — weekly client summary. Numbers come from SQL (a tool the API injects);
 * the LLM only writes the narrative. Always routed to a human before it reaches the client.
 */
export interface WeeklyMetrics {
  spendInr: number;
  leads: number;
  qualifiedLeads: number;
  siteVisits: number;
  bookings: number;
  medianFirstResponseSec: number | null;
  slaCompliancePct: number | null; // % of leads called within SLA
  bySource: Array<{ source: string; leads: number; spendInr?: number }>;
}

export interface ReportingInput {
  orgId: string;
  clientId: string;
  clientName: string;
  projects: string[];
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  targets: { leads?: number | null; siteVisits?: number | null; bookings?: number | null; budgetInr?: number | null };
  /** Tool: fetch metrics for a period. Injected so the agent never writes SQL. */
  fetchMetrics: (start: string, end: string) => Promise<WeeklyMetrics>;
}

export interface ReportingOutput {
  metrics: WeeklyMetrics & { cplInr: number | null; cpsvInr: number | null; visitToBookingPct: number | null };
  previous: WeeklyMetrics | null;
  anomalies: string[];
  narrative: string;
  approvalId?: string;
  awaitingApproval: boolean;
}

const State = Annotation.Root({
  input: Annotation<ReportingInput>(),
  metrics: Annotation<ReportingOutput['metrics'] | undefined>(),
  previous: Annotation<WeeklyMetrics | null>({ reducer: (_a, b) => b, default: () => null }),
  anomalies: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  narrative: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  approvalId: Annotation<string | undefined>(),
});
type S = typeof State.State;
type U = typeof State.Update;

const ratio = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null);

export function buildReportingGraph(deps: AgentDeps, tracer: RunTracer) {
  const gather = async (s: S): Promise<U> => {
    const { input } = s;
    const cur = await input.fetchMetrics(input.periodStart, input.periodEnd);
    const prevStart = shiftDays(input.periodStart, -7);
    const prevEnd = shiftDays(input.periodEnd, -7);
    const previous = await input.fetchMetrics(prevStart, prevEnd).catch(() => null);
    const metrics = {
      ...cur,
      cplInr: ratio(cur.spendInr, cur.leads),
      cpsvInr: ratio(cur.spendInr, cur.siteVisits),
      visitToBookingPct: cur.siteVisits ? Math.round((cur.bookings / cur.siteVisits) * 1000) / 10 : null,
    };
    tracer.step('gather', { metrics, previous });
    return { metrics, previous };
  };

  const analyze = async (s: S): Promise<U> => {
    const m = s.metrics!;
    const p = s.previous;
    const t = s.input.targets;
    const anomalies: string[] = [];
    if (p && p.leads > 10 && m.leads < p.leads * 0.6) anomalies.push(`Leads down ${Math.round((1 - m.leads / p.leads) * 100)}% week on week`);
    if (p && p.spendInr > 0 && p.leads > 0 && m.cplInr && m.cplInr > (p.spendInr / p.leads) * 1.4) anomalies.push('Cost per lead up more than 40% week on week');
    if (m.leads > 20 && m.siteVisits === 0) anomalies.push('No site visits despite lead volume — check follow-up and visit offers');
    if (m.slaCompliancePct !== null && m.slaCompliancePct < 80) anomalies.push(`Only ${m.slaCompliancePct}% of leads called within SLA`);
    if (t.siteVisits && m.siteVisits < t.siteVisits / 4.3 * 0.7) anomalies.push('Site visits tracking below 70% of weekly target');
    tracer.step('analyze', { anomalies });
    return { anomalies };
  };

  const write = async (s: S): Promise<U> => {
    const { input } = s;
    const m = s.metrics!;
    const fallback = [
      `**${input.clientName} — ${input.periodStart} to ${input.periodEnd}**`,
      `- Spend: ${formatInr(m.spendInr)} | Leads: ${m.leads} | CPL: ${m.cplInr ? formatInr(m.cplInr) : 'n/a'}`,
      `- Site visits: ${m.siteVisits} | Cost per visit: ${m.cpsvInr ? formatInr(m.cpsvInr) : 'n/a'} | Bookings: ${m.bookings}`,
      `- SLA compliance: ${m.slaCompliancePct ?? 'n/a'}%`,
      ...(s.anomalies.length ? ['', 'Watch-outs:', ...s.anomalies.map((a) => `- ${a}`)] : []),
    ].join('\n');
    try {
      const res = await deps.llm.chat([{
        role: 'user',
        content: prompt('reporting.narrative', {
          clientName: input.clientName,
          projects: input.projects.join(', '),
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          targets: JSON.stringify(input.targets),
          metrics: JSON.stringify(m),
          previous: JSON.stringify(s.previous),
          anomalies: s.anomalies.join('; ') || 'none',
        }),
      }], { temperature: 0.3, maxTokens: 700 });
      tracer.usage(res.tokensIn, res.tokensOut, res.model);
      tracer.step('write', { mode: 'ai' });
      return { narrative: res.text.trim() || fallback };
    } catch (err) {
      tracer.step('write.llm_fallback', { error: (err as Error).message });
      return { narrative: fallback };
    }
  };

  const approval = async (s: S): Promise<U> => {
    const { approvalId } = await deps.approvals.request({
      orgId: s.input.orgId,
      agentRunId: tracer.runId,
      kind: 'client_report',
      subjectType: 'client',
      subjectId: s.input.clientId,
      title: `Weekly report for ${s.input.clientName} (${s.input.periodStart} – ${s.input.periodEnd})`,
      payload: { narrative: s.narrative, metrics: s.metrics, anomalies: s.anomalies, periodStart: s.input.periodStart, periodEnd: s.input.periodEnd },
      assigneeRole: 'manager',
      expiresInHours: 72,
    });
    tracer.step('approval_requested', { approvalId });
    return { approvalId };
  };

  return new StateGraph(State)
    .addNode('gather', gather)
    .addNode('analyze', analyze)
    .addNode('write', write)
    .addNode('approval', approval)
    .addEdge(START, 'gather')
    .addEdge('gather', 'analyze')
    .addEdge('analyze', 'write')
    .addEdge('write', 'approval')
    .addEdge('approval', END)
    .compile();
}

export async function runReportingAgent(deps: AgentDeps, input: ReportingInput) {
  const { fetchMetrics: _tool, ...loggable } = input;
  return withRun(deps, input.orgId, 'reporting', { type: 'client', id: input.clientId }, loggable, async (tracer) => {
    const s = await buildReportingGraph(deps, tracer).invoke({ input });
    const out: ReportingOutput = {
      metrics: s.metrics!, previous: s.previous, anomalies: s.anomalies, narrative: s.narrative,
      approvalId: s.approvalId, awaitingApproval: true,
    };
    return out;
  });
}

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
