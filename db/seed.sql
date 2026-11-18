-- =====================================================================
-- RealCognix OS — sample data (fictitious, for local development only)
-- Names, phone numbers and RERA numbers below are made up.
-- Fixed UUIDs so API calls in the README work out of the box.
-- =====================================================================

-- Organization (the agency running RealCognix)
INSERT INTO organizations (id, name, slug, gstin) VALUES
  ('00000000-0000-0000-0000-000000000001', 'RealCognix Demo Agency', 'realcognix-demo', '29AAAAA0000A1Z5');

-- Roles
INSERT INTO roles (id, org_id, key, name, permissions, is_system) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'admin',     'Admin',
     '{*}', true),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'manager',   'Sales Manager',
     '{leads:read,leads:write,leads:assign,visits:write,approvals:decide,reports:read}', true),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'executive', 'Sales Executive',
     '{leads:read,leads:write,visits:write}', true),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'client_viewer', 'Client (portal)',
     '{reports:read,approvals:decide}', true);

-- Users
INSERT INTO users (id, org_id, role_id, full_name, email, phone_e164, languages, localities, routing_weight, max_active_leads, manager_id) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001',
     'Priya Sharma',  'priya@realcognix.test',  '+919800000001', '{en,hi}',    '{}', 0, 0, NULL),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000002',
     'Vikram Rao',    'vikram@realcognix.test', '+919800000002', '{en,kn,hi}', '{Whitefield,Sarjapur Road}', 1, 20, NULL),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003',
     'Rahul Nair',    'rahul@realcognix.test',  '+919800000003', '{en,ml,kn}', '{Whitefield,KR Puram}', 3, 60, '00000000-0000-0000-0002-000000000002'),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003',
     'Ananya Reddy',  'ananya@realcognix.test', '+919800000004', '{en,te,hi}', '{Sarjapur Road,Electronic City}', 2, 60, '00000000-0000-0000-0002-000000000002'),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003',
     'Karthik Iyer',  'karthik@realcognix.test','+919800000005', '{en,ta,kn}', '{Whitefield,Hebbal}', 2, 50, '00000000-0000-0000-0002-000000000002');

-- Client (a builder) + contact + agreement
INSERT INTO clients (id, org_id, legal_name, brand_name, status, gstin, pan, kyc_status, city, state, website, account_owner_id,
                     target_leads, target_site_visits, target_bookings, monthly_budget_inr) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'Shreeji Habitats Private Limited', 'Shreeji Habitats',
     'active', '29BBBBB1111B1Z2', 'BBBBB1111B', 'verified', 'Bengaluru', 'Karnataka', 'https://shreeji-habitats.example',
     '00000000-0000-0000-0002-000000000002', 600, 90, 12, 1200000.00);

INSERT INTO client_contacts (org_id, client_id, full_name, designation, email, phone_e164, is_primary) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'Suresh Patel', 'Director – Sales',
     'suresh@shreeji-habitats.example', '+919811111111', true);

INSERT INTO agreements (org_id, client_id, title, status, scope, fee_model, retainer_inr, success_fee, starts_on, ends_on, signed_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'Marketing & Sales Services – Shreeji Lakeview',
     'signed', '{"channels":["meta","google","portals","whatsapp"],"services":["microsite","lead_management","site_visits","reporting"]}',
     'hybrid', 150000.00, '{"per_booking_pct": 0.75}', '2026-11-01', '2027-10-31', '2026-10-28 11:00:00+05:30');

-- Cadence (day 0/1/3/7/14/30)
INSERT INTO cadences (id, org_id, client_id, name, description, trigger) VALUES
  ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000001', NULL, 'New lead – 30 day',
   'Standard speed-to-lead cadence: WhatsApp + email + call tasks', 'lead_created');

