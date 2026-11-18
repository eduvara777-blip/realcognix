-- =====================================================================
-- RealCognix OS — core schema (PostgreSQL 16 + pgvector)
-- Multi-tenant: every business table carries org_id (the agency/tenant).
-- clients = the builders/developers the agency serves inside an org.
-- Row-level security is enabled at the bottom, keyed on the session
-- setting app.org_id (the API sets it per request/transaction).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector (AI memory)

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE user_status        AS ENUM ('invited', 'active', 'disabled');
CREATE TYPE client_status      AS ENUM ('prospect', 'onboarding', 'active', 'paused', 'churned');
CREATE TYPE kyc_status         AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE agreement_status   AS ENUM ('draft', 'sent', 'signed', 'expired', 'terminated');
CREATE TYPE rera_status        AS ENUM ('unverified', 'verified', 'mismatch', 'expired');
CREATE TYPE project_status     AS ENUM ('draft', 'pre_launch', 'launched', 'under_construction', 'ready_to_move', 'sold_out', 'archived');
CREATE TYPE property_type      AS ENUM ('apartment', 'villa', 'plot', 'row_house', 'commercial', 'other');
CREATE TYPE unit_status        AS ENUM ('available', 'blocked', 'booked', 'sold', 'not_released');
CREATE TYPE facing             AS ENUM ('north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west');
CREATE TYPE media_kind         AS ENUM ('image', 'video', 'floor_plan', 'brochure', 'price_sheet', 'document', 'virtual_tour');
CREATE TYPE microsite_status   AS ENUM ('draft', 'in_review', 'published', 'unpublished');
CREATE TYPE ad_platform        AS ENUM ('meta', 'google', 'portal', 'whatsapp', 'seo', 'channel_partner', 'event', 'other');
CREATE TYPE campaign_status    AS ENUM ('draft', 'pending_approval', 'active', 'paused', 'completed', 'archived');
CREATE TYPE campaign_objective AS ENUM ('leads', 'traffic', 'awareness', 'conversions', 'messages', 'site_visits');
CREATE TYPE creative_status    AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'live', 'archived');
CREATE TYPE lead_source_kind   AS ENUM ('meta_lead_ads', 'google_ads', 'website_form', 'microsite', 'portal_99acres', 'portal_magicbricks',
                                        'portal_housing', 'portal_nobroker', 'portal_other', 'missed_call', 'walk_in', 'channel_partner',
                                        'referral', 'whatsapp_click', 'event', 'manual', 'other');
CREATE TYPE lead_stage         AS ENUM ('new', 'contacted', 'qualified', 'visit_scheduled', 'visited', 'negotiation', 'booked', 'lost', 'nurture');
CREATE TYPE lead_temperature   AS ENUM ('hot', 'warm', 'cold');
CREATE TYPE buyer_persona      AS ENUM ('end_user', 'investor', 'nri', 'upgrade', 'first_home', 'unknown');
CREATE TYPE loan_need          AS ENUM ('yes', 'no', 'maybe', 'unknown');
CREATE TYPE purchase_timeline  AS ENUM ('immediate', 'within_3_months', 'within_6_months', 'within_12_months', 'just_exploring', 'unknown');
CREATE TYPE channel_kind       AS ENUM ('whatsapp', 'email', 'sms', 'call', 'web_chat', 'in_person');
CREATE TYPE message_direction  AS ENUM ('inbound', 'outbound');
CREATE TYPE message_status     AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked', 'received');
CREATE TYPE consent_purpose    AS ENUM ('transactional', 'marketing', 'calls', 'data_processing');
CREATE TYPE consent_state      AS ENUM ('granted', 'withdrawn');
CREATE TYPE task_status        AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_kind          AS ENUM ('call', 'follow_up', 'site_visit', 'document', 'nudge', 'escalation', 'other');
CREATE TYPE assignment_status  AS ENUM ('active', 'reassigned', 'released', 'completed');
CREATE TYPE enrollment_status  AS ENUM ('active', 'paused', 'completed', 'stopped');
CREATE TYPE visit_status       AS ENUM ('requested', 'scheduled', 'confirmed', 'completed', 'no_show', 'cancelled', 'rescheduled');
CREATE TYPE booking_status     AS ENUM ('offer', 'token_paid', 'agreement_signed', 'loan_processing', 'registered', 'cancelled');
CREATE TYPE partner_status     AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE agent_kind         AS ENUM ('onboarding', 'market_intel', 'creative', 'campaign_optimizer', 'lead_qualifier', 'router',
                                        'follow_up', 'visit_concierge', 'reporting', 'compliance_guard');
