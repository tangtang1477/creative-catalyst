ALTER TABLE public.video_tasks ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.video_tasks ADD COLUMN IF NOT EXISTS project_id uuid;
CREATE INDEX IF NOT EXISTS idx_video_tasks_user_project ON public.video_tasks(user_id, project_id);