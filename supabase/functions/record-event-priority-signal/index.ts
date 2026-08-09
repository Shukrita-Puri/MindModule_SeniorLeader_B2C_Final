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
import { coarseEventType } from "../_shared/events/event-classifier.ts";
import { enrichEvent } from "../_shared/events/enrich-event.ts";
import {
  recordConfirmation,
  stampCalendarEventCategory,
} from "../_shared/events/learning-store.ts";
import {
  normalizeEventTitleMemoryKey,
  TITLE_SPECIFIC_MEMORY_CATEGORY,
} from "../_shared/plan/event-priority-memory.ts";
import { normalizeEventTypeKey } from "../_shared/plan/week-ahead-mode.ts";
import { routeCustomTag } from "../_shared/jit/custom-tag-router.ts";
import {
  isValidIsoDate,
  localWeekOf,
  parseCanonicalIdentity,
  scopeForSignal,
  upcomingWeek,
} from "../_shared/plan/exclusion-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-mm-client-platform",
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventId: string | null = body?.eventId ? String(body.eventId) : null;
    const eventTitleHint: string | null = body?.eventTitle
      ? String(body.eventTitle)
      : null;
    const signal: string = String(body?.signal || "");
    const source: string = String(body?.source || "");
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};
    const targetWeekStartIn: unknown = body?.targetWeekStart;
    const targetWeekEndIn: unknown = body?.targetWeekEnd;
    const timezoneIn: string =
      typeof body?.timezone === "string" && body.timezone
        ? body.timezone
        : "UTC";
    const clientCanonicalId: string | null =
      typeof body?.clientCanonicalId === "string"
        ? body.clientCanonicalId
        : null;

    if (!VALID_SIGNALS.has(signal)) {
      return new Response(JSON.stringify({ error: "invalid_signal" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_SOURCES.has(source)) {
      return new Response(JSON.stringify({ error: "invalid_source" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const category = coarseEventType(resolvedTitle);
    const typeKey = normalizeEventTypeKey(resolvedTitle);
    // v2 taxonomy: capture the fine-grained subcategory (e.g. "deep_work",
    // "long_haul") once so downstream Plan / Insights / Nudges can read it
    // without re-classifying. Nullable — safe if classifier returns no match.
    const enrichedSignal = enrichEvent({ title: resolvedTitle });
    const subcategory = enrichedSignal.subcategory;

    // ─── Learning loop: user override → confirmed classification ───
    // An explicit A–H category from the client wins; otherwise the act of
    // categorising/acting on the event confirms the current resolution for
    // this title. Best-effort — never blocks the signal write.
    const clientCategoryRaw = typeof body?.eventCategory === "string"
      ? body.eventCategory.trim().toUpperCase().slice(0, 1)
      : null;
    const confirmedCategory =
      (clientCategoryRaw && "ABCDEFGH".includes(clientCategoryRaw)
        ? clientCategoryRaw
        : null) ?? enrichedSignal.categoryId ?? null;
    const confirmationSource = clientCategoryRaw
      ? "user_override" as const
      : (source === "post_plan_feedback" ? "plan_slot" as const : "user_override" as const);

    // ─── SSOT exclusion scope: compute the target week + resolve identity ───
    const scope = scopeForSignal(signal);
    let effectiveWeekStart: string | null = null;
    let effectiveWeekEnd: string | null = null;
    if (scope === "target_week") {
      if (
        isValidIsoDate(targetWeekStartIn) && isValidIsoDate(targetWeekEndIn)
      ) {
        effectiveWeekStart = targetWeekStartIn as string;
        effectiveWeekEnd = targetWeekEndIn as string;
      } else {
        // Server-authoritative fallback: upcoming Mon–Sun in the user's zone.
        const wk = upcomingWeek(new Date(), timezoneIn);
        effectiveWeekStart = wk.start;
        effectiveWeekEnd = wk.end;
      }
    }

    // Safe identity resolution — only attach a real calendar_events.id when
    // the (title, start, duration) tuple matches exactly one row.
    let resolvedEventUuid: string | null = null;
    let identityConfidence: "resolved" | "ambiguous" | "unresolved" | null =
      null;
    let resolutionDiagnostic: string | null = null;
    const canon = parseCanonicalIdentity(clientCanonicalId);
    if (canon) {
      const startISO = new Date(canon.startMs).toISOString();
      const startLoISO = new Date(canon.startMs - 60_000).toISOString();
      const startHiISO = new Date(canon.startMs + 60_000).toISOString();
      const normTitle = canon.title.trim().toLowerCase();
      const { data: matches } = await supabase
        .from("calendar_events")
        .select("id, title, start_time, end_time")
        .eq("user_id", userId)
        .gte("start_time", startLoISO)
        .lte("start_time", startHiISO);
      const candidates = (matches ?? []).filter((row: any) => {
        if (String(row?.title ?? "").trim().toLowerCase() !== normTitle) {
          return false;
        }
        if (!row?.start_time || !row?.end_time) return false;
        const dur = Math.round(
          (new Date(row.end_time).getTime() -
            new Date(row.start_time).getTime()) / 60_000,
        );
        return Math.abs(dur - canon.durationMinutes) <= 1;
      });
      if (candidates.length === 1) {
        resolvedEventUuid = candidates[0].id as string;
        identityConfidence = "resolved";
      } else if (candidates.length === 0) {
        identityConfidence = "unresolved";
        resolutionDiagnostic = "no_match";
      } else {
        identityConfidence = "ambiguous";
        resolutionDiagnostic = "multiple_matches";
      }
      (meta as any).clientCanonicalId = canon.raw;
      if (resolutionDiagnostic) {
        (meta as any).resolutionDiagnostic = resolutionDiagnostic;
      }
      // Prefer server-resolved UUID over any client-supplied `eventId` when
      // client sent a canonical hint but no eventId.
    }

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
        scope: scope === "none" ? null : scope,
        effective_week_start: effectiveWeekStart,
        effective_week_end: effectiveWeekEnd,
        timezone: scope === "target_week" ? timezoneIn : null,
        resolved_event_id: resolvedEventUuid,
        identity_confidence: identityConfidence,
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
      return new Response(
        JSON.stringify({
          error: "insert_failed",
          pg_code: (insErr as any)?.code ?? null,
          pg_message: insErr.message,
          pg_details: (insErr as any)?.details ?? null,
          pg_hint: (insErr as any)?.hint ?? null,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
          scope: "permanent",
          resolved_event_id: resolvedEventUuid,
          identity_confidence: identityConfidence,
        });
      if (titleErr) {
        console.warn(
          "[record-event-priority-signal] title-specific memory insert failed",
          {
            code: (titleErr as any)?.code,
            message: titleErr.message,
            signal,
            source,
          },
        );
      }
    }

    // ─── Snapshot invalidation ───
    // A signal change means any pre-existing plan / daily-context / weekly-plan
    // snapshot covering the target window may still surface the excluded event.
    // We proactively delete them; the next fetch regenerates against the new
    // memory row (which now also participates in the input signature via
    // `computeExclusionRevision`).
    try {
      if (scope === "permanent") {
        // `never` — invalidate everything from today forward for this user.
        const todayISO = new Date().toISOString().slice(0, 10);
        const currentWeekStart = localWeekOf(new Date(), timezoneIn).start;
        await supabase.from("mastery_plan_snapshots").delete().eq(
          "user_id",
          userId,
        ).gte("plan_date", todayISO);
        await supabase.from("daily_context_snapshot").delete().eq(
          "user_id",
          userId,
        ).gte("local_date", todayISO);
        await supabase.from("weekly_plan_snapshots").delete().eq(
          "user_id",
          userId,
        ).gte("week_start_date", currentWeekStart);
      } else if (
        scope === "target_week" && effectiveWeekStart && effectiveWeekEnd
      ) {
        await supabase.from("mastery_plan_snapshots").delete()
          .eq("user_id", userId)
          .gte("plan_date", effectiveWeekStart)
          .lte("plan_date", effectiveWeekEnd);
        await supabase.from("daily_context_snapshot").delete()
          .eq("user_id", userId)
          .gte("local_date", effectiveWeekStart)
          .lte("local_date", effectiveWeekEnd);
        await supabase.from("weekly_plan_snapshots").delete()
          .eq("user_id", userId)
          .eq("week_start_date", effectiveWeekStart);
      }
    } catch (invalidErr) {
      console.warn(
        "[record-event-priority-signal] snapshot invalidation soft-failed",
        (invalidErr as Error)?.message,
      );
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
      const importanceMap: Record<string, number> = {
        high: 45,
        medium: 20,
        low: 0,
      };
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
        ? (meta as any).customTags.map((t: string) => routeCustomTag(t)).filter(
          Boolean,
        )
        : [];
      const routedImportance = routed.find((r: any) =>
        r?.kind === "importance"
      ) as { kind: "importance"; value: "high" | "medium" | "low" } | undefined;
      const routedRelationship = routed.find((r: any) =>
        r?.kind === "relationship"
      ) as { kind: "relationship"; value: string } | undefined;
      await upsertDerived({
        net_importance: routedImportance?.value === "high"
          ? 45
          : routedImportance?.value === "medium"
          ? 20
          : routedImportance?.value === "low"
          ? 0
          : undefined,
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
          const attendees =
            Array.isArray((evRow as any)?.event_metadata?.attendees)
              ? (evRow as any).event_metadata.attendees
              : [];
          const emails: string[] = [];
          for (const a of attendees) {
            const em = typeof a === "string" ? a : a?.email;
            if (typeof em === "string" && em.includes("@")) {
              emails.push(em.toLowerCase().trim());
            }
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
          console.warn(
            "[record-event-priority-signal] tag_cleared relationship cleanup failed",
            (e as Error)?.message,
          );
        }
      }
    }

    if (signal === "tag_relationship" && eventId) {
      const rel = String((meta as any)?.relationshipTag || "").toLowerCase()
        .trim();
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

    return new Response(
      JSON.stringify({
        ok: true,
        category,
        typeKey,
        signal,
        resolvedBy: signal === "tag_relationship"
          ? "sovereign_tag"
          : signal === "tag_custom"
          ? "custom_tag_router"
          : "direct_signal",
        sovereignFired: signal.startsWith("tag_"),
        relationshipLeads: signal === "tag_relationship",
        gateBypassed: signal === "never" || signal === "cancelled_now",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[record-event-priority-signal] fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
