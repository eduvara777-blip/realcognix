import type { BuyerPersona, LeadStage, LeadTemperature, LoanNeed, PurchaseTimeline } from '@realcognix/core';

export interface LeadRow {
  id: string;
  org_id: string;
  client_id: string | null;
  project_id: string | null;
  source_id: string | null;
  source_kind: string;
  full_name: string | null;
  phone_e164: string | null;
  email: string | null;
  email_normalized: string | null;
  city: string | null;
  preferred_language: string;
  preferred_locality: string | null;
  budget_min_inr: number | null;
  budget_max_inr: number | null;
  bhk_preference: number[] | null;
  timeline: PurchaseTimeline;
  loan_need: LoanNeed;
  persona: BuyerPersona;
  is_nri: boolean;
  stage: LeadStage;
  score: number;
  temperature: LeadTemperature;
  owner_id: string | null;
  dnd: boolean;
  opted_out: boolean;
  first_response_at: Date | null;
  first_contact_at: Date | null;
  last_inbound_at: Date | null;
  created_at: Date;
}

export interface ProjectRow {
  id: string;
  org_id: string;
  client_id: string;
  name: string;
  slug: string;
  locality: string | null;
  city: string;
  rera_number: string | null;
  rera_status: string;
  price_min_inr: number | null;
  price_max_inr: number | null;
  latitude: number | null;
  longitude: number | null;
  address_line: string | null;
  amenities: string[];
  default_cadence_id: string | null;
}