CREATE TYPE run_status         AS ENUM ('running', 'succeeded', 'failed', 'awaiting_approval', 'cancelled');
CREATE TYPE approval_status    AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE report_kind        AS ENUM ('weekly_client', 'monthly_client', 'campaign', 'team', 'custom');
CREATE TYPE integration_kind   AS ENUM ('llm', 'whatsapp', 'email', 'sms', 'ads_meta', 'ads_google', 'lead_source', 'storage', 'analytics', 'calendar', 'other');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- Tenancy, people, access
-- ---------------------------------------------------------------------
CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  gstin           text,
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,                      -- owner, admin, manager, executive, client_viewer, partner
  name            text NOT NULL,
  permissions     text[] NOT NULL DEFAULT '{}',       -- e.g. {'leads:read','leads:write','campaigns:approve'}
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id           uuid NOT NULL REFERENCES roles(id),
  auth_subject      text UNIQUE,                       -- Supabase Auth / Keycloak subject
  full_name         text NOT NULL,
  email             citext NOT NULL,
  phone_e164        text,
  status            user_status NOT NULL DEFAULT 'active',
  -- routing attributes for executives
  languages         text[] NOT NULL DEFAULT '{en}',    -- ISO 639-1: en, hi, kn, ta, te, ml, mr
  localities        text[] NOT NULL DEFAULT '{}',      -- e.g. {'Whitefield','Sarjapur Road'}
  routing_weight    smallint NOT NULL DEFAULT 1 CHECK (routing_weight BETWEEN 0 AND 10),
  max_active_leads  integer NOT NULL DEFAULT 60,
  is_available      boolean NOT NULL DEFAULT true,
  manager_id        uuid REFERENCES users(id),
  last_assigned_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);
CREATE INDEX users_org_role_idx ON users (org_id, role_id) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- Clients (builders / developers / brokers) and onboarding
-- ---------------------------------------------------------------------
CREATE TABLE clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_name        text NOT NULL,
  brand_name        text,
  client_type       text NOT NULL DEFAULT 'developer' CHECK (client_type IN ('developer', 'broker', 'other')),
  status            client_status NOT NULL DEFAULT 'onboarding',
  gstin             text,
  pan               text,
  cin               text,
  kyc_status        kyc_status NOT NULL DEFAULT 'pending',
  city              text,
  state             text,
  website           text,
  account_owner_id  uuid REFERENCES users(id),
  -- targets agreed at onboarding (monthly)
  target_leads          integer,
  target_site_visits    integer,
  target_bookings       integer,
  monthly_budget_inr    numeric(14,2),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_org_status_idx ON clients (org_id, status);

CREATE TABLE client_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  designation   text,
  email         citext,
  phone_e164    text,
  is_primary    boolean NOT NULL DEFAULT false,
  receives_reports boolean NOT NULL DEFAULT true,
  portal_user_id uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_contacts_client_idx ON client_contacts (client_id);

CREATE TABLE agreements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title           text NOT NULL,
  status          agreement_status NOT NULL DEFAULT 'draft',
  scope           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- services, channels, deliverables
  fee_model       text CHECK (fee_model IN ('retainer', 'per_lead', 'per_visit', 'per_booking', 'hybrid')),
  retainer_inr    numeric(14,2),
  success_fee     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- e.g. {"per_booking_pct": 1.0}
  starts_on       date,
  ends_on         date,
  signed_at       timestamptz,
  document_media_id uuid,                               -- FK added after media
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agreements_client_idx ON agreements (client_id, status);

