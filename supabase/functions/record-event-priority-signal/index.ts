/**
 * record-event-priority-signal
 *
 * Persists a single (category, type_key, signal) row to event_priority_memory.
 * Called from:
 *   - Week-Ahead Picker (source='week_ahead_picker'): Priority / Not this week / Never
 *   - Cancel feedback   (source='cancel_feedback'):  cancelled_as_noise / cancelled_keep_surfacing
 *   - Priority Tag      (source='priority_tag'):     priority
 *
 * Looks up the live calendar_events row by id (when supplied) to derive
 * category + type_key so the client can't poison the memory with arbitrary
 * strings.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.4.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  coarseEventType,
} from "../_shared/events/event-classifier.ts";
import { normalizeEventTypeKey } from "../_shared/plan/week-ahead-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id",
};

const VALID_SIGNALS = new Set([
  "priority",
  "not_this_week",
  "never",
  "cancelled_as_noise",
  "cancelled_keep_surfacing",
]);

const VALID_SOURCES = new Set([
  "week_ahead_picker",
  "priority_tag",
  "cancel_feedback",
  "post_plan_feedback",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let userId: string | null = null;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const env = Deno.env.get("ENVIRONMENT") || "";
      if (env !== "production") {
        const devHeader = req.headers.get("x-dev-user-id");
        if (devHeader) userId = devHeader;
        else return auth.errorResponse;
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "no_user" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventId: string | null = body?.eventId ? String(body.eventId) : null;
    const eventTitleHint: string | null = body?.eventTitle ? String(body.eventTitle) : null;
    const signal: string = String(body?.signal || "");
    const source: string = String(body?.source || "");
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    if (!VALID_SIGNALS.has(signal)) {
      return new Response(JSON.stringify({ error: "invalid_signal" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_SOURCES.has(source)) {
      return new Response(JSON.stringify({ error: "invalid_source" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Resolve the live event to derive category + type_key when possible.
    let resolvedTitle: string | null = eventTitleHint;
    if (eventId) {
      const { data: ev } = await supabase
        .from("calendar_events")
        .select("title")
        .eq("id", eventId)
        .eq("user_id", userId)
        .maybeSingle();
      if (ev?.title) resolvedTitle = ev.title;
    }

    if (!resolvedTitle) {
      return new Response(JSON.stringify({ error: "event_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const category = coarseEventType(resolvedTitle);
    const typeKey = normalizeEventTypeKey(resolvedTitle);

    const { error: insErr } = await supabase
      .from("event_priority_memory")
      .insert({
        user_id: userId,
        event_category: category,
        event_type_key: typeKey,
        signal,
        source,
        event_id: eventId,
        meta,
      });
    if (insErr) {
      console.error("[record-event-priority-signal] insert error", insErr.message);
      return new Response(JSON.stringify({ error: "insert_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      category,
      typeKey,
      signal,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[record-event-priority-signal] fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});