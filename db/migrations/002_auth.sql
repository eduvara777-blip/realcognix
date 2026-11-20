-- =====================================================================
-- 002_auth — built-in email + password login and rotating refresh tokens.
-- Idempotent: safe to run on an existing database and on a fresh one.
--   docker compose exec -T postgres psql -U realcognix -d realcognix < db/migrations/002_auth.sql
-- =====================================================================

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
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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
