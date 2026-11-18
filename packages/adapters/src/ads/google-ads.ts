import { AdapterError, NotImplementedError, httpJson } from '../errors.js';
import type {
  AdLevel, AdPlatform, AdStatus, CreateAdInput, CreateAdSetInput, CreateCampaignInput, ExternalRef, InsightRow, InsightsQuery,
} from './types.js';

export interface GoogleAdsConfig {
  developerToken: string; // requires an approved Google Ads developer token
  customerId: string; // 10 digits, no dashes
  loginCustomerId?: string; // MCC id when operating client accounts
  accessToken: string; // OAuth2 access token (refresh flow is out of scope for the starter)
  apiVersion?: string; // e.g. v21 — bump to the current version
}

/**
 * STUB (typed): Google Ads API. Only reporting (GAQL via REST searchStream) is wired; mutations
 * (campaign/ad group/responsive search ad creation) throw NotImplementedError until Phase 2.
 */
export class GoogleAdsPlatform implements AdPlatform {
  readonly platform = 'google' as const;

  constructor(private readonly cfg: GoogleAdsConfig) {
    if (!cfg.developerToken || !cfg.customerId) throw new AdapterError('google_ads', 'GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID are required');
  }

  createCampaign(_input: CreateCampaignInput): Promise<ExternalRef> {
    throw new NotImplementedError('google_ads', 'createCampaign');
  }
  createAdSet(_input: CreateAdSetInput): Promise<ExternalRef> {
    throw new NotImplementedError('google_ads', 'createAdSet (ad group)');
  }
  createAd(_input: CreateAdInput): Promise<ExternalRef> {
    throw new NotImplementedError('google_ads', 'createAd (responsive search ad)');
  }
  setStatus(_level: AdLevel, _externalId: string, _status: AdStatus): Promise<void> {
    throw new NotImplementedError('google_ads', 'setStatus');
  }
  updateDailyBudget(_level: 'campaign' | 'ad_set', _externalId: string, _inr: number): Promise<void> {
    throw new NotImplementedError('google_ads', 'updateDailyBudget');
  }

  async getInsights(q: InsightsQuery): Promise<InsightRow[]> {
    const resource = q.level === 'campaign' ? 'campaign' : q.level === 'ad_set' ? 'ad_group' : 'ad_group_ad';
    const idCol = q.level === 'ad' ? 'ad_group_ad.ad.id' : `${resource}.id`;
    const nameCol = q.level === 'ad' ? 'ad_group_ad.ad.name' : `${resource}.name`;
    const where = [`segments.date BETWEEN '${q.since}' AND '${q.until}'`];
    if (q.externalIds?.length) where.push(`${idCol} IN (${q.externalIds.map(Number).join(',')})`);
    const query = `SELECT ${idCol}, ${nameCol}, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ${resource} WHERE ${where.join(' AND ')}`;

    const version = this.cfg.apiVersion ?? 'v21';
    const url = `https://googleads.googleapis.com/${version}/customers/${this.cfg.customerId}/googleAds:searchStream`;
    const batches = await httpJson<Array<{ results?: Array<Record<string, any>> }>>('google_ads', url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'developer-token': this.cfg.developerToken,
        ...(this.cfg.loginCustomerId ? { 'login-customer-id': this.cfg.loginCustomerId } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    return batches.flatMap((b) => b.results ?? []).map((r) => {
      const entity = q.level === 'ad' ? r.adGroupAd?.ad : q.level === 'ad_set' ? r.adGroup : r.campaign;
      return {
        level: q.level,
        externalId: String(entity?.id ?? ''),
        name: entity?.name,
        spendInr: Number(r.metrics?.costMicros ?? 0) / 1e6,
        impressions: Number(r.metrics?.impressions ?? 0),
        clicks: Number(r.metrics?.clicks ?? 0),
        leads: Math.round(Number(r.metrics?.conversions ?? 0)),
      };
    });
  }
}
