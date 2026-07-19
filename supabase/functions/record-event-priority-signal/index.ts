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
import { enrichEvent } from "../_shared/events/enrich-event.ts";
import {
  normalizeEventTitleMemoryKey,
  TITLE_SPECIFIC_MEMORY_CATEGORY,
} from "../_shared/plan/event-priority-memory.ts";
import { normalizeEventTypeKey } from "../_shared/plan/week-ahead-mode.ts";
import { routeCustomTag } from "../_shared/jit/custom-tag-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id",
};

const VALID_SIGNALS = new Set([
  "priority",
  "not_this_week",
  "never",
  "cancelled_now",
  "cancelled_as_noise",
  "cancelled_keep_surfacing",
  // Sovereign user-tag layer (JIT v2 rework). Persists the graduated
  // importance + relationship + custom tags the user declared on a
  // priority card so the next plan regeneration can read them.
  "tag_importance_high",
  "tag_importance_medium",
  "tag_importance_low",
  "tag_relationship",
  "tag_custom",
  "tag_cleared",
]);

const VALID_SOURCES = new Set([
  "week_ahead_picker",
  "priority_tag",
  "cancel_feedback",
  "post_plan_feedback",
]);

// Map UI relationshipTag → role used by the sovereign relationship layer.
// Event-level tags only. Do not fan out to all attendees.
const RELATIONSHIP_TO_ROLE: Record<string, string> = {
  boss: "direct_boss",
  board: "board_member",
  investor: "investor",
  client: "client",
  customer: "customer",
  vendor: "vendor",
  leadership: "skip_level",
  team: "report_direct",
  junior: "report_junior",
  colleague: "peer",
};

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
    // v2 taxonomy: capture the fine-grained subcategory (e.g. "deep_work",
    // "long_haul") once so downstream Plan / Insights / Nudges can read it
    // without re-classifying. Nullable — safe if classifier returns no match.
    const subcategory = enrichEvent({ title: resolvedTitle }).subcategory;

    const { error: insErr } = await supabase
      .from("event_priority_memory")
      .insert({
        user_id: userId,
        event_category: category,
        event_type_key: typeKey,
        event_subcategory: subcategory,
        signal,
        source,
        event_id: eventId,
        meta,
      });
    if (insErr) {
      console.error("[record-event-priority-signal] insert error", {
        code: (insErr as any)?.code,
        message: insErr.message,
        details: (insErr as any)?.details,
        hint: (insErr as any)?.hint,
        signal,
        source,
      });
      return new Response(JSON.stringify({
        error: "insert_failed",
        pg_code: (insErr as any)?.code ?? null,
        pg_message: insErr.message,
        pg_details: (insErr as any)?.details ?? null,
        pg_hint: (insErr as any)?.hint ?? null,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (signal === "never") {
      const titleKey = normalizeEventTitleMemoryKey(resolvedTitle);
      const { error: titleErr } = await supabase
        .from("event_priority_memory")
        .insert({
          user_id: userId,
          event_category: TITLE_SPECIFIC_MEMORY_CATEGORY,
          event_type_key: titleKey,
          event_subcategory: subcategory,
          signal,
          source,
          event_id: eventId,
          meta: {
            ...meta,
            titleSpecific: true,
            originalCategory: category,
            originalTypeKey: typeKey,
            resolvedTitle,
          },
        });
      if (titleErr) {
        console.warn("[record-event-priority-signal] title-specific memory insert failed", {
          code: (titleErr as any)?.code,
          message: titleErr.message,
          signal,
          source,
        });
      }
    }

    const upsertDerived = async (patch: Record<string, unknown>) => {
      await supabase.from("event_priority_derived").upsert({
        user_id: userId,
        event_category: category,
        event_type_key: typeKey,
        updated_at: new Date().toISOString(),
        ...patch,
      }, { onConflict: "user_id,event_category,event_type_key" });
    };

    if (signal === "never") {
      await upsertDerived({
        net_importance: -999,
        permanent_flag: true,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal === "cancelled_now") {
      await upsertDerived({
        net_importance: -10,
        permanent_flag: false,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal === "cancelled_as_noise") {
      await upsertDerived({
        net_importance: -25,
        permanent_flag: false,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal === "cancelled_keep_surfacing") {
      await upsertDerived({
        net_importance: 5,
        permanent_flag: false,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal.startsWith("tag_importance_")) {
      const level = signal.slice("tag_importance_".length);
      const importanceMap: Record<string, number> = { high: 45, medium: 20, low: 0 };
      await upsertDerived({
        net_importance: importanceMap[level] ?? 0,
        permanent_flag: true,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal === "tag_relationship") {
      await upsertDerived({
        relationship_role: String((meta as any)?.relationshipRole || ""),
        permanent_flag: true,
        last_signal: signal,
        signal_count: 1,
      });
    } else if (signal === "tag_custom") {
      const routed = Array.isArray((meta as any)?.customTags)
        ? (meta as any).customTags.map((t: string) => routeCustomTag(t)).filter(Boolean)
        : [];
      const routedImportance = routed.find((r: any) => r?.kind === "importance") as { kind: "importance"; value: "high" | "medium" | "low" } | undefined;
      const routedRelationship = routed.find((r: any) => r?.kind === "relationship") as { kind: "relationship"; value: string } | undefined;
      await upsertDerived({
        net_importance:
          routedImportance?.value === "high" ? 45 :
          routedImportance?.value === "medium" ? 20 :
          routedImportance?.value === "low" ? 0 :
          undefined,
        relationship_role: routedRelationship?.value ?? undefined,
        last_signal: signal,
        signal_count: routed.length || 1,
      });
    } else if (signal === "tag_cleared") {
      await upsertDerived({
        net_importance: 0,
        relationship_role: null,
        permanent_flag: false,
        last_signal: signal,
        signal_count: 1,
      });
      if (eventId) {
        try {
          const { data: evRow } = await supabase
            .from("calendar_events")
            .select("event_metadata")
            .eq("id", eventId)
            .eq("user_id", userId)
            .maybeSingle();
          const attendees = Array.isArray((evRow as any)?.event_metadata?.attendees)
            ? (evRow as any).event_metadata.attendees
            : [];
          const emails: string[] = [];
          for (const a of attendees) {
            const em = typeof a === "string" ? a : a?.email;
            if (typeof em === "string" && em.includes("@")) emails.push(em.toLowerCase().trim());
          }
          if (emails.length > 0) {
            await supabase
              .from("attendee_relationships")
              .delete()
              .eq("user_id", userId)
              .eq("source", "user_tag")
              .in("attendee_email", emails);
          }
        } catch (e) {
          console.warn("[record-event-priority-signal] tag_cleared relationship cleanup failed", (e as Error)?.message);
        }
      }
    }

    if (signal === "tag_relationship" && eventId) {
      const rel = String((meta as any)?.relationshipTag || "").toLowerCase().trim();
      const role = RELATIONSHIP_TO_ROLE[rel];
      if (role) {
        await supabase.from("event_priority_memory").insert({
          user_id: userId,
          event_category: category,
          event_type_key: typeKey,
          event_subcategory: subcategory,
          signal: "tag_relationship",
          source: "priority_tag",
          event_id: eventId,
          meta: { ...meta, relationshipRole: role },
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      category,
      typeKey,
      signal,
      resolvedBy: signal === "tag_relationship" ? "sovereign_tag" : signal === "tag_custom" ? "custom_tag_router" : "direct_signal",
      sovereignFired: signal.startsWith("tag_"),
      relationshipLeads: signal === "tag_relationship",
      gateBypassed: signal === "never" || signal === "cancelled_now",
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
