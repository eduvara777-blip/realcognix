import { AdapterError, httpJson } from '../errors.js';
import type {
  AdLevel, AdPlatform, AdStatus, CreateAdInput, CreateAdSetInput, CreateCampaignInput, ExternalRef, InsightRow, InsightsQuery,
} from './types.js';

export interface MetaMarketingConfig {
  accessToken: string; // system-user token with ads_management
  adAccountId: string; // numeric, without act_
  graphVersion: string;
}

const OBJECTIVES: Record<CreateCampaignInput['objective'], string> = {
  leads: 'OUTCOME_LEADS',
  traffic: 'OUTCOME_TRAFFIC',
  awareness: 'OUTCOME_AWARENESS',
  conversions: 'OUTCOME_SALES',
  messages: 'OUTCOME_ENGAGEMENT',
};

/** Meta budgets are in the account currency's minor unit (paise for INR). */
const paise = (inr: number) => Math.round(inr * 100);

/**
 * Meta Marketing API — typed, minimal implementation over the Graph REST API.
 * Written against the documented endpoints; verify against your API version before going live.
 * Everything is created PAUSED by default.
 */
export class MetaMarketingAds implements AdPlatform {
  readonly platform = 'meta' as const;
  private readonly base: string;

  constructor(private readonly cfg: MetaMarketingConfig) {
    if (!cfg.accessToken || !cfg.adAccountId) throw new AdapterError('meta_ads', 'META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID are required');
    this.base = `https://graph.facebook.com/${cfg.graphVersion}`;
  }

  async createCampaign(input: CreateCampaignInput): Promise<ExternalRef> {
    const res = await this.post<{ id: string }>(`act_${this.cfg.adAccountId}/campaigns`, {
      name: input.name,
      objective: OBJECTIVES[input.objective],
      status: input.status ?? 'PAUSED',
      special_ad_categories: input.specialAdCategories ?? [],
      ...(input.dailyBudgetInr ? { daily_budget: paise(input.dailyBudgetInr) } : {}),
    });
    return { externalId: res.id, raw: res };
  }

  async createAdSet(input: CreateAdSetInput): Promise<ExternalRef> {
    const targeting: Record<string, unknown> = {
      geo_locations: {
        ...(input.geo?.length
          ? { custom_locations: input.geo.map((g) => ({ latitude: g.latitude, longitude: g.longitude, radius: g.radiusKm, distance_unit: 'kilometer' })) }
          : {}),
        ...(input.countries?.length ? { countries: input.countries } : {}),
      },
      ...(input.ageMin ? { age_min: input.ageMin } : {}),
      ...(input.ageMax ? { age_max: input.ageMax } : {}),
      ...(input.interests?.length ? { flexible_spec: [{ interests: input.interests }] } : {}),
    };
    const res = await this.post<{ id: string }>(`act_${this.cfg.adAccountId}/adsets`, {
      name: input.name,
      campaign_id: input.campaignExternalId,
      daily_budget: paise(input.dailyBudgetInr),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      destination_type: input.leadFormId ? 'ON_AD' : 'WEBSITE',
      ...(input.pageId ? { promoted_object: { page_id: input.pageId } } : {}),
      targeting,
      status: input.status ?? 'PAUSED',
      ...(input.startTime ? { start_time: input.startTime.toISOString() } : {}),
      ...(input.endTime ? { end_time: input.endTime.toISOString() } : {}),
    });
    return { externalId: res.id, raw: res };
  }

  async createAd(input: CreateAdInput): Promise<ExternalRef> {
    const creative = await this.post<{ id: string }>(`act_${this.cfg.adAccountId}/adcreatives`, {
      name: `${input.name} – creative`,
      object_story_spec: {
        page_id: input.pageId,
        link_data: {
          message: input.primaryText,
          name: input.headline,
          description: input.description,
          link: input.linkUrl,
          ...(input.imageHash ? { image_hash: input.imageHash } : input.imageUrl ? { picture: input.imageUrl } : {}),
          call_to_action: {
            type: input.callToAction ?? 'SIGN_UP',
            value: input.leadFormId ? { lead_gen_form_id: input.leadFormId } : { link: input.linkUrl },
          },
        },
      },
    });
    const ad = await this.post<{ id: string }>(`act_${this.cfg.adAccountId}/ads`, {
      name: input.name,
      adset_id: input.adSetExternalId,
      creative: { creative_id: creative.id },
      status: input.status ?? 'PAUSED',
    });
    return { externalId: ad.id, raw: { ad, creative } };
  }

  async setStatus(_level: AdLevel, externalId: string, status: AdStatus): Promise<void> {
    await this.post(externalId, { status });
  }

  async updateDailyBudget(_level: 'campaign' | 'ad_set', externalId: string, dailyBudgetInr: number): Promise<void> {
    await this.post(externalId, { daily_budget: paise(dailyBudgetInr) });
  }

  async getInsights(q: InsightsQuery): Promise<InsightRow[]> {
    const level = q.level === 'ad_set' ? 'adset' : q.level;
    const idField = `${level}_id`;
    const params = new URLSearchParams({
      level,
      fields: `${idField},${level}_name,spend,impressions,clicks,actions`,
      time_range: JSON.stringify({ since: q.since, until: q.until }),
      limit: '500',
      access_token: this.cfg.accessToken,
    });
    if (q.externalIds?.length) {
      params.set('filtering', JSON.stringify([{ field: `${level}.id`, operator: 'IN', value: q.externalIds }]));
    }
    const res = await httpJson<{ data: Array<Record<string, unknown>> }>('meta_ads', `${this.base}/act_${this.cfg.adAccountId}/insights?${params}`);
    return res.data.map((r) => {
      const actions = (r.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
      const leads = actions.filter((a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
        .reduce((s, a) => s + Number(a.value), 0);
      return {
        level: q.level,
        externalId: String(r[idField]),
        name: r[`${level}_name`] as string | undefined,
        spendInr: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        leads,
      };
    });
  }

  private post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    return httpJson<T>('meta_ads', `${this.base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.accessToken}` },
      body: JSON.stringify(body),
    });
  }
}
