ALTER TABLE public.brief_snapshots
  ADD COLUMN IF NOT EXISTS phrase           text    GENERATED ALWAYS AS (COALESCE(refined_phrase,           baseline_phrase))           STORED,
  ADD COLUMN IF NOT EXISTS body_text        text    GENERATED ALWAYS AS (COALESCE(refined_body_text,        baseline_body_text))        STORED,
  ADD COLUMN IF NOT EXISTS lean_on          text    GENERATED ALWAYS AS (COALESCE(refined_lean_on,          baseline_lean_on))          STORED,
  ADD COLUMN IF NOT EXISTS lean_on_source   text    GENERATED ALWAYS AS (COALESCE(refined_lean_on_source,   baseline_lean_on_source))   STORED,
  ADD COLUMN IF NOT EXISTS watch_for        text    GENERATED ALWAYS AS (COALESCE(refined_watch_for,        baseline_watch_for))        STORED,
  ADD COLUMN IF NOT EXISTS watch_for_source text    GENERATED ALWAYS AS (COALESCE(refined_watch_for_source, baseline_watch_for_source)) STORED,
  ADD COLUMN IF NOT EXISTS score            integer GENERATED ALWAYS AS (COALESCE(refined_score,            baseline_score))            STORED,
  ADD COLUMN IF NOT EXISTS tier             text    GENERATED ALWAYS AS (COALESCE(refined_tier,             baseline_tier))             STORED,
  ADD COLUMN IF NOT EXISTS signal_pills     jsonb   GENERATED ALWAYS AS (COALESCE(refined_signal_pills,     baseline_signal_pills))     STORED;