/** Domain types shared by api, adapters and agents. Mirrors enums in db/schema.sql. */

export type UUID = string;

export type ChannelKind = 'whatsapp' | 'email' | 'sms' | 'call' | 'web_chat' | 'in_person';
export type ConsentPurpose = 'transactional' | 'marketing' | 'calls' | 'data_processing';
export type LeadStage =
  | 'new' | 'contacted' | 'qualified' | 'visit_scheduled' | 'visited' | 'negotiation' | 'booked' | 'lost' | 'nurture';
export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type PurchaseTimeline =
  | 'immediate' | 'within_3_months' | 'within_6_months' | 'within_12_months' | 'just_exploring' | 'unknown';
export type LoanNeed = 'yes' | 'no' | 'maybe' | 'unknown';
export type BuyerPersona = 'end_user' | 'investor' | 'nri' | 'upgrade' | 'first_home' | 'unknown';
export type LeadSourceKind =
  | 'meta_lead_ads' | 'google_ads' | 'website_form' | 'microsite' | 'portal_99acres' | 'portal_magicbricks'
  | 'portal_housing' | 'portal_nobroker' | 'portal_other' | 'missed_call' | 'walk_in' | 'channel_partner'
  | 'referral' | 'whatsapp_click' | 'event' | 'manual' | 'other';
export type AgentKind =
  | 'onboarding' | 'market_intel' | 'creative' | 'campaign_optimizer' | 'lead_qualifier' | 'router'
  | 'follow_up' | 'visit_concierge' | 'reporting' | 'compliance_guard';

/** What every LeadSource adapter produces. Intake works only with this shape. */
export interface NormalizedLead {
  sourceKind: LeadSourceKind;
  externalId?: string;
  /** Meta form id, portal listing id etc. — used to look up lead_sources.external_ref */
  sourceRef?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  city?: string;
  message?: string;
  projectHint?: string;
  budgetText?: string;
  bhkText?: string;
  preferredLanguage?: string;
  utm?: Record<string, string>;
  consents?: Array<{ channel: ChannelKind; purpose: ConsentPurpose; source: string; noticeVersion?: string }>;
  receivedAt?: string;
  raw?: unknown;
}

export interface QualificationAnswers {
  budgetMinInr?: number | null;
  budgetMaxInr?: number | null;
  bhk?: number[] | null;
  timeline?: PurchaseTimeline | null;
  loanNeed?: LoanNeed | null;
  persona?: BuyerPersona | null;
}

export interface ScoreResult {
  score: number;
  temperature: LeadTemperature;
  reasons: string[];
}

export interface ComplianceResult {
  allowed: boolean;
  reasons: string[];
  /** When blocked only by quiet hours, the earliest time the action may run. */
  retryAt?: Date;
}
