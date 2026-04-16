ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS mental_sharpness_score INTEGER
  CHECK (mental_sharpness_score IS NULL OR mental_sharpness_score BETWEEN 1 AND 5);