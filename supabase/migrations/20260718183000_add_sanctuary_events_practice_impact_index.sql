CREATE INDEX IF NOT EXISTS idx_sanctuary_events_user_type_timestamp
  ON public.sanctuary_events (user_id, event_type, timestamp DESC);
