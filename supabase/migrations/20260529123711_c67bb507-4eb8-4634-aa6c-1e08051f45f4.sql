
-- ============================================================
-- TRAVEL DETECTION & NOTIFICATION SYSTEM
-- Adds location-aware travel intelligence with a state machine,
-- timezone tracking, and idempotent travel-aware notifications.
-- ============================================================

-- Add home location columns to profiles for "is this away?" comparison.
-- We deliberately do NOT store precise lat/lng — only a coarse anchor +
-- timezone, which is enough for travel detection without becoming a tracker.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision,
  ADD COLUMN IF NOT EXISTS home_location_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS travel_notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS location_permission_state text;

-- ------------------------------------------------------------
-- travel_state: one row per user, the canonical travel state machine.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_state (
  user_id text PRIMARY KEY,
  state text NOT NULL DEFAULT 'not_travelling',
  -- states: not_travelling | travel_planned | en_route | arrived | returning | location_unknown
  last_known_lat double precision,
  last_known_lng double precision,
  last_known_accuracy_m double precision,
  last_location_at timestamptz,
  last_known_timezone text,
  last_timezone_change_at timestamptz,
  last_state_change_at timestamptz NOT NULL DEFAULT now(),
  distance_from_home_km double precision,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_state TO authenticated;
GRANT ALL ON public.travel_state TO service_role;

ALTER TABLE public.travel_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own travel_state"
  ON public.travel_state FOR SELECT TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- Writes are server-side only (edge functions via service_role).
CREATE POLICY "Service role manages travel_state"
  ON public.travel_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER travel_state_updated_at
  BEFORE UPDATE ON public.travel_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- travel_location_pings: append-only stream of location samples.
-- Used to compute state transitions; we only keep ~30 days.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  source text NOT NULL DEFAULT 'ios-significant', -- ios-significant | ios-visit | ios-foreground | manual
  timezone text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_pings_user_time
  ON public.travel_location_pings (user_id, captured_at DESC);

GRANT SELECT, INSERT ON public.travel_location_pings TO authenticated;
GRANT ALL ON public.travel_location_pings TO service_role;

ALTER TABLE public.travel_location_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own pings"
  ON public.travel_location_pings FOR INSERT TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users read own pings"
  ON public.travel_location_pings FOR SELECT TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Service role manages pings"
  ON public.travel_location_pings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- travel_notifications: scheduled travel-aware nudges with
-- explicit cancel/delivery lifecycle so we can prevent stacking
-- of stale alerts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.travel_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  phase text NOT NULL, -- pre_travel | during_travel | post_travel
  state_at_schedule text NOT NULL, -- snapshot of travel_state.state
  scheduled_for timestamptz NOT NULL,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  title text NOT NULL,
  body text NOT NULL,
  -- idempotency: same (user, phase, anchor_key) collapses to one row
  anchor_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phase, anchor_key)
);

CREATE INDEX IF NOT EXISTS idx_travel_notif_user_scheduled
  ON public.travel_notifications (user_id, scheduled_for)
  WHERE delivered_at IS NULL AND cancelled_at IS NULL;

GRANT SELECT ON public.travel_notifications TO authenticated;
GRANT ALL ON public.travel_notifications TO service_role;

ALTER TABLE public.travel_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own travel notifications"
  ON public.travel_notifications FOR SELECT TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Service role manages travel notifications"
  ON public.travel_notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER travel_notifications_updated_at
  BEFORE UPDATE ON public.travel_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
