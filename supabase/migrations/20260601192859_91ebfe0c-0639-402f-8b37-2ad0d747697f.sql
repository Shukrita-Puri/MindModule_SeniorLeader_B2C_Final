-- Add sleep_efficiency column to wearable_data and backfill from raw_data
ALTER TABLE public.wearable_data
  ADD COLUMN IF NOT EXISTS sleep_efficiency smallint;

ALTER TABLE public.wearable_data
  DROP CONSTRAINT IF EXISTS wearable_data_sleep_efficiency_check;
ALTER TABLE public.wearable_data
  ADD CONSTRAINT wearable_data_sleep_efficiency_check
  CHECK (sleep_efficiency IS NULL OR sleep_efficiency BETWEEN 0 AND 100);

-- Backfill: prefer raw_data.efficiency, then raw_data.sleep.efficiency,
-- then derive from time_in_bed (seconds or minutes) + total_sleep_minutes.
UPDATE public.wearable_data
SET sleep_efficiency = LEAST(100, GREATEST(0, sub.eff))
FROM (
  SELECT id,
    CASE
      WHEN (raw_data->>'efficiency') ~ '^[0-9.]+$'
        THEN ROUND((raw_data->>'efficiency')::numeric)::int
      WHEN (raw_data->'sleep'->>'efficiency') ~ '^[0-9.]+$'
        THEN ROUND((raw_data->'sleep'->>'efficiency')::numeric)::int
      WHEN (raw_data->>'time_in_bed') ~ '^[0-9.]+$' AND total_sleep_minutes IS NOT NULL THEN
        CASE
          WHEN (raw_data->>'time_in_bed')::numeric > 1000 THEN
            ROUND(total_sleep_minutes::numeric / ((raw_data->>'time_in_bed')::numeric / 60.0) * 100)::int
          WHEN (raw_data->>'time_in_bed')::numeric > 0 THEN
            ROUND(total_sleep_minutes::numeric / (raw_data->>'time_in_bed')::numeric * 100)::int
          ELSE NULL
        END
      ELSE NULL
    END AS eff
  FROM public.wearable_data
  WHERE sleep_efficiency IS NULL
) sub
WHERE public.wearable_data.id = sub.id
  AND sub.eff IS NOT NULL;