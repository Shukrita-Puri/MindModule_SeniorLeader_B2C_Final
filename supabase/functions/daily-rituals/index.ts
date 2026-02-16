import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_RITUALS' | 'GET_TODAY_RITUAL' | 'UPSERT_RITUAL' | 'GET_RITUAL_RANGE';
  startDate?: string;
  endDate?: string;
  ritualData?: {
    ritual_date: string;
    soundscape_completed?: boolean;
    soundscape_completed_at?: string;
    guided_practice_completed?: boolean;
    guided_practice_completed_at?: string;
    micro_exercise_completed?: boolean;
    micro_exercise_completed_at?: string;
    completion_status?: string;
    recommended_practice_ids?: string[];
    completed_practice_ids?: string[];
    recommended_practices_count?: number;
  };
}

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('VITE_AUTH0_DOMAIN not configured');
  
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

    const { action, startDate, endDate, ritualData } = await req.json() as RequestBody;
    console.log(`[daily-rituals] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_RITUALS': {
        const daysBack = 30;
        const start = new Date();
        start.setDate(start.getDate() - daysBack);
        
        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .gte('ritual_date', start.toISOString().split('T')[0])
          .order('ritual_date', { ascending: false });

        if (error) {
          console.error('[daily-rituals] GET_RITUALS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_TODAY_RITUAL': {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', today)
          .maybeSingle();

        if (error) {
          console.error('[daily-rituals] GET_TODAY_RITUAL error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_RITUAL_RANGE': {
        if (!startDate || !endDate) {
          return new Response(JSON.stringify({ error: 'Missing date range' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .gte('ritual_date', startDate)
          .lte('ritual_date', endDate)
          .order('ritual_date', { ascending: true });

        if (error) {
          console.error('[daily-rituals] GET_RITUAL_RANGE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'UPSERT_RITUAL': {
        if (!ritualData) {
          return new Response(JSON.stringify({ error: 'Missing ritual data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .upsert({
            user_id: userId,
            ...ritualData
          }, { onConflict: 'user_id,ritual_date' })
          .select()
          .single();

        if (error) {
          console.error('[daily-rituals] UPSERT_RITUAL error:', error);
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
    console.error('[daily-rituals] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
