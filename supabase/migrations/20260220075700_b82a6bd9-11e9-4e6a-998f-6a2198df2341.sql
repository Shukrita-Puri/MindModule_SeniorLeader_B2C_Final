
-- Create notification_device_tokens table
CREATE TABLE public.notification_device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  device_token text NOT NULL,
  platform text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all device tokens"
  ON public.notification_device_tokens FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can insert their own device tokens"
  ON public.notification_device_tokens FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can view their own device tokens"
  ON public.notification_device_tokens FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE TRIGGER update_device_tokens_updated_at
  BEFORE UPDATE ON public.notification_device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create notification_log table
CREATE TABLE public.notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  notification_type text NOT NULL,
  variant_id text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  event_reference text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  tapped boolean NOT NULL DEFAULT false,
  app_opened boolean NOT NULL DEFAULT false,
  target_action_completed boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  time_to_engagement_seconds integer
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all notification logs"
  ON public.notification_log FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view their own notification logs"
  ON public.notification_log FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own notification logs"
  ON public.notification_log FOR UPDATE
  USING ((auth.uid())::text = user_id);

CREATE INDEX idx_notification_log_user_type_sent
  ON public.notification_log (user_id, notification_type, sent_at DESC);

-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL UNIQUE,
  morning_anchor_enabled boolean NOT NULL DEFAULT true,
  pre_event_prep_enabled boolean NOT NULL DEFAULT true,
  evening_close_enabled boolean NOT NULL DEFAULT true,
  pattern_alert_enabled boolean NOT NULL DEFAULT true,
  state_aware_nudge_enabled boolean NOT NULL DEFAULT true,
  morning_window_start integer NOT NULL DEFAULT 6,
  morning_window_end integer NOT NULL DEFAULT 9,
  evening_window_start integer NOT NULL DEFAULT 19,
  evening_window_end integer NOT NULL DEFAULT 22,
  dnd_start integer,
  dnd_end integer,
  quiet_days integer[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add timezone_offset to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone_offset integer;
