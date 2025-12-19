import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_SNAPSHOTS' | 'SAVE_SNAPSHOT' | 'GET_LATEST_SNAPSHOT';
  days?: number;
  snapshotData?: {
    snapshot_date: string;
    energy_balance?: number;
    pause_percentage?: number;
    powerup_percentage?: number;
    presence_percentage?: number;
    total_sessions?: number;
    dominant_state?: string;
    oura_readiness?: number;
    calendar_density?: number;
    computed_data?: Record<string, unknown>;
  };
}

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN');
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Invalid token');
  }
  
  const userInfo = await response.json();
  return userInfo.sub;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = await verifyAuth0Token(authHeader);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, days, snapshotData } = await req.json() as RequestBody;
    console.log(`[energy-snapshots] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_SNAPSHOTS': {
        const daysToFetch = days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysToFetch);
        
        const { data, error } = await supabase
          .from('energy_snapshots')
          .select('*')
          .eq('user_id', userId)
          .gte('snapshot_date', startDate.toISOString().split('T')[0])
          .order('snapshot_date', { ascending: false });

        if (error) {
          console.error('[energy-snapshots] GET_SNAPSHOTS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_LATEST_SNAPSHOT': {
        const { data, error } = await supabase
          .from('energy_snapshots')
          .select('*')
          .eq('user_id', userId)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[energy-snapshots] GET_LATEST_SNAPSHOT error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SAVE_SNAPSHOT': {
        if (!snapshotData) {
          return new Response(JSON.stringify({ error: 'Missing snapshot data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('energy_snapshots')
          .upsert({
            user_id: userId,
            ...snapshotData
          }, { onConflict: 'user_id,snapshot_date' })
          .select()
          .single();

        if (error) {
          console.error('[energy-snapshots] SAVE_SNAPSHOT error:', error);
          throw error;
        }

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[energy-snapshots] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
