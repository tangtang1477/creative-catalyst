-- Update projects.kind allowed values to video-creation semantics
UPDATE public.projects SET kind='custom'
  WHERE kind NOT IN ('series','ad','education','mv','custom');

ALTER TABLE public.projects ALTER COLUMN kind SET DEFAULT 'custom';

-- Drop any existing check constraint
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
END $$;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_kind_check
  CHECK (kind IN ('series','ad','education','mv','custom'));