ALTER TABLE coach_session_summaries
  ADD COLUMN IF NOT EXISTS jit_relevant_insight text,
  ADD COLUMN IF NOT EXISTS next_session_focus text;

CREATE TABLE IF NOT EXISTS coach_surface_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  message text NOT NULL,
  trigger_condition text,
  expires_at timestamptz NOT NULL,
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coach_surface_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_surface_messages"
  ON coach_surface_messages FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "service_role_manage_surface_messages"
  ON coach_surface_messages FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_coach_surface_user
  ON coach_surface_messages(user_id, dismissed, expires_at);