INSERT INTO cadence_steps (org_id, cadence_id, position, day_offset, send_at_local, channel, purpose, template_name, subject, body, use_ai_draft, requires_approval) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 1, 0,  NULL,    'whatsapp', 'transactional', 'welcome_brochure', NULL,
     'Hi {{name}}, thanks for your interest in {{project}}. Here is the brochure. RERA: {{rera}}', false, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 2, 0,  NULL,    'call',     'calls',         NULL, NULL,
     'Call {{name}} within 5 minutes – new {{temperature}} lead for {{project}}', false, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 3, 1,  '11:00', 'whatsapp', 'marketing',     'followup_visit_invite', NULL,
     'Hi {{name}}, would you like to see {{project}} this weekend? Reply with a day that suits you.', true, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 4, 3,  '10:30', 'email',    'marketing',     NULL,
     '{{project}} – floor plans and price sheet',
     'Dear {{name}},\n\nSharing the floor plans and current price sheet for {{project}}.\n\nRERA: {{rera}}', true, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 5, 7,  '12:00', 'whatsapp', 'marketing',     'followup_offer', NULL,
     'Hi {{name}}, a few {{bhk}} homes are still available at {{project}}. Shall I block a visit slot?', true, true),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 6, 14, '11:00', 'call',     'calls',         NULL, NULL,
     'Check-in call with {{name}} – share construction update', false, false),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0006-000000000001', 7, 30, '11:00', 'whatsapp', 'marketing',     'nurture_monthly', NULL,
     'Hi {{name}}, monthly update from {{project}}: {{update}}', true, true);

-- Project + inventory (fictitious RERA number)
INSERT INTO projects (id, org_id, client_id, name, slug, status, property_type, rera_number, rera_state, rera_status, rera_verified_at,
                      rera_url, address_line, locality, city, state, pincode, latitude, longitude, land_area_acres, possession_date,
                      amenities, price_min_inr, price_max_inr, description, personas, languages, default_cadence_id) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   'Shreeji Lakeview', 'shreeji-lakeview', 'under_construction', 'apartment',
   'PRM/KA/RERA/1251/446/PR/000000/000001', 'KA', 'verified', '2026-10-30 10:00:00+05:30',
   'https://rera.karnataka.gov.in/', 'Survey No. 00, Varthur Main Road', 'Whitefield', 'Bengaluru', 'Karnataka', '560066',
   12.969800, 77.749900, 6.50, '2029-06-30',
   '{Clubhouse,Swimming pool,Lake view,Co-working lounge,EV charging,Kids play area}', 8900000.00, 16500000.00,
   '2 & 3 BHK lake-facing homes in Whitefield, 10 minutes from ITPL.', '{end_user,upgrade,nri}', '{en,kn,hi}',
   '00000000-0000-0000-0006-000000000001');

INSERT INTO towers (id, org_id, project_id, name, floors, units_per_floor) VALUES
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', 'Tower A', 18, 6),
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', 'Tower B', 18, 6);

INSERT INTO unit_types (id, org_id, project_id, name, bedrooms, bathrooms, carpet_area_sqft, super_built_up_sqft) VALUES
  ('00000000-0000-0000-0005-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '2 BHK', 2, 2, 860, 1210),
  ('00000000-0000-0000-0005-000000000102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '3 BHK', 3, 3, 1240, 1690),
  ('00000000-0000-0000-0005-000000000103', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '3 BHK Premium', 3, 3, 1420, 1930);

INSERT INTO price_lists (org_id, project_id, name, effective_from, base_rate_per_sqft, floor_rise_per_sqft, plc, charges) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', 'Launch price list', '2026-11-01', 7200, 40,
   '{"lake_facing": 250, "corner": 150}', '{"car_park": 350000, "club_membership": 200000, "gst_pct": 5, "stamp_duty_pct": 5, "registration_pct": 1}');

INSERT INTO units (org_id, project_id, tower_id, unit_type_id, unit_number, floor, facing, status, list_price_inr) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0005-000000000101', 'A-0302', 3,  'east',       'available', 8950000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0005-000000000101', 'A-0705', 7,  'north',      'sold',      9150000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0005-000000000102', 'A-1104', 11, 'north_east', 'available', 12800000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0005-000000000102', 'B-0601', 6,  'east',       'blocked',   12400000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0005-000000000103', 'B-1502', 15, 'north_east', 'available', 16300000);

INSERT INTO microsites (org_id, project_id, slug, status, content, tracking, rera_disclaimer) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0004-000000000001', 'shreeji-lakeview', 'draft',
   '{"hero":{"headline":"Lake-facing 2 & 3 BHK homes in Whitefield","subhead":"From ₹89 Lakh*"}}',
   '{"meta_pixel_id": null, "ga4_id": null}',
   'RERA No. PRM/KA/RERA/1251/446/PR/000000/000001 | rera.karnataka.gov.in');