-- ---------------------------------------------------------------------
-- Projects & inventory
-- ---------------------------------------------------------------------
CREATE TABLE projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL,
  status            project_status NOT NULL DEFAULT 'draft',
  property_type     property_type NOT NULL DEFAULT 'apartment',
  rera_number       text,                               -- must be present before any ad/microsite goes live
  rera_state        text,                               -- e.g. KA, MH, TS
  rera_status       rera_status NOT NULL DEFAULT 'unverified',
  rera_verified_at  timestamptz,
  rera_url          text,
  address_line      text,
  locality          text,                               -- micro-market, e.g. Whitefield
  city              text NOT NULL,
  state             text,
  pincode           text,
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  land_area_acres   numeric(8,2),
  possession_date   date,
  amenities         text[] NOT NULL DEFAULT '{}',
  price_min_inr     numeric(14,2),
  price_max_inr     numeric(14,2),
  description       text,
  personas          buyer_persona[] NOT NULL DEFAULT '{}',
  languages         text[] NOT NULL DEFAULT '{en}',      -- languages buyers are served in
  default_cadence_id uuid,                              -- FK added after cadences
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX projects_client_idx ON projects (client_id);
CREATE INDEX projects_org_city_locality_idx ON projects (org_id, city, locality);

CREATE TABLE towers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  floors        smallint,
  units_per_floor smallint,
  possession_date date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE unit_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,                        -- "3 BHK Premium"
  bedrooms        numeric(3,1) NOT NULL,                -- 2.5 for 2.5 BHK
  bathrooms       smallint,
  carpet_area_sqft   numeric(9,2),                      -- RERA mandates carpet area
  super_built_up_sqft numeric(9,2),
  floor_plan_media_id uuid,                             -- FK added after media
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE price_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  is_active       boolean NOT NULL DEFAULT true,
  base_rate_per_sqft numeric(10,2),
  floor_rise_per_sqft numeric(10,2) DEFAULT 0,
  plc             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- preferential location charges {"park_facing":150}
  charges         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"car_park":350000,"club":200000,"gst_pct":5}
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX price_lists_one_active_idx ON price_lists (project_id) WHERE is_active;

CREATE TABLE units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tower_id        uuid REFERENCES towers(id) ON DELETE SET NULL,
  unit_type_id    uuid NOT NULL REFERENCES unit_types(id),
  unit_number     text NOT NULL,
  floor           smallint,
  facing          facing,
  status          unit_status NOT NULL DEFAULT 'available',
  list_price_inr  numeric(14,2),                        -- all-inclusive price from active price list
  blocked_until   timestamptz,
  blocked_by_lead_id uuid,                              -- FK added after leads
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, tower_id, unit_number)
);
-- sold/booked units are auto-hidden from microsites by querying status = 'available'
CREATE INDEX units_available_idx ON units (project_id, unit_type_id) WHERE status = 'available';

CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  kind          media_kind NOT NULL,
  title         text,
  storage_key   text NOT NULL,                          -- key in Storage adapter (MinIO / Supabase / local)
  mime_type     text,
  size_bytes    bigint,
  width         integer,
  height        integer,
  sort_order    integer NOT NULL DEFAULT 0,
  extracted_text text,                                  -- filled by Onboarding Agent (brochure OCR/parse)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_project_kind_idx ON media (project_id, kind, sort_order);

ALTER TABLE agreements ADD CONSTRAINT agreements_document_fk FOREIGN KEY (document_media_id) REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE unit_types ADD CONSTRAINT unit_types_floor_plan_fk FOREIGN KEY (floor_plan_media_id) REFERENCES media(id) ON DELETE SET NULL;

