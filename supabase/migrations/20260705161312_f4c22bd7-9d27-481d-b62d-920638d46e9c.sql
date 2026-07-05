CREATE TABLE public.calendar_quota_cooldowns (
  scope_key text PRIMARY KEY,
  provider text NOT NULL,
  cooldown_until timestamptz NOT NULL,
  retry_after_seconds integer NOT NULL,
  last_reason text,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_quota_cooldowns_cooldown_until_idx
  ON public.calendar_quota_cooldowns (cooldown_until);
CREATE INDEX IF NOT EXISTS calendar_quota_cooldowns_provider_idx
  ON public.calendar_quota_cooldowns (provider);

GRANT SELECT ON public.calendar_quota_cooldowns TO authenticated;
GRANT ALL ON public.calendar_quota_cooldowns TO service_role;

ALTER TABLE public.calendar_quota_cooldowns ENABLE ROW LEVEL SECURITY;

-- Cooldown state is not user-scoped; deny all direct client writes.
-- Only the service role (edge functions) writes/reads it. Authenticated
-- clients may read (for optional debug surfaces) but never mutate.
CREATE POLICY "calendar_quota_cooldowns read for authenticated"
  ON public.calendar_quota_cooldowns
  FOR SELECT
  TO authenticated
  USING (true);