-- Campaign + lead sources
INSERT INTO campaigns (id, org_id, client_id, project_id, name, platform, objective, status, daily_budget_inr, utm_campaign, spend_inr, impressions, clicks) VALUES
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', 'Lakeview – Meta Lead Ads – Whitefield 15km', 'meta', 'leads', 'active', 15000, 'lakeview_meta_nov',
   182000, 410000, 6900);

INSERT INTO lead_sources (id, org_id, client_id, project_id, campaign_id, kind, name, external_ref, intake_key, quality_weight) VALUES
  ('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0007-000000000001', 'meta_lead_ads', 'Meta form – Lakeview Nov', '1234567890', NULL, 1.00),
  ('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', NULL, 'website_form', 'Lakeview microsite form', NULL, 'demo-lakeview-form-key', 1.10),
  ('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', NULL, 'portal_99acres', '99acres listing', NULL, 'demo-portal-email-key', 0.80);

INSERT INTO channel_partners (org_id, firm_name, contact_name, phone_e164, email, rera_agent_number, status, commission_pct) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Sai Krupa Realty', 'Manjunath Gowda', '+919822222222', 'manju@saikrupa.example',
   'PRM/KA/RERA/1251/309/AG/000000/000002', 'approved', 2.00);

-- Leads
INSERT INTO leads (id, org_id, client_id, project_id, source_id, source_kind, campaign_id, full_name, phone_raw, phone_e164, email, email_normalized,
                   city, preferred_language, preferred_locality, budget_min_inr, budget_max_inr, bhk_preference, timeline, loan_need, persona,
                   stage, score, temperature, owner_id, first_response_at, created_at) VALUES
  ('00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0008-000000000001', 'meta_lead_ads', '00000000-0000-0000-0007-000000000001',
   'Arjun Menon', '098450 00001', '+919845000001', 'arjun.menon@example.com', 'arjun.menon@example.com',
   'Bengaluru', 'en', 'Whitefield', 10000000, 13000000, '{3}', 'within_3_months', 'yes', 'upgrade',
   'visit_scheduled', 82, 'hot', '00000000-0000-0000-0002-000000000003', now() - interval '2 days' + interval '40 seconds', now() - interval '2 days'),
  ('00000000-0000-0000-0009-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0008-000000000002', 'website_form', NULL,
   'Lakshmi Krishnan', '+91 99000 00002', '+919900000002', 'lakshmi.k@example.com', 'lakshmi.k@example.com',
   'Chennai', 'ta', NULL, 8500000, 9500000, '{2}', 'within_6_months', 'maybe', 'end_user',
   'contacted', 58, 'warm', '00000000-0000-0000-0002-000000000005', now() - interval '1 day' + interval '25 seconds', now() - interval '1 day'),
  ('00000000-0000-0000-0009-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0008-000000000003', 'portal_99acres', NULL,
   'Rohit Gupta', '+1 408 555 0100', '+14085550100', 'rohit.gupta@example.com', 'rohit.gupta@example.com',
   'San Jose', 'hi', 'Whitefield', 15000000, 17000000, '{3}', 'within_12_months', 'no', 'nri',
   'new', 44, 'warm', NULL, NULL, now() - interval '20 minutes');

