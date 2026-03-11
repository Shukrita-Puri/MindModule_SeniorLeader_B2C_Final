/**
 * manage-beta-invites: Admin endpoint to add/list/bulk-import beta invites.
 * 
 * POST { action: "add", email, beta_expires_at?, invited_by? }
 * POST { action: "bulk", emails: string[], beta_expires_at?, invited_by? }
 * POST { action: "list" }
 * 
 * Protected by ADMIN_SUBS_CSV secret check (reuses existing admin pattern).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_BETA_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'));

    // Simple admin check: userId must be in ADMIN_SUBS_CSV
    const adminCsv = Deno.env.get('ADMIN_SUBS_CSV') || '';
    const adminIds = adminCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (!adminIds.includes(userId)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'list') {
      const { data, error } = await supabase
        .from('beta_invites')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Add computed expired flag for admin visibility
      const now = new Date();
      const enriched = (data || []).map((invite: any) => ({
        ...invite,
        is_expired: new Date(invite.beta_expires_at) < now,
      }));

      return new Response(
        JSON.stringify({ invites: enriched }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'add') {
      const email = body.email?.toLowerCase()?.trim();
      if (!email) throw new Error('email is required');

      const betaExpiresAt = body.beta_expires_at || 
        new Date(Date.now() + DEFAULT_BETA_DAYS * 86400000).toISOString();

      const { data, error } = await supabase
        .from('beta_invites')
        .upsert({
          email,
          beta_expires_at: betaExpiresAt,
          status: 'invited',
          invited_by: body.invited_by || userId,
        }, { onConflict: 'email' })
        .select()
        .single();

      if (error) throw error;
      return new Response(
        JSON.stringify({ invite: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'bulk') {
      const emails: string[] = body.emails;
      if (!Array.isArray(emails) || emails.length === 0) throw new Error('emails array is required');

      const betaExpiresAt = body.beta_expires_at ||
        new Date(Date.now() + DEFAULT_BETA_DAYS * 86400000).toISOString();

      const rows = emails.map(e => ({
        email: e.toLowerCase().trim(),
        beta_expires_at: betaExpiresAt,
        status: 'invited' as const,
        invited_by: body.invited_by || userId,
      }));

      const { data, error } = await supabase
        .from('beta_invites')
        .upsert(rows, { onConflict: 'email' })
        .select();

      if (error) throw error;
      return new Response(
        JSON.stringify({ inserted: data?.length || 0, invites: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action. Use: add, bulk, list' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[manage-beta-invites] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
