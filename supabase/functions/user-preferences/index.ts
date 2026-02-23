import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

interface RequestBody {
  action: 'GET_PREFERENCES' | 'UPSERT_PREFERENCES';
  preferences?: {
    preferredTimes?: any;
    effectiveContentTypes?: any;
    energyPatterns?: any;
    favoriteContentIds?: string[];
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;
    const { action, preferences } = await req.json() as RequestBody;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[user-preferences] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_PREFERENCES': {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'UPSERT_PREFERENCES': {
        if (!preferences) {
          return new Response(JSON.stringify({ error: 'Missing preferences data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const upsertData = {
          user_id: userId,
          preferred_times: preferences.preferredTimes || {},
          effective_content_types: preferences.effectiveContentTypes || {},
          energy_patterns: preferences.energyPatterns || {},
          favorite_content_ids: preferences.favoriteContentIds || [],
          last_updated: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('user_preferences')
          .upsert(upsertData, { onConflict: 'user_id' })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: unknown) {
    console.error('[user-preferences] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
