import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getServerTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getUTCHours();
  // Default to UTC — client can pass session_period to override
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

interface RequestBody {
  action: 'GET_RITUALS' | 'GET_TODAY_RITUAL' | 'UPSERT_RITUAL' | 'GET_RITUAL_RANGE' | 'COMPLETE_PRACTICE' | 'DELETE_TODAY_RITUAL';
  startDate?: string;
  endDate?: string;
  sessionPeriod?: 'morning' | 'afternoon' | 'evening';
  practiceType?: 'soundscape' | 'guided_practice' | 'micro_exercise';
  practiceId?: string;
  practiceQueue?: { id: string }[];
  ritualData?: {
    ritual_date: string;
    session_period?: string;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId: string;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      // DEV_MODE bypass: allow fallback when not in production
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) {
          userId = devHeader;
          console.log(`[daily-rituals] DEV bypass: userId=${userId}`);
        } else {
          return auth.errorResponse;
        }
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json() as RequestBody;
    const { action, startDate, endDate, ritualData } = body;
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
        const period = body.sessionPeriod;
        
        let query = supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', today);
        
        // If sessionPeriod provided, filter by it; otherwise get latest
        if (period) {
          query = query.eq('session_period', period);
        }
        
        const { data, error } = await query
          .order('updated_at', { ascending: false })
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

      case 'COMPLETE_PRACTICE': {
        const { practiceType, practiceId, practiceQueue, sessionPeriod } = body;
        if (!practiceType || !practiceId) {
          return new Response(JSON.stringify({ error: 'Missing practiceType or practiceId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        const period = sessionPeriod || getServerTimeOfDay();

        // 1. Get current ritual for this period (if exists)
        const { data: existing } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', today)
          .eq('session_period', period)
          .maybeSingle();

        // 2. Build updated fields atomically
        const existingIds: string[] = existing?.completed_practice_ids || [];
        const newCompletedIds = existingIds.includes(practiceId) 
          ? existingIds 
          : [...existingIds, practiceId];

        const updateData: Record<string, any> = {
          user_id: userId,
          ritual_date: today,
          session_period: period,
          completed_practice_ids: newCompletedIds,
        };

        // 3. Set boolean flag + timestamp for practiceType
        if (practiceType === 'soundscape') {
          updateData.soundscape_completed = true;
          updateData.soundscape_completed_at = now;
        } else if (practiceType === 'guided_practice') {
          updateData.guided_practice_completed = true;
          updateData.guided_practice_completed_at = now;
        } else if (practiceType === 'micro_exercise') {
          updateData.micro_exercise_completed = true;
          updateData.micro_exercise_completed_at = now;
        }

        // Set recommended if provided via queue
        if (practiceQueue && practiceQueue.length > 0) {
          updateData.recommended_practice_ids = practiceQueue.map((p: any) => p.id);
          updateData.recommended_practices_count = practiceQueue.length;
        }

        // 4. Recalculate completion_status
        const totalRecommended = updateData.recommended_practices_count 
          || existing?.recommended_practices_count 
          || 3;
        const completedCount = newCompletedIds.length;
        
        updateData.completion_status = completedCount >= totalRecommended && completedCount > 0
          ? 'full'
          : completedCount > 0
            ? 'partial'
            : 'skipped';

        // 5. Upsert in ONE call — now keyed on (user_id, ritual_date, session_period)
        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .upsert(updateData, { onConflict: 'user_id,ritual_date,session_period' })
          .select()
          .single();

        if (error) {
          console.error('[daily-rituals] COMPLETE_PRACTICE error:', error);
          throw error;
        }

        console.log(`[daily-rituals] COMPLETE_PRACTICE success: ${practiceId}, period=${period}, status=${updateData.completion_status}, completed=${completedCount}/${totalRecommended}`);

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'DELETE_TODAY_RITUAL': {
        const today = new Date().toISOString().split('T')[0];
        
        const { error } = await supabase
          .from('daily_ritual_completions')
          .delete()
          .eq('user_id', userId)
          .eq('ritual_date', today);

        if (error) {
          console.error('[daily-rituals] DELETE_TODAY_RITUAL error:', error);
          throw error;
        }

        console.log(`[daily-rituals] DELETE_TODAY_RITUAL success for ${userId} on ${today}`);

        return new Response(JSON.stringify({ success: true }), {
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