-- AI memory: chunks of brochures, FAQs, RERA pages, conversations
CREATE TABLE knowledge_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  media_id      uuid REFERENCES media(id) ON DELETE CASCADE,
  content       text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding     vector(768),                            -- nomic-embed-text = 768 dims; change with model
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_chunks_project_idx ON knowledge_chunks (org_id, project_id);
CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE microsites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  custom_domain   text UNIQUE,
  template        text NOT NULL DEFAULT 'classic',
  status          microsite_status NOT NULL DEFAULT 'draft',
  content         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- sections: hero, gallery, plans, amenities, location, emi, faq
  seo             jsonb NOT NULL DEFAULT '{}'::jsonb,
  tracking        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"meta_pixel_id":"","ga4_id":"","capi":true}
  rera_disclaimer text,                                 -- rendered on every page; guard checks rera_number present
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- ---------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------
CREATE TABLE campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  name              text NOT NULL,
  platform          ad_platform NOT NULL,
  objective         campaign_objective NOT NULL DEFAULT 'leads',
  status            campaign_status NOT NULL DEFAULT 'draft',
  external_id       text,                               -- id in Meta / Google
  daily_budget_inr  numeric(12,2),
  total_budget_inr  numeric(14,2),
  starts_at         timestamptz,
  ends_at           timestamptz,
  utm_campaign      text,
  -- denormalised metrics, refreshed by the ads sync job
  spend_inr         numeric(14,2) NOT NULL DEFAULT 0,
  impressions       bigint NOT NULL DEFAULT 0,
  clicks            bigint NOT NULL DEFAULT 0,
  metrics_synced_at timestamptz,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_client_status_idx ON campaigns (org_id, client_id, status);
