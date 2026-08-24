ALTER TABLE public.sanctuary_content
  ADD COLUMN IF NOT EXISTS intensity_level text
    CHECK (intensity_level IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS energy_direction text
    CHECK (energy_direction IN ('uplift','downshift','stabilize','clarify','activate','motivate')),
  ADD COLUMN IF NOT EXISTS goal_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS physio_targets text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipment text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS environment text[] DEFAULT '{}';

ALTER TABLE public.daily_ritual_completions
  ADD COLUMN IF NOT EXISTS is_plan_practice boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_context text
    CHECK (plan_context IN (
      'pre-travel','during-travel','post-travel',
      'pre-board','during-board','post-board',
      'pre-heavy-load','during-heavy-load','post-heavy-load',
      'pre-high-stakes','post-high-stakes',
      'standalone'
    )),
  ADD COLUMN IF NOT EXISTS plan_event_category text,
  ADD COLUMN IF NOT EXISTS plan_event_date date,
  ADD COLUMN IF NOT EXISTS practice_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS practice_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.event_outcome_feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL,
  event_id          text,
  event_title       text,
  event_type        text,
  event_date        date,
  rating            smallint CHECK (rating IN (-1, 0, 1)),
  open_text         text,
  practice_ids_used text[] DEFAULT '{}',
  trigger_context   text DEFAULT 'post_event',
  created_at        timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.event_outcome_feedback TO authenticated;
GRANT ALL ON public.event_outcome_feedback TO service_role;

CREATE INDEX IF NOT EXISTS idx_eof_user_id
  ON public.event_outcome_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_eof_event_date
  ON public.event_outcome_feedback (user_id, event_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_eof_user_event
  ON public.event_outcome_feedback (user_id, event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.event_outcome_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own event feedback"
  ON public.event_outcome_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can view own event feedback"
  ON public.event_outcome_feedback FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));