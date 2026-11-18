import type { ChannelKind, ConsentPurpose, NormalizedLead } from '@realcognix/core';
import { httpJson } from '../errors.js';
import { verifyMetaSignature } from '../messaging/whatsapp-cloud.js';
import type { LeadSource, WebhookRequest } from './types.js';

export interface MetaLeadAdsConfig {
  appSecret?: string;
  verifyToken: string;
  pageAccessToken?: string; // needs leads_retrieval permission
  graphVersion: string;
}

interface LeadgenChange {
  field: string;
  value: { leadgen_id: string; form_id: string; page_id: string; ad_id?: string; adgroup_id?: string; created_time?: number };
}

interface GraphLead {
  id: string;
  created_time: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  field_data: Array<{ name: string; values: string[] }>;
  custom_disclaimer_responses?: Array<{ checkbox_key: string; is_checked: string | boolean }>;
}

/**
 * Meta (Facebook/Instagram) Lead Ads.
 * Webhook only carries leadgen_id; the lead itself is fetched from the Graph API.
 * Alternative wiring: n8n's "Facebook Lead Ads Trigger" → POST /webhooks/intake (see n8n/meta-leadads-to-api.json).
 */
export class MetaLeadAdsSource implements LeadSource {
  readonly kind = 'meta_lead_ads' as const;
  constructor(private readonly cfg: MetaLeadAdsConfig) {}

  verifyChallenge(query: Record<string, string | undefined>): string | null {
    return query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === this.cfg.verifyToken
      ? (query['hub.challenge'] ?? null)
      : null;
  }

  verifySignature(req: WebhookRequest): boolean {
    return this.cfg.appSecret ? verifyMetaSignature(this.cfg.appSecret, req) : true;
  }

  async parse(req: WebhookRequest): Promise<NormalizedLead[]> {
    const body = req.body as { object?: string; entry?: Array<{ changes?: LeadgenChange[] }> };
    const changes = (body.entry ?? []).flatMap((e) => e.changes ?? []).filter((c) => c.field === 'leadgen');
    const leads: NormalizedLead[] = [];
    for (const change of changes) {
      const lead = await this.fetchLead(change.value.leadgen_id);
      leads.push(mapGraphLead(lead ?? stubLead(change.value), change.value.form_id));
    }
    return leads;
  }

  private async fetchLead(leadgenId: string): Promise<GraphLead | null> {
    if (!this.cfg.pageAccessToken) return null; // dev: no token → keep ids only
    const fields = 'id,created_time,ad_id,adset_id,campaign_id,form_id,field_data,custom_disclaimer_responses';
    const url = `https://graph.facebook.com/${this.cfg.graphVersion}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(this.cfg.pageAccessToken)}`;
    return httpJson<GraphLead>('meta_lead_ads', url);
  }
}

function stubLead(v: LeadgenChange['value']): GraphLead {
  return { id: v.leadgen_id, created_time: new Date().toISOString(), ad_id: v.ad_id, form_id: v.form_id, field_data: [] };
}

export function mapGraphLead(lead: GraphLead, formId?: string): NormalizedLead {
  const f = new Map(lead.field_data.map((d) => [d.name.toLowerCase(), d.values?.[0] ?? '']));
  const pick = (...keys: string[]) => keys.map((k) => f.get(k)).find((v) => v && v.trim()) || undefined;
  const fullName = pick('full_name') ?? ([pick('first_name'), pick('last_name')].filter(Boolean).join(' ') || undefined);

  // Meta forms carry the privacy policy link; explicit opt-ins come from custom disclaimer checkboxes.
  const consents: NonNullable<NormalizedLead['consents']> = [
    { channel: 'whatsapp', purpose: 'transactional', source: 'meta_lead_form' },
    { channel: 'email', purpose: 'transactional', source: 'meta_lead_form' },
    { channel: 'call', purpose: 'calls', source: 'meta_lead_form' },
  ];
  for (const c of lead.custom_disclaimer_responses ?? []) {
    const checked = c.is_checked === true || c.is_checked === '1' || c.is_checked === 'true';
    if (!checked) continue;
    const ch: ChannelKind = /whatsapp/i.test(c.checkbox_key) ? 'whatsapp' : /email/i.test(c.checkbox_key) ? 'email' : 'call';
    const purpose: ConsentPurpose = ch === 'call' ? 'calls' : 'marketing';
    consents.push({ channel: ch, purpose, source: `meta_form_checkbox:${c.checkbox_key}` });
  }

  return {
    sourceKind: 'meta_lead_ads',
    externalId: lead.id,
    sourceRef: lead.form_id ?? formId,
    fullName,
    phone: pick('phone_number', 'phone', 'mobile_number'),
    email: pick('email'),
    city: pick('city'),
    budgetText: pick('budget', 'what_is_your_budget?', 'what_is_your_budget'),
    bhkText: pick('bhk', 'configuration', 'which_configuration_are_you_looking_for?'),
    utm: { utm_source: 'meta', ...(lead.campaign_id ? { campaign_id: lead.campaign_id } : {}), ...(lead.ad_id ? { ad_id: lead.ad_id } : {}) },
    consents,
    receivedAt: lead.created_time,
    raw: lead,
  };
}
