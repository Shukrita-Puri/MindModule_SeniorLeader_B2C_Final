-- Enable RLS on calendar_connections and calendar_events
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own calendar connections" ON calendar_connections;
DROP POLICY IF EXISTS "Users can insert their own calendar connections" ON calendar_connections;
DROP POLICY IF EXISTS "Users can update their own calendar connections" ON calendar_connections;
DROP POLICY IF EXISTS "Users can delete their own calendar connections" ON calendar_connections;
DROP POLICY IF EXISTS "Service role can manage all calendar connections" ON calendar_connections;

DROP POLICY IF EXISTS "Users can view their own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Users can manage their own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "Service role can manage all calendar events" ON calendar_events;

-- Policies for calendar_connections (with proper UUID to text casting)
CREATE POLICY "Users can view their own calendar connections"
  ON calendar_connections
  FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own calendar connections"
  ON calendar_connections
  FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own calendar connections"
  ON calendar_connections
  FOR UPDATE
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete their own calendar connections"
  ON calendar_connections
  FOR DELETE
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Service role can manage all calendar connections"
  ON calendar_connections
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policies for calendar_events (with proper UUID to text casting)
CREATE POLICY "Users can view their own calendar events"
  ON calendar_events
  FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can manage their own calendar events"
  ON calendar_events
  FOR ALL
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Service role can manage all calendar events"
  ON calendar_events
  FOR ALL
  USING (auth.role() = 'service_role');