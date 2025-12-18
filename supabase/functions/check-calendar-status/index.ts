import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTH0_DOMAIN = Deno.env.get("AUTH0_DOMAIN")!;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function getAuth0Sub(accessToken: string): Promise<string> {
  console.log("[check-calendar-status] Verifying Auth0 token via userinfo");
  
  const res = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("[check-calendar-status] Auth0 userinfo failed:", res.status, txt);
    throw new Error(`Auth0 userinfo failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  if (!data?.sub) throw new Error("Auth0 userinfo response missing sub");
  
  console.log("[check-calendar-status] Auth0 user verified:", data.sub);
  return data.sub as string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      console.error("[check-calendar-status] Missing Authorization token");
      return new Response(JSON.stringify({ error: "Missing Authorization token" }), {
        status: 401,
        headers: corsHeaders(),
      });
    }

    const userId = await getAuth0Sub(token);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    console.log("[check-calendar-status] Querying calendar_connections for user:", userId);

    const { data, error } = await supabaseAdmin
      .from("calendar_connections")
      .select("is_active, provider, updated_at, last_sync")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[check-calendar-status] Database error:", error);
      throw error;
    }

    console.log("[check-calendar-status] Connection result:", { connected: !!data?.is_active, provider: data?.provider });

    return new Response(
      JSON.stringify({
        connected: !!data?.is_active,
        provider: data?.provider ?? null,
        updated_at: data?.updated_at ?? null,
        last_sync: data?.last_sync ?? null,
      }),
      { status: 200, headers: corsHeaders() }
    );
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[check-calendar-status] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
});
