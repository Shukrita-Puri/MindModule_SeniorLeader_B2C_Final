ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS emotion_level integer,
  ADD COLUMN IF NOT EXISTS pressure_level integer,
  ADD COLUMN IF NOT EXISTS regulation_level integer;

ALTER TABLE public.daily_checkins
  ADD CONSTRAINT daily_checkins_emotion_level_check
    CHECK (emotion_level IS NULL OR (emotion_level >= 1 AND emotion_level <= 5)),
  ADD CONSTRAINT daily_checkins_pressure_level_check
    CHECK (pressure_level IS NULL OR (pressure_level >= 1 AND pressure_level <= 5)),
  ADD CONSTRAINT daily_checkins_regulation_level_check
    CHECK (regulation_level IS NULL OR (regulation_level >= 1 AND regulation_level <= 5));