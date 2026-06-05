CREATE TABLE public.wan_jobs (
  task_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_task_id uuid REFERENCES public.video_tasks(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  route text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  operations jsonb,
  oss_url text,
  request_payload jsonb,
  raw jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wan_jobs TO authenticated;
GRANT ALL ON public.wan_jobs TO service_role;
ALTER TABLE public.wan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own wan jobs" ON public.wan_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_wan_jobs_status ON public.wan_jobs (status) WHERE status IN ('pending','processing');
CREATE INDEX idx_wan_jobs_user_created ON public.wan_jobs (user_id, created_at DESC);
CREATE TRIGGER trg_wan_jobs_touch BEFORE UPDATE ON public.wan_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();