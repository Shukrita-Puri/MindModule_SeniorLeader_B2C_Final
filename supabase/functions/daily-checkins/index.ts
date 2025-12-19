import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_CHECKINS' | 'GET_TODAY_CHECKIN' | 'SAVE_CHECKIN' | 'GET_CHECKIN_RANGE';
  days?: number;
  startDate?: string;
  endDate?: string;
  checkinData?: {
    checkin_date: string;
    outcome: string;
    state_tags?: string[];
    energy_balance?: number;
    skipped?: boolean;
    timestamp: string;
    data_sources?: Record<string, unknown>;
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

    const { action, days, startDate, endDate, checkinData } = await req.json() as RequestBody;
    console.log(`[daily-checkins] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_CHECKINS': {
        const daysToFetch = days || 30;
        const start = new Date();
        start.setDate(start.getDate() - daysToFetch);
        
        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .gte('checkin_date', start.toISOString().split('T')[0])
          .order('checkin_date', { ascending: false });

        if (error) {
          console.error('[daily-checkins] GET_CHECKINS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_TODAY_CHECKIN': {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] GET_TODAY_CHECKIN error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_CHECKIN_RANGE': {
        if (!startDate || !endDate) {
          return new Response(JSON.stringify({ error: 'Missing date range' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .gte('checkin_date', startDate)
          .lte('checkin_date', endDate)
          .order('checkin_date', { ascending: true });

        if (error) {
          console.error('[daily-checkins] GET_CHECKIN_RANGE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SAVE_CHECKIN': {
        if (!checkinData) {
          return new Response(JSON.stringify({ error: 'Missing checkin data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .upsert({
            user_id: userId,
            ...checkinData
          }, { onConflict: 'user_id,checkin_date' })
          .select()
          .single();

        if (error) {
          console.error('[daily-checkins] SAVE_CHECKIN error:', error);
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
    console.error('[daily-checkins] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
