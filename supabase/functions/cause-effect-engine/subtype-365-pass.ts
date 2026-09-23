/**
 * subtype-365-pass.ts — IO wrapper for the NEW 365-day subtype pattern pass.
 *
 * Runs ONLY after the engine's existing 60-day results have been saved. It
 * writes one additive key (`signal_summary.subtype_patterns_365`) onto the row
 * the engine has just written, and nothing else. Every existing key, threshold
 * and window is untouched, so Insights receives exactly what it received before.
 *
 * Safety:
 *   • off switch — SUBTYPE_PATTERNS_365_ENABLED=false disables it with no deploy
 *   • time limit — the pass is abandoned after PASS_TIMEOUT_MS
 *   • fails quietly — any error/timeout/missing data logs and returns, leaving
 *     the existing saved results exactly as they are
 */

import {
  buildTravelOccurrences,
  type CalendarTravelEvidence,
  type LocationDay,
  type TravelDayVerdict,
} from "../_shared/patterns/travel-occurrences.ts";
import {
  computeSubtypePatterns365,
  WINDOW_DAYS_365,
} from "../_shared/patterns/subtype-patterns-365.ts";
import { classifyTripEvidence } from "../_shared/travel/trip-windows.ts";

const PASS_TIMEOUT_MS = 12_000;

