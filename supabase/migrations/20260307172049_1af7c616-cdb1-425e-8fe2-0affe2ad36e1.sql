CREATE TABLE IF NOT EXISTS user_integrations (
  user_id text PRIMARY KEY,
  calendar_provider text,
  calendar_connected_at timestamptz,
  watch_type text,
  watch_connected_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON user_integrations FOR ALL USING (true) WITH CHECK (true);