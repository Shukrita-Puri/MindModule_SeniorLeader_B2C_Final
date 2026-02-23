import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'LOG_SESSION' | 'GET_SESSIONS' | 'GET_RITUAL_STATUS' | 'UPSERT_RITUAL' | 'UPDATE_RITUAL_STATUS';
  contentId?: string;
  contentType?: string;
  category?: string;
  durationSeconds?: number;
  partOfRitual?: boolean;
  metadata?: Record<string, any>;
  completed?: boolean;
  ritualDate?: string;
  soundscapeCompleted?: boolean;
  soundscapeCompletedAt?: string;
  guidedPracticeCompleted?: boolean;
  guidedPracticeCompletedAt?: string;
  microExerciseCompleted?: boolean;
  microExerciseCompletedAt?: string;
  completedPracticeIds?: string[];
  completionStatus?: string;
  recommendedPracticesCount?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    // Parse request body
    const body: RequestBody = await req.json();
    const { action } = body;

    console.log('[practice-data] Action:', action, 'User:', userId);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case 'LOG_SESSION': {
        const { contentId, contentType, category, durationSeconds, partOfRitual, metadata } = body;
        
        if (!contentId || !contentType || !category) {
          return new Response(
            JSON.stringify({ success: false, error: 'contentId, contentType, and category are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('practice_sessions')
          .insert({
            user_id: userId,
            content_id: contentId,
            content_type: contentType,
            category,
            duration_seconds: durationSeconds || 0,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            completed: true,
            part_of_ritual: partOfRitual || false,
            metadata: metadata || {}
          })
          .select('id')
          .single();

        if (error) {
          console.error('[practice-data] Error logging session:', error);
          throw error;
        }

        console.log('[practice-data] Session logged:', data?.id);
        return new Response(
          JSON.stringify({ success: true, data: { id: data?.id } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_SESSIONS': {
        const { completed } = body;
        
        let query = supabase
          .from('practice_sessions')
          .select('id, completed')
          .eq('user_id', userId);
        
        if (completed !== undefined) {
          query = query.eq('completed', completed);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[practice-data] Error fetching sessions:', error);
          throw error;
        }

        console.log('[practice-data] Found sessions:', data?.length || 0);
        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_RITUAL_STATUS': {
        const { ritualDate } = body;
        const dateToQuery = ritualDate || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .select('*')
          .eq('user_id', userId)
          .eq('ritual_date', dateToQuery)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          console.error('[practice-data] Error fetching ritual status:', error);
          throw error;
        }

        console.log('[practice-data] Ritual status for', dateToQuery, ':', data ? 'found' : 'not found');
        return new Response(
          JSON.stringify({ success: true, data: data || null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'UPSERT_RITUAL': {
        const { 
          ritualDate, 
          soundscapeCompleted, 
          soundscapeCompletedAt,
          guidedPracticeCompleted,
          guidedPracticeCompletedAt,
          microExerciseCompleted,
          microExerciseCompletedAt,
          completedPracticeIds,
          completionStatus,
          recommendedPracticesCount
        } = body;

        const dateToUpsert = ritualDate || new Date().toISOString().split('T')[0];

        // Build upsert data, only including fields that are provided
        const upsertData: Record<string, any> = {
          user_id: userId,
          ritual_date: dateToUpsert,
        };

        if (soundscapeCompleted !== undefined) upsertData.soundscape_completed = soundscapeCompleted;
        if (soundscapeCompletedAt) upsertData.soundscape_completed_at = soundscapeCompletedAt;
        if (guidedPracticeCompleted !== undefined) upsertData.guided_practice_completed = guidedPracticeCompleted;
        if (guidedPracticeCompletedAt) upsertData.guided_practice_completed_at = guidedPracticeCompletedAt;
        if (microExerciseCompleted !== undefined) upsertData.micro_exercise_completed = microExerciseCompleted;
        if (microExerciseCompletedAt) upsertData.micro_exercise_completed_at = microExerciseCompletedAt;
        if (completedPracticeIds) upsertData.completed_practice_ids = completedPracticeIds;
        if (completionStatus) upsertData.completion_status = completionStatus;
        if (recommendedPracticesCount !== undefined) upsertData.recommended_practices_count = recommendedPracticesCount;

        const { data, error } = await supabase
          .from('daily_ritual_completions')
          .upsert(upsertData, { onConflict: 'user_id,ritual_date' })
          .select()
          .single();

        if (error) {
          console.error('[practice-data] Error upserting ritual:', error);
          throw error;
        }

        console.log('[practice-data] Ritual upserted for', dateToUpsert);
        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'UPDATE_RITUAL_STATUS': {
        const { ritualDate, completionStatus } = body;
        const dateToUpdate = ritualDate || new Date().toISOString().split('T')[0];

        if (!completionStatus) {
          return new Response(
            JSON.stringify({ success: false, error: 'completionStatus is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('daily_ritual_completions')
          .update({ completion_status: completionStatus })
          .eq('user_id', userId)
          .eq('ritual_date', dateToUpdate);

        if (error) {
          console.error('[practice-data] Error updating ritual status:', error);
          throw error;
        }

        console.log('[practice-data] Ritual status updated to', completionStatus);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[practice-data] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
