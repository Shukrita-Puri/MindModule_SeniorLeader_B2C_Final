/**
 * Check Coach Access Edge Function
 * 
 * Auth0 JWT verification → checks subscription tier and dialogue session count.
 * Returns: { canStart, unlimited, sessionsRemaining, showWarning }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get subscription tier
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status')
      .eq('id', userId)
      .single();

    const tier = profile?.subscription_tier || 'none';

    // Pro users: unlimited
    if (tier === 'monthly_pro' || tier === 'annual_pro') {
      return new Response(
        JSON.stringify({ canStart: true, unlimited: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trial users: 10 session limit
    if (tier === 'trial') {
      const { count } = await supabase
        .from('dialogue_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      const sessionsUsed = count || 0;
      const sessionsRemaining = Math.max(0, 10 - sessionsUsed);

      return new Response(
        JSON.stringify({
          canStart: sessionsRemaining > 0,
          unlimited: false,
          sessionsUsed,
          sessionsRemaining,
          sessionsLimit: 10,
          showWarning: sessionsRemaining <= 2 && sessionsRemaining > 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No subscription
    return new Response(
      JSON.stringify({ canStart: false, reason: 'No active subscription' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[check-coach-access] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
