import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// v5.3 — Honest delivery receipts. Called by the iOS Notification Service
// Extension when a push is rendered, and by the in-app tap handler as a
// fallback. Flips notification_log.delivery_state from 'accepted' to
// 'delivered' and stamps delivered_at. Service-role write only.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const notificationLogId = String(body?.notification_log_id || '').trim();
    const receivedAtRaw = body?.received_at ? new Date(body.received_at) : new Date();
    if (!notificationLogId) {
      return new Response(JSON.stringify({ error: 'notification_log_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: row } = await supabase
      .from('notification_log')
      .select('id, delivery_state, payload')
      .eq('id', notificationLogId)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Don't downgrade a row already marked failed/expired.
    const next = row.delivery_state === 'failed' || row.delivery_state === 'expired_before_delivery'
      ? row.delivery_state
      : 'delivered';

    await supabase
      .from('notification_log')
      .update({ delivery_state: next, delivered_at: receivedAtRaw.toISOString() })
      .eq('id', notificationLogId);

    return new Response(JSON.stringify({ ok: true, delivery_state: next }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});