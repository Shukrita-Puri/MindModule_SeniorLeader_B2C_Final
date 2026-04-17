-- Add heart_rate column to wearable_data for daily average HR measurements (separate from RHR)
ALTER TABLE public.wearable_data
  ADD COLUMN IF NOT EXISTS heart_rate integer;

COMMENT ON COLUMN public.wearable_data.heart_rate IS 'Daily average heart rate (bpm) — distinct from resting_heart_rate. Sourced from HealthKit heartRate samples.';