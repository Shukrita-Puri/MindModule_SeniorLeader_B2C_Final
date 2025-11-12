-- Fix: Remove materialized view from public API access
-- This view contains hidden product intelligence metrics and should only be accessible server-side

-- Revoke public access to the materialized view
REVOKE ALL ON content_usage_analytics FROM anon;
REVOKE ALL ON content_usage_analytics FROM authenticated;

-- Grant access only to service role (for edge functions and backend queries)
GRANT SELECT ON content_usage_analytics TO service_role;