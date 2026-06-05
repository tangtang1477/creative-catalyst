ALTER TABLE public.wan_jobs
  ADD COLUMN IF NOT EXISTS video_name text,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text;

DROP TABLE IF EXISTS public.seedance_jobs;