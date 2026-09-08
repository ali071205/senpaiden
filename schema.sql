-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.manga (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_id text NOT NULL UNIQUE,
  source_provider text NOT NULL,
  title text NOT NULL,
  cover_url text,
  genres ARRAY DEFAULT '{}'::text[],
  author text,
  status text DEFAULT 'ongoing'::text CHECK (status = ANY (ARRAY['ongoing'::text, 'completed'::text, 'hiatus'::text])),
  description text,
  view_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  title_i18n jsonb DEFAULT '{}'::jsonb,
  description_i18n jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT manga_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chapters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  manga_id uuid,
  chapter_number numeric NOT NULL,
  title text,
  source_url text NOT NULL,
  job_status text DEFAULT 'QUEUED'::text CHECK (job_status = ANY (ARRAY['DISCOVERED'::text, 'QUEUED'::text, 'PROCESSING'::text, 'STORAGE_VERIFYING'::text, 'READY'::text, 'FAILED'::text, 'NEEDS_REVIEW'::text, 'STALE'::text, 'STALE_RETRY'::text, 'ARCHIVED'::text])),
  content_freshness text DEFAULT 'fresh'::text CHECK (content_freshness = ANY (ARRAY['fresh'::text, 'stale'::text, 'archived'::text])),
  last_served_at timestamp with time zone,
  retry_count integer DEFAULT 0,
  error_message text,
  processing_started_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  language text DEFAULT 'en'::text,
  scanlation_group text DEFAULT 'Official'::text,
  CONSTRAINT chapters_pkey PRIMARY KEY (id),
  CONSTRAINT chapters_manga_id_fkey FOREIGN KEY (manga_id) REFERENCES public.manga(id)
);
CREATE TABLE public.pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chapter_id uuid,
  page_number integer NOT NULL,
  r2_keys ARRAY DEFAULT '{}'::text[],
  slice_dimensions jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  blurhash text,
  CONSTRAINT pages_pkey PRIMARY KEY (id),
  CONSTRAINT pages_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id)
);
CREATE TABLE public.dead_letter_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chapter_id uuid,
  error_type text NOT NULL,
  error_detail text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  resolved boolean DEFAULT false,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT dead_letter_queue_pkey PRIMARY KEY (id),
  CONSTRAINT dead_letter_queue_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id)
);
CREATE TABLE public.error_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider text,
  error_type text NOT NULL,
  error_detail text,
  chapter_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT error_log_pkey PRIMARY KEY (id),
  CONSTRAINT error_log_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.chapters(id)
);
CREATE TABLE public.system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text DEFAULT 'system'::text
);
CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text DEFAULT 'INFO'::text,
  source text NOT NULL,
  detail text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);