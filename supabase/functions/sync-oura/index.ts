import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get Oura connection
    const { data: connection, error: connError } = await supabaseClient
      .from('oura_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      throw new Error('No active Oura connection found');
    }

    // Fetch daily data from Oura API
    // This is a placeholder - actual implementation depends on OAuth flow
    
    // TODO: Implement actual API calls to Oura Cloud API
    // Example endpoint: https://api.ouraring.com/v2/usercollection/daily_readiness
    
    await supabaseClient
      .from('oura_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', connection.id);

    console.log('Oura sync completed for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Oura sync initiated',
        note: 'Full OAuth implementation required'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in sync-oura:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
