import type { LeadSourceKind, NormalizedLead } from '@realcognix/core';
import type { WebhookRequest } from '../messaging/types.js';

export type { WebhookRequest };

/**
 * Anything that produces leads. Each adapter turns its native payload into NormalizedLead[];
 * the intake pipeline (dedupe → consent → score → respond → route) never sees vendor formats.
 */
export interface LeadSource<Input = WebhookRequest> {
  readonly kind: LeadSourceKind | 'portal_email';
  /** Optional webhook handshake (Meta GET verification). */
  verifyChallenge?(query: Record<string, string | undefined>): string | null;
  verifySignature?(req: WebhookRequest): boolean;
  parse(input: Input): Promise<NormalizedLead[]>;
}
