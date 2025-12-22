import { supabase } from "@/integrations/supabase/client";

/**
 * Get the latest session ID for the authenticated user via the edge function.
 * This routes through dialogue-session-manage to avoid direct browser queries
 * to dialogue_sessions (which has service-role-only RLS).
 */
export async function getLatestSessionId(accessToken: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("dialogue-session-manage", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action: "GET_LATEST" },
  });

  if (error) {
    console.error("[dialogueSessions] GET_LATEST error:", error);
    throw new Error(error.message);
  }
  
  if (!data?.success) {
    throw new Error(data?.error || "Failed to get latest session");
  }
  
  return data.sessionId ?? null;
}
