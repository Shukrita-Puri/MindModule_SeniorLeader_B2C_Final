ALTER TABLE public.wearable_data
  ADD COLUMN IF NOT EXISTS write_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS wearable_data_user_date_write_token_idx
  ON public.wearable_data (user_id, summary_date, write_token);