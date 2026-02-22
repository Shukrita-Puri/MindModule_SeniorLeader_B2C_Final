/**
 * Check Pending Commitments Edge Function
 * 
 * Called before each session to retrieve commitments due for follow-up.
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
    const { userId } = await req.json();

    if (verifiedUserId !== userId) {
      return new Response(JSON.stringify({ error: 'User mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Query pending commitments with check-in due
    const { data: commitments, error } = await supabase
      .from('coach_accountability_tracker')
      .select('id, commitment_text, commitment_type, committed_at, check_in_due_date, target_practice_id, times_checked, pattern_area')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('check_in_due_date', new Date().toISOString())
      .order('check_in_due_date', { ascending: true })
      .limit(5);

    if (error) {
      console.error('[check-pending-commitments] Query error:', error);
      throw new Error('Failed to query commitments');
    }

    const pendingCommitments = (commitments || []).map(c => ({
      id: c.id,
      commitment_text: c.commitment_text,
      commitment_type: c.commitment_type,
      committed_at: c.committed_at,
      days_since_commitment: Math.floor((Date.now() - new Date(c.committed_at).getTime()) / 86400000),
      target_practice_id: c.target_practice_id,
      times_checked: c.times_checked,
      pattern_area: c.pattern_area,
    }));

    return new Response(JSON.stringify({ 
      pendingCommitments 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[check-pending-commitments] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
