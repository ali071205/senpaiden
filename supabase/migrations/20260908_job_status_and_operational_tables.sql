-- ============================================================
-- Migration: 20260908_job_status_and_operational_tables.sql
-- Description: Hardens chapters.job_status constraint to 10 supported states,
--              ensures operational tables (system_config, system_events),
--              and provides idempotent maintenance mode RPCs.
-- Non-destructive and idempotent.
-- ============================================================

-- 1. Hardened chapters.job_status check constraint
DO $$
DECLARE
  con_rec RECORD;
BEGIN
  -- Drop existing check constraint(s) on job_status if present
  FOR con_rec IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.chapters'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) ILIKE '%job_status%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.chapters DROP CONSTRAINT IF EXISTS %I', con_rec.conname);
  END LOOP;

  -- Add the verified 10-state constraint
  ALTER TABLE public.chapters ADD CONSTRAINT chapters_job_status_check
    CHECK (job_status = ANY (ARRAY[
      'DISCOVERED'::text,
      'QUEUED'::text,
      'PROCESSING'::text,
      'STORAGE_VERIFYING'::text,
      'READY'::text,
      'FAILED'::text,
      'NEEDS_REVIEW'::text,
      'STALE'::text,
      'STALE_RETRY'::text,
      'ARCHIVED'::text
    ]));
END $$;

-- 2. Operational Table: system_config
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

INSERT INTO public.system_config (key, value, updated_by)
VALUES ('maintenance_mode', 'false'::jsonb, 'migration')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_config (key, value, updated_by)
VALUES ('auto_requeue_enabled', 'true'::jsonb, 'migration')
ON CONFLICT (key) DO NOTHING;

-- 3. Operational Table: system_events
CREATE TABLE IF NOT EXISTS public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'INFO',
  source TEXT NOT NULL,
  detail TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_created
  ON public.system_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_events_type
  ON public.system_events (event_type, created_at DESC);

-- 4. Maintenance RPCs
CREATE OR REPLACE FUNCTION is_maintenance_mode()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT value::text::boolean FROM public.system_config WHERE key = 'maintenance_mode'),
    false
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION set_maintenance_mode(enabled BOOLEAN, actor TEXT DEFAULT 'admin')
RETURNS VOID AS $$
  INSERT INTO public.system_config (key, value, updated_at, updated_by)
  VALUES ('maintenance_mode', to_jsonb(enabled), NOW(), actor)
  ON CONFLICT (key) DO UPDATE SET
    value = to_jsonb(enabled),
    updated_at = NOW(),
    updated_by = actor;
$$ LANGUAGE sql;
