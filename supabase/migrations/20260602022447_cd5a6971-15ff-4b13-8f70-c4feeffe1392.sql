-- ============ projects ============
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'custom',
  icon text,
  brief jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own projects" ON public.projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ project_episodes ============
CREATE TABLE public.project_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.video_tasks(id) ON DELETE CASCADE,
  episode_no int NOT NULL DEFAULT 1,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_episodes TO authenticated;
GRANT ALL ON public.project_episodes TO service_role;
ALTER TABLE public.project_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own episodes" ON public.project_episodes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own episodes" ON public.project_episodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own episodes" ON public.project_episodes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own episodes" ON public.project_episodes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_episodes_project ON public.project_episodes(project_id);

-- ============ voices ============
CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  source text NOT NULL DEFAULT 'cloned',
  external_id text,
  name text NOT NULL,
  lang text DEFAULT 'multi',
  description text,
  sample_url text,
  origin_audio_url text,
  status text NOT NULL DEFAULT 'ready',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voices TO authenticated;
GRANT SELECT ON public.voices TO anon;
GRANT ALL ON public.voices TO service_role;
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;
-- Preset voices (user_id IS NULL, source='preset') are readable by everyone
CREATE POLICY "Anyone reads preset voices" ON public.voices FOR SELECT TO authenticated, anon USING (source = 'preset' AND user_id IS NULL);
CREATE POLICY "Users select own voices" ON public.voices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own voices" ON public.voices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own voices" ON public.voices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own voices" ON public.voices FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_voices_touch BEFORE UPDATE ON public.voices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed preset voices (ElevenLabs recommended)
INSERT INTO public.voices (source, external_id, name, lang, description) VALUES
  ('preset', 'EXAVITQu4vr4xnSDxMaL', 'Sarah', 'en', 'Warm, friendly young woman'),
  ('preset', 'FGY2WhTYpPnrIDTdsKH5', 'Laura', 'en', 'Confident professional'),
  ('preset', 'IKne3meq5aSn9XLyUdCD', 'Charlie', 'en', 'Casual conversational male'),
  ('preset', 'JBFqnCBsd6RMkjVDRZzb', 'George', 'en', 'Mature warm narrator'),
  ('preset', 'N2lVS1w4EtoT3dr4eOWO', 'Callum', 'en', 'Intense dramatic male'),
  ('preset', 'SAz9YHcvj6GT2YYXdXww', 'River', 'en', 'Neutral calm voice'),
  ('preset', 'TX3LPaxmHKxFdv7VOQHJ', 'Liam', 'en', 'Articulate young male'),
  ('preset', 'Xb7hH8MSUJpSbSDYk0k2', 'Alice', 'en', 'British clear woman'),
  ('preset', 'XrExE9yKIg1WjnnlVkGX', 'Matilda', 'en', 'Friendly warm female'),
  ('preset', 'cgSgspJ2msm6clMCkdW9', 'Jessica', 'en', 'Young expressive woman'),
  ('preset', 'nPczCjzI2devNBz1zQrb', 'Brian', 'en', 'Deep resonant male'),
  ('preset', 'pFZP5JQG7iQjIQuC4Bku', 'Lily', 'en', 'Soft delicate female');

-- ============ character_voices ============
CREATE TABLE public.character_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  character_name text NOT NULL,
  voice_id uuid NOT NULL REFERENCES public.voices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_voices TO authenticated;
GRANT ALL ON public.character_voices TO service_role;
ALTER TABLE public.character_voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own char voices" ON public.character_voices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own char voices" ON public.character_voices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own char voices" ON public.character_voices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own char voices" ON public.character_voices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ assets: add version + media_kind ============
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS media_kind text;

-- Backfill media_kind from existing kind column
UPDATE public.assets SET media_kind = kind WHERE media_kind IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_parent ON public.assets(parent_asset_id);