CREATE UNIQUE INDEX campaigns_external_idx ON campaigns (platform, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE ad_sets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id       uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name              text NOT NULL,
  status            campaign_status NOT NULL DEFAULT 'draft',
  external_id       text,
  persona           buyer_persona NOT NULL DEFAULT 'unknown',
  targeting         jsonb NOT NULL DEFAULT '{}'::jsonb, -- geo radius, age, interests, NRI countries
  daily_budget_inr  numeric(12,2),
  spend_inr         numeric(14,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_sets_campaign_idx ON ad_sets (campaign_id);

CREATE TABLE creatives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id     uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_set_id       uuid REFERENCES ad_sets(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  persona         buyer_persona NOT NULL DEFAULT 'unknown',
  format          text NOT NULL DEFAULT 'single_image', -- single_image, carousel, video, search_text, whatsapp_template
  language        text NOT NULL DEFAULT 'en',
  headline        text,
  primary_text    text,
  description     text,
  cta             text,
  media_id        uuid REFERENCES media(id) ON DELETE SET NULL,
  rera_number_shown text,                               -- copied in at generation; guard verifies against project
  status          creative_status NOT NULL DEFAULT 'draft',
  external_id     text,
  generated_by_run_id uuid,                             -- FK added after agent_runs
  compliance      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- last guard result
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creatives_project_status_idx ON creatives (project_id, status);

-- ---------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------
CREATE TABLE lead_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  kind          lead_source_kind NOT NULL,
  name          text NOT NULL,
  external_ref  text,                                   -- Meta form id, portal listing id, IVR number
  intake_key    text UNIQUE,                            -- public key for website forms / webhooks
  quality_weight numeric(3,2) NOT NULL DEFAULT 1.00,     -- used by scoring (portals often < 1)
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_sources_lookup_idx ON lead_sources (org_id, kind, external_ref);

CREATE TABLE channel_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  firm_name       text NOT NULL,
  contact_name    text NOT NULL,
  phone_e164      text NOT NULL,
  email           citext,
  rera_agent_number text,                               -- agents must be RERA-registered too
  status          partner_status NOT NULL DEFAULT 'pending',
  commission_pct  numeric(5,2),
  payout_details  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- store references only; bank details belong in a vault
  portal_user_id  uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_e164)
);

CREATE TABLE leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  source_id         uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  source_kind       lead_source_kind NOT NULL DEFAULT 'manual',
  campaign_id       uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_set_id         uuid REFERENCES ad_sets(id) ON DELETE SET NULL,
  creative_id       uuid REFERENCES creatives(id) ON DELETE SET NULL,
  channel_partner_id uuid REFERENCES channel_partners(id) ON DELETE SET NULL,
  external_id       text,                               -- e.g. Meta leadgen_id
  full_name         text,
  phone_raw         text,
  phone_e164        text,                               -- normalised (+91XXXXXXXXXX)
  alt_phone_e164    text,
  email             citext,
  email_normalized  citext,                             -- lowercased, gmail dots/plus stripped
  city              text,
  preferred_language text NOT NULL DEFAULT 'en',
  preferred_locality text,
  -- qualification
  budget_min_inr    numeric(14,2),
  budget_max_inr    numeric(14,2),
  bhk_preference    numeric(3,1)[],
  timeline          purchase_timeline NOT NULL DEFAULT 'unknown',
  loan_need         loan_need NOT NULL DEFAULT 'unknown',
  persona           buyer_persona NOT NULL DEFAULT 'unknown',
  is_nri            boolean NOT NULL DEFAULT false,
  -- pipeline
  stage             lead_stage NOT NULL DEFAULT 'new',
  score             smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  temperature       lead_temperature NOT NULL DEFAULT 'cold',
  score_reasons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  lost_reason       text,
  -- compliance flags
  dnd               boolean NOT NULL DEFAULT false,     -- on NCPR/DND list or asked not to call
  opted_out         boolean NOT NULL DEFAULT false,     -- STOP / unsubscribe on any channel
  -- tracking
  utm               jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload       jsonb,
  first_response_at timestamptz,                        -- speed-to-lead (auto)
  first_contact_at  timestamptz,                        -- first human contact
  last_inbound_at   timestamptz,                        -- drives WhatsApp 24h session window
  last_activity_at  timestamptz,
  next_action_at    timestamptz,
  merged_into_id    uuid REFERENCES leads(id),
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- dedupe: one live lead per person per project (NULL project treated as one bucket)
CREATE UNIQUE INDEX leads_dedupe_phone_idx ON leads (org_id, project_id, phone_e164) NULLS NOT DISTINCT
  WHERE phone_e164 IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX leads_email_idx ON leads (org_id, email_normalized) WHERE email_normalized IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX leads_phone_idx ON leads (org_id, phone_e164) WHERE merged_into_id IS NULL;
CREATE INDEX leads_pipeline_idx ON leads (org_id, project_id, stage, temperature) WHERE archived_at IS NULL;
CREATE INDEX leads_owner_idx ON leads (owner_id, stage) WHERE archived_at IS NULL;
CREATE INDEX leads_created_idx ON leads (org_id, created_at DESC);
CREATE UNIQUE INDEX leads_external_idx ON leads (org_id, source_kind, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE units ADD CONSTRAINT units_blocked_by_lead_fk FOREIGN KEY (blocked_by_lead_id) REFERENCES leads(id) ON DELETE SET NULL;

CREATE TABLE lead_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type          text NOT NULL,                          -- created, duplicate_inquiry, stage_changed, scored, assigned, sla_breach,
                                                        -- message_in, message_out, call_logged, visit_scheduled, consent_changed ...
  actor_type    text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'user', 'agent', 'lead', 'partner')),
  actor_id      uuid,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_events_timeline_idx ON lead_events (lead_id, occurred_at DESC);
CREATE INDEX lead_events_org_type_idx ON lead_events (org_id, type, occurred_at DESC);

