/**
 * Paid media platform (Meta, Google). APIs are free; spend is paid by the client.
 * All spend-changing calls are made only after an approval row is approved (see Campaign module).
 */
export type AdStatus = 'ACTIVE' | 'PAUSED';
export type AdLevel = 'campaign' | 'ad_set' | 'ad';

export interface ExternalRef {
  externalId: string;
  raw?: unknown;
}

export interface CreateCampaignInput {
  name: string;
  objective: 'leads' | 'traffic' | 'awareness' | 'conversions' | 'messages';
  dailyBudgetInr?: number;
  status?: AdStatus; // default PAUSED — nothing goes live without approval
  /** Meta special ad categories (e.g. HOUSING). Check platform policy for the target country. */
  specialAdCategories?: string[];
}

export interface GeoTarget {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface CreateAdSetInput {
  campaignExternalId: string;
  name: string;
  dailyBudgetInr: number;
  geo?: GeoTarget[];
  countries?: string[]; // NRI targeting: ['AE','US','GB','SG']
  ageMin?: number;
  ageMax?: number;
  interests?: Array<{ id: string; name?: string }>;
  pageId?: string;
  leadFormId?: string;
  status?: AdStatus;
  startTime?: Date;
  endTime?: Date;
}

export interface CreateAdInput {
  adSetExternalId: string;
  name: string;
  pageId: string;
  headline: string;
  primaryText: string; // must contain the RERA number (compliance guard checks before calling)
  description?: string;
  linkUrl: string;
  imageUrl?: string;
  imageHash?: string;
  leadFormId?: string;
  callToAction?: 'SIGN_UP' | 'LEARN_MORE' | 'GET_QUOTE' | 'CONTACT_US' | 'BOOK_TRAVEL' | 'APPLY_NOW';
  status?: AdStatus;
}

export interface InsightsQuery {
  level: AdLevel;
  since: string; // YYYY-MM-DD
  until: string;
  externalIds?: string[];
}

export interface InsightRow {
  level: AdLevel;
  externalId: string;
  name?: string;
  date?: string;
  spendInr: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface AdPlatform {
  readonly platform: 'meta' | 'google';
  createCampaign(input: CreateCampaignInput): Promise<ExternalRef>;
  createAdSet(input: CreateAdSetInput): Promise<ExternalRef>;
  createAd(input: CreateAdInput): Promise<ExternalRef>;
  setStatus(level: AdLevel, externalId: string, status: AdStatus): Promise<void>;
  updateDailyBudget(level: 'campaign' | 'ad_set', externalId: string, dailyBudgetInr: number): Promise<void>;
  getInsights(query: InsightsQuery): Promise<InsightRow[]>;
}
