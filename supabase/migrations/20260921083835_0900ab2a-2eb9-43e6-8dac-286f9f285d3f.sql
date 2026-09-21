CREATE TABLE public.app_installs (
  install_id TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform TEXT NOT NULL DEFAULT 'unknown',
  app_version TEXT,
  country TEXT,
  timezone TEXT,
  locale TEXT,
  notification_opt_in BOOLEAN NOT NULL DEFAULT false,
  notification_status TEXT,
  device_token TEXT,
  signup_reminders_sent INTEGER NOT NULL DEFAULT 0,
  last_signup_reminder_at TIMESTAMPTZ,
  user_id TEXT,
  linked_at TIMESTAMPTZ,
  signup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_installs_first_seen ON public.app_installs (first_seen_at DESC);
CREATE INDEX idx_app_installs_user_id ON public.app_installs (user_id);
CREATE INDEX idx_app_installs_reminder_pool ON public.app_installs (notification_opt_in, signup_reminders_sent, first_seen_at);

GRANT ALL ON public.app_installs TO service_role;
ALTER TABLE public.app_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_installs service role only"
  ON public.app_installs FOR ALL
  USING (false) WITH CHECK (false);

CREATE TABLE public.app_screen_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id TEXT NOT NULL,
  user_id TEXT,
  route TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  platform TEXT NOT NULL DEFAULT 'unknown',
  local_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_screen_views_entered ON public.app_screen_views (entered_at DESC);
CREATE INDEX idx_app_screen_views_install ON public.app_screen_views (install_id, entered_at DESC);
CREATE INDEX idx_app_screen_views_user ON public.app_screen_views (user_id, entered_at DESC);
CREATE INDEX idx_app_screen_views_route ON public.app_screen_views (route);

GRANT ALL ON public.app_screen_views TO service_role;
ALTER TABLE public.app_screen_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_screen_views service role only"
  ON public.app_screen_views FOR ALL
  USING (false) WITH CHECK (false);

CREATE TABLE public.app_store_downloads (
  download_date DATE PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0,
  entered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_store_downloads TO service_role;
ALTER TABLE public.app_store_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_store_downloads service role only"
  ON public.app_store_downloads FOR ALL
  USING (false) WITH CHECK (false);

CREATE TRIGGER app_installs_set_updated_at
  BEFORE UPDATE ON public.app_installs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER app_store_downloads_set_updated_at
  BEFORE UPDATE ON public.app_store_downloads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();