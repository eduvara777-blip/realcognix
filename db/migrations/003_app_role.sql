-- =====================================================================
-- 003_app_role — the database enforces tenant isolation.
--
-- Roles
--   owner (POSTGRES_USER)  owns every table and runs migrations. Never used by the API or worker.
--   realcognix_app         LOGIN, NOBYPASSRLS, not an owner. The API, the worker and set-password connect as it.
--                          Gets SELECT/INSERT/UPDATE on tenant tables (no DELETE: the app only soft-deletes),
--                          SELECT on organizations, and EXECUTE on the SECURITY DEFINER lookups below. Nothing else.
--   realcognix_system      NOLOGIN, BYPASSRLS. Owns the SECURITY DEFINER lookups and nothing else, so the only
--                          cross-tenant reads are those functions. Nobody can connect as it.
--
-- Every table with org_id has RLS ENABLEd and FORCEd (the owner is subject to it too, unless it is a superuser),
-- with one policy keyed on current_setting('app.org_id', true). An unset app.org_id matches no rows.
-- organizations has no org_id: it is read-only for the app and each org sees only its own row.
--
-- Run as the owner (a superuser in Docker). Idempotent: safe on fresh and existing databases.
--   docker compose exec -T postgres psql -U realcognix -d realcognix < db/migrations/003_app_role.sql
-- Then give the app role a password (the Docker init script does this from APP_DB_PASSWORD):
--   docker compose exec postgres psql -U realcognix -d realcognix -c "ALTER ROLE realcognix_app PASSWORD '...'"
--
-- New tables: there are deliberately no default privileges. A migration that adds a table must add org_id,
-- ENABLE + FORCE RLS with the tenant policy, and GRANT to realcognix_app explicitly (re-running this file does it).
-- =====================================================================

-- ---------------------------------------------------------------- roles
DO $$
DECLARE is_super boolean := (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_app') THEN
    CREATE ROLE realcognix_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'realcognix_app') THEN
    RAISE EXCEPTION 'realcognix_app must be NOSUPERUSER NOBYPASSRLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'realcognix_app') THEN
    RAISE EXCEPTION 'realcognix_app must not own tables (owners can disable RLS)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_system') THEN
    IF is_super THEN
      CREATE ROLE realcognix_system NOLOGIN BYPASSRLS;
    ELSE
      RAISE WARNING 'not a superuser: realcognix_system (BYPASSRLS) not created; the auth/intake lookups stay owned by %, which then needs BYPASSRLS', current_user;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------- RLS on every tenant table
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_tenant') THEN
      EXECUTE format(
        'CREATE POLICY %I_tenant ON %I USING (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
        'WITH CHECK (org_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)', t, t);
    END IF;
  END LOOP;

  -- organizations is the tenant itself (no org_id): each org reads only its own row; the app cannot write it.
  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = 'organizations_self') THEN
    CREATE POLICY organizations_self ON organizations FOR SELECT
      USING (id = NULLIF(current_setting('app.org_id', true), '')::uuid);
  END IF;
END $$;

-- Views run as their owner unless security_invoker is set, which would bypass RLS.
ALTER VIEW project_funnel SET (security_invoker = true);

-- ---------------------------------------------------------------- SECURITY DEFINER lookups
-- The only reads that cross tenants. Each returns the minimum needed to pick an org; everything after runs scoped.
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

-- Webhook intake: which org/client/project a lead belongs to, by its form intake key (unique) or by the
-- provider's external ref (e.g. Meta form id). An external ref used by more than one org is ambiguous: no match.
CREATE OR REPLACE FUNCTION intake_resolve_source(p_intake_key text, p_external_ref text, p_kind lead_source_kind DEFAULT NULL)
RETURNS TABLE (id uuid, org_id uuid, client_id uuid, project_id uuid, campaign_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.org_id, s.client_id, s.project_id, s.campaign_id FROM lead_sources s
   WHERE s.is_active AND p_intake_key IS NOT NULL AND s.intake_key = p_intake_key
  UNION ALL
  (SELECT s.id, s.org_id, s.client_id, s.project_id, s.campaign_id FROM lead_sources s
    WHERE p_intake_key IS NULL AND p_external_ref IS NOT NULL
      AND s.is_active AND s.external_ref = p_external_ref AND (p_kind IS NULL OR s.kind = p_kind)
      AND (SELECT count(DISTINCT x.org_id) FROM lead_sources x
            WHERE x.is_active AND x.external_ref = p_external_ref AND (p_kind IS NULL OR x.kind = p_kind)) = 1
    ORDER BY s.created_at LIMIT 1)
$$;

-- WhatsApp delivery receipts carry only the provider message id: find the org that sent it.
CREATE OR REPLACE FUNCTION whatsapp_message_org(p_provider_message_id text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.org_id FROM messages m WHERE m.channel = 'whatsapp' AND m.provider_message_id = p_provider_message_id LIMIT 1
$$;

-- Weekly report scheduler: the one job that fans out across orgs. Ids only; each report then runs scoped to its org.
CREATE OR REPLACE FUNCTION system_active_clients()
RETURNS TABLE (org_id uuid, client_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.org_id, c.id FROM clients c WHERE c.status = 'active' ORDER BY c.org_id, c.id
$$;

-- realcognix_system owns the lookups (least privilege: SELECT on exactly what they read, BYPASSRLS, NOLOGIN).
DO $$
DECLARE f text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_system') THEN
    GRANT USAGE ON SCHEMA public TO realcognix_system;
    GRANT SELECT ON users, organizations, roles, user_credentials, refresh_tokens, lead_sources, messages, clients TO realcognix_system;
    GRANT CREATE ON SCHEMA public TO realcognix_system; -- ALTER ... OWNER needs it; revoked right after
    FOREACH f IN ARRAY ARRAY['auth_login_lookup(text,text)', 'auth_subject_lookup(text)', 'auth_refresh_lookup(text)',
                             'intake_resolve_source(text,text,lead_source_kind)', 'whatsapp_message_org(text)', 'system_active_clients()'] LOOP
      EXECUTE format('ALTER FUNCTION %s OWNER TO realcognix_system', f);
    END LOOP;
    REVOKE CREATE ON SCHEMA public FROM realcognix_system;
  END IF;
END $$;

-- ---------------------------------------------------------------- grants for the app role
DO $$
DECLARE t text; f text;
BEGIN
  -- Start from nothing, then grant exactly what the app uses.
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM realcognix_app';
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM realcognix_app';
  GRANT USAGE ON SCHEMA public TO realcognix_app;
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO realcognix_app', t);
  END LOOP;
  GRANT SELECT ON organizations TO realcognix_app;
  GRANT SELECT ON project_funnel TO realcognix_app;
  EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO realcognix_app'; -- none today (uuid keys); future-proof

  FOREACH f IN ARRAY ARRAY['auth_login_lookup(text,text)', 'auth_subject_lookup(text)', 'auth_refresh_lookup(text)',
                           'intake_resolve_source(text,text,lead_source_kind)', 'whatsapp_message_org(text)', 'system_active_clients()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO realcognix_app', f);
  END LOOP;
END $$;
