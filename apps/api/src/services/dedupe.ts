import { normalizeEmail, normalizePhone } from '@realcognix/core';
import type { Q } from '../lib/db.js';
import type { LeadRow } from '../lib/types.js';

export interface Identity {
  phoneE164: string | null;
  emailNormalized: string | null;
}

export function identityOf(phone?: string | null, email?: string | null): Identity {
  return { phoneE164: normalizePhone(phone), emailNormalized: normalizeEmail(email) };
}

/**
 * One live lead per person per project. Match order: phone (strongest, +91 normalised), then email.
 * A lead with no project matches any open lead of the same person in the org.
 */
export async function findDuplicate(q: Q, orgId: string, projectId: string | null, id: Identity): Promise<LeadRow | null> {
  if (!id.phoneE164 && !id.emailNormalized) return null;
  const { rows } = await q.query<LeadRow>(
    `SELECT * FROM leads
      WHERE org_id = $1
        AND merged_into_id IS NULL AND archived_at IS NULL
        AND ($2::uuid IS NULL OR project_id IS NOT DISTINCT FROM $2::uuid)
        AND ((phone_e164 IS NOT NULL AND phone_e164 = $3) OR (email_normalized IS NOT NULL AND email_normalized = $4))
      ORDER BY (phone_e164 = $3) DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [orgId, projectId, id.phoneE164, id.emailNormalized],
  );
  return rows[0] ?? null;
}

/** Fill gaps on the existing lead from a repeat enquiry; never overwrite what a human already set. */
export async function mergeInto(q: Q, existing: LeadRow, incoming: { fullName?: string | null; email?: string | null; emailNormalized?: string | null; city?: string | null }) {
  await q.query(
    `UPDATE leads SET
        full_name = COALESCE(full_name, $2),
        email = COALESCE(email, $3),
        email_normalized = COALESCE(email_normalized, $4),
        city = COALESCE(city, $5),
        -- a lost/nurture lead that enquires again is back in play
        stage = CASE WHEN stage IN ('lost','nurture') THEN 'new'::lead_stage ELSE stage END,
        last_activity_at = now()
      WHERE id = $1`,
    [existing.id, incoming.fullName ?? null, incoming.email ?? null, incoming.emailNormalized ?? null, incoming.city ?? null],
  );
}
