-- 1. Fix CHECK constraint: add 'cancelled_now' to allowed signals
ALTER TABLE public.event_priority_memory
  DROP CONSTRAINT IF EXISTS event_priority_memory_signal_chk;

ALTER TABLE public.event_priority_memory
  ADD CONSTRAINT event_priority_memory_signal_chk
  CHECK (signal = ANY (ARRAY[
    'priority',
    'not_this_week',
    'never',
    'cancelled_now',
    'cancelled_as_noise',
    'cancelled_keep_surfacing',
    'tag_importance_high',
    'tag_importance_medium',
    'tag_importance_low',
    'tag_relationship',
    'tag_custom',
    'tag_cleared'
  ]));

-- 2. Grants for event_priority_memory (service role writes; auth users read own via existing policy)
GRANT SELECT ON public.event_priority_memory TO authenticated;
GRANT ALL ON public.event_priority_memory TO service_role;

-- 3. Grants + policies for event_priority_derived (no policies existed)
GRANT SELECT ON public.event_priority_derived TO authenticated;
GRANT ALL ON public.event_priority_derived TO service_role;

DROP POLICY IF EXISTS "users read own event priority derived" ON public.event_priority_derived;
CREATE POLICY "users read own event priority derived"
  ON public.event_priority_derived
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "service role full access event priority derived" ON public.event_priority_derived;
CREATE POLICY "service role full access event priority derived"
  ON public.event_priority_derived
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
