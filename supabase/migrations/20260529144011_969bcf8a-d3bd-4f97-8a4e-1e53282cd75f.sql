ALTER TABLE public.wearable_data
  ADD COLUMN IF NOT EXISTS source_apps jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_provider text;