-- DPDP Act 2023: purpose-specific, withdrawable consent with evidence
CREATE TABLE consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel       channel_kind NOT NULL,
  purpose       consent_purpose NOT NULL,
  state         consent_state NOT NULL,
  source        text NOT NULL,                          -- meta_form_checkbox, website_form, whatsapp_optin, verbal_call, STOP_keyword
  notice_version text,                                  -- version of privacy notice shown
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,     -- ip, user agent, form id, message id
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);
-- latest consent per (lead, channel, purpose) is the effective one
CREATE INDEX consents_effective_idx ON consents (lead_id, channel, purpose, recorded_at DESC);

-- ---------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------
CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel         channel_kind NOT NULL,
  external_thread_id text,                              -- wa_id / email thread id
  is_open         boolean NOT NULL DEFAULT true,
  ai_enabled      boolean NOT NULL DEFAULT true,         -- human takeover switches this off
  session_expires_at timestamptz,                       -- WhatsApp 24h customer-service window
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, channel)
);
CREATE INDEX conversations_inbox_idx ON conversations (org_id, is_open, last_message_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction       message_direction NOT NULL,
  channel         channel_kind NOT NULL,
  status          message_status NOT NULL DEFAULT 'queued',
  sender_type     text NOT NULL DEFAULT 'system' CHECK (sender_type IN ('lead', 'user', 'agent', 'system')),
  sender_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  template_name   text,
  subject         text,
  body            text,
  media           jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_message_id text,
  error           text,
  blocked_reasons text[],                               -- compliance guard output when status = blocked
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE UNIQUE INDEX messages_provider_idx ON messages (channel, provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Work: tasks, cadences, assignments
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
  assignee_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  kind          task_kind NOT NULL DEFAULT 'follow_up',
  title         text NOT NULL,
  notes         text,
  status        task_status NOT NULL DEFAULT 'open',
  due_at        timestamptz,
  completed_at  timestamptz,
  created_by_type text NOT NULL DEFAULT 'system',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assignee_due_idx ON tasks (assignee_id, status, due_at);

CREATE TABLE cadences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  trigger       text NOT NULL DEFAULT 'lead_created',   -- lead_created, visit_completed, lead_lost (nurture)
  stop_on_stages lead_stage[] NOT NULL DEFAULT '{booked,lost}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ADD CONSTRAINT projects_default_cadence_fk FOREIGN KEY (default_cadence_id) REFERENCES cadences(id) ON DELETE SET NULL;

CREATE TABLE cadence_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cadence_id    uuid NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  position      smallint NOT NULL,
  day_offset    smallint NOT NULL,                      -- 0, 1, 3, 7, 14, 30
  send_at_local time,                                   -- preferred IST time; null = asap within allowed hours
  channel       channel_kind NOT NULL,
  purpose       consent_purpose NOT NULL DEFAULT 'marketing',
  template_name text,                                   -- approved WhatsApp template (required outside 24h window)
  subject       text,
  body          text,                                   -- with {{name}}, {{project}} placeholders
  use_ai_draft  boolean NOT NULL DEFAULT false,         -- Follow-up Agent personalises the body
  requires_approval boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, position)
);

CREATE TABLE cadence_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cadence_id    uuid NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status        enrollment_status NOT NULL DEFAULT 'active',
  current_position smallint NOT NULL DEFAULT 0,
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  next_run_at   timestamptz,
  stopped_reason text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, lead_id)
);
CREATE INDEX cadence_enrollments_due_idx ON cadence_enrollments (status, next_run_at);

