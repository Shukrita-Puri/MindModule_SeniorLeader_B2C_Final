
CREATE TABLE public.event_priority_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  event_category text NOT NULL,
  event_type_key text NOT NULL,
  signal text NOT NULL,
  source text NOT NULL,
  event_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT event_priority_memory_signal_chk
    CHECK (signal IN ('priority','not_this_week','never','cancelled_as_noise','cancelled_keep_surfacing')),
  CONSTRAINT event_priority_memory_source_chk
    CHECK (source IN ('week_ahead_picker','priority_tag','cancel_feedback'))
);

CREATE INDEX event_priority_memory_user_lookup_idx
  ON public.event_priority_memory (user_id, event_category, event_type_key, occurred_at DESC);

CREATE INDEX event_priority_memory_user_signal_idx
  ON public.event_priority_memory (user_id, signal, occurred_at DESC);

GRANT SELECT ON public.event_priority_memory TO authenticated;
GRANT ALL    ON public.event_priority_memory TO service_role;

ALTER TABLE public.event_priority_memory ENABLE ROW LEVEL SECURITY;

-- Deny-by-default for direct client writes. Edge functions use service_role.
-- Authenticated users may read their own rows (for surfacing prior signals in UI).
CREATE POLICY "users read own event priority memory"
  ON public.event_priority_memory
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "service role full access event priority memory"
  ON public.event_priority_memory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
