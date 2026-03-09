DROP POLICY IF EXISTS "Users can view their own physiological events" ON public.physiological_events;

CREATE POLICY "Users can view their own physiological events"
ON public.physiological_events
FOR SELECT
TO authenticated
USING (user_id = (auth.jwt() ->> 'sub'::text));