CREATE TABLE assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          assignment_status NOT NULL DEFAULT 'active',
  method          text NOT NULL DEFAULT 'auto' CHECK (method IN ('auto', 'manual', 'sla_reassign', 'partner')),
  reason          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- router explanation (language/locality/load)
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  sla_due_at      timestamptz,
  first_contact_at timestamptz,
  sla_breached    boolean NOT NULL DEFAULT false,
  ended_at        timestamptz
);
CREATE UNIQUE INDEX assignments_one_active_idx ON assignments (lead_id) WHERE status = 'active';
CREATE INDEX assignments_user_active_idx ON assignments (user_id) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- Site visits & bookings
-- ---------------------------------------------------------------------
CREATE TABLE site_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  host_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  channel_partner_id uuid REFERENCES channel_partners(id) ON DELETE SET NULL,
  status          visit_status NOT NULL DEFAULT 'scheduled',
  scheduled_at    timestamptz NOT NULL,
  duration_min    smallint NOT NULL DEFAULT 60,
  attendees       smallint NOT NULL DEFAULT 1,
  pickup_required boolean NOT NULL DEFAULT false,
  pickup_address  text,
  reminders_sent  jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_in_at   timestamptz,
  feedback        jsonb,                                -- {"rating":4,"liked":["clubhouse"],"concerns":["price"],"next_step":"negotiation"}
  interest_level  lead_temperature,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_visits_calendar_idx ON site_visits (org_id, scheduled_at) WHERE status IN ('scheduled', 'confirmed');
CREATE INDEX site_visits_lead_idx ON site_visits (lead_id);

CREATE TABLE bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id           uuid NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  unit_id           uuid REFERENCES units(id) ON DELETE SET NULL,
  channel_partner_id uuid REFERENCES channel_partners(id) ON DELETE SET NULL,
  closed_by_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  status            booking_status NOT NULL DEFAULT 'offer',
  agreed_price_inr  numeric(14,2),
  cost_sheet        jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_amount_inr  numeric(12,2),
  token_paid_at     timestamptz,
  loan_bank         text,
  documents         jsonb NOT NULL DEFAULT '[]'::jsonb, -- media ids
  partner_payout_inr numeric(12,2),
  partner_paid_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_project_status_idx ON bookings (org_id, project_id, status);
CREATE UNIQUE INDEX bookings_unit_live_idx ON bookings (unit_id) WHERE unit_id IS NOT NULL AND status <> 'cancelled';

-- ---------------------------------------------------------------------
-- AI agents, approvals, reports, integrations
-- ---------------------------------------------------------------------
CREATE TABLE agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent         agent_kind NOT NULL,
  status        run_status NOT NULL DEFAULT 'running',
  subject_type  text,                                   -- lead, project, campaign, client
  subject_id    uuid,
  input         jsonb NOT NULL DEFAULT '{}'::jsonb,
  output        jsonb,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,     -- node-by-node trace (every action logged)
  model         text,
  tokens_in     integer,
  tokens_out    integer,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX agent_runs_subject_idx ON agent_runs (subject_type, subject_id, started_at DESC);
CREATE INDEX agent_runs_org_agent_idx ON agent_runs (org_id, agent, started_at DESC);

ALTER TABLE creatives ADD CONSTRAINT creatives_run_fk FOREIGN KEY (generated_by_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE TABLE approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_run_id  uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  kind          text NOT NULL,                          -- creative, campaign_budget, outbound_message, client_report, project_publish
  subject_type  text NOT NULL,
  subject_id    uuid,
  title         text NOT NULL,
  payload       jsonb NOT NULL,                         -- the proposed content/change
  compliance    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        approval_status NOT NULL DEFAULT 'pending',
  requested_by_type text NOT NULL DEFAULT 'agent',
  assignee_role text,                                   -- who may approve (manager, admin, client_viewer)
  decided_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_queue_idx ON approvals (org_id, status, created_at);

CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind          report_kind NOT NULL DEFAULT 'weekly_client',
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,     -- spend, leads, cpl, cpql, visits, cpsv, bookings, roas, sla
  narrative     text,                                   -- Reporting Agent output
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent')),
  approval_id   uuid REFERENCES approvals(id) ON DELETE SET NULL,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (client_id, project_id, kind, period_start)
);

CREATE TABLE integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,  -- per-client ad accounts / WABA numbers
  kind          integration_kind NOT NULL,
  provider      text NOT NULL,                          -- whatsapp_cloud, smtp, brevo, meta_marketing, google_ads, litellm
  name          text NOT NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,     -- non-secret settings (phone_number_id, ad_account_id)
  secret_ref    text,                                   -- pointer to a secret manager entry; never store tokens here in plain text
  is_active     boolean NOT NULL DEFAULT true,
  last_ok_at    timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integrations_lookup_idx ON integrations (org_id, kind, is_active);

