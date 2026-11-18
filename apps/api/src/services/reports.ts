import type { WeeklyMetrics } from '@realcognix/agents';
import type { AppContext } from '../context.js';

/**
 * KPI SQL for the Reporting Agent's fetchMetrics tool.
 * Spend comes from campaigns.spend_inr (synced from ad platforms); it is period-agnostic in this starter —
 * a daily spend table (campaign_daily_metrics) is the Phase 2 upgrade.
 */
export async function fetchClientMetrics(ctx: AppContext, clientId: string, start: string, end: string): Promise<WeeklyMetrics> {
  const range = [clientId, start, end];
  const one = async <T>(sql: string) => (await ctx.db.one<{ v: T }>(sql, range))?.v;

  const leads = (await one<number>(`SELECT count(*)::int AS v FROM leads WHERE client_id = $1 AND merged_into_id IS NULL AND created_at >= $2::date AND created_at < $3::date + 1`)) ?? 0;
  const qualified = (await one<number>(`SELECT count(*)::int AS v FROM leads WHERE client_id = $1 AND merged_into_id IS NULL AND created_at >= $2::date AND created_at < $3::date + 1 AND stage NOT IN ('new','contacted','lost')`)) ?? 0;
  const visits = (await one<number>(`SELECT count(*)::int AS v FROM site_visits v JOIN projects p ON p.id = v.project_id WHERE p.client_id = $1 AND v.status = 'completed' AND v.scheduled_at >= $2::date AND v.scheduled_at < $3::date + 1`)) ?? 0;
  const bookings = (await one<number>(`SELECT count(*)::int AS v FROM bookings b JOIN projects p ON p.id = b.project_id WHERE p.client_id = $1 AND b.status <> 'cancelled' AND b.created_at >= $2::date AND b.created_at < $3::date + 1`)) ?? 0;
  const spend = (await ctx.db.one<{ v: number }>(`SELECT COALESCE(sum(spend_inr),0) AS v FROM campaigns WHERE client_id = $1`, [clientId]))?.v ?? 0;
  const speed = await ctx.db.one<{ median: number | null; sla: number | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM l.first_response_at - l.created_at)) AS median,
            round(100.0 * avg(CASE WHEN a.first_contact_at IS NOT NULL AND a.first_contact_at <= a.sla_due_at THEN 1 ELSE 0 END)) AS sla
       FROM leads l LEFT JOIN assignments a ON a.lead_id = l.id AND a.method = 'auto'
      WHERE l.client_id = $1 AND l.created_at >= $2::date AND l.created_at < $3::date + 1`,
    range,
  );
  const bySource = await ctx.db.query<{ source: string; leads: number }>(
    `SELECT source_kind::text AS source, count(*)::int AS leads FROM leads
      WHERE client_id = $1 AND merged_into_id IS NULL AND created_at >= $2::date AND created_at < $3::date + 1 GROUP BY 1 ORDER BY 2 DESC`,
    range,
  );
  return {
    spendInr: spend, leads, qualifiedLeads: qualified, siteVisits: visits, bookings,
    medianFirstResponseSec: speed?.median !== null && speed?.median !== undefined ? Math.round(speed.median) : null,
    slaCompliancePct: speed?.sla ?? null,
    bySource: bySource.rows,
  };
}
