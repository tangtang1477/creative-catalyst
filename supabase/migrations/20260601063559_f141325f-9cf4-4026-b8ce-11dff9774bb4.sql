CREATE TABLE public.credit_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id TEXT,
  stage TEXT,
  label TEXT NOT NULL,
  cost INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'consume',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_ledger_user_created ON public.credit_ledger(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credit ledger"
ON public.credit_ledger
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own credit ledger"
ON public.credit_ledger
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);