-- ---------------------------------------------------------------------
-- Reporting view: funnel per project (spend -> lead -> visit -> booking)
-- ---------------------------------------------------------------------
CREATE VIEW project_funnel AS
SELECT
  p.org_id,
  p.client_id,
  p.id AS project_id,
  p.name AS project_name,
  COALESCE((SELECT sum(c.spend_inr) FROM campaigns c WHERE c.project_id = p.id), 0)            AS spend_inr,
  (SELECT count(*) FROM leads l WHERE l.project_id = p.id AND l.merged_into_id IS NULL)          AS leads,
  (SELECT count(*) FROM leads l WHERE l.project_id = p.id AND l.stage NOT IN ('new', 'lost')
     AND l.merged_into_id IS NULL)                                                                AS qualified_or_better,
  (SELECT count(*) FROM site_visits v WHERE v.project_id = p.id AND v.status = 'completed')       AS site_visits,
  (SELECT count(*) FROM bookings b WHERE b.project_id = p.id AND b.status <> 'cancelled')         AS bookings
FROM projects p;

-- ---------------------------------------------------------------------
-- updated_at triggers + row-level security on every org-scoped table
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;

  -- RLS: a session must SET app.org_id; the app's DB role is subject to these policies.
  -- (Superusers and table owners bypass RLS; run the API as a non-owner role in production.)
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant ON %I USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
      'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Auth (same as db/migrations/002_auth.sql; keep the two in sync)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  password_hash       text NOT NULL,                    -- scrypt$N$r$p$salt$hash (base64url)
  failed_attempts     integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id     uuid NOT NULL,                          -- one login session; reuse of a rotated token revokes the family
  token_hash    text NOT NULL UNIQUE,                   -- sha256 of the token; the token itself is never stored
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  replaced_by   uuid,
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_credentials_updated_at') THEN
    CREATE TRIGGER user_credentials_updated_at BEFORE UPDATE ON user_credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  FOREACH t IN ARRAY ARRAY['user_credentials', 'refresh_tokens'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_tenant') THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant ON %I USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
        'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)', t, t);
    END IF;
  END LOOP;
END $$;

-- Pre-tenant lookups. Sign-in happens before app.org_id is known, so these narrow
-- SECURITY DEFINER functions are the only reads that cross RLS. Everything after uses app.org_id.
CREATE OR REPLACE FUNCTION auth_login_lookup(p_email text, p_org_slug text DEFAULT NULL)
RETURNS TABLE (user_id uuid, org_id uuid, org_slug text, role_key text, status user_status, full_name text, email text,
               password_hash text, failed_attempts integer, locked_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.org_id, o.slug, r.key, u.status, u.full_name, u.email::text,
         c.password_hash, COALESCE(c.failed_attempts, 0), c.locked_until
    FROM users u
    JOIN organizations o ON o.id = u.org_id
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN user_credentials c ON c.user_id = u.id
   WHERE u.email = p_email::citext AND (p_org_slug IS NULL OR o.slug = p_org_slug)
$$;

CREATE OR REPLACE FUNCTION auth_subject_lookup(p_subject text)
RETURNS TABLE (user_id uuid, org_id uuid, role_key text, status user_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.org_id, r.key, u.status FROM users u JOIN roles r ON r.id = u.role_id WHERE u.auth_subject = p_subject
$$;

CREATE OR REPLACE FUNCTION auth_refresh_lookup(p_token_hash text)
RETURNS TABLE (id uuid, org_id uuid, user_id uuid, family_id uuid, expires_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.id, t.org_id, t.user_id, t.family_id, t.expires_at, t.revoked_at FROM refresh_tokens t WHERE t.token_hash = p_token_hash
$$;
