import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    // Parse request body
    const { 
      winContent, 
      source = 'coach', 
      sessionId, 
      practiceId, 
      practiceType,
      category 
    } = await req.json();

    if (!winContent || winContent.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Win content too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert the tiny win
    const today = new Date().toISOString().split("T")[0];
    
    const { data, error } = await supabase
      .from("tiny_wins")
      .insert({
        user_id: userId,
        win_content: winContent.trim(),
        win_date: today,
        detected_at: new Date().toISOString(),
        source,
        session_id: sessionId || null,
        practice_id: practiceId || null,
        practice_type: practiceType || null,
        category: category || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[store-tiny-win] Insert error:", error);
      return new Response(JSON.stringify({ error: "Failed to store win" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[store-tiny-win] Stored win for user ${userId} from source: ${source}`);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[store-tiny-win] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
