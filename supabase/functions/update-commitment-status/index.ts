/**
 * Update Commitment Status Edge Function
 * 
 * Called after coach checks on a commitment during conversation.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verifiedUserId = await verifyAuth0JWT(req.headers.get('Authorization'));
    const { commitmentId, userId, status, completionEvidence, wasHelpful, outcomeNote } = await req.json();

    if (verifiedUserId !== userId) {
      return new Response(JSON.stringify({ error: 'User mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!commitmentId || !status) {
      return new Response(JSON.stringify({ error: 'commitmentId and status required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const validStatuses = ['checked', 'progressed', 'completed', 'abandoned'];
    if (!validStatuses.includes(status)) {
      return new Response(JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify the commitment belongs to this user
    const { data: existing } = await supabase
      .from('coach_accountability_tracker')
      .select('id, user_id, times_checked')
      .eq('id', commitmentId)
      .single();

    if (!existing || existing.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Commitment not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { error: updateError } = await supabase
      .from('coach_accountability_tracker')
      .update({
        status,
        times_checked: (existing.times_checked || 0) + 1,
        last_checked_at: new Date().toISOString(),
        completion_evidence: completionEvidence || null,
        was_helpful: wasHelpful ?? null,
        outcome_note: outcomeNote || null,
      })
      .eq('id', commitmentId);

    if (updateError) {
      console.error('[update-commitment-status] Update error:', updateError);
      throw new Error('Failed to update commitment');
    }

    console.log(`[update-commitment-status] Updated commitment ${commitmentId} to ${status}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[update-commitment-status] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
