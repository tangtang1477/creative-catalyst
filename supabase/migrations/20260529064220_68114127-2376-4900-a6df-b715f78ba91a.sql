-- =====================================
-- video_tasks: 任务列表
-- =====================================
CREATE TABLE public.video_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  kind TEXT NOT NULL DEFAULT 'oneoff',
  brief JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_tasks TO authenticated;
GRANT ALL ON public.video_tasks TO service_role;

ALTER TABLE public.video_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own tasks"
  ON public.video_tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own tasks"
  ON public.video_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tasks"
  ON public.video_tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own tasks"
  ON public.video_tasks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_video_tasks_user_created
  ON public.video_tasks (user_id, created_at DESC);

-- =====================================
-- assets: 图片 / 视频素材
-- =====================================
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.video_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'image' | 'video'
  url TEXT NOT NULL,
  source TEXT NOT NULL,         -- 'gpt-image-2' | 'seedance' | 'upload'
  stage TEXT,                   -- 'paint' | 'life' | ...
  label TEXT,
  caption TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own assets"
  ON public.assets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own assets"
  ON public.assets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_assets_task_created
  ON public.assets (task_id, created_at DESC);
CREATE INDEX idx_assets_user_created
  ON public.assets (user_id, created_at DESC);

-- =====================================
-- seedance_jobs: 异步视频任务追踪
-- =====================================
CREATE TABLE public.seedance_jobs (
  task_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_task_id UUID REFERENCES public.video_tasks(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0,
  oss_url TEXT,
  request_payload JSONB,
  raw JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seedance_jobs TO authenticated;
GRANT ALL ON public.seedance_jobs TO service_role;

ALTER TABLE public.seedance_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own jobs"
  ON public.seedance_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 写入走 service_role / admin 客户端，所以这里不开放 INSERT/UPDATE 给 authenticated

CREATE INDEX idx_seedance_jobs_user_created
  ON public.seedance_jobs (user_id, created_at DESC);
CREATE INDEX idx_seedance_jobs_status
  ON public.seedance_jobs (status) WHERE status IN ('pending', 'processing');

-- =====================================
-- updated_at 触发器
-- =====================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_video_tasks_touch BEFORE UPDATE ON public.video_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_seedance_jobs_touch BEFORE UPDATE ON public.seedance_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================
-- 媒体存储桶（公开读）
-- =====================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 公开读
CREATE POLICY "Public read media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- 用户只能上传到自己的目录：media/{user_id}/...
CREATE POLICY "Users upload own media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );