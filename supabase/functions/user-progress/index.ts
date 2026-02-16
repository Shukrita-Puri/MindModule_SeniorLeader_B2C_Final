import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_ACHIEVEMENTS' | 'SYNC_ACHIEVEMENTS' | 'MARK_SHARED' | 'GET_CERTIFICATE_REQUESTS';
  achievementIds?: string[];
  achievementId?: string;
  pointsAtEarn?: number;
}

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  
  if (!auth0Domain) {
    throw new Error('VITE_AUTH0_DOMAIN not configured');
  }

  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[user-progress] Auth0 verification failed:', errorText);
    throw new Error('Invalid or expired token');
  }

  const userInfo = await response.json();
  console.log('[user-progress] Auth0 user verified:', userInfo.sub);
  return userInfo.sub;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify Auth0 token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = await verifyAuth0Token(authHeader);

    // Parse request body
    const body: RequestBody = await req.json();
    const { action } = body;

    console.log('[user-progress] Action:', action, 'User:', userId);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case 'GET_ACHIEVEMENTS': {
        // Fetch user's earned achievements
        const { data: achievements, error } = await supabase
          .from('user_achievements')
          .select('*')
          .eq('user_id', userId);

        if (error) {
          console.error('[user-progress] Error fetching achievements:', error);
          throw error;
        }

        console.log('[user-progress] Found achievements:', achievements?.length || 0);
        return new Response(
          JSON.stringify({ success: true, data: achievements || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'SYNC_ACHIEVEMENTS': {
        // Insert new achievements (upsert pattern)
        const { achievementIds, pointsAtEarn } = body;
        
        if (!achievementIds || achievementIds.length === 0) {
          return new Response(
            JSON.stringify({ success: true, data: { synced: 0 } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get existing achievements
        const { data: existing } = await supabase
          .from('user_achievements')
          .select('achievement_id')
          .eq('user_id', userId);

        const existingIds = new Set(existing?.map(a => a.achievement_id) || []);
        const newIds = achievementIds.filter(id => !existingIds.has(id));

        if (newIds.length === 0) {
          return new Response(
            JSON.stringify({ success: true, data: { synced: 0, message: 'All achievements already recorded' } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Insert new achievements
        const insertData = newIds.map(achievementId => ({
          user_id: userId,
          achievement_id: achievementId,
          earned_at: new Date().toISOString(),
          skill_progress_at_earn: pointsAtEarn || null
        }));

        const { error: insertError } = await supabase
          .from('user_achievements')
          .insert(insertData);

        if (insertError) {
          console.error('[user-progress] Error syncing achievements:', insertError);
          throw insertError;
        }

        console.log('[user-progress] Synced achievements:', newIds);
        return new Response(
          JSON.stringify({ success: true, data: { synced: newIds.length, achievementIds: newIds } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'MARK_SHARED': {
        // Update achievement as shared to LinkedIn
        const { achievementId } = body;
        
        if (!achievementId) {
          return new Response(
            JSON.stringify({ success: false, error: 'achievementId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabase
          .from('user_achievements')
          .update({
            shared_to_linkedin: true,
            shared_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('achievement_id', achievementId);

        if (updateError) {
          console.error('[user-progress] Error marking shared:', updateError);
          throw updateError;
        }

        console.log('[user-progress] Marked as shared:', achievementId);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_CERTIFICATE_REQUESTS': {
        // Fetch user's certificate requests
        const { data: requests, error } = await supabase
          .from('certificate_requests')
          .select('*')
          .eq('user_id', userId);

        if (error) {
          console.error('[user-progress] Error fetching certificate requests:', error);
          throw error;
        }

        console.log('[user-progress] Found certificate requests:', requests?.length || 0);
        return new Response(
          JSON.stringify({ success: true, data: requests || [] }),
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
    console.error('[user-progress] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
