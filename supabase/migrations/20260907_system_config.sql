-- ============================================================
-- system_config table + maintenance mode support
-- Provides key-value configuration accessible by all components
-- ============================================================

-- Create system_config table (idempotent)
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

-- Insert default maintenance_mode = false (idempotent)
INSERT INTO public.system_config (key, value, updated_by)
VALUES ('maintenance_mode', 'false'::jsonb, 'migration')
ON CONFLICT (key) DO NOTHING;

-- Insert default auto_requeue_enabled = true (worker behavior flag)
INSERT INTO public.system_config (key, value, updated_by)
VALUES ('auto_requeue_enabled', 'true'::jsonb, 'migration')
ON CONFLICT (key) DO NOTHING;

-- RPC to check maintenance mode (callable from HF Worker and CF Worker)
CREATE OR REPLACE FUNCTION is_maintenance_mode()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT value::text::boolean FROM public.system_config WHERE key = 'maintenance_mode'),
    false
  );
$$ LANGUAGE sql STABLE;

-- RPC to toggle maintenance mode (callable from admin dashboard)
CREATE OR REPLACE FUNCTION set_maintenance_mode(enabled BOOLEAN, actor TEXT DEFAULT 'admin')
RETURNS VOID AS $$
  INSERT INTO public.system_config (key, value, updated_at, updated_by)
  VALUES ('maintenance_mode', to_jsonb(enabled), NOW(), actor)
  ON CONFLICT (key) DO UPDATE SET
    value = to_jsonb(enabled),
    updated_at = NOW(),
    updated_by = actor;
$$ LANGUAGE sql;