export function subtypePassEnabled(): boolean {
  return (Deno.env.get("SUBTYPE_PATTERNS_365_ENABLED") ?? "true").toLowerCase() !==
    "false";
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Calendar evidence for travel. Conference/off-site titles are marked as such. */
export function travelEvidenceFromEvents(
  events: Array<{
    title?: string | null;
    start_time?: string | null;
    event_metadata?: Record<string, unknown> | null;
  }>,
  homeCountryHint?: string | null,
): CalendarTravelEvidence[] {
  const out: CalendarTravelEvidence[] = [];
  for (const ev of events) {
    const date = ev.start_time ? isoDate(Date.parse(ev.start_time)) : null;
    if (!date || Number.isNaN(Date.parse(date))) continue;
    const kind = classifyTripEvidence(ev.title ?? null);
    if (kind === "flight") out.push({ date, kind: "flight", title: ev.title ?? null });
    else if (kind === "stay") out.push({ date, kind: "stay", title: ev.title ?? null });
    else if (kind === "trip") out.push({ date, kind: "transit", title: ev.title ?? null });
    else if (kind === "offsite") {
      // A conference / off-site title is never travel on its own.
      out.push({ date, kind: "conference_title", title: ev.title ?? null });
    }
    // An invite address away from the home country is stronger than a title.
    const rawLoc = (ev.event_metadata as Record<string, unknown> | null)?.location;
    const loc = typeof rawLoc === "string" ? rawLoc.trim() : "";
    if (loc && homeCountryHint && !loc.toLowerCase().includes(homeCountryHint.toLowerCase())) {
      const looksForeign = /,\s*[A-Za-z .'-]{3,}$/.test(loc);
      if (looksForeign) {
        out.push({ date, kind: "invite_address", title: ev.title ?? null });
      }
    }
  }
  return out;
}

export interface PassResult {
  ok: boolean;
  reason?: string;
  itemCount?: number;
  durationMs: number;
  store?: unknown;
}

/**
 * Compute and (optionally) persist the 365-day pass. `dryRun` returns the store
 * without writing, for the pre-deploy comparison.
 */
export async function runSubtypePatterns365Pass(
  supabase: any,
  userId: string,
  todayStr: string,
  opts?: { dryRun?: boolean },
): Promise<PassResult> {
  const started = Date.now();
  if (!subtypePassEnabled()) {
    return { ok: false, reason: "disabled", durationMs: 0 };
  }

  const timeout = new Promise<PassResult>((resolve) =>
    setTimeout(
      () => resolve({ ok: false, reason: "timeout", durationMs: PASS_TIMEOUT_MS }),
      PASS_TIMEOUT_MS,
    )
  );

  const work = (async (): Promise<PassResult> => {
    const todayMs = Date.parse(todayStr + "T00:00:00Z");
    const startStr = isoDate(todayMs - WINDOW_DAYS_365 * 86_400_000);
    const startIso = startStr + "T00:00:00Z";
    const nowIso = new Date().toISOString();

    const [evRes, wearRes, pingRes, profRes, prevRes] = await Promise.all([
      supabase.from("calendar_events")
        .select("title, start_time, end_time, is_all_day, event_metadata, event_category, event_subcategory, category_resolved_by, category_confidence, attendees_count")
        .eq("user_id", userId)
        .gte("start_time", startIso)
        .lte("start_time", nowIso),
      supabase.from("wearable_data")
        .select("summary_date, hrv, resting_heart_rate, sleep_score")
        .eq("user_id", userId)
        .gte("summary_date", startStr),
      supabase.from("travel_location_pings")
        .select("lat, lng, captured_at")
        .eq("user_id", userId)
        .gte("captured_at", startIso)
        .order("captured_at", { ascending: true })
        .limit(5000),
      supabase.from("profiles")
        .select("home_lat, home_lng, country")
        // profiles is keyed by `id` (the Auth0 subject), not `user_id`.
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("causality_findings")
        .select("signal_summary")
        .eq("user_id", userId)
        .eq("pattern_kind", "cause_effect_v2")
        .order("computed_for_date", { ascending: false })
        .limit(2),
    ]);

    const events = (evRes?.data ?? []) as any[];
    const wearable = (wearRes?.data ?? []) as any[];
    const pings = (pingRes?.data ?? []) as any[];
    const profile = profRes?.data ?? null;

    // Per-day greatest distance from the home anchor.
    const locationDays: LocationDay[] = [];
    if (profile?.home_lat != null && profile?.home_lng != null) {
      const byDay = new Map<string, number>();
      for (const p of pings) {
        if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
        const d = isoDate(Date.parse(p.captured_at));
        const km = haversineKm(
          { lat: profile.home_lat, lng: profile.home_lng },
          { lat: p.lat, lng: p.lng },
        );
        byDay.set(d, Math.max(byDay.get(d) ?? 0, km));
      }
      for (const [date, maxDistanceKm] of byDay) {
        locationDays.push({ date, maxDistanceKm });
      }
    }

    // Carry forward travel days a previous run already confirmed.
    const carried: TravelDayVerdict[] = [];
    for (const row of (prevRes?.data ?? []) as any[]) {
      const prev = row?.signal_summary?.subtype_patterns_365?.travelDays;
      if (Array.isArray(prev)) {
        for (const d of prev) {
          if (d?.travel && typeof d.date === "string") {
            carried.push({
              date: d.date,
              travel: true,
              source: d.source ?? null,
              reason: d.reason ?? "carried-forward",
              titles: Array.isArray(d.titles) ? d.titles : [],
            });
          }
        }
      }
    }

    const travel = buildTravelOccurrences({
      locationDays,
      calendarEvidence: travelEvidenceFromEvents(events, profile?.country ?? null),
      carriedForwardDays: carried,
    });

    const store = computeSubtypePatterns365({
      todayIsoDate: todayStr,
      events,
      wearable,
      travel,
    });

    if (!opts?.dryRun) {
      // Merge onto the row the engine has just saved — read-modify-write of the
      // single new key, so every existing key is preserved byte-for-byte.
      const { data: current } = await supabase
        .from("causality_findings")
        .select("signal_summary")
        .eq("user_id", userId)
        .eq("pattern_kind", "cause_effect_v2")
        .eq("computed_for_date", todayStr)
        .maybeSingle();
      const merged = {
        ...(current?.signal_summary ?? {}),
        subtype_patterns_365: store,
      };
      const { error } = await supabase
        .from("causality_findings")
        .update({ signal_summary: merged })
        .eq("user_id", userId)
        .eq("pattern_kind", "cause_effect_v2")
        .eq("computed_for_date", todayStr);
      if (error) {
        return {
          ok: false,
          reason: `persist_failed:${error.message}`,
          durationMs: Date.now() - started,
        };
      }
    }

    return {
      ok: true,
      itemCount: store.items.length,
      durationMs: Date.now() - started,
      store,
    };
  })().catch((err) => ({
    ok: false,
    reason: `error:${err instanceof Error ? err.message : String(err)}`,
    durationMs: Date.now() - started,
  }));

  return await Promise.race([work, timeout]);
}
