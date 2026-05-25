
-- PR 1: JIT v2 shadow mode infra.

-- 1. attendee_relationships: resolved roles per (user_id, attendee_email)
CREATE TABLE IF NOT EXISTS public.attendee_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  attendee_email text NOT NULL,
  attendee_name text,
  attendee_domain text,
  role text NOT NULL DEFAULT 'unknown',
  seniority text,
  confidence numeric,
  evidence_url text,
  source text NOT NULL DEFAULT 'llm',           -- 'user_tag' | 'llm' | 'unknown'
  resolved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, attendee_email)
);

CREATE INDEX IF NOT EXISTS idx_attendee_rel_user        ON public.attendee_relationships (user_id);
CREATE INDEX IF NOT EXISTS idx_attendee_rel_user_email  ON public.attendee_relationships (user_id, attendee_email);
CREATE INDEX IF NOT EXISTS idx_attendee_rel_expires     ON public.attendee_relationships (expires_at);

ALTER TABLE public.attendee_relationships ENABLE ROW LEVEL SECURITY;

-- Deny-by-default. Edge functions write/read via service role.
-- Authenticated users may read their own resolved rows (used by future
-- relationship-tagger UI), and may insert their own user_tag rows.
CREATE POLICY "attendee_rel_select_own"
  ON public.attendee_relationships
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "attendee_rel_insert_own_tag"
  ON public.attendee_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND source = 'user_tag');

CREATE POLICY "attendee_rel_update_own_tag"
  ON public.attendee_relationships
  FOR UPDATE
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub') AND source = 'user_tag')
  WITH CHECK (user_id = (auth.jwt() ->> 'sub') AND source = 'user_tag');

CREATE TRIGGER set_attendee_rel_updated_at
  BEFORE UPDATE ON public.attendee_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. resolver_lookup_log: simple counter for per-user/day rate cap.
CREATE TABLE IF NOT EXISTS public.attendee_resolver_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  attendee_email text NOT NULL,
  status text NOT NULL,                          -- 'resolved' | 'skipped_generic' | 'rate_limited' | 'failed'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendee_resolver_log_user_day
  ON public.attendee_resolver_log (user_id, created_at DESC);

ALTER TABLE public.attendee_resolver_log ENABLE ROW LEVEL SECURITY;
-- No policies → deny-by-default for users; service role bypasses RLS.

-- 3. jit_event_context shadow columns for v2 selector parity testing.
ALTER TABLE public.jit_event_context
  ADD COLUMN IF NOT EXISTS shadow_v2_score        numeric,
  ADD COLUMN IF NOT EXISTS shadow_v2_components   jsonb,
  ADD COLUMN IF NOT EXISTS shadow_v2_tier         text,
  ADD COLUMN IF NOT EXISTS shadow_v2_role         text,
  ADD COLUMN IF NOT EXISTS shadow_v2_at           timestamptz;