UPDATE leads SET is_nri = true WHERE id = '00000000-0000-0000-0009-000000000003';

INSERT INTO consents (org_id, lead_id, channel, purpose, state, source, notice_version, evidence) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'whatsapp', 'marketing',     'granted', 'meta_form_checkbox', 'v1', '{"form_id":"1234567890"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'whatsapp', 'transactional', 'granted', 'meta_form_checkbox', 'v1', '{"form_id":"1234567890"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'call',     'calls',         'granted', 'meta_form_checkbox', 'v1', '{}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000002', 'whatsapp', 'transactional', 'granted', 'website_form',       'v1', '{"ip":"203.0.113.10"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000002', 'email',    'marketing',     'granted', 'website_form',       'v1', '{"ip":"203.0.113.10"}'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000003', 'email',    'transactional', 'granted', 'portal_99acres',     'v1', '{}');

INSERT INTO lead_events (org_id, lead_id, type, actor_type, data, occurred_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'created',  'system', '{"source":"meta_lead_ads"}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'scored',   'system', '{"score":82,"temperature":"hot"}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'assigned', 'system', '{"user":"Rahul Nair","method":"auto"}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'visit_scheduled', 'user', '{"when":"Saturday 11:00 IST"}', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000002', 'created',  'system', '{"source":"website_form"}', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000003', 'created',  'system', '{"source":"portal_99acres"}', now() - interval '20 minutes');

INSERT INTO assignments (org_id, lead_id, user_id, status, method, reason, assigned_at, sla_due_at, first_contact_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0002-000000000003', 'active', 'auto',
   '{"language":"en","locality":"Whitefield"}', now() - interval '2 days', now() - interval '2 days' + interval '5 minutes', now() - interval '2 days' + interval '3 minutes'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000002', '00000000-0000-0000-0002-000000000005', 'active', 'auto',
   '{"language":"ta"}', now() - interval '1 day', now() - interval '1 day' + interval '5 minutes', now() - interval '1 day' + interval '4 minutes');

INSERT INTO conversations (id, org_id, lead_id, channel, external_thread_id, session_expires_at, last_message_at) VALUES
  ('00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', 'whatsapp',
   '919845000001', now() + interval '20 hours', now() - interval '4 hours');

INSERT INTO messages (org_id, conversation_id, lead_id, direction, channel, status, sender_type, template_name, body, sent_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0009-000000000001', 'outbound', 'whatsapp', 'read', 'system',
   'welcome_brochure', 'Hi Arjun, thanks for your interest in Shreeji Lakeview. Here is the brochure.', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-000a-000000000001', '00000000-0000-0000-0009-000000000001', 'inbound',  'whatsapp', 'received', 'lead',
   NULL, 'Looking for 3BHK around 1.2 Cr, will need a home loan. Can I visit Saturday?', now() - interval '4 hours');

INSERT INTO site_visits (org_id, lead_id, project_id, host_user_id, status, scheduled_at, attendees, pickup_required) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0004-000000000001',
   '00000000-0000-0000-0002-000000000003', 'confirmed', date_trunc('day', now()) + interval '3 days' + interval '5 hours 30 minutes', 3, false);

INSERT INTO tasks (org_id, lead_id, assignee_id, kind, title, due_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0009-000000000002', '00000000-0000-0000-0002-000000000005', 'follow_up',
   'Share 2 BHK cost sheet with Lakshmi', now() + interval '1 day');

INSERT INTO integrations (org_id, kind, provider, name, config) VALUES
  ('00000000-0000-0000-0000-000000000001', 'llm',      'litellm',        'Local LLM via LiteLLM', '{"model":"default"}'),
  ('00000000-0000-0000-0000-000000000001', 'email',    'smtp',           'Mailpit (dev)',         '{"host":"mailpit","port":1025}'),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp', 'console',        'Console (dev, no keys)', '{}');
