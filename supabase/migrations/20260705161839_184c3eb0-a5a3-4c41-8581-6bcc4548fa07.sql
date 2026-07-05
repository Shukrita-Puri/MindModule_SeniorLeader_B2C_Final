CREATE UNIQUE INDEX IF NOT EXISTS calendar_quota_cooldowns_provider_scope_key_uidx
  ON public.calendar_quota_cooldowns (provider, scope_key);
