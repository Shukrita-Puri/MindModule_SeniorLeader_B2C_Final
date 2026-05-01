ALTER TABLE public.wearable_data
ADD COLUMN IF NOT EXISTS hr_samples jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wearable_data.hr_samples IS
'Per-sample heart rate readings for the day, shape: [{"t": ISO8601, "v": bpm}, ...]. Used by cause-effect-engine to compute per-event-window peak HR for true causation (not day-max proxy). Empty array = no samples available; engine treats affected event windows as "need more data" rather than faking a value.';