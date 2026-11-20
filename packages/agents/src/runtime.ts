import type { AgentKind } from '@realcognix/core';
import type { LLMProvider } from '@realcognix/adapters';

/** Anything with pg's query signature (PoolClient, or the API's org-scoped Db). Keeps this package free of a DB driver. */
export interface Queryable {
  query<R extends { [column: string]: any } = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface ApprovalRequest {
  orgId: string;
  agentRunId?: string;
  kind: 'creative' | 'campaign_budget' | 'outbound_message' | 'client_report' | 'project_publish';
  subjectType: string;
  subjectId?: string | null;
  title: string;
  payload: unknown;
  compliance?: unknown;
  assigneeRole?: 'manager' | 'admin' | 'client_viewer';
  expiresInHours?: number;
}

/** Human-in-the-loop hook: agents propose, people approve. */
export interface ApprovalSink {
  request(req: ApprovalRequest): Promise<{ approvalId: string }>;
}

export interface RunTracer {
  runId: string;
  step(node: string, data?: unknown): void;
  usage(tokensIn?: number, tokensOut?: number, model?: string): void;
}

export interface RunStore {
  start(orgId: string, agent: AgentKind, subject: { type: string; id?: string | null }, input: unknown): Promise<string>;
  finish(
    runId: string,
    result: { status: 'succeeded' | 'failed' | 'awaiting_approval'; output?: unknown; error?: string; steps: unknown[]; model?: string; tokensIn: number; tokensOut: number },
  ): Promise<void>;
}

export interface AgentDeps {
  llm: LLMProvider;
  approvals: ApprovalSink;
  runs: RunStore;
}

/** Writes to the approvals + agent_runs tables. */
export class PgAgentStore implements ApprovalSink, RunStore {
  constructor(private readonly db: Queryable) {}

  async request(req: ApprovalRequest) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO approvals (org_id, agent_run_id, kind, subject_type, subject_id, title, payload, compliance, assignee_role, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + make_interval(hours => $10::int))
       RETURNING id`,
      [req.orgId, req.agentRunId ?? null, req.kind, req.subjectType, req.subjectId ?? null, req.title,
       JSON.stringify(req.payload), JSON.stringify(req.compliance ?? {}), req.assigneeRole ?? 'manager', req.expiresInHours ?? 72],
    );
    return { approvalId: rows[0]!.id };
  }

  async start(orgId: string, agent: AgentKind, subject: { type: string; id?: string | null }, input: unknown) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO agent_runs (org_id, agent, subject_type, subject_id, input) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [orgId, agent, subject.type, subject.id ?? null, JSON.stringify(input ?? {})],
    );
    return rows[0]!.id;
  }

  async finish(runId: string, r: Parameters<RunStore['finish']>[1]) {
    await this.db.query(
      `UPDATE agent_runs SET status=$2, output=$3, error=$4, steps=$5, model=$6, tokens_in=$7, tokens_out=$8, finished_at=now() WHERE id=$1`,
      [runId, r.status, JSON.stringify(r.output ?? null), r.error ?? null, JSON.stringify(r.steps), r.model ?? null, r.tokensIn, r.tokensOut],
    );
  }
}

/** In-memory store for tests and local experiments. */
export class MemoryAgentStore implements ApprovalSink, RunStore {
  readonly approvals: ApprovalRequest[] = [];
  readonly runs = new Map<string, unknown>();
  private n = 0;
  async request(req: ApprovalRequest) {
    this.approvals.push(req);
    return { approvalId: `approval-${this.approvals.length}` };
  }
  async start(_o: string, agent: AgentKind) {
    const id = `run-${++this.n}-${agent}`;
    this.runs.set(id, { status: 'running' });
    return id;
  }
  async finish(runId: string, r: unknown) {
    this.runs.set(runId, r);
  }
}

/**
 * Wraps one agent invocation in an agent_runs row. Every node logs via the tracer
 * ("every action logged" in the blueprint).
 */
export async function withRun<T extends object>(
  deps: AgentDeps,
  orgId: string,
  agent: AgentKind,
  subject: { type: string; id?: string | null },
  input: unknown,
  fn: (t: RunTracer) => Promise<T>,
): Promise<T & { runId: string }> {
  const runId = await deps.runs.start(orgId, agent, subject, input);
  const steps: unknown[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let model: string | undefined;
  const tracer: RunTracer = {
    runId,
    step: (node, data) => steps.push({ node, at: new Date().toISOString(), data }),
    usage: (i, o, m) => {
      tokensIn += i ?? 0;
      tokensOut += o ?? 0;
      model = m ?? model;
    },
  };
  try {
    const out = await fn(tracer);
    await deps.runs.finish(runId, {
      status: (out as { awaitingApproval?: boolean }).awaitingApproval ? 'awaiting_approval' : 'succeeded', output: out, steps, model, tokensIn, tokensOut,
    });
    return { ...out, runId };
  } catch (err) {
    await deps.runs.finish(runId, { status: 'failed', error: (err as Error).message, steps, model, tokensIn, tokensOut });
    throw err;
  }
}
