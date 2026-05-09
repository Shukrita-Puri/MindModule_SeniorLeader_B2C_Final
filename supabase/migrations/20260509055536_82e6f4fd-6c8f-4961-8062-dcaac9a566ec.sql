
CREATE TABLE IF NOT EXISTS public.processed_outbox_items (
  outbox_item_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  function_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_outbox_items_created_at
  ON public.processed_outbox_items (created_at);

CREATE INDEX IF NOT EXISTS idx_processed_outbox_items_user
  ON public.processed_outbox_items (user_id, function_name);

ALTER TABLE public.processed_outbox_items ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies = service role only (bypasses RLS).
-- This table is exclusively managed by edge functions for idempotency tracking.
