CREATE POLICY "Users can view own calendar events"
ON public.calendar_events
FOR SELECT
USING (user_id = (auth.jwt() ->> 'sub'::text));