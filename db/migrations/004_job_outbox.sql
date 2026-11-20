-- =====================================================================
-- 004_job_outbox — queue-later when Redis is down (transactional outbox).
--
-- Request paths (webhooks, routing, cadences, site visits) add BullMQ jobs. If Redis is unreachable or slow, the job
-- is written here instead and the request still succeeds; the worker's drainer moves unsent rows into BullMQ once Redis
-- is back (apps/api/src/queues/outbox.ts). Every row keeps the BullMQ jobId it was created with, so a job that reached
-- Redis late and its outbox copy collapse into one job.
--
--   org_id set   : a job for one org (sla, cadence, visit-reminders, reports). RLS like every tenant table.
--   org_id NULL  : a raw provider webhook (Meta Lead Ads intake, WhatsApp inbound) whose org is only known after the job
--                  parses it. No tenant can see these rows; they are written and drained only through the SECURITY
--                  DEFINER functions below (owned by realcognix_system).
--
-- Run as the owner after 003 (a superuser in Docker). Idempotent: safe on fresh and existing databases.
--   docker compose exec -T postgres psql -U realcognix -d realcognix < db/migrations/004_job_outbox.sql
-- A fresh volume runs it from infra/postgres/04-app-role.sh, right after 003. db/schema.sql already has the table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS job_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,   -- NULL only for raw provider webhooks (see above)
  queue       text NOT NULL CHECK (queue IN ('intake', 'inbound', 'sla', 'cadence', 'visit-reminders', 'reports')),
  name        text NOT NULL,                                         -- BullMQ job name
  payload     jsonb NOT NULL,
  job_id      text NOT NULL,                                         -- BullMQ jobId: deterministic, reused by the drainer
  run_at      timestamptz NOT NULL DEFAULT now(),                    -- not before (the job's delay, as a time)
  attempts    integer NOT NULL DEFAULT 0,                            -- drain attempts
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,                                           -- set once the job is in BullMQ
  CONSTRAINT job_outbox_org_or_raw CHECK (org_id IS NOT NULL OR queue IN ('intake', 'inbound')),
  CONSTRAINT job_outbox_job UNIQUE (queue, job_id)
);
CREATE INDEX IF NOT EXISTS job_outbox_unsent_idx ON job_outbox (org_id, created_at) WHERE sent_at IS NULL;

-- RLS + grants like every tenant table (003 does the same for any table with org_id when re-run).
ALTER TABLE job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_outbox FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_outbox' AND policyname = 'job_outbox_tenant') THEN
    CREATE POLICY job_outbox_tenant ON job_outbox
      USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_app') THEN
    REVOKE ALL ON job_outbox FROM realcognix_app;
    GRANT SELECT, INSERT, UPDATE ON job_outbox TO realcognix_app;   -- no DELETE, like every tenant table
  END IF;
END $$;

-- ---------------------------------------------------------------- SECURITY DEFINER functions
-- Drainer: which orgs have unsent rows (ids and counts only). Each org's rows are then read and updated scoped.
CREATE OR REPLACE FUNCTION outbox_pending_orgs(p_max_attempts integer)
RETURNS TABLE (org_id uuid, pending bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.org_id, count(*) FROM job_outbox o
   WHERE o.sent_at IS NULL AND o.org_id IS NOT NULL AND o.attempts < p_max_attempts
   GROUP BY o.org_id ORDER BY o.org_id
$$;

-- Raw provider webhook (no org yet): store it. Only the two raw queues. Same jobId twice = one row.
CREATE OR REPLACE FUNCTION outbox_put_raw(p_queue text, p_name text, p_payload jsonb, p_job_id text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_queue NOT IN ('intake', 'inbound') THEN
    RAISE EXCEPTION 'outbox_put_raw: queue % needs an org (write it scoped)', p_queue;
  END IF;
  INSERT INTO job_outbox (org_id, queue, name, payload, job_id) VALUES (NULL, p_queue, p_name, p_payload, p_job_id)
  ON CONFLICT ON CONSTRAINT job_outbox_job DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT o.id INTO v_id FROM job_outbox o WHERE o.queue = p_queue AND o.job_id = p_job_id AND o.org_id IS NULL;
  END IF;
  RETURN v_id;
END $$;

-- Drainer: unsent raw rows (org_id NULL), oldest first.
CREATE OR REPLACE FUNCTION outbox_raw_pending(p_limit integer, p_max_attempts integer, p_created_before timestamptz)
RETURNS TABLE (id uuid, queue text, name text, payload jsonb, job_id text, run_at timestamptz, attempts integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, o.queue, o.name, o.payload, o.job_id, o.run_at, o.attempts FROM job_outbox o
   WHERE o.org_id IS NULL AND o.sent_at IS NULL AND o.attempts < p_max_attempts AND o.created_at < p_created_before
   ORDER BY o.created_at LIMIT LEAST(p_limit, 500)
$$;

-- Drainer: record one raw row's attempt. p_error NULL = it is in BullMQ now.
CREATE OR REPLACE FUNCTION outbox_raw_mark(p_id uuid, p_error text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE job_outbox SET attempts = attempts + 1,
         sent_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
         last_error = COALESCE(left(p_error, 1000), last_error)
   WHERE id = p_id AND org_id IS NULL AND sent_at IS NULL
$$;

DO $$
DECLARE f text;
  fns text[] := ARRAY['outbox_pending_orgs(integer)', 'outbox_put_raw(text,text,jsonb,text)',
                      'outbox_raw_pending(integer,integer,timestamptz)', 'outbox_raw_mark(uuid,text)'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_system') THEN
    GRANT USAGE ON SCHEMA public TO realcognix_system;
    GRANT SELECT, INSERT, UPDATE ON job_outbox TO realcognix_system;
    GRANT CREATE ON SCHEMA public TO realcognix_system; -- ALTER ... OWNER needs it; revoked right after
    FOREACH f IN ARRAY fns LOOP
      EXECUTE format('ALTER FUNCTION %s OWNER TO realcognix_system', f);
    END LOOP;
    REVOKE CREATE ON SCHEMA public FROM realcognix_system;
  ELSE
    RAISE WARNING 'realcognix_system missing (run 003 first as a superuser): outbox functions stay owned by %', current_user;
  END IF;
  FOREACH f IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realcognix_app') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO realcognix_app', f);
    END IF;
  END LOOP;
END $$;
