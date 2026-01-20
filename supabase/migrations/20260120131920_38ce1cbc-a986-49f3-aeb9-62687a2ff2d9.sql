-- Create daily_themes table to store user's daily strategic themes
CREATE TABLE public.daily_themes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  theme_date date NOT NULL,
  theme_phrase text NOT NULL,
  theme_driver text,
  check_in_outcome text,
  calendar_pressure text,
  calendar_load text,
  time_of_day text,
  created_at timestamp with time zone DEFAULT now()
);

-- Unique constraint: one theme per user per day
CREATE UNIQUE INDEX daily_themes_user_date_unique ON daily_themes(user_id, theme_date);

-- Enable RLS
ALTER TABLE public.daily_themes ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_themes (service role access only for Auth0 compatibility)
CREATE POLICY "Service role full access to daily_themes"
ON public.daily_themes
FOR ALL
USING (true)
WITH CHECK (true);