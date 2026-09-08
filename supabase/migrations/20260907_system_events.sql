-- ============================================================
-- system_events table — Structured operational event tracking
-- Records non-error events: scraper runs, eviction, worker starts, health checks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,     -- 'SCRAPER_RUN' | 'EVICTION_RUN' | 'WORKER_START' | 'HEALTH_CHECK' | 'MAINTENANCE_TOGGLE'
  severity TEXT DEFAULT 'INFO', -- 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
  source TEXT NOT NULL,         -- 'scraper' | 'hf_worker' | 'cf_worker' | 'health_check' | 'admin'
  detail TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient time-range queries in admin dashboard
CREATE INDEX IF NOT EXISTS idx_system_events_created
  ON public.system_events (created_at DESC);

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_system_events_type
  ON public.system_events (event_type, created_at DESC);

-- Add severity column to error_log if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'error_log' AND column_name = 'severity'
  ) THEN
    ALTER TABLE public.error_log ADD COLUMN severity TEXT DEFAULT 'ERROR';
  END IF;
END
$$;
