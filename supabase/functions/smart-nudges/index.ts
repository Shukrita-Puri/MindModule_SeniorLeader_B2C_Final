import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callClaudeText,
  callLovableAIText,
  CLAUDE_MODELS,
} from "../_shared/anthropic.ts";
import { evaluateForScope } from "../_shared/behaviour-wiring.ts";
// Canonical Availability SSOT. Every behavioural consumer (Planner, Brief,
// Nudges) reads from this single classifier so "is the user actually working
// today?" always has one authoritative answer.
import {
  type AvailabilityResult,
  type AvailabilityState,
  classifyAvailability,
  classifyDay,
  isLastDayOfLongWeekend,
} from "../_shared/availability/availability-classifier.ts";
// Brief↔Nudge parity. Nudges MUST read the same shared snapshot the Brief
// reasoned over instead of re-evaluating rules against a fresh
// SignalCoverageInput. Falls back to `evaluateForScope` only when no Brief
// snapshot exists for the current (user, local_date, time_window).
import {
  loadBriefBehaviourSnapshot,
  snapshotToWiring,
  type TimeWindow as BriefTimeWindow,
} from "../_shared/load-brief-behaviour-snapshot.ts";
import { BRIEF_PROMPT_VERSION } from "../_shared/brief-prompt-version.ts";
import {
  CHIEF_OF_STAFF_PERSONA,
  FORBIDDEN_NOTIFICATION_WORDS,
} from "../_shared/copy-vocabulary.ts";
import { EVENT_CATEGORIES } from "../_shared/events/event-categories.ts";
import { buildActionFrameForEvent } from "../_shared/plan/action-frame.ts";
import { evaluateWeekAheadMode, planningDayOfWeek } from "../_shared/plan/week-ahead-mode.ts";
import { shouldFireWeekAheadPickerInvite } from "../_shared/plan/week-ahead-nudge.ts";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { requireAdmin, writeAdminAudit } from "../_shared/admin-guard.ts";
import { validateApnsEnvironment } from "../_shared/apns-env.ts";
import {
  type DeliveryMode,
  describeDeliveryMode,
  resolveDeliveryMode,
} from "./delivery-mode.ts";
import {
  eventHourInTimezone,
  isHourInDndWindow,
  localDayBoundsUtc,
  localParts,
  resolveEffectiveTimezone,
  timezoneOffsetMinutes,
} from "../_shared/effective-timezone.ts";
import {
  COUNTABLE_DELIVERY_STATES as SHARED_COUNTABLE_DELIVERY_STATES,
  isCountableDeliveryState,
} from "../_shared/countable-notification-states.ts";
// Batch C — atomic dispatch-key claim + per-device delivery attempts.
import {
  attachNotificationLogToClaim,
  claimDispatch,
} from "../_shared/dispatch-key.ts";
import { recordDeliveryAttempt } from "../_shared/delivery-attempts.ts";
// Direct import from calendar-merge.ts (not the calendarEvents.ts re-export)
// to harden against re-export regressions that previously caused BootFailure.
import { mergeCalendarEvents } from "../_shared/rules/calendar-merge.ts";

type SupabaseLoose = ReturnType<typeof createClient<any, "public", any>>;

// Phase 4 — Unified CoS Leader Profile reader (null-safe). Provides
// `preferences.{brief_timing, reset_modality, weekend_signals}` and
// `voice.cos_brief_rules`. Missing/failed profiles resolve to a shell
// with nulls; Smart Nudges must treat null values as "system decides"
// and continue to work exactly as today when the profile is absent.
import {
  type LeaderProfileContext,
  loadLeaderProfile,
  normaliseBriefTiming,
  normaliseResetModality,
  normaliseWeekendSignal,
} from "../_shared/leader-profile-loader.ts";

// ── APNs Helper Functions ──

/**
 * Normalize a .p8 private key from env storage into clean base64 DER.
 * Handles: raw PEM, literal \\n escapes, URL-safe base64, extra whitespace.
 */
function normalizeP8Key(raw: string): string {
  let key = raw
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/[\s\r\n]+/g, "")
    .replace(/-/g, "+").replace(/_/g, "/"); // URL-safe → standard base64

  // Add padding if needed
  const pad = key.length % 4;
  if (pad === 2) key += "==";
  else if (pad === 3) key += "=";

  if (key.length === 0) {
    throw new Error("[APNs] APNS_P8_KEY empty after normalization");
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(key)) {
    const bad = key.match(/[^A-Za-z0-9+/=]/);
    throw new Error(
      `[APNs] APNS_P8_KEY has invalid char at pos ${bad?.index}: charCode=${
        bad?.[0]?.charCodeAt(0)
      }, len=${key.length}`,
    );
  }
  return key;
}

/**
 * Create a JWT for APNs authentication using ES256 (ECDSA P-256 + SHA-256).
 */
async function createApnsJwt(
  p8Key: string,
  keyId: string,
  teamId: string,
): Promise<string> {
  const pemBody = normalizeP8Key(p8Key);
  console.log(`[APNs] Key normalized OK: ${pemBody.length} base64 chars`);
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = { alg: "ES256", kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(
      /=+$/,
      "",
    );

  const headerB64 = encode(header);
  const claimsB64 = encode(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${signingInput}.${sigB64}`;
}

/**
 * Send a push notification to a single iOS device via APNs HTTP/2.
 */
async function sendApnsPush(
  deviceToken: string,
  jwt: string,
  bundleId: string,
  title: string,
  body: string,
  customData: Record<string, string>,
  apnsHost: string = "api.sandbox.push.apple.com",
  options: {
    ttlSeconds?: number;
    collapseId?: string;
    badge?: number;
    subtitle?: string;
  } = {},
): Promise<
  {
    ok: boolean;
    status: number;
    reason: string;
    expirationTs: number;
    collapseId: string | null;
  }
> {
  // v5.3 - Punctuality + Clean Desk
  // Caller passes per-intent ttlSeconds and collapseId so APNs drops the push
  // once it stops being relevant ("no zombie notifications") and so a stale
  // queued one is replaced when the device reconnects.
  const ttlSeconds = Math.max(60, options.ttlSeconds ?? 6 * 3600);
  const expirationTs = Math.floor(Date.now() / 1000) + ttlSeconds;
  const collapseId = options.collapseId ?? null;
  const badge = typeof options.badge === "number"
    ? Math.max(0, options.badge)
    : 1;

  // v1.1 - Collapsed/Expanded headline contract.
  // title is forced to the brand string ('Mind Module') by the caller.
  // The original moment headline rides aps.alert.subtitle.
  const subtitle = (options.subtitle ?? "").trim();
  const apnsPayload = {
    aps: {
      alert: subtitle ? { title, subtitle, body } : { title, body },
      sound: "default",
      badge,
    },
    ...customData,
  };

  const url = `https://${apnsHost}/3/device/${deviceToken}`;

  console.log(
    `[APNs] Sending to ${apnsHost} | topic=${bundleId} | token=${
      deviceToken.substring(0, 12)
    }... (${deviceToken.length} chars) | ttl=${ttlSeconds}s | collapse=${
      collapseId ?? "-"
    }`,
  );

  const headers: Record<string, string> = {
    "Authorization": `bearer ${jwt}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(expirationTs),
    "Content-Type": "application/json",
  };
  if (collapseId) headers["apns-collapse-id"] = collapseId.substring(0, 64);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(
      `[APNs] Failed (${response.status}): ${errBody} – host=${apnsHost} topic=${bundleId} token=${
        deviceToken.substring(0, 12)
      }...`,
    );
    let reason = errBody || `http_${response.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.reason) reason = parsed.reason;
    } catch (_) { /* keep raw body */ }
    return {
      ok: false,
      status: response.status,
      reason,
      expirationTs,
      collapseId,
    };
  }

  await response.text();
  console.log(`[APNs] Success – token=${deviceToken.substring(0, 12)}...`);
  return {
    ok: true,
    status: response.status,
    reason: "success",
    expirationTs,
    collapseId,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
// ── SIGNAL-FIRST ARCHITECTURE: Types & Constants ──
// ══════════════════════════════════════════════════════════════

const DAILY_NOTIFICATION_CAP = 3;
const LOW_TIERS = ["depleted", "managing"];
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const EVALUATOR_VERSION = "smart-nudges-v8-trace-2026-06-23";

// §17.7 - Week-Ahead Picker Invite is treated as a weekly digest, NOT a
// behavioural nudge. It has its own cap bucket (max one per ISO week per
// user) and is exempt from:
//   - DAILY_NOTIFICATION_CAP
//   - 2-hour intra-tick suppression
//   - per-window slot cap
// Kill-switch: set WEEK_AHEAD_PICKER_ENABLED='false' to disable without a
// deploy. Any other value (or missing) → enabled.
const WEEK_AHEAD_PICKER_ENABLED =
  (Deno.env.get("WEEK_AHEAD_PICKER_ENABLED") ?? "true").toLowerCase() !==
    "false";

// MVP feature flag - set to true post-launch to enable P2/P3/P4/P6/P7
const MVP_POST_LAUNCH = false;

// Sub-flag for staged activation once the post-launch evaluator bucket is on.
// Keep this false until pattern-alert copy, suppression, and deep-link behavior
// are validated independently in staging.
const PATTERN_ALERT_ENABLED = false;

// v7 - Suppress legacy generic mid-day variants (priorities-count, consecutive-low).
// Framework code is preserved for future use; flip this on to re-enable.
const LEGACY_GENERIC_NUDGES_ENABLED = false;

// ── v5.3 - Per-intent TTL + collapse-id helpers ────────────────────────
// Maps the resolved nudge variant to its actionable window (TTL) and the
// collapse bucket APNs should de-dupe by. After expiration, APNs drops the
// queued push, so when the device reconnects the user only sees pushes that
// are still in their relevance window - exactly the Chief-of-Staff
// "no zombie notifications" contract.
function nudgeTtlSeconds(variantId: string, type: string): number {
  if (variantId === "nudge_one_jit") return 45 * 60; // 45 min
  if (variantId === "nudge_one_jit_post_travel") return 45 * 60;
  if (variantId === "nudge_one_morning") return 3 * 3600; // 3 h
  if (variantId === "nudge_one_pre_flight") return 45 * 60; // 45 min
  if (variantId === "nudge_one_post_arrival") return 3 * 3600;
  if (variantId === "nudge_two_jit") return 45 * 60;
  if (variantId === "nudge_two_recalibrate") return 2 * 3600; // 2 h
  if (variantId === "nudge_two_reserves") return 2 * 3600;
  if (variantId === "nudge_two_priorities") return 2 * 3600;
  if (variantId === "nudge_two_in_flight") return 90 * 60; // 90 min
  if (variantId === "nudge_three_lookahead") return 10 * 3600;
  if (variantId.startsWith("nudge_three")) return 6 * 3600; // 6 h
  // Family fallback
  if (type === "nudge_one") return 3 * 3600;
  if (type === "nudge_two") return 2 * 3600;
  if (type === "nudge_three") return 6 * 3600;
  return 3600;
}

function nudgeCollapseId(
  family: string,
  localDate: string,
  isTravel: boolean,
): string {
  // Travel pre-flight + in-flight collapse to a single "travel" bucket so
  // the latest update wins on reconnect (clean desk).
  if (isTravel) return `travel-${localDate}`;
  return `${family}-${localDate}`;
}

// ── v5 timing contract ─────────────────────────────────────────────────
// Hard floor: never deliver any push before this local hour, regardless of
// calendar anchor or evaluator. Protects "morning mindset" per CEO feedback.
const GLOBAL_EARLIEST_LOCAL = 8.0; // 08:00
const GLOBAL_LATEST_LOCAL = 21.5; // 21:30
// Per-user, per-cron-tick: at most one notification regardless of evaluators.
const INTRA_TICK_MAX = 1;

function isCanonicalIosApnsToken(token: string): boolean {
  return /^[0-9a-f]+$/.test(token) && [64, 72, 128].includes(token.length);
}

// Noise filter, day-kind detection, and high-stakes scoring all live in
// the shared executive-state-taxonomy module so every surface uses the
// same vocabulary (Section L of the taxonomy plan).
import {
  classifyEventBucket,
  detectDayKindFromEvents,
  highStakesScore,
  isNoiseTitle,
} from "../_shared/executive-state-taxonomy.ts";
import {
  detectClientPlatform,
  wrapDbWithCalendarPrimacy,
} from "../_shared/calendar-provider.ts";
import {
  detectInFlightTravelEvent,
  detectPreFlightTravelEvent,
  isTravelTitle,
} from "../_shared/ceo-behaviour/travel.ts";
import { EVENT_PHASE_MAP } from "../_shared/events/event-phase-map.ts";
import { PROTOCOL_COMBOS } from "../_shared/protocols/protocol-combos.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

// ── Canonical Travel-phase copy adapter ──
// Mirrors the `copyForPhase` pattern used by `travel-notifications`. Smart-
// nudges layers a CTA-ready body on top of the canonical §4 Travel (G) phase
// contract so Brief / Plan / Notifications / Nudges all narrate Pre / During /
// Post travel from one source of truth. Variant IDs and titles are kept
// intact because they carry telemetry meaning; only the body framing is
// derived from EVENT_PHASE_MAP.G + PROTOCOL_COMBOS.
type TravelPhaseKey = "pre" | "during" | "post";
function travelPhaseFraming(
  phase: TravelPhaseKey,
): { goal: string; outcome: string } {
  const ph = EVENT_PHASE_MAP.G[phase];
  const goal = ph?.goal ?? "";
  const combo = ph ? PROTOCOL_COMBOS[ph.combo] : null;
  return { goal, outcome: combo?.outcome ?? "" };
}

function isNoiseEvent(title: string): boolean {
  return isNoiseTitle(title);
}
function scoreEvent(title: string | null): number {
  return highStakesScore(title);
}
function isHighStakes(title: string | null): boolean {
  return isHighStakesTitle(title);
}

// Travel-event detection for the v5.3 pre-flight / in-flight sub-arc is
// sourced from the canonical ceo-behaviour module (`isTravelTitle`) so
// Brief/Plan/Nudges stay in sync.

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── NudgeContext: all signals assembled once per user ──

interface CalendarEvent {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  external_id: string;
  is_organizer?: boolean;
  attendees_count?: number;
}

function mergeCalendarRows(rows: unknown[]): CalendarEvent[] {
  return mergeCalendarEvents((rows || []) as any[], "unknown").map((event) => ({
    id: event.id,
    title: event.title ?? null,
    start_time: event.startTime,
    end_time: event.endTime,
    external_id: event.canonicalEventId,
    is_organizer: event.isOrganizer ?? false,
    attendees_count: event.attendeesCount ?? 0,
  }));
}

function slotNameForIndex(index: number): NudgeSlot | null {
  if (index === 0) return "morning";
  if (index === 1) return "afternoon";
  if (index === 2) return "evening";
  return null;
}

function currentSlotForLocalHour(localHour: number): NudgeSlot {
  if (localHour < 12) return "morning";
  if (localHour < 18) return "afternoon";
  return "evening";
}

function periodEndHour(slot: NudgeSlot): number {
  if (slot === "morning") return 12;
  if (slot === "afternoon") return 18;
  return GLOBAL_LATEST_LOCAL;
}

function periodTtlSeconds(slot: NudgeSlot, localTime: number): number {
  const seconds = Math.floor((periodEndHour(slot) - localTime) * 3600);
  return Math.max(60, seconds);
}

function periodCollapseId(slot: NudgeSlot, localDate: string): string {
  return `smart-nudge-${slot}-${localDate}`;
}

function slotFromNotificationLogRow(
  row: { notification_type?: string | null; payload?: unknown },
): NudgeSlot | null {
  const payload = row?.payload && typeof row.payload === "object"
    ? row.payload as Record<string, unknown>
    : null;
  const metadata = payload?.metadata && typeof payload.metadata === "object"
    ? payload.metadata as Record<string, unknown>
    : null;
  const explicitSlot = metadata?.delivery_slot ?? payload?.slot;
  if (
    explicitSlot === "morning" || explicitSlot === "afternoon" ||
    explicitSlot === "evening"
  ) {
    return explicitSlot;
  }

  const type = String(row?.notification_type ?? "");
  if (type === "nudge_one" || type.startsWith("nudge_one")) return "morning";
  if (type === "nudge_two" || type.startsWith("nudge_two")) return "afternoon";
  if (
    type === "nudge_three" || type === "evening_close" ||
    type.startsWith("nudge_three")
  ) return "evening";
  return null;
}

function normalizeNotificationCopy(copy: NudgeCopy): NudgeCopy {
  return {
    ...copy,
    title: copy.title.replace(/\u2014/g, "-").trim(),
    body: copy.body.replace(/\u2014/g, "-").trim(),
  };
}

async function loadPlanNudgeSlots(
  supabase: SupabaseLoose,
  userId: string,
  planDate: string,
  mrsWindow: BriefTimeWindow,
): Promise<
  { status: "ready" | "missing" | "empty"; slots: PlanNudgeSlot[] | null }
> {
  const { data, error } = await supabase
    .from("mastery_plan_snapshots")
    .select("horizon_modules,status,generated_at")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .eq("mrs_window", mrsWindow)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(
      "[smart-nudges] plan snapshot read failed:",
      error.message ?? error,
    );
    return { status: "missing", slots: null };
  }
  let row = data as
    | { horizon_modules?: unknown; generated_at?: string | null }
    | null;
  if (!row) {
    const { data: latest, error: latestError } = await supabase
      .from("mastery_plan_snapshots")
      .select("horizon_modules,status,generated_at,mrs_window")
      .eq("user_id", userId)
      .eq("plan_date", planDate)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.warn(
        "[smart-nudges] plan snapshot same-day fallback failed:",
        latestError.message ?? latestError,
      );
      return { status: "missing", slots: null };
    }
    row = latest as
      | { horizon_modules?: unknown; generated_at?: string | null }
      | null;
  }
  if (!row) return { status: "missing", slots: null };
  const raw = Array.isArray(row?.horizon_modules) ? row.horizon_modules : [];
  const slots = raw
    .map((module: unknown, idx: number): PlanNudgeSlot | null => {
      const m = module as Record<string, unknown>;
      const rawIndex = Number.isInteger(m.slotIndex)
        ? Number(m.slotIndex)
        : idx;
      const slot = slotNameForIndex(rawIndex);
      if (!slot) return null;
      const mode =
        ["jit", "state", "jit+state", "full_arc"].includes(String(m.mode))
          ? String(m.mode) as PlanSlotMode
          : (m.isJit ? "jit" : "state");
      const jitPhase = m.jitPhase;
      return {
        slotIndex: rawIndex as 0 | 1 | 2,
        slot,
        mode,
        arcLabel: typeof m.arcLabel === "string" ? m.arcLabel : "Steady",
        jitPhase:
          jitPhase === "pre" || jitPhase === "during" || jitPhase === "post"
            ? jitPhase
            : null,
        jitEventTitle:
          typeof m.jitEventTitle === "string" && m.jitEventTitle.trim()
            ? m.jitEventTitle.trim()
            : null,
        whyLine: typeof m.whyLine === "string" && m.whyLine.trim()
          ? m.whyLine.trim()
          : null,
      };
    })
    .filter((slot): slot is PlanNudgeSlot => slot !== null);
  return { status: slots.length > 0 ? "ready" : "empty", slots };
}

interface CalendarGap {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  nextEvent: CalendarEvent;
  postGapMeetingCount: number;
  postGapHasHighStakes: boolean;
}

interface WearableSignals {
  sleepScore: number | null;
  hrv: number | null;
  rhr: number | null;
  hrvBaseline30d: number | null;
  rhrBaseline30d: number | null;
  hrvDeltaPct: number | null;
  rhrElevated: boolean;
  totalSleepMinutes: number | null;
}

interface DailyContextSnapshotRead {
  supply_demand_gap_flag?: string | null;
  pattern_signals?: { sustained_deficit_flag?: boolean | null } | null;
  readiness_state?: string | null;
  readiness_score_baseline?: number | null;
  readiness_score_refined?: number | null;
  mrs_window?: string | null;
}

type PlanSlotMode = "jit" | "state" | "jit+state" | "full_arc";
type NudgeSlot = "morning" | "afternoon" | "evening";

interface PlanNudgeSlot {
  slotIndex: 0 | 1 | 2;
  slot: NudgeSlot;
  mode: PlanSlotMode;
  arcLabel: "Prepare" | "During" | "Recover" | "Steady" | string;
  jitPhase: "pre" | "during" | "post" | null;
  jitEventTitle: string | null;
  whyLine: string | null;
}

interface CoachSignals {
  pendingCommitments: Array<
    {
      text: string;
      overdueDays: number;
      patternArea: string | null;
      metaSkill: string | null;
    }
  >;
  activePatterns: Array<
    {
      description: string;
      patternArea: string | null;
      observationCount: number;
    }
  >;
  stressSignals: Array<{ topic: string; sessionId: string }>;
  lastSessionAt: Date | null;
  sessionsIn7d: number;
}

function confidenceBandFromScore(
  score: number | null | undefined,
): "high" | "medium" | "low" | "none" {
  if (typeof score !== "number" || !Number.isFinite(score)) return "low";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "none";
}

// v7 - Unified pattern store projection (read from causality_findings.signal_summary)
interface PatternSummary {
  event_to_hrv: Array<{
    event_type: string;
    n: number;
    hrvDeltaPct: number;
    rhrElevated: boolean;
    confidence: "strong" | "emerging";
    lastSeen: string;
  }>;
  event_to_rhr: Array<{
    event_type: string;
    n: number;
    rhrDeltaPct: number;
    confidence: "strong" | "emerging";
    lastSeen: string;
  }>;
  sleep_to_prs: {
    lowSleepPrsDeltaPct: number;
    n: number;
    confidence: "strong" | "emerging";
  } | null;
  consecutive_load: {
    tailDeltaPct: number;
    n: number;
    confidence: "strong" | "emerging";
  } | null;
}

interface NudgeContext {
  userId: string;
  todayStr: string;
  tomorrowStr: string;
  localHour: number;
  localMinute: number;
  localTime: number;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  briefWindow: BriefTimeWindow;
  /**
   * Batch B follow-up — IANA timezone used for ALL notification
   * decisions in this ctx. Callers MUST use `eventHourInTimezone(evt,
   * ctx.timeZone)` and `localDayBoundsUtc(date, ctx.timeZone)` rather
   * than `new Date(evt).getHours()` or `${date}T00:00:00`.
   */
  timeZone: string;
  // Calendar
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  nonNoiseEvents: CalendarEvent[];
  firstNonNoiseEvent: CalendarEvent | null;
  eventCount: number;
  highStakesEvents: CalendarEvent[];
  calendarGaps: CalendarGap[];
  dayType: "light" | "moderate" | "heavy" | "extreme";
  // Wearable
  wearable: WearableSignals;
  hasWearableData: boolean;
  wearableFreshness: "fresh" | "stale" | "missing";
  // Coach
  coach: CoachSignals;
  // Check-in
  morningCheckinOutcome: string | null;
  afternoonCheckinOutcome: string | null;
  lastCheckinTime: Date | null;
  checkinCountToday: number;
  // Mastery plan
  pendingPracticeIds: string[];
  completedPracticeIds: string[];
  planSlots: PlanNudgeSlot[] | null;
  planSnapshotStatus: "ready" | "missing" | "empty";
  // JIT
  jitEvents: Array<
    {
      eventId: string;
      eventTitle: string;
      eventStart: string;
      finalScore: number;
      externalId: string;
      confidenceBand: string;
    }
  >;
  // Performance correlations (30d)
  coachSessionReadinessLift: number | null;
  practiceCompletionCorrelation: number | null;
  // Streak
  currentStreak: number;
  // Suppression signals
  lastAppOpen: Date | null;
  inMeetingNow: boolean;
  // Energy snapshot
  hrvDeltaPctFromSnapshot: number | null;
  // v7 - Unified pattern store (cross-event historical correlations)
  pattern: PatternSummary | null;
  // V8 - Day-shape awareness (copy only). Travel/away-day and post-travel.
  // C2 (Path B, pre-launch): legacy 'ooo' kind folded into 'away-day' — the
  // canonical PTO SSOT (PTO_TITLE_RX) already matches OOO titles, and both
  // branches produced identical downstream behaviour.
  dayContext: {
    kind: "normal" | "travel-day" | "away-day";
    signalToken?: string;
    postTravel: boolean;
    // v5.3 - Travel arc sub-flags (derived from today's calendar). Each
    // rides one of the existing 3 slots - they never add a 4th send.
    preFlight?: { eventTitle: string; minutesUntil: number } | null;
    inFlight?: { eventTitle: string; minutesUntil: number } | null;
    // v5.3 - PTO / public-holiday "light touch" mode. Collapses the day to
    // a single morning nudge and skips JIT pre-event prep.
    ptoMode?: boolean;
    // Pass 8 (P - travel arc) - post-flight + meeting awareness. True when
    // yesterday was a travel day AND today has a high-stakes meeting in the
    // next 4 h. Mirrors the canonical `travelLandingPlusHighStakes` rule so
    // the copy can pivot from pure decompression to "decompress then sharpen".
    landingPlusHighStakes?: { eventTitle: string; minutesUntil: number } | null;
    /** Canonical availability decision (SSOT). Populated when the classifier
     *  ran successfully. When present, `ptoMode` is derived from this. */
    availability?: AvailabilityResult;
  };
  // §17 Week-Ahead - hydrated inputs for evaluateWeekAheadMode. Computed once
  // in buildNudgeContext from today/tomorrow/14-day-lookback calendar data so
  // the last_day_pto / last_day_holiday / last_day_long_weekend branches can
  // actually fire (previously these were stubbed undefined → never triggered).
  weekAheadInputs?: {
    ptoTodayAllDay: boolean;
    ptoTomorrowAllDay: boolean;
    holidayTodayAllDay: boolean;
    holidayTomorrowAllDay: boolean;
    tomorrowIsWorkday: boolean;
    consecutiveOffDaysBefore: number;
    travelDay: boolean;
    fullWorkingWeekend: boolean;
    /** SSOT-derived: today is a PTO / applicable holiday / weekend day. */
    todayIsOffDay: boolean;
    /** SSOT-derived: today ends a long weekend (weekend ∪ PTO/holiday). */
    isLastDayOfLongWeekend: boolean;
    /** Home country from profiles.country. Selects planning weekday. */
    homeCountry: string | null;
  };
  // v5.3 - Server-computed badge: outstanding cognitive debt the user
  // can clear today. Falls back to 1 when we cannot compute it.
  badgeCount?: number;
  // Brief↔Nudge parity - the persisted snapshot the Brief reasoned over for
  // the current (user, local_date, time_window). Loaded once in
  // buildNudgeContext; null when no Brief row exists yet (in which case
  // generateNudgeCopy falls back to evaluateForScope so we still ship the
  // canonical rule output).
  briefBehaviour?: {
    signatureHash: string;
    promptBlockBrief: string;
    taxonomyBlock: string;
    source: "brief_snapshot";
    // Part 1 - flag array surfaced so dispatch can read landingDeliveryMode
    // and suppress deep-link CTAs for travel push_only flags. Optional for
    // back-compat with snapshots written before Part 1 shipped.
    flagsBrief?: Array<{
      rule: string;
      landingDeliveryMode?: "in_app_practice" | "push_only" | "standard";
    }>;
  } | null;
  // Phase 4 — Leader voice rules + preferences from the CoS Leader
  // Profile. Populated once per user tick after buildNudgeContext.
  // Null when the profile is missing / in_progress / failed; the copy
  // generator and preference gates must treat null as "system decides".
  leaderVoiceRules?: string | null;
  leaderResetModality?: "movement" | "stillness" | "breath" | string | null;
}

interface NudgeCopy {
  title: string;
  body: string;
  variantId: string;
  // V8 telemetry - which provider produced this copy.
  // 'claude' / 'gemini' when AI succeeded, 'static' when fallback library used,
  // null when never set (defensive).
  aiProvider?: "claude" | "gemini" | "static" | null;
}

// ══════════════════════════════════════════════════════════════
// ── A/B CTA Variant System (v5.1) ──
// Goal: measure which action-verb CTA drives the highest
// Brief/Plan opens. Each user is deterministically assigned to
// one of 4 variants per nudge_type (stable across days, so groups
// are clean). The variant rewrites the trailing CTA phrase of the
// body so we A/B test the lure, not the substance.
// ══════════════════════════════════════════════════════════════

export type CtaVariant = "A" | "B" | "C" | "D";

const CTA_VARIANTS: CtaVariant[] = ["A", "B", "C", "D"];

// v8 - Meaning-Forward / Mind-Prep CTA. Every variant is a qualified
// mental-prep action verb (NEVER an unqualified "prep" - a CEO would read
// that as "prep the board deck"). The user's job is always to log in /
// check in and do MENTAL prep / recalibration / closing. Deep-link routing
// is unchanged on the payload - verbs only imply a destination, the system
// still controls the route.
const CTA_PHRASES: Record<CtaVariant, { brief: string; plan: string }> = {
  // A = control - calm, mental-prep
  A: {
    brief: "check in to set your intention",
    plan: "log in to prep your mind",
  },
  // B = state-framed
  B: { brief: "check in to recalibrate", plan: "log in to prep your state" },
  // C = urgency / recovery
  C: {
    brief: "log in to recalibrate your mind",
    plan: "log in to prep your mind",
  },
  // D = close-of-day / week (evening variants - applyCtaVariant decides
  // which 'close' verb based on deep-link route)
  D: { brief: "check in to close the day", plan: "check in to close the week" },
};

// Stable hash so the same user lands in the same bucket per nudge_type
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function assignCtaVariant(userId: string, nudgeTypeFamily: string): CtaVariant {
  // Family = 'nudge_one' | 'nudge_two' | 'nudge_three' so JIT and
  // morning variants share a bucket per family per user.
  const idx = hashString(`${userId}::${nudgeTypeFamily}`) % CTA_VARIANTS.length;
  return CTA_VARIANTS[idx];
}

function nudgeFamily(nudgeType: string): string {
  if (nudgeType.startsWith("nudge_one")) return "nudge_one";
  if (nudgeType.startsWith("nudge_two")) return "nudge_two";
  if (nudgeType.startsWith("nudge_three")) return "nudge_three";
  return nudgeType;
}

// v8 - recognise legacy V6/V7 phrases AND the new V8 qualified mind-prep
// verbs so any generated body can be rewritten to match the assigned
// variant. Anything matched here gets replaced with the variant's V8 verb.
const CTA_REWRITE_PATTERNS: { rx: RegExp; kind: "brief" | "plan" }[] = [
  // Legacy V5/V6 (still tolerated as input, normalised to V8 on rewrite)
  { rx: /open your brief/gi, kind: "brief" },
  { rx: /open the brief/gi, kind: "brief" },
  { rx: /open your plan/gi, kind: "plan" },
  { rx: /open the plan/gi, kind: "plan" },
  { rx: /open your prep plan/gi, kind: "plan" },
  { rx: /build your prep plan/gi, kind: "plan" },
  { rx: /build your plan/gi, kind: "plan" },
  { rx: /lock in your prep/gi, kind: "plan" },
  { rx: /tap to prep/gi, kind: "plan" },
  { rx: /see your prep/gi, kind: "plan" },
  { rx: /see your readiness/gi, kind: "brief" },
  { rx: /see your plan/gi, kind: "plan" },
  { rx: /recalibrate now/gi, kind: "brief" },
  { rx: /check in now/gi, kind: "brief" },
  { rx: /open the app$/gi, kind: "brief" },
  // V7 unqualified-prep verbs (banned in V8 - rewritten away)
  { rx: /open the app to prep tonight/gi, kind: "plan" },
  { rx: /open the app to prep with a cool-down/gi, kind: "plan" },
  { rx: /check into the app to prep/gi, kind: "brief" },
  { rx: /go to the app to prep/gi, kind: "plan" },
  { rx: /open the app to prep/gi, kind: "brief" },
  { rx: /\bprep now\b/gi, kind: "brief" },
  // V8 surface forms (rewritten when assigned variant differs)
  { rx: /log in to prep your mind tonight/gi, kind: "plan" },
  { rx: /log in to prep your mind/gi, kind: "plan" },
  { rx: /log in to prep your state/gi, kind: "plan" },
  { rx: /log in to recalibrate your mind/gi, kind: "brief" },
  { rx: /check in to recalibrate/gi, kind: "brief" },
  { rx: /check in to set your intention/gi, kind: "brief" },
  { rx: /check in to set tomorrow/gi, kind: "brief" },
  { rx: /check in to close the day/gi, kind: "brief" },
  { rx: /check in to close the week/gi, kind: "brief" },
  { rx: /check in to land the weekend/gi, kind: "brief" },
  { rx: /open your insights/gi, kind: "brief" },
];

// v1.1 - Brand constants for the collapsed/expanded headline contract and
// the new weekend / reminder CTA buckets.
const MIND_MODULE_TITLE = "Mind Module";
const SUBTITLE_MAX_WORDS = 3;
const SUBTITLE_MAX_CHARS = 28;
const WEEKEND_CTA = "let's prioritise the week ahead";
const WEEKEND_CTA_ROUTE = "/plan";
const REMINDER_CTA = "take 60 seconds";
const BACK_TO_BACK_MIN_GAP_MIN = 30;
const REMINDER_GAP_UPPER_MIN = 60;
const DEVICE_OFFLINE_STALE_MIN = 60;

// Legacy form recognisers so older fallbacks self-heal into the new CTAs.
const WEEKEND_LEGACY_RX: RegExp[] = [
  /plan the week/gi,
  /prioritize the week/gi,
  /prioritise the week/gi,
];
const REMINDER_LEGACY_RX: RegExp[] = [/60 seconds/gi, /sixty seconds/gi];

function clampSubtitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return "";
  const words = s.split(" ").slice(0, SUBTITLE_MAX_WORDS).join(" ");
  s = words.slice(0, SUBTITLE_MAX_CHARS);
  return s;
}

function requiresHeadlineStructure(
  title: string,
  subtitle: string,
): string | null {
  if (title !== MIND_MODULE_TITLE) {
    return `title must be "${MIND_MODULE_TITLE}"`;
  }
  if (!subtitle || !subtitle.trim()) return "subtitle missing";
  const w = subtitle.trim().split(/\s+/).length;
  if (w > SUBTITLE_MAX_WORDS) {
    return `subtitle > ${SUBTITLE_MAX_WORDS} words (${w})`;
  }
  if (subtitle.length > SUBTITLE_MAX_CHARS) {
    return `subtitle > ${SUBTITLE_MAX_CHARS} chars (${subtitle.length})`;
  }
  return null;
}

/** Force the body's terminal CTA verb to a specific allowed verb. Used by
 *  the weekend / reminder buckets where the variant comparator doesn't apply. */
function forceCtaVerb(body: string, verb: string): string {
  let stripped = body.trim().replace(/[.\s!?]+$/, "");
  for (const p of CTA_REWRITE_PATTERNS) {
    stripped = stripped.replace(p.rx, "").trim();
  }
  for (const rx of WEEKEND_LEGACY_RX) {
    stripped = stripped.replace(rx, "").trim();
  }
  for (const rx of REMINDER_LEGACY_RX) {
    stripped = stripped.replace(rx, "").trim();
  }
  stripped = stripped.replace(/[,;:\s]+$/, "");
  return `${stripped}, ${verb}`.slice(0, 160);
}

function applyCtaVariant(
  copy: NudgeCopy,
  variant: CtaVariant,
  deepLinkRoute: string,
): NudgeCopy {
  // Variant A is the control - leave body untouched but tag it.
  if (variant === "A") {
    return { ...copy, variantId: `${copy.variantId}::A` };
  }

  let body = copy.body;
  let rewrote = false;
  for (const p of CTA_REWRITE_PATTERNS) {
    if (p.rx.test(body)) {
      const phrase = CTA_PHRASES[variant][p.kind];
      body = body.replace(p.rx, phrase);
      rewrote = true;
    }
  }

  // No canonical phrase found - append a CTA so the experiment still runs.
  if (!rewrote) {
    const kind: "brief" | "plan" = deepLinkRoute === "/executive-home"
      ? "plan"
      : "brief";
    const phrase = CTA_PHRASES[variant][kind];
    body = body.replace(/[.\s]+$/, "");
    body = `${body}, ${phrase}`;
  }

  return {
    ...copy,
    body: body.substring(0, 160),
    variantId: `${copy.variantId}::${variant}`,
  };
}

interface QualifiedNudge {
  type: string;
  copy: NudgeCopy;
  deepLinkRoute: string;
  eventReference?: string;
  commitmentText?: string;
  meetingTitle?: string;
  priority: number;
  // v7 - JIT-or-State anchoring + slot + signal strength for the comparator
  anchorKind: "jit" | "state";
  slot: "morning" | "afternoon" | "evening";
  signalStrength: number; // 0..3 - higher wins ties (e.g., pattern-cited JIT > plain JIT)
}

// ── v7 helpers: pattern store reader + event classifier ────────────────

// Event→bucket lookup against the persisted pattern store is delegated to
// the shared pattern-bucket resolver in `_shared/events/event-classifier.ts`.
// It preserves the historical `signal_summary` label set while resolving
// from canonical subtypes first, so writers/readers no longer drift on
// parallel keyword tables.
import {
  classifyEvent,
  classifyPatternBucket as classifyEventForPattern,
  isHighStakesTitle,
} from "../_shared/events/event-classifier.ts";

async function loadPatternSummary(
  supabase: SupabaseLoose,
  userId: string,
): Promise<PatternSummary | null> {
  const { data, error } = await supabase
    .from("causality_findings")
    .select("signal_summary")
    .eq("user_id", userId)
    .eq("pattern_kind", "cause_effect_v2")
    .order("computed_for_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[smart-nudges v7] loadPatternSummary error:", error.message);
    return null;
  }
  const sig = (data as any)?.signal_summary;
  if (!sig) return null;
  return {
    event_to_hrv: Array.isArray(sig.event_to_hrv) ? sig.event_to_hrv : [],
    event_to_rhr: Array.isArray(sig.event_to_rhr) ? sig.event_to_rhr : [],
    sleep_to_prs: sig.sleep_to_prs ?? null,
    consecutive_load: sig.consecutive_load ?? null,
  };
}

function findEventPattern(
  pattern: PatternSummary | null,
  eventTitle: string | null | undefined,
): {
  hrvDeltaPct: number;
  n: number;
  rhrElevated: boolean;
  confidence: "strong" | "emerging";
} | null {
  if (!pattern) return null;
  const bucket = classifyEventForPattern(eventTitle);
  if (!bucket) return null;
  const hit = pattern.event_to_hrv.find((p) => p.event_type === bucket);
  if (!hit) return null;
  if (hit.confidence !== "strong" && hit.confidence !== "emerging") return null;
  if (hit.hrvDeltaPct >= 0 && !hit.rhrElevated) return null;
  return hit;
}

function suppressJitForNotificationOnlyCategory(
  eventTitle: string | null | undefined,
): boolean {
  const subtype = classifyEvent(eventTitle);
  if (!subtype) return false;
  const category = EVENT_CATEGORIES[subtype.categoryId];
  return category?.protocol.duringNotificationOnly === true;
}

function buildSharedEventFrameLine(
  eventTitle: string | null | undefined,
): string {
  const frame = buildActionFrameForEvent(eventTitle, "pre");
  return frame ? `- Shared event frame: ${frame}` : "";
}

function resolveMorningAnchorWindow(
  ctx: Pick<NudgeContext, "firstNonNoiseEvent" | "timeZone" | "dayOfWeek">,
): { morningStart: number; morningEnd: number } {
  let morningStart = GLOBAL_EARLIEST_LOCAL;
  let morningEnd = 9.5;

  if (ctx.firstNonNoiseEvent) {
    const eventHour = eventHourInTimezone(
      ctx.firstNonNoiseEvent.start_time,
      ctx.timeZone,
    );
    const title = (ctx.firstNonNoiseEvent.title || "").toLowerCase();
    const isVirtual = title.includes("zoom") || title.includes("teams") ||
      title.includes("call") || title.includes("video") ||
      title.includes("virtual");
    const leadHours = isVirtual ? 1.0 : 1.5;
    const idealStart = eventHour - leadHours;
    morningStart = Math.max(GLOBAL_EARLIEST_LOCAL, Math.min(idealStart, 10.0));
    morningEnd = Math.max(morningStart + 1.0, eventHour - 0.25);
  }

  if (ctx.dayOfWeek === 6) {
    morningStart = Math.max(morningStart, 9.0);
    morningEnd = Math.max(morningEnd, 11.0);
  }

  if (ctx.dayOfWeek === 0 || (ctx.dayOfWeek === 6 && !ctx.firstNonNoiseEvent)) {
    morningStart = 9.0;
    morningEnd = 10.5;
  }

  return { morningStart, morningEnd };
}

function isWithinMorningAnchorWindow(
  ctx: Pick<
    NudgeContext,
    "localTime" | "firstNonNoiseEvent" | "timeZone" | "dayOfWeek"
  >,
): boolean {
  const { morningStart, morningEnd } = resolveMorningAnchorWindow(ctx);
  return ctx.localTime >= morningStart && ctx.localTime < morningEnd;
}

async function shouldAllowProjectedMorningJit(
  ctx: NudgeContext,
  slotEventTitle: string,
  matchingJit: NudgeContext["jitEvents"][number] | null,
  minutesUntil: number | null,
  sentEventRefs: Set<string>,
  supabase: SupabaseLoose,
): Promise<boolean> {
  if (!matchingJit) return false;
  if (matchingJit.confidenceBand === "none") return false;
  if (sentEventRefs.has(matchingJit.externalId)) return false;
  if (suppressJitForNotificationOnlyCategory(slotEventTitle)) return false;
  if (minutesUntil === null || minutesUntil < 30 || minutesUntil > 180) {
    return false;
  }

  const { data: jitPlan } = await supabase
    .from("jit_event_context")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("id", matchingJit.eventId)
    .eq("dismissed_by_user", false)
    .limit(1);
  if (!jitPlan || jitPlan.length === 0) return false;

  const { data: ledgerRows } = await supabase
    .from("daily_ritual_completions")
    .select("plan_ledger")
    .eq("user_id", ctx.userId)
    .eq("ritual_date", ctx.todayStr);
  const ledger = (ledgerRows || []).flatMap((r: any) =>
    (r.plan_ledger as any[]) || []
  );
  const evtBucket = slotEventTitle.toLowerCase();
  const prepDone = ledger.some((p: any) => {
    const status = String(p?.status || "").toLowerCase();
    const ref = String(p?.event_reference || "").toLowerCase();
    const title = String(p?.title || "").toLowerCase();
    return status === "completed" && (
      ref === matchingJit.externalId.toLowerCase() ||
      (evtBucket && (ref.includes(evtBucket) || title.includes(evtBucket)))
    );
  });
  return !prepDone;
}

// ══════════════════════════════════════════════════════════════
// ── buildNudgeContext() – Central Signal Assembly ──
// ══════════════════════════════════════════════════════════════

async function buildNudgeContext(
  supabase: SupabaseLoose,
  userId: string,
  todayStr: string,
  tomorrowStr: string,
  localHour: number,
  localMinute: number,
  dayOfWeek: number,
  currentStreak: number,
  lastAppOpen: Date | null,
  timeZone: string = "UTC",
): Promise<NudgeContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();
  // V8 - yesterday's date string (user-local) for post-travel awareness.
  // Compute purely in the user's timezone to survive DST + midnight.
  const yesterdayStr = (() => {
    const anchorUtc = new Date(`${todayStr}T12:00:00Z`).getTime() -
      24 * 60 * 60 * 1000;
    return localParts(timeZone, new Date(anchorUtc)).localDate;
  })();

  // Batch B follow-up: every calendar query below must scope by the
  // UTC boundaries of the user's LOCAL day, not by naive
  // `${date}T00:00:00` strings (which parse as server-local ≡ UTC on
  // edge functions and skew calendar fetches by the user's UTC offset).
  const todayBounds = localDayBoundsUtc(todayStr, timeZone);
  const tomorrowBounds = localDayBoundsUtc(tomorrowStr, timeZone);
  const yesterdayBounds = localDayBoundsUtc(yesterdayStr, timeZone);

  // All queries in parallel
  const [
    { data: todayEventsRaw },
    { data: tomorrowEventsRaw },
    { data: yesterdayEventsRaw },
    { data: latestWearable },
    { data: wearable30d },
    { data: latestSnapshot },
    { data: pendingCommitments },
    { data: activePatterns },
    { data: recentSessions },
    { data: todayCheckins },
    { data: todayRituals },
    { data: jitEventsRaw },
    { data: practiceSessions30d },
    { data: checkins30d },
  ] = await Promise.all([
    supabase.from("primary_calendar_events")
      .select(
        "id, title, start_time, end_time, external_id, is_organizer, attendees_count",
      )
      .eq("user_id", userId)
      .gte("start_time", todayBounds.startUtc)
      .lt("start_time", todayBounds.endUtc)
      .order("start_time", { ascending: true }),
    supabase.from("primary_calendar_events")
      .select(
        "id, title, start_time, end_time, external_id, is_organizer, attendees_count",
      )
      .eq("user_id", userId)
      .gte("start_time", tomorrowBounds.startUtc)
      .lt("start_time", tomorrowBounds.endUtc)
      .order("start_time", { ascending: true }),
    supabase.from("primary_calendar_events")
      .select("id, title, start_time")
      .eq("user_id", userId)
      .gte("start_time", yesterdayBounds.startUtc)
      .lt("start_time", yesterdayBounds.endUtc),
    supabase.from("wearable_data")
      .select(
        "hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date",
      )
      .eq("user_id", userId)
      .order("summary_date", { ascending: false })
      .limit(1),
    supabase.from("wearable_data")
      .select("hrv, resting_heart_rate")
      .eq("user_id", userId)
      .gte("summary_date", thirtyDaysAgo.split("T")[0])
      .not("hrv", "is", null),
    supabase.from("energy_snapshots")
      .select("oura_readiness, computed_data")
      .eq("user_id", userId)
      .eq("snapshot_date", todayStr)
      .limit(1)
      .maybeSingle(),
    supabase.from("coach_accountability_tracker")
      .select(
        "commitment_text, committed_at, check_in_due_date, status, pattern_area, meta_skill",
      )
      .eq("user_id", userId)
      .eq("status", "pending"),
    supabase.from("coach_pattern_observations")
      .select("pattern_description, pattern_area, observation_count")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("observation_count", { ascending: false })
      .limit(5),
    supabase.from("dialogue_sessions")
      .select("id, started_at, session_title, flow_type")
      .eq("user_id", userId)
      .eq("flow_type", "coach")
      .gte("started_at", sevenDaysAgo)
      .order("started_at", { ascending: false }),
    supabase.from("daily_checkins")
      .select("outcome, time_window, timestamp")
      .eq("user_id", userId)
      .eq("checkin_date", todayStr)
      .order("timestamp", { ascending: true }),
    supabase.from("daily_ritual_completions")
      .select(
        "recommended_practice_ids, completed_practice_ids, session_period, completion_status",
      )
      .eq("user_id", userId)
      .eq("ritual_date", todayStr),
    supabase.from("jit_event_context")
      .select("id, event_title, event_start, final_score, jit_confidence_score")
      .eq("user_id", userId)
      .gte("event_start", new Date(now.getTime() + 30 * 60000).toISOString())
      .lte("event_start", new Date(now.getTime() + 360 * 60000).toISOString())
      .gte("final_score", 55)
      .order("final_score", { ascending: false }),
    supabase.from("practice_sessions")
      .select("completed_at, completed, content_id")
      .eq("user_id", userId)
      .eq("completed", true)
      .gte("created_at", thirtyDaysAgo),
    supabase.from("daily_checkins")
      .select("checkin_date, outcome, time_window")
      .eq("user_id", userId)
      .gte("checkin_date", thirtyDaysAgo.split("T")[0])
      .order("checkin_date", { ascending: true }),
  ]);

  // §17 Week-Ahead lookback: pull the last 14 days of events (titles + start
  // dates only) so we can derive consecutiveOffDaysBefore + post-PTO return-
  // day detection without inflating the main parallel batch.
  const lookbackStartStr = (() => {
    const d = new Date(`${todayStr}T00:00:00`);
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  })();
  const { data: lookbackEventsRaw } = await supabase
    .from("primary_calendar_events")
    // calendar_summary column does not exist on calendar_events / views; consumers tolerate null.
    .select(
      "title, start_time, end_time, is_organizer, attendees_count, is_all_day",
    )
    .eq("user_id", userId)
    .gte("start_time", `${lookbackStartStr}T00:00:00`)
    .lte("start_time", `${todayStr}T00:00:00`);
  const lookbackEvents = mergeCalendarRows(lookbackEventsRaw || []);

  // Fetch session summaries separately (depends on recentSessions)
  const sessionIds = (recentSessions || []).map((s) => s.id).filter(Boolean);
  const { data: sessionSummaries } = sessionIds.length > 0
    ? await supabase.from("coach_session_summaries")
      .select("session_id, key_topics, commitments_made")
      .in("session_id", sessionIds)
    : { data: [] as any[] };

  // Process wearable signals
  const latestW = latestWearable?.[0];
  const hasWearableData = latestW !== null && latestW !== undefined;
  const wearableFreshness: "fresh" | "stale" | "missing" = !hasWearableData
    ? "missing"
    : latestW?.summary_date === todayStr
    ? "fresh"
    : "stale";
  const hasFreshWearableData = wearableFreshness === "fresh";

  const hrvValues = (wearable30d || []).map((w) => w.hrv).filter((
    v,
  ): v is number => v !== null);
  const rhrValues = (wearable30d || []).map((w) => w.resting_heart_rate).filter(
    (v): v is number => v !== null,
  );
  const hrvBaseline = hrvValues.length > 0
    ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
    : null;
  const rhrBaseline = rhrValues.length > 0
    ? rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length
    : null;

  const hrvDeltaPct = (latestW?.hrv && hrvBaseline)
    ? Math.round(((latestW.hrv - hrvBaseline) / hrvBaseline) * 100)
    : null;
  const rhrElevated = (latestW?.resting_heart_rate && rhrBaseline)
    ? latestW.resting_heart_rate > rhrBaseline * 1.1
    : false;

  const snapshotComputed = latestSnapshot?.computed_data as
    | Record<string, unknown>
    | null;
  const hrvDeltaPctFromSnapshot = hasFreshWearableData
    ? snapshotComputed?.hrv_delta_pct as number | null ?? hrvDeltaPct
    : null;

  // Process calendar
  const todayEvents = mergeCalendarRows(todayEventsRaw || []);
  const tomorrowEvents = mergeCalendarRows(tomorrowEventsRaw || []);
  const nonNoiseEvents = todayEvents.filter((e) =>
    !isNoiseEvent(e.title || "")
  );
  const highStakesEvents = nonNoiseEvents.filter((e) => isHighStakes(e.title));

  const eventCount = nonNoiseEvents.length;
  let dayType: "light" | "moderate" | "heavy" | "extreme" = "light";
  if (eventCount >= 8) dayType = "extreme";
  else if (eventCount >= 6) dayType = "heavy";
  else if (eventCount >= 3) dayType = "moderate";

  // Calendar gaps (≥20 min between events)
  const calendarGaps: CalendarGap[] = [];
  for (let i = 0; i < nonNoiseEvents.length - 1; i++) {
    const currentEnd = new Date(nonNoiseEvents[i].end_time);
    const nextStart = new Date(nonNoiseEvents[i + 1].start_time);
    const gapMs = nextStart.getTime() - currentEnd.getTime();
    const gapMinutes = gapMs / 60000;
    if (gapMinutes >= 20) {
      const postGapEvents = nonNoiseEvents.slice(i + 1);
      calendarGaps.push({
        startTime: currentEnd,
        endTime: nextStart,
        durationMinutes: Math.round(gapMinutes),
        nextEvent: nonNoiseEvents[i + 1],
        postGapMeetingCount: postGapEvents.length,
        postGapHasHighStakes: postGapEvents.some((e) => isHighStakes(e.title)),
      });
    }
  }

  const inMeetingNow = todayEvents.some((e) => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    return now >= start && now <= end;
  });

  // Coach signals
  const commitments = (pendingCommitments || []).map((c) => {
    const dueDate = c.check_in_due_date ? new Date(c.check_in_due_date) : null;
    const overdueDays = dueDate
      ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000))
      : 0;
    return {
      text: c.commitment_text,
      overdueDays,
      patternArea: c.pattern_area,
      metaSkill: c.meta_skill,
    };
  });

  const stressSignals: Array<{ topic: string; sessionId: string }> = [];
  for (const summary of (sessionSummaries || [])) {
    const topics = summary.key_topics as string[] | null;
    if (topics) {
      for (const topic of topics) {
        const lower = topic.toLowerCase();
        if (
          lower.includes("stress") || lower.includes("anxiety") ||
          lower.includes("worried") ||
          lower.includes("nervous") || lower.includes("overwhelm") ||
          lower.includes("dread")
        ) {
          stressSignals.push({ topic, sessionId: summary.session_id });
        }
      }
    }
  }

  const lastCoachSession = recentSessions?.[0];
  const lastSessionAt = lastCoachSession?.started_at
    ? new Date(lastCoachSession.started_at)
    : null;

  // Check-in data
  const morningCheckin = (todayCheckins || []).find((c) =>
    c.time_window === "morning"
  );
  const afternoonCheckin = (todayCheckins || []).find((c) =>
    c.time_window === "afternoon"
  );
  const lastCheckin = (todayCheckins || []).length > 0
    ? new Date(
      (todayCheckins || [])[(todayCheckins || []).length - 1].timestamp,
    )
    : null;

  // Mastery plan
  const allRecommended = (todayRituals || []).flatMap((r) =>
    r.recommended_practice_ids || []
  );
  const allCompleted = (todayRituals || []).flatMap((r) =>
    r.completed_practice_ids || []
  );
  const pendingPracticeIds = allRecommended.filter((id) =>
    !allCompleted.includes(id)
  );

  // Performance correlation
  let coachSessionReadinessLift: number | null = null;
  let practiceCompletionCorrelation: number | null = null;

  if ((checkins30d || []).length >= 10) {
    const checkinMap = new Map<string, string>();
    for (const c of (checkins30d || [])) {
      if (c.time_window === "morning") {
        checkinMap.set(c.checkin_date, c.outcome);
      }
    }

    const coachSessionDates = new Set(
      (recentSessions || []).map((s) => s.started_at?.split("T")[0]).filter(
        Boolean,
      ),
    );
    const coachDayAfterOutcomes: string[] = [];
    const nonCoachDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      if (coachSessionDates.has(prevDateStr)) {
        coachDayAfterOutcomes.push(outcome);
      } else {
        nonCoachDayOutcomes.push(outcome);
      }
    }

    const outcomeScore = (o: string) =>
      o === "peak"
        ? 5
        : o === "strong"
        ? 4
        : o === "steady"
        ? 3
        : o === "managing"
        ? 2
        : 1;

    if (coachDayAfterOutcomes.length >= 2 && nonCoachDayOutcomes.length >= 2) {
      const coachAvg = coachDayAfterOutcomes.reduce((a, o) =>
        a + outcomeScore(o), 0) / coachDayAfterOutcomes.length;
      const nonCoachAvg = nonCoachDayOutcomes.reduce((a, o) =>
        a + outcomeScore(o), 0) / nonCoachDayOutcomes.length;
      if (nonCoachAvg > 0) {
        coachSessionReadinessLift = Math.round(
          ((coachAvg - nonCoachAvg) / nonCoachAvg) * 100,
        );
      }
    }

    const practiceDates = new Set(
      (practiceSessions30d || []).map((p) => p.completed_at?.split("T")[0])
        .filter(Boolean),
    );
    const practiceDayAfterOutcomes: string[] = [];
    const noPracticeDayOutcomes: string[] = [];

    for (const [date, outcome] of checkinMap) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      if (practiceDates.has(prevDateStr)) {
        practiceDayAfterOutcomes.push(outcome);
      } else {
        noPracticeDayOutcomes.push(outcome);
      }
    }

    if (
      practiceDayAfterOutcomes.length >= 2 && noPracticeDayOutcomes.length >= 2
    ) {
      const practiceAvg = practiceDayAfterOutcomes.reduce((a, o) =>
        a + outcomeScore(o), 0) / practiceDayAfterOutcomes.length;
      const noPracticeAvg = noPracticeDayOutcomes.reduce((a, o) =>
        a + outcomeScore(o), 0) / noPracticeDayOutcomes.length;
      if (noPracticeAvg > 0) {
        practiceCompletionCorrelation = Math.round(
          ((practiceAvg - noPracticeAvg) / noPracticeAvg) * 100,
        );
      }
    }
  }

  // JIT events
  const jitEvents = (jitEventsRaw || []).map((e) => ({
    eventId: e.id,
    eventTitle: e.event_title,
    eventStart: e.event_start,
    finalScore: e.final_score || 0,
    externalId: e.id,
    confidenceBand: confidenceBandFromScore(e.jit_confidence_score),
  }));

  // Determine the Brief's time window for the snapshot lookup. Mirrors
  // _shared/signal-engine/day-kind-detector.ts:getTimeOfDay() so the
  // Nudge reads the SAME row the Brief wrote for this window.
  const briefWindow: BriefTimeWindow = localHour >= 5 && localHour < 12
    ? "morning"
    : localHour >= 12 && localHour < 18
    ? "afternoon"
    : "evening";
  const loadedSnap = await loadBriefBehaviourSnapshot(
    supabase,
    userId,
    todayStr,
    briefWindow,
    // Disambiguate by current Brief prompt-version so stale prior-version
    // rows in the same window cannot win the "latest" ordering.
    { promptVersion: BRIEF_PROMPT_VERSION },
  );
  const briefBehaviour = loadedSnap
    ? {
      signatureHash: loadedSnap.signatureHash,
      promptBlockBrief: loadedSnap.promptBlockBrief ??
        snapshotToWiring(loadedSnap, "nudge")?.promptBlock ??
        "",
      taxonomyBlock: loadedSnap.taxonomyBlock,
      source: "brief_snapshot" as const,
      flagsBrief: Array.isArray(loadedSnap.flagsBrief)
        ? loadedSnap.flagsBrief.map((f: any) => ({
          rule: String(f?.rule ?? ""),
          landingDeliveryMode: f?.landingDeliveryMode,
        }))
        : undefined,
    }
    : null;
  console.log(
    `[smart-nudges] briefBehaviour ${
      briefBehaviour
        ? `loaded sig=${briefBehaviour.signatureHash}`
        : "absent - will fall back to evaluateForScope"
    } user=${userId} date=${todayStr} window=${briefWindow}`,
  );
  const planSlotRead = await loadPlanNudgeSlots(
    supabase,
    userId,
    todayStr,
    briefWindow,
  );
  console.log(
    `[smart-nudges] planSlots status=${planSlotRead.status} count=${
      planSlotRead.slots?.length ?? 0
    } user=${userId} date=${todayStr} window=${briefWindow}`,
  );

  // Canonical Availability SSOT — one classification per tick, shared by
  // dayContext.ptoMode and weekAheadInputs.pto/holidayTodayAllDay below.
  // Country is fetched best-effort so region-qualified holidays are gated
  // by geography, not title regex; failure falls back to null (unqualified
  // titles still apply → matches legacy behaviour).
  let userHomeCountry: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("country")
      .eq("id", userId)
      .maybeSingle();
    userHomeCountry = (prof as { country?: string | null } | null)?.country ??
      null;
  } catch (_e) { /* best-effort — classifier degrades gracefully */ }
  let nudgeAvailability: AvailabilityResult | undefined;
  try {
    nudgeAvailability = classifyAvailability({
      now,
      userHomeCountry,
      userCurrentCountry: null,
      events: (todayEvents || []).map((e: any) => ({
        title: String(e?.title ?? ""),
        startTime: String(e?.start_time ?? ""),
        endTime: String(e?.end_time ?? e?.start_time ?? ""),
        isAllDay: e?.is_all_day === true ||
          ((new Date(e?.end_time ?? e?.start_time ?? 0).getTime() -
            new Date(e?.start_time ?? 0).getTime()) >= 20 * 3600 * 1000),
        isOrganizer: e?.is_organizer === true,
        attendeesCount: Number(e?.attendees_count ?? 0) || 0,
        source: e?.source ?? e?.calendar_name ?? null,
        calendarSummary: e?.calendar_summary ?? null,
      })),
    });
    console.log(
      `[smart-nudges][availability] user=${userId} state=${nudgeAvailability.state} isRestDay=${nudgeAvailability.isRestDay} reason=${nudgeAvailability.reason} country=${
        userHomeCountry ?? "null"
      }`,
    );
  } catch (avErr) {
    console.warn(
      "[smart-nudges][availability] classifier failed:",
      avErr instanceof Error ? avErr.message : avErr,
    );
  }

  return {
    userId,
    todayStr,
    tomorrowStr,
    localHour,
    localMinute,
    localTime: localHour + localMinute / 60,
    dayOfWeek,
    dayName: DAYS[dayOfWeek],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    // Batch B follow-up: `briefWindow` is used downstream in the
    // plan-empty-fallback warning. Previously it lived only in this
    // function's scope and referencing it at the top-level evaluator
    // threw `ReferenceError: briefWindow is not defined`, surfacing as
    // a 500 on every live tick that hit the fallback path.
    briefWindow,
    timeZone,
    todayEvents,
    tomorrowEvents,
    nonNoiseEvents,
    firstNonNoiseEvent: nonNoiseEvents.length > 0 ? nonNoiseEvents[0] : null,
    eventCount,
    highStakesEvents,
    calendarGaps,
    dayType,
    wearable: {
      sleepScore: hasFreshWearableData ? latestW?.sleep_score ?? null : null,
      hrv: hasFreshWearableData ? latestW?.hrv ?? null : null,
      rhr: hasFreshWearableData ? latestW?.resting_heart_rate ?? null : null,
      hrvBaseline30d: hrvBaseline,
      rhrBaseline30d: rhrBaseline,
      hrvDeltaPct: hasFreshWearableData ? hrvDeltaPct : null,
      rhrElevated: hasFreshWearableData ? rhrElevated : false,
      totalSleepMinutes: hasFreshWearableData
        ? latestW?.total_sleep_minutes ?? null
        : null,
    },
    hasWearableData: hasFreshWearableData,
    wearableFreshness,
    coach: {
      pendingCommitments: commitments,
      activePatterns: (activePatterns || []).map((p) => ({
        description: p.pattern_description,
        patternArea: p.pattern_area,
        observationCount: p.observation_count || 0,
      })),
      stressSignals,
      lastSessionAt,
      sessionsIn7d: (recentSessions || []).length,
    },
    morningCheckinOutcome: morningCheckin?.outcome || null,
    afternoonCheckinOutcome: afternoonCheckin?.outcome || null,
    lastCheckinTime: lastCheckin,
    checkinCountToday: (todayCheckins || []).length,
    pendingPracticeIds,
    completedPracticeIds: allCompleted,
    planSlots: planSlotRead.slots,
    planSnapshotStatus: planSlotRead.status,
    jitEvents,
    coachSessionReadinessLift,
    practiceCompletionCorrelation,
    currentStreak,
    lastAppOpen,
    inMeetingNow,
    hrvDeltaPctFromSnapshot,
    pattern: null, // Hydrated by main handler before evaluators run
    dayContext: (() => {
      const today = detectDayKindFromEvents(todayEvents);
      const yesterday = detectDayKindFromEvents(
        mergeCalendarRows(yesterdayEventsRaw || []),
      );
      // v5.3 - Travel arc sub-flags. Travel-event detection AND the pre-flight
      // / in-flight windowing are delegated to the canonical ceo-behaviour
      // module so Brief / Plan / Nudges share one travel sub-arc taxonomy.
      let preFlight: { eventTitle: string; minutesUntil: number } | null = null;
      let inFlight: { eventTitle: string; minutesUntil: number } | null = null;
      if (today.kind === "travel-day") {
        preFlight = detectPreFlightTravelEvent(todayEvents, now);
        inFlight = detectInFlightTravelEvent(todayEvents, now);
      }
      // Pass 8 (P) - post-flight + meeting awareness. Only meaningful when
      // yesterday was travel OR today already landed (preFlight==null but a
      // travel event has ended). Fires when the next high-stakes meeting is
      // within the next 4 h. Pure read of existing arrays - no extra query.
      const postTravelToday = yesterday.kind === "travel-day";
      let landingPlusHighStakes:
        | { eventTitle: string; minutesUntil: number }
        | null = null;
      if (postTravelToday) {
        const nowMs = now.getTime();
        const next = highStakesEvents
          .map((e) => ({
            e,
            minutesUntil: Math.round(
              (new Date(e.start_time).getTime() - nowMs) / 60000,
            ),
          }))
          .filter((x) => x.minutesUntil >= 0 && x.minutesUntil <= 240)
          .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
        if (next) {
          landingPlusHighStakes = {
            eventTitle: next.e.title || "high-stakes meeting",
            minutesUntil: next.minutesUntil,
          };
        }
      }
      return {
        kind: today.kind,
        signalToken: today.signalToken,
        postTravel: postTravelToday,
        preFlight,
        inFlight,
        // Canonical Availability SSOT — Nudges must not treat foreign
        // regional holidays (e.g. "Bank Holiday (N Ireland)" for a
        // GB-ENG user) or empty calendars as PTO, and must treat
        // weekend-with-work-meetings as WORKDAY. Legacy `today.kind`
        // detection retained above only for travel/signalToken plumbing.
        ptoMode: nudgeAvailability
          ? (nudgeAvailability.state === "PTO" ||
            nudgeAvailability.state === "PUBLIC_HOLIDAY")
          : (today.kind === "away-day"),
        landingPlusHighStakes,
        availability: nudgeAvailability,
      };
    })(),
    weekAheadInputs: (() => {
      const today = detectDayKindFromEvents(todayEvents);
      const tomorrow = detectDayKindFromEvents(tomorrowEvents);
      // Map kind → PTO vs holiday signals. The shared classifier doesn't
      // distinguish PTO from public holidays from a bare title. C2 (Path B):
      // legacy 'ooo' kind is gone; a single 'away-day' covers both. Week-
      // ahead-mode collapses both to the same outcome (active=true,
      // lookahead=7); the distinction only shapes telemetry.
      // Canonical override: consult the availability SSOT. When it says
      // WORKDAY (empty weekday, or work-evidence override on a
      // weekend/holiday), zero both PTO and holiday flags so the week-
      // ahead evaluator does NOT fire post-PTO / post-holiday branches.
      const ptoTodayAllDayLegacy = today.kind === "away-day";
      const holidayTodayAllDayLegacy = false;
      const availOverride = nudgeAvailability;
      const ptoTodayAllDay = availOverride
        ? availOverride.state === "PTO"
        : ptoTodayAllDayLegacy;
      const holidayTodayAllDay = availOverride
        ? availOverride.state === "PUBLIC_HOLIDAY"
        : holidayTodayAllDayLegacy;
      const ptoTomorrowAllDay = tomorrow.kind === "away-day";
      const holidayTomorrowAllDay = false;
      const tomorrowDow = (dayOfWeek + 1) % 7;
      const tomorrowIsWeekend = tomorrowDow === 0 || tomorrowDow === 6;
      const tomorrowIsWorkday = !ptoTomorrowAllDay && !holidayTomorrowAllDay &&
        !tomorrowIsWeekend;
      // §17.7 - Fail-open per-signal hydration. Each upstream source
      // (today/tomorrow calendar, 14-day lookback) defaults to a SAFE
      // value when missing so the evaluator can still run; we emit a
      // structured [week-ahead-hydration] log line for every defaulted
      // field so a week of silence is diagnosable from logs alone.
      const defaults: string[] = [];
      if (!Array.isArray(todayEvents) || todayEvents.length === 0) {
        defaults.push("todayEvents=empty");
      }
      if (!Array.isArray(tomorrowEvents) || tomorrowEvents.length === 0) {
        defaults.push("tomorrowEvents=empty");
      }
      if (!Array.isArray(lookbackEvents) || lookbackEvents.length === 0) {
        defaults.push("lookbackEvents=empty");
      }
      // Walk back from yesterday counting consecutive off-days (PTO / holiday
      // / weekend / empty calendar). Stop at the first work-day. Bounded to
      // 14 days so a quiet calendar can't run away.
      //
      // ─── DATE GRANULARITY + DST CAVEAT ─────────────────────────────────
      // Date boundaries are computed in **UTC calendar days**, not the
      // user's local calendar. `cursor` is constructed from
      // `${todayStr}T00:00:00` (no Z) - JS parses that as **local** to the
      // runtime (Deno edge worker = UTC), so `cursor` is effectively
      // midnight UTC on `todayStr`. We then decrement by `setDate(-1)`
      // (24h hops, no DST awareness) and key into `byDate` using
      // `cursor.toISOString().slice(0, 10)` - a UTC date string.
      //
      // The lookback event map (`byDate`) is also keyed by
      // `start_time.slice(0, 10)`, i.e. the UTC date of the event start
      // (not the user's local date). So whenever a user's local date and
      // the event's UTC date diverge - late-evening events in
      // Europe/London winter (UTC=local, no skew), or any event after
      // ~20:00 local in EST, or every event during BST/EDT summer hours
      // near midnight - an event can be filed under the "wrong" calendar
      // bucket relative to the user's perception of the day.
      //
      // Concrete DST failure mode - Europe/London, late-March
      // spring-forward (e.g. 2026-03-29):
      //   * Sat 2026-03-28: PTO all day. Sun 2026-03-29: clocks jump
      //     01:00 → 02:00 BST, user is on PTO. Mon 2026-03-30: PTO.
      //   * The walk-back from Tue 2026-03-31 decrements via
      //     `setDate(-1)`, which is 24h hops in the worker's UTC frame.
      //     Mon (UTC) → Sun (UTC) → Sat (UTC) all line up with the
      //     user's local PTO days here because all-day events are
      //     date-only (their `start_time` is `YYYY-MM-DDT00:00:00Z` or
      //     similar), so DST does not shift the date key.
      //   * The bug surfaces with **timed** events near local midnight:
      //     a timed meeting at Sun 2026-03-29 23:30 BST has
      //     `start_time = '2026-03-29T22:30:00Z'` → bucketed under
      //     2026-03-29 (correct). But a timed meeting at Sun 2026-10-25
      //     00:30 BST (fall-back day, before 02:00 GMT switch) has
      //     `start_time = '2026-10-24T23:30:00Z'` → bucketed under
      //     2026-10-24, so Sunday looks empty (off-day) and Saturday
      //     looks worked even though the user considers Sunday worked.
      //     `consecutiveOffDaysBefore` would then be inflated by 1.
      //
      // REALISTIC IMPACT: only `last_day_long_weekend_evening` depends
      // on `>= 2` consecutive off-days, so a ±1 miscount fires the
      // picker one local day early/late for users who happen to have a
      // timed event within ~1h of local midnight on the DST boundary.
      // Empirically that is ≪ 1 user per DST event in our base; bounded
      // upper estimate ≈ 1–2 users/year. All-day PTO/holiday events are
      // unaffected because they are stored as date-only and never shift.
      //
      // FIX-SIZE ESTIMATE (if we ever decide to do it): ~20-30 LOC.
      // Compute the user-local date for each lookback event using the
      // already-available `tzOffset` (or a real IANA-aware helper) and
      // key `byDate` by that local date string; then walk the cursor in
      // **local-date** space (e.g. format-and-parse via
      // `formatInTimeZone(..., timezone, 'yyyy-MM-dd')`). Add a
      // regression test covering the Oct fall-back case above. Not
      // implemented today - see WEEK_AHEAD_TRIGGER_VERIFICATION.sql
      // header for cross-reference.
      // ────────────────────────────────────────────────────────────────────
      // Canonical Availability SSOT lookback. We bucket each event under its
      // UTC calendar day (matching the DST caveat above) and hand the day's
      // events to `classifyDay`, which uses the SAME rules as the "today"
      // branch: foreign-region public holidays are filtered by
      // `userHomeCountry`, empty calendars are NEVER off-days, and only
      // PTO / applicable PUBLIC_HOLIDAY / REST_DAY count as off. This
      // guarantees that Brief, Plan, and Nudges agree on what "last day of
      // the break" means — see mem://architecture/availability-ssot.md.
      const byDate = new Map<string, any[]>();
      for (const e of lookbackEvents) {
        const d = (e.start_time || "").slice(0, 10);
        if (!d) continue;
        const arr = byDate.get(d) || [];
        arr.push(e);
        byDate.set(d, arr);
      }
      const toAvailEvents = (rows: any[]) =>
        rows.map((e: any) => ({
          title: String(e?.title ?? ""),
          startTime: String(e?.start_time ?? ""),
          endTime: String(e?.end_time ?? e?.start_time ?? ""),
          isAllDay: e?.is_all_day === true ||
            ((new Date(e?.end_time ?? e?.start_time ?? 0).getTime() -
              new Date(e?.start_time ?? 0).getTime()) >= 20 * 3600 * 1000),
          isOrganizer: e?.is_organizer === true,
          attendeesCount: Number(e?.attendees_count ?? 0) || 0,
          source: e?.source ?? e?.calendar_name ?? null,
          calendarSummary: e?.calendar_summary ?? null,
        }));
      let consecutiveOffDaysBefore = 0;
      // Prior day states (newest-first) for the SSOT long-weekend detector.
      const priorDayStates: Array<{ state: AvailabilityState }> = [];
      const cursor = new Date(`${todayStr}T00:00:00`);
      for (let i = 0; i < 14; i++) {
        cursor.setDate(cursor.getDate() - 1);
        const dStr = cursor.toISOString().split("T")[0];
        const events = byDate.get(dStr) || [];
        let isOff = false;
        let priorState: AvailabilityState = "WORKDAY";
        try {
          const r = classifyDay({
            now: new Date(`${dStr}T12:00:00Z`),
            userHomeCountry,
            userCurrentCountry: null,
            events: toAvailEvents(events),
          });
          isOff = r.isOffDay;
          priorState = r.state;
        } catch (_e) {
          // Fallback: weekend-only. Empty calendars intentionally do NOT
          // count — see canonical rules above.
          const dDow = cursor.getDay();
          isOff = dDow === 0 || dDow === 6;
          priorState = isOff ? "REST_DAY" : "WORKDAY";
        }
        priorDayStates.push({ state: priorState });
        if (isOff) consecutiveOffDaysBefore++;
        else break;
      }
      const travelDay = today.kind === "travel-day";
      // Full working weekend: ≥3 non-noise events on a Sat/Sun. Reuse the
      // existing nonNoiseEvents array.
      const isTodayWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const fullWorkingWeekend = isTodayWeekend && nonNoiseEvents.length >= 3;
      // SSOT long-weekend detector: needs today's state, tomorrow-is-workday,
      // and the walked-back prior day states above.
      const todayStateForLW: AvailabilityState = nudgeAvailability?.state ??
        (dayOfWeek === 0 || dayOfWeek === 6 ? "REST_DAY" : "WORKDAY");
      const longWeekendToday = isLastDayOfLongWeekend({
        today: { state: todayStateForLW },
        tomorrowIsWorkday,
        priorDays: priorDayStates,
      });
      if (defaults.length > 0) {
        console.log(
          `[week-ahead-hydration] user=${userId} defaulted=${
            defaults.join(",")
          } ` +
            `result=${
              JSON.stringify({
                ptoTodayAllDay,
                ptoTomorrowAllDay,
                holidayTodayAllDay,
                holidayTomorrowAllDay,
                tomorrowIsWorkday,
                consecutiveOffDaysBefore,
                travelDay,
                fullWorkingWeekend,
                isLastDayOfLongWeekend: longWeekendToday,
                homeCountry: userHomeCountry,
              })
            }`,
        );
      }
      return {
        ptoTodayAllDay,
        ptoTomorrowAllDay,
        holidayTodayAllDay,
        holidayTomorrowAllDay,
        tomorrowIsWorkday,
        consecutiveOffDaysBefore,
        travelDay,
        fullWorkingWeekend,
        // SSOT-derived: today itself must be an off-day for any last_day_*
        // branch to fire. Never trust workload proxies here.
        todayIsOffDay: nudgeAvailability
          ? (nudgeAvailability.state === "PTO" ||
            nudgeAvailability.state === "PUBLIC_HOLIDAY" ||
            nudgeAvailability.state === "REST_DAY")
          : (dayOfWeek === 0 || dayOfWeek === 6),
        isLastDayOfLongWeekend: longWeekendToday,
        homeCountry: userHomeCountry,
      };
    })(),
    badgeCount: (() => {
      // v5.3 - Intelligent badge: outstanding cognitive debt the user can
      // clear today. Falls back to 1 when there is nothing to count.
      const open = pendingPracticeIds.length;
      const checkinDue = (() => {
        if (localHour < 12) return morningCheckin ? 0 : 1;
        if (localHour < 18) return afternoonCheckin ? 0 : 1;
        return ((todayCheckins || []).length === 0) ? 1 : 0;
      })();
      const total = open + checkinDue;
      return total > 0 ? Math.min(total, 9) : 1;
    })(),
    briefBehaviour,
  };
}

// ══════════════════════════════════════════════════════════════
// ── Wearable signal line builders (omit when no data) ──
// ══════════════════════════════════════════════════════════════

function buildWearableLines(ctx: NudgeContext): string {
  if (!ctx.hasWearableData) return "";

  const lines: string[] = [];
  if (ctx.wearable.sleepScore !== null) {
    lines.push(`- Sleep score: ${ctx.wearable.sleepScore}`);
  }
  if (ctx.wearable.hrvDeltaPct !== null) {
    lines.push(`- HRV vs baseline: ${ctx.wearable.hrvDeltaPct}%`);
  }
  if (ctx.wearable.rhrElevated) {
    lines.push(`- RHR: elevated above baseline`);
  } else if (ctx.wearable.rhr !== null) {
    lines.push(`- RHR: normal`);
  }
  return lines.join("\n");
}

function buildWearablePriorityLines(ctx: NudgeContext): string {
  if (!ctx.hasWearableData) return "";

  const lines: string[] = [];
  if (ctx.wearable.sleepScore !== null && ctx.wearable.sleepScore < 60) {
    lines.push("PRIORITY: Lead with recovery signal – sleep was poor");
  }
  if (ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15) {
    lines.push("PRIORITY: Lead with HRV recovery signal");
  }
  return lines.join("\n");
}

// V8 - Day-shape awareness line for AI prompts. Empty when normal & no post-travel.
function buildDayShapeLine(ctx: NudgeContext): string {
  const dc = ctx.dayContext;
  if (dc.kind === "normal" && !dc.postTravel) return "";
  const parts: string[] = [];
  if (dc.kind === "travel-day") {
    // Travel framing goal is sourced from the canonical §4 Travel (G) phase
    // map so Brief / Plan / Nudges share one travel intent. The naming
    // discipline ("travel" verbatim, no long/short-haul) is prompt hygiene,
    // not taxonomy, and stays local.
    const travelGoal = EVENT_PHASE_MAP.G.pre?.goal ?? "";
    parts.push(
      `Today shape: travel on the calendar - name "travel" verbatim (no long/short-haul)${
        travelGoal ? `. Frame intent: ${travelGoal}.` : "."
      }`,
    );
  } else if (dc.kind === "away-day") {
    parts.push("Today shape: away-day - acknowledge the day away.");
  }
  if (dc.postTravel) {
    // Post-travel recovery goal also sourced from canonical G.post phase.
    const postGoal = EVENT_PHASE_MAP.G.post?.goal ?? "";
    parts.push(
      `Recovery context: yesterday included travel - body may still be carrying load${
        postGoal ? ` (${postGoal})` : ""
      }. Lead the meaning sentence with this awareness.`,
    );
  }
  if (dc.landingPlusHighStakes) {
    // Pass 8 (P) - sequence matters: decompress first, then sharpen for the
    // imminent meeting. Mirrors canonical travelLandingPlusHighStakes copyHint.
    parts.push(
      `Travel + meeting awareness: high-stakes "${dc.landingPlusHighStakes.eventTitle}" in ${dc.landingPlusHighStakes.minutesUntil}min after yesterday's travel - frame as decompress then sharpen, do not skip the body-down step.`,
    );
  }
  return parts.join("\n");
}

// ══════════════════════════════════════════════════════════════
// ── Post-generation fabrication validation ──
// ══════════════════════════════════════════════════════════════

const FABRICATION_PATTERNS = [
  /\d+%/,
  /\d+\s*ms/i,
  /below baseline|above baseline/i,
  /your HRV|recovery score/i,
];

function containsFabricatedWearableData(
  body: string,
  hasWearableData: boolean,
): boolean {
  if (hasWearableData) return false;
  return FABRICATION_PATTERNS.some((pattern) => pattern.test(body));
}

// v6 - title-case word truncation for long event titles to keep CTAs scannable
function truncateEventTitle(title: string | null | undefined): string {
  const t = (title || "").trim();
  if (!t) return "your meeting";
  if (t.length <= 20) return t;
  return t.split(/\s+/).slice(0, 3).join(" ");
}

// v6 - copy-contract lint shared by AI output and any future fallback editor.
// Returns null if body passes; returns a string reason if it must be rejected.
const FORBIDDEN_WORDS_V6 = [...FORBIDDEN_NOTIFICATION_WORDS];
const ALLOWED_CTA_VERBS_V6 = [
  "open your brief",
  "open your plan",
  "open your prep plan",
  "open your readiness",
  "build your prep plan",
  "build your plan",
  "recalibrate now",
  "close the day",
  "close the week",
  "close the loop",
  "lock in your prep",
  "tap to prep",
  "see your prep",
  "see your plan",
  "see your readiness",
  // v6.1 - short, human CTAs
  "check in now",
  "open the app",
  "prep now",
  "take 2 minutes",
];
function violatesCopyContractV6(body: string): string | null {
  const lower = body.toLowerCase();
  for (const w of FORBIDDEN_WORDS_V6) {
    const rx = new RegExp(
      `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (rx.test(lower)) return `forbidden word: "${w}"`;
  }
  if (!ALLOWED_CTA_VERBS_V6.some((v) => lower.includes(v))) {
    return "no allowed CTA verb";
  }
  // No placeholder tokens
  if (/\{[a-z_]+\}|\bN\b|--/i.test(body)) return "placeholder token detected";
  // v6.1 - hard length ceiling (CEO feedback: notifications too long)
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 14) return `body too long (${wordCount} words, max 14)`;
  if (body.length > 95) return `body too long (${body.length} chars, max 95)`;
  return null;
}

// ── v8 - Meaning-Forward + Mind-Prep CTA contract ──────────────────────
// Three principles, enforced verbatim:
//   1. Lead with meaning, not the data point.  (the metric, if used, sits
//      INSIDE a meaning sentence - never as the whole first sentence).
//   2. Title = state or moment.  Body = context + one clear action.
//   3. CTA always ends at a specific app screen via a "log in / check in /
//      open" verb that QUALIFIES the prep as mental (mind / state /
//      recalibrate / close / set / land).  Unqualified "prep" is banned.
const ALLOWED_CTA_VERBS_V8 = [
  "log in to prep your mind tonight",
  "log in to prep your mind",
  "log in to prep your state",
  "log in to recalibrate your mind",
  "check in to recalibrate",
  "check in to set your intention",
  "check in to set tomorrow",
  "check in to close the day",
  "check in to close the week",
  "check in to land the weekend",
  "open your insights",
  // v1.1 - Weekend / post-holiday CTA (routes to /plan).
  // Only fires when Brief snapshot + Plan ledger BOTH exist for today.
  "let's prioritise the week ahead",
  // v1.1 - Reminder variant (no-app-open CTA, back-to-back gap downgrade,
  // post-landing window). Body is self-sufficient; tap is optional.
  "take 60 seconds",
];

// V8 - body must reference at least one real, named context token.
// Sources: a calendar event title, a numeric physiological signal with
// unit, a countable today-state, a check-in outcome word, or a
// minutes-until / clock-time for a real event.
const NAMED_CONTEXT_RX_DEFAULT = [
  /\b(HRV|RHR|HR|sleep)\b\s*[-+]?\d/i, // HRV -22%, Sleep 62
  /\b\d+\s*\/\s*100\b/, // 62/100
  /\b\d+\s*(meeting|meetings|priority|priorities|min|minutes|day|days)\b/i,
  /\b(in|at)\s+\d{1,2}(?::\d{2})?\s*(min|minutes|am|pm|h)?\b/i, // in 25 min, at 10am
  /\b(started low|managing|depleted|heavy|low|peak|strong|focused|overloaded)\b/i,
];
function requiresNamedContextToken(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): boolean {
  if (NAMED_CONTEXT_RX_DEFAULT.some((rx) => rx.test(body))) return true;
  const titles = ctx?.eventTitles ?? [];
  for (const t of titles) {
    if (!t || t.length < 3) continue;
    if (body.toLowerCase().includes(t.toLowerCase())) return true;
    // Title-cased words from a real event title (3+ chars) also count.
    const head = t.split(/\s+/).slice(0, 3).join(" ");
    if (head.length >= 3 && body.toLowerCase().includes(head.toLowerCase())) {
      return true;
    }
  }
  if (
    ctx?.checkinWord &&
    body.toLowerCase().includes(ctx.checkinWord.toLowerCase())
  ) return true;
  return false;
}

// V8 - first sentence must NOT be a bare metric statement. The metric, if
// used, must be embedded INSIDE a meaning sentence (parenthetical or clause).
function violatesMeaningSentence(body: string): string | null {
  const first = body.split(/(?<=[.!?])\s+/)[0]?.trim() ?? body.trim();
  // Bare metric leads (HRV -22% today, RHR +9 bpm, Sleep 62/100, etc.)
  if (/^(HRV|RHR|HR|Sleep|Sleep score)\s*[-+]?\d[^.]*$/i.test(first)) {
    return `first sentence is a bare metric: "${first}"`;
  }
  // First sentence is purely a number+unit clause with no human meaning verb.
  if (/^[-+]?\d+\s*(%|bpm|\/100)\b[^.]*$/i.test(first)) {
    return `first sentence is a bare number+unit: "${first}"`;
  }
  return null;
}

function violatesCopyContractV8(
  body: string,
  ctx?: { eventTitles?: string[]; checkinWord?: string | null },
): string | null {
  const lower = body.toLowerCase().trim();
  for (const w of FORBIDDEN_WORDS_V6) {
    const rx = new RegExp(
      `\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    if (rx.test(lower)) return `forbidden word: "${w}"`;
  }
  // Must end with a V8 qualified mind-prep verb (allow trailing punctuation).
  const trailing = lower.replace(/[.!?\s]+$/, "");
  if (!ALLOWED_CTA_VERBS_V8.some((v) => trailing.endsWith(v))) {
    return "must end with a V8 qualified mind-prep CTA verb";
  }
  if (/\{[a-z_]+\}|\bN\b|--/i.test(body)) return "placeholder token detected";
  // Meaning-first lint
  const meaningViolation = violatesMeaningSentence(body);
  if (meaningViolation) return meaningViolation;
  // Named-context lint
  if (!requiresNamedContextToken(body, ctx)) {
    return "body cites no named context token (event title, metric+unit, count, time, or check-in word)";
  }
  const wordCount = body.trim().split(/\s+/).length;
  // v8 - meaning-forward bodies are longer than V7 metric-led bodies.
  // Gold-standard examples run 18–22 words.
  if (wordCount > 22) return `body too long (${wordCount} words, max 22)`;
  if (body.length > 140) return `body too long (${body.length} chars, max 140)`;
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── AI Copy Generation ──
// ══════════════════════════════════════════════════════════════

async function generateNudgeCopy(
  ctx: NudgeContext,
  nudgeType: string,
  specificSignals: Record<string, unknown> = {},
  supabase?: SupabaseLoose,
): Promise<NudgeCopy | null> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    console.warn("[smart-nudges] No ANTHROPIC_API_KEY – using static fallback");
    return null;
  }

  let systemPrompt = `${CHIEF_OF_STAFF_PERSONA}

You write push notifications for a MENTAL-PERFORMANCE app. The user's job, every habit-building nudge, is to check in and do mental prep - never strategic prep, never deck prep.

EVERY notification is anchored to ONE of two things:
  • JIT  - a specific upcoming/just-past calendar event from the user's morning plan
  • STATE - a specific physiological / check-in / plan-progress signal from today
If neither anchor is present, do not write copy.

THE THREE V8 PRINCIPLES (non-negotiable):

1. LEAD WITH MEANING, NOT THE DATA POINT.
   Raw metrics never lead. The first sentence translates what the data MEANS for the user's day. The number, if used, sits INSIDE the meaning sentence (parenthetical or clause) - it never carries the message alone.
   Do not write: "HRV -22% today - log in to prep."
   Write: "Your body's running below baseline (HRV -22%). Close the day before tomorrow loads up - log in to recalibrate your mind."

2. TITLE = STATE OR MOMENT. BODY = CONTEXT + ONE CLEAR ACTION.
   Title names a moment a CEO recognises ("Recovery in progress", "Starting from where you are", "Recalibrating mid-day"). Body delivers the so-what plus a specific in-app action.

3. CTA ALWAYS ENDS AT A SPECIFIC APP SCREEN VIA A "log in / check in / open" VERB - AND THE PREP IS ALWAYS MENTAL.
   This is a mental-performance system. Plain "prep" is ambiguous (a CEO reads it as "prep the deck"). Every CTA must qualify the prep as MIND / STATE / RECALIBRATE / CLOSE / SET / LAND.

Allowed CTA verbs (verbatim end of body, modulo trailing punctuation):
  "log in to prep your mind"               (JIT plan exists)
  "log in to prep your mind tonight"       (Sunday/eve, high-stakes Monday)
  "log in to prep your state"              (JIT, depleted state)
  "log in to recalibrate your mind"        (evening recovery)
  "check in to recalibrate"                (mid-day reset)
  "check in to set your intention"         (morning anchor)
  "check in to set tomorrow"               (Sunday close)
  "check in to close the day"              (evening close)
  "check in to close the week"             (Friday close)
  "check in to land the weekend"           (Saturday)
  "open your insights"                     (pattern alerts only)

BANNED CTA verbs (never use, even if the user's data tempts you):
  "your prep is ready", "your plan is ready", "your brief is ready",
  "see your prep", "see your plan", "see your readiness", "tap to prep",
  "open the app to prep", "check into the app to prep", "go to the app to prep",
  "prep now", "open the app to prep tonight", "open the app to prep with a cool-down".
These either present the work as already done (passive consumption) or leave "prep" unqualified (CEO reads it as strategic prep).

Gold-standard examples (match these shapes - meaning-first, named context, qualified mind-prep CTA):
- Evening · 7 meetings:
  Title: "Evening cool-down"
  Body:  "Seven meetings, no real break for your mind today. Close the day before it carries into tomorrow - log in to recalibrate your mind."
- Evening · HRV deficit:
  Title: "Recovery in progress"
  Body:  "Your body's running below baseline (HRV -22%). Close the day with a short reset before tomorrow loads up - log in to recalibrate your mind."
- Morning · yesterday depleted + heavy day:
  Title: "Starting from where you are"
  Body:  "Yesterday was heavy and today has 5 meetings ahead. Manage your energy instead of reacting to it - check in to set your intention."
- Morning · JIT board in 60m:
  Title: "Preparing mental performance"
  Body:  "Board Review in an hour. Walk in with the edge, not the anxiety - log in to prep your mind."
- Afternoon · morning was low:
  Title: "Mid-day reset window"
  Body:  "Your morning state was low and the afternoon is still ahead. This is the recovery window - check in to recalibrate."
- Afternoon · 3 more meetings:
  Title: "Recalibrating mid-day"
  Body:  "Halfway through with three more meetings ahead. Stay sharp instead of running on fumes - check in to recalibrate."
- Pre-event · investor 60m, peak:
  Title: "You're ready for this"
  Body:  "Investor Update in an hour. Your mental prep is built for exactly this moment - log in to prep your mind."
- Pre-event · board 45m, depleted:
  Title: "Managing the moment"
  Body:  "Board Review in 45 minutes and you're running low. Short, sharp, built for right now - log in to prep your state."
- Friday close:
  Title: "Week complete"
  Body:  "Five heavy days behind you. Close the week before you disconnect so it doesn't bleed into the weekend - check in to close the week."
- Sunday · heavy Monday:
  Title: "Monday is already mapped"
  Body:  "Tomorrow opens with Board Review and a full calendar. Three minutes of clarity tonight beats two hours of catch-up - check in to set tomorrow."
- Sunday · high-stakes Monday event:
  Title: "Big Monday - pre-loading now"
  Body:  "Tomorrow opens with a high-stakes moment. Wake up ahead instead of behind - log in to prep your mind tonight."
- Saturday · low HRV:
  Title: "The body's still catching up"
  Body:  "Recovery from the week isn't instant - your HRV is still below baseline. A short check-in tells you what kind of weekend you actually need - check in to land the weekend."

Hard rules:
- Title: max 6 words, no emoji, names the state or moment in human language.
- Body: max 22 words AND 140 characters. One or two short sentences.
- Body MUST cite at least ONE named context token from the data block: a real event title, an HRV/RHR/sleep number with unit, a meetings/practices count, a minutes-until or clock time, or a check-in outcome word the user actually logged. Never invent a number or a meeting name.
- The first sentence MUST be a meaning sentence - never a bare metric like "HRV -22% today" or "RHR +9 bpm".
- The body MUST end with one of the V8 qualified mind-prep CTA verbs above (verbatim).
- When the JIT anchor is an event from the user's morning plan, prefix with "From your morning Plan:" or "From your plan:" - that prefix IS the proactive lure.
- Do not use long em dashes. Use a short dash (-).
- Forbidden words/phrases: wellness, mindful, mindfulness, relax, breathe, calm, recharge, self-care, streak, "keep it up", "well done", "great job", productive, productivity, intent, strategy, strategic, "decision posture", "decision readiness", "mental sharpness", "anchor sharpness", "performance state", "reset trajectory", "capacity", "reserves", "baseline", "set the tone", "loaded day", "come back", and every banned CTA verb listed above.
- Truncate any event title longer than 20 characters to its first 3 words.
- Return ONLY valid JSON: {"title":"...","body":"..."}`;

  // Phase 4 — append leader voice rules + reset-modality preference to
  // the system prompt when the CoS Leader Profile is available. Both
  // blocks are strictly additive; the LLM prompt is unchanged for users
  // without a synthesised profile.
  if (ctx.leaderVoiceRules && ctx.leaderVoiceRules.trim().length > 0) {
    systemPrompt += `\n\n=== LEADER VOICE ===\n${ctx.leaderVoiceRules.trim()}`;
  }
  if (ctx.leaderResetModality) {
    systemPrompt +=
      `\n\nThe leader prefers ${ctx.leaderResetModality}-based reset protocols. When the CTA references a reset, prefer language consistent with that modality (but never invent a new CTA verb — stay within the allowed list above).`;
  }

  let userPrompt = "";
  const wearableLines = buildWearableLines(ctx);
  const wearablePriorityLines = buildWearablePriorityLines(ctx);

  switch (nudgeType) {
    case "nudge_one_morning": {
      const firstEventRaw =
        (specificSignals.firstEventTitle as string | undefined) ||
        ctx.firstNonNoiseEvent?.title;
      const firstEvent = firstEventRaw
        ? truncateEventTitle(firstEventRaw)
        : null;
      const firstEventTime = specificSignals.firstEventTime ||
        (ctx.firstNonNoiseEvent
          ? new Date(ctx.firstNonNoiseEvent.start_time).toLocaleTimeString(
            "en-US",
            { hour: "numeric", minute: "2-digit" },
          )
          : null);
      const stakes = ctx.highStakesEvents.map((e) =>
        truncateEventTitle(e.title)
      ).filter(Boolean);
      const dayShapeLine = buildDayShapeLine(ctx);
      const sharedEventFrameLine = buildSharedEventFrameLine(
        firstEventRaw || null,
      );
      userPrompt =
        `Morning nudge (06:30–09:00 local). Prepare the leader for today.

Available signals (use ONLY these):
${
          firstEvent
            ? `- First event: ${firstEvent}${
              firstEventTime ? ` at ${firstEventTime}` : ""
            }`
            : "- First event: none scheduled"
        }
- Meetings today: ${ctx.eventCount}
${
          stakes.length > 0
            ? `- High-stakes today: ${stakes.join(", ")}`
            : "- High-stakes today: none"
        }
${
          wearableLines
            ? wearableLines
            : "- Wearable: not available, DO NOT mention HRV, RHR, sleep, baselines"
        }
- Day: ${ctx.dayName}
${dayShapeLine}
${sharedEventFrameLine}
${wearablePriorityLines ? wearablePriorityLines : ""}

Required CTA verb at end of body: "check in to set your intention" (default) or "log in to prep your state" (if HRV<-15% or sleep<60 with a heavy day) or "log in to prep your mind" (if naming a high-stakes event). The first sentence MUST be a meaning sentence - never a bare metric.`;
      break;
    }

    case "nudge_one_jit": {
      const evt = specificSignals as {
        eventTitle: string;
        minutesUntil: number;
      };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      const hrvLine = ctx.hasWearableData && ctx.wearable.hrvDeltaPct !== null
        ? `\n- HRV: ${ctx.wearable.hrvDeltaPct}% vs baseline`
        : "";
      const dayShapeLine = buildDayShapeLine(ctx);
      const sharedEventFrameLine = buildSharedEventFrameLine(evt.eventTitle);
      userPrompt =
        `JIT first-touch. This event is from the user's MORNING PLAN - the prep plan is already queued.
The proactive job is to pull them back into the app to use that prep before the event starts.

Available signals:
- Event: "${evtTitle}" in ${evt.minutesUntil} minutes${hrvLine}
${
          ctx.morningCheckinOutcome
            ? `- Morning state: ${ctx.morningCheckinOutcome}`
            : ""
        }
- Meetings today: ${ctx.eventCount}
${dayShapeLine}
${sharedEventFrameLine}

Required: name "${evtTitle}" + minutes-until. The first sentence is a meaning sentence ("Walk in with the edge, not the anxiety", "Lead it instead of surviving it") - not a bare metric.
Required CTA verb at end of body: "log in to prep your mind" (default) or "log in to prep your state" (if morning state was depleted/managing).`;
      break;
    }

    case "nudge_two_jit": {
      const evt = specificSignals as {
        eventTitle: string;
        minutesUntil: number;
      };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      const sharedEventFrameLine = buildSharedEventFrameLine(evt.eventTitle);
      userPrompt =
        `Mid-day JIT. This event is from the user's MORNING PLAN - the prep plan is already queued.
Pull them back into the app. Their context may have shifted since morning, but the event hasn't.

Available signals:
- Event: "${evtTitle}" in ${evt.minutesUntil} minutes
${
          ctx.morningCheckinOutcome
            ? `- Morning state: ${ctx.morningCheckinOutcome}`
            : ""
        }
- Meetings today: ${ctx.eventCount}
${sharedEventFrameLine}

Required: name "${evtTitle}" + minutes-until. The first sentence is a meaning sentence (e.g. "Stay sharp instead of running on fumes") - never a bare metric.
Required CTA verb at end of body: "log in to prep your mind" (default) or "log in to prep your state" (if depleted).`;
      break;
    }

    case "nudge_two_priorities": {
      const remaining = specificSignals.remainingCount as number;
      userPrompt = `Mid-day. User has practices remaining on today's plan.

Available signals:
- Practices remaining: ${remaining}
- Meetings today: ${ctx.eventCount}

Required: name the count "${remaining} practice${
        remaining === 1 ? "" : "s"
      } left".
The first sentence translates what that means for the day, not the raw count alone.
Required CTA verb at end of body: "check in to recalibrate".
Say "practices" not "priorities". Never reference "Priority 1".`;
      break;
    }

    case "nudge_two_recalibrate": {
      const eventTitle = truncateEventTitle(
        specificSignals.eventTitle as string,
      );
      const sharedEventFrameLine = buildSharedEventFrameLine(
        specificSignals.eventTitle as string,
      );
      userPrompt =
        `State-aware recalibration. User started low; heavy afternoon ahead.

Available signals:
- Morning check-in: ${ctx.morningCheckinOutcome}
- Next event: "${eventTitle}"
${sharedEventFrameLine}

Required: name the morning state AND the event in a meaning sentence (e.g. "Your morning state was low and ${eventTitle} is next - this is the recovery window").
Required CTA verb at end of body: "check in to recalibrate".`;
      break;
    }

    case "nudge_two_reserves": {
      const evt = specificSignals as {
        eventTitle: string;
        signal: "rhr" | "hrv";
      };
      const evtTitle = truncateEventTitle(evt.eventTitle);
      const signalLine = evt.signal === "rhr"
        ? `RHR elevated above baseline`
        : (ctx.wearable.hrvDeltaPct !== null
          ? `HRV ${ctx.wearable.hrvDeltaPct}% vs baseline`
          : null);
      // If we cannot cite a real number, hand off to fallback
      if (!signalLine) return null;
      const sharedEventFrameLine = buildSharedEventFrameLine(evt.eventTitle);
      userPrompt =
        `Reserves-down lure. Physiology is depleted with a high-stakes event ahead.

Available signals:
- Wearable: ${signalLine}
- Next high-stakes: "${evtTitle}"
${
          ctx.morningCheckinOutcome
            ? `- Morning check-in: ${ctx.morningCheckinOutcome}`
            : ""
        }
${sharedEventFrameLine}

Required: cite the wearable signal INSIDE a meaning sentence (e.g. "You're running low (${signalLine}) and ${evtTitle} is next") - never lead with the bare metric.
Required CTA verb at end of body: "log in to prep your state" or "check in to recalibrate".`;
      break;
    }

    case "nudge_three": {
      const isWeekendEvening = ctx.isWeekend || ctx.dayOfWeek === 5;
      const isSundayEvening = ctx.dayOfWeek === 0;
      const tomorrowHighStakes = ctx.tomorrowEvents.filter((e) =>
        isHighStakes(e.title)
      ).map((e) => ({ ...e, title: truncateEventTitle(e.title) }));
      const tomorrowEventCount =
        ctx.tomorrowEvents.filter((e) => !isNoiseEvent(e.title || "")).length;
      const sharedTomorrowFrameLine = buildSharedEventFrameLine(
        tomorrowHighStakes[0]?.title || null,
      );

      const eveningWearableLines: string[] = [];
      if (ctx.hasWearableData) {
        if (ctx.wearable.hrvDeltaPct !== null) {
          eveningWearableLines.push(
            `- HRV end of day vs baseline: ${ctx.wearable.hrvDeltaPct}%`,
          );
        }
        if (ctx.wearable.rhrElevated) {
          eveningWearableLines.push(`- RHR: elevated through the day`);
        }
      }

      const prioritiesCompleted = ctx.completedPracticeIds.length;
      const prioritiesTotal = ctx.completedPracticeIds.length +
        ctx.pendingPracticeIds.length;
      const prioritiesRemaining = ctx.pendingPracticeIds.length;
      const todayStakes = ctx.highStakesEvents.map((e) =>
        truncateEventTitle(e.title)
      );

      userPrompt =
        `Evening nudge (18:00–21:00 local). Close today and set up tomorrow.

Available signals (use ONLY these):
- Meetings today: ${ctx.eventCount}
${
          todayStakes.length > 0
            ? `- High-stakes today: ${todayStakes.join(", ")}`
            : ""
        }
- Practices: ${prioritiesCompleted}/${prioritiesTotal} done${
          prioritiesRemaining > 0 ? `, ${prioritiesRemaining} still open` : ""
        }
${
          eveningWearableLines.length > 0
            ? eveningWearableLines.join("\n")
            : "- Wearable: not available, DO NOT mention HRV, RHR, sleep"
        }
${
          isSundayEvening
            ? `- Tomorrow (Mon): ${tomorrowEventCount} meetings${
              tomorrowHighStakes.length > 0
                ? `, incl. "${tomorrowHighStakes[0].title}"`
                : ""
            }`
            : ""
        }
${sharedTomorrowFrameLine}

${
          isSundayEvening
            ? `SUNDAY framing: name a Monday signal, prepare the user for the week. Required CTA verb at end of body: "check in to set tomorrow" (default) or "log in to prep your mind tonight" (if a high-stakes Monday event).`
            : ""
        }
${
          ctx.dayOfWeek === 5
            ? `FRIDAY framing: name today's load (meetings count or high-stakes) inside a meaning sentence. Required CTA verb at end of body: "check in to close the week".`
            : ""
        }
${
          !isSundayEvening && ctx.dayOfWeek !== 5 && ctx.dayOfWeek !== 6
            ? `Required CTA verb at end of body: "log in to recalibrate your mind" (if HRV/RHR signal) or "check in to close the day" (default).`
            : ""
        }
${
          ctx.dayOfWeek === 6
            ? `SATURDAY framing: recovery-first. Required CTA verb at end of body: "check in to land the weekend".`
            : ""
        }`;
      break;
    }

    // Legacy types for backward compat
    case "morning_prep":
    case "jit_pre_event":
    case "calendar_gap":
    case "coach_meeting_match":
    case "performance_state":
    case "evening_close":
    case "pattern_alert":
    case "daily_fallback":
      return null; // Post-MVP types should use fallback

    default:
      return null;
  }

  // ── CEO behaviour wiring (Brief↔Nudge parity, canonical) ──
  // Preferred path: read the Brief's persisted snapshot (loaded once in
  // buildNudgeContext as `ctx.briefBehaviour`) so the Nudge LLM sees the
  // EXACT advisory block + event taxonomy the Brief used. Fallback path:
  // `evaluateForScope("nudge", …)` - only when no Brief row exists yet for
  // this window, AND we still need `notificationIsProduct` (the nudge-only
  // rule) which the Brief's snapshot does not carry.
  let behaviourPromptBlock = "";
  try {
    if (ctx.briefBehaviour?.taxonomyBlock) {
      behaviourPromptBlock += ctx.briefBehaviour.taxonomyBlock;
    }
    if (ctx.briefBehaviour?.promptBlockBrief) {
      behaviourPromptBlock += ctx.briefBehaviour.promptBlockBrief;
      console.log(
        `[smart-nudges] applied brief snapshot sig=${ctx.briefBehaviour.signatureHash}`,
      );
    } else {
      // Fallback: no Brief written yet for this window. Evaluate the rules
      // directly so the nudge still gets the canonical §2 / §5.2 reads
      // (incl. notificationIsProduct). This is the ONLY path that still
      // calls evaluateForScope from inside this function.
      const backToBackHoursToday = computeBackToBackHours(ctx);
      const eventsForCtx = ctx.nonNoiseEvents
        .filter((e) => !!e.title)
        .map((e) => ({
          title: e.title as string,
          startTime: e.start_time,
          stakesLevel: isHighStakes(e.title) ? "external" : null,
        }));
      // Part 1 - hydrate travel_state for the fallback path. Fail-open: any
      // error leaves the field undefined and the rule defaults take over.
      let _nudgeTravelState:
        | { state?: string | null; distanceFromHomeKm?: number | null }
        | null = null;
      try {
        if (supabase) {
          const { data: tsRow } = await supabase
            .from("travel_state")
            .select("state, distance_from_home_km")
            .eq("user_id", ctx.userId)
            .maybeSingle();
          if (tsRow) {
            _nudgeTravelState = {
              state: (tsRow as any).state ?? null,
              distanceFromHomeKm: (tsRow as any).distance_from_home_km ?? null,
            };
          }
        }
      } catch (tsErr) {
        console.warn(
          "[smart-nudges] travel_state hydration skipped:",
          tsErr instanceof Error ? tsErr.message : tsErr,
        );
      }
      const wiring = evaluateForScope(
        {
          wearable: ctx.hasWearableData
            ? {
              hrvDeviationPct: ctx.wearable.hrvDeltaPct ?? null,
              sleepHours: ctx.wearable.totalSleepMinutes != null
                ? ctx.wearable.totalSleepMinutes / 60
                : null,
              sleepDeviationPct: null,
              rhrDeviationPct: ctx.wearable.rhrElevated ? 10 : null,
              hrElevatedProxy: ctx.wearable.rhrElevated,
            }
            : null,
          checkIn: {
            emotionalSelfDeclared: ctx.afternoonCheckinOutcome ??
              ctx.morningCheckinOutcome ?? null,
            mentalSharpness: null,
            confidence: null,
            clarity: null,
          },
          scoreToday: null,
          scoreYesterday: null,
          timezone: {
            offsetMinutes: null,
            shift48hHours: null,
            travelDay: false,
          },
          travelState: _nudgeTravelState,
          events: eventsForCtx,
          now: new Date(),
        },
        "nudge",
        {
          dayOfWeek: ctx.dayOfWeek,
          backToBackHoursToday,
          historicalAppOpenRateLow: isAppOpenRateLow(ctx.lastAppOpen),
          // Canonical Availability SSOT — feed the classifier result into
          // the RuleContext so PTO/holiday and weekend rules read from the
          // same authoritative decision the planner and Brief use.
          availability: ctx.dayContext.availability,
        },
      );
      if (wiring?.promptBlock) {
        behaviourPromptBlock += wiring.promptBlock;
        console.log(
          "[smart-nudges] applied evaluateForScope fallback (no brief snapshot)",
        );
      }
    }
  } catch (e) {
    console.warn("[smart-nudges] behaviour wiring skipped:", e);
  }

  if (behaviourPromptBlock) {
    userPrompt = `${behaviourPromptBlock}\n\n${userPrompt}`;
  }

  // Try providers in order: Claude Haiku → Lovable AI Gemini Flash → null.
  // Both providers are validated through the identical V8 gate.

  const claudeCopy = await tryAIProvider(
    "claude",
    ctx,
    nudgeType,
    systemPrompt,
    userPrompt,
  );
  if (claudeCopy) return claudeCopy;
  const geminiCopy = await tryAIProvider(
    "gemini",
    ctx,
    nudgeType,
    systemPrompt,
    userPrompt,
  );
  if (geminiCopy) return geminiCopy;
  return null;
}

// Estimate today's back-to-back meeting hours from ctx events (≤15 min gaps).
function computeBackToBackHours(ctx: NudgeContext): number {
  const events = [...ctx.todayEvents]
    .filter((e) => e.start_time && (e as any).end_time)
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
  if (events.length < 2) return 0;
  let totalMs = 0;
  let runStart = new Date(events[0].start_time).getTime();
  let runEnd = new Date((events[0] as any).end_time).getTime();
  for (let i = 1; i < events.length; i++) {
    const s = new Date(events[i].start_time).getTime();
    const e = new Date((events[i] as any).end_time).getTime();
    if (s - runEnd <= 15 * 60_000) {
      runEnd = Math.max(runEnd, e);
    } else {
      totalMs += runEnd - runStart;
      runStart = s;
      runEnd = e;
    }
  }
  totalMs += runEnd - runStart;
  return Math.round((totalMs / 3_600_000) * 10) / 10;
}

// Crude 7-day open-rate proxy: if last app open > 72h ago (or null), treat as low.
function isAppOpenRateLow(lastAppOpen: Date | null): boolean {
  if (!lastAppOpen) return true;
  return Date.now() - lastAppOpen.getTime() > 72 * 3_600_000;
}

// V8 - shared real-context tokens for requiresNamedContextToken().
function buildV8CtxForCheck(
  ctx: NudgeContext,
): { eventTitles: string[]; checkinWord: string | null } {
  return {
    eventTitles: [
      ...ctx.todayEvents.map((e) => e.title || ""),
      ...ctx.tomorrowEvents.map((e) => e.title || ""),
      ...ctx.highStakesEvents.map((e) => e.title || ""),
      ctx.firstNonNoiseEvent?.title || "",
    ].filter(Boolean),
    checkinWord: ctx.morningCheckinOutcome ?? null,
  };
}

function isLowContextStaticFallbackVariant(variantId: string): boolean {
  // Strip A/B CTA arm suffix (e.g. "FB-N3-light::D") before checking,
  // because applyCtaVariant mutates variantId after the pre-AB validator runs.
  return variantId.replace(/::[ABCD]$/, "").endsWith("-light");
}

function isNamedContextViolation(violation: string): boolean {
  return violation.includes("no named context token");
}

// V8 - validate any static fallback copy through the same contract used for
// AI output. If the fallback violates V8, we drop it so the cron tick simply
// sends nothing rather than ship V7 phrasing.
function validateStaticFallbackCopy(
  copy: NudgeCopy | null,
  ctx: NudgeContext,
  nudgeType: string,
): NudgeCopy | null {
  if (!copy) return null;
  copy = normalizeNotificationCopy(copy);
  const v8Ctx = buildV8CtxForCheck(ctx);
  const violation = violatesCopyContractV8(copy.body, v8Ctx);
  if (
    violation &&
    !(isLowContextStaticFallbackVariant(copy.variantId) &&
      isNamedContextViolation(violation))
  ) {
    console.warn(
      `[smart-nudges v8] Suppressed static fallback ${copy.variantId} for ${nudgeType}: ${violation} | "${copy.body}"`,
    );
    return null;
  }
  if (violation) {
    console.log(
      `[smart-nudges v8] Allowed low-context static fallback ${copy.variantId} for ${nudgeType}: ${violation}`,
    );
  }
  // V8 telemetry - stamp the provider so the insert payload can record
  // which path actually produced the shipped copy (claude / gemini / static).
  return { ...copy, aiProvider: "static" };
}

async function tryAIProvider(
  provider: "claude" | "gemini",
  ctx: NudgeContext,
  nudgeType: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<NudgeCopy | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let content = "";
    if (provider === "claude") {
      content = await callClaudeText({
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        model: CLAUDE_MODELS.HAIKU,
        max_tokens: 256,
        temperature: 0.7,
        signal: controller.signal,
      });
    } else {
      content = await callLovableAIText({
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        model: "google/gemini-3-flash-preview",
        max_tokens: 256,
        temperature: 0.7,
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed?.title || !parsed?.body) return null;
    parsed.title = String(parsed.title).replace(/\u2014/g, "-").trim();
    parsed.body = String(parsed.body).replace(/\u2014/g, "-").trim();

    if (containsFabricatedWearableData(parsed.body, ctx.hasWearableData)) {
      console.warn(
        `[smart-nudges ${provider}] Rejected AI copy for ${nudgeType}, fabricated wearable data: "${parsed.body}"`,
      );
      return null;
    }
    const lowerBody = (parsed.body as string).toLowerCase();
    if (
      ctx.wearable.hrvDeltaPct === null &&
      /hrv|heart rate variability/.test(lowerBody)
    ) {
      console.warn(
        `[smart-nudges ${provider}] Rejected for ${nudgeType}, cites HRV but null`,
      );
      return null;
    }
    if (
      !ctx.wearable.rhrElevated && ctx.wearable.hrvDeltaPct === null &&
      /rhr|resting heart rate/.test(lowerBody)
    ) {
      console.warn(
        `[smart-nudges ${provider}] Rejected for ${nudgeType}, cites RHR but no signal`,
      );
      return null;
    }
    if (
      ctx.wearable.sleepScore === null && /sleep score|slept/.test(lowerBody)
    ) {
      console.warn(
        `[smart-nudges ${provider}] Rejected for ${nudgeType}, cites sleep but null`,
      );
      return null;
    }

    const violation = violatesCopyContractV8(
      parsed.body,
      buildV8CtxForCheck(ctx),
    );
    if (violation) {
      console.warn(
        `[smart-nudges v8 ${provider}] Rejected for ${nudgeType}: ${violation} | "${parsed.body}"`,
      );
      return null;
    }

    return {
      title: parsed.title.substring(0, 60),
      body: parsed.body.substring(0, 140),
      variantId: `AI-${provider}-${nudgeType}-${Date.now()}`,
      aiProvider: provider,
    };
  } catch (e) {
    console.warn(
      `[smart-nudges ${provider}] AI copy error:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// ── Static Fallback Copy - MVP Nudge System ──
// ══════════════════════════════════════════════════════════════

function getFallbackNudgeOneMorningCopy(ctx: NudgeContext): NudgeCopy {
  // v8 - Meaning-first sentence + named context + qualified mind-prep CTA.
  const dc = ctx.dayContext;

  // V8 - Away-day morning (weekday or weekend, no meeting needed). C2 (Path B):
  // legacy 'ooo' kind folded into 'away-day' — canonical PTO regex already
  // matches OOO titles.
  if (dc.kind === "away-day") {
    return {
      title: "Day away",
      body:
        `On your day away - a short reset before you switch off. Check in to set your intention.`,
      variantId: "FB-N1-away",
    };
  }

  // V8 - Travel today (state-anchored, no meeting required)
  if (dc.kind === "travel-day") {
    return {
      title: "Travel today",
      body:
        `Travel on today's calendar. Ground yourself before the day moves - check in to set your intention.`,
      variantId: "FB-N1-travel",
    };
  }

  // V8 - Post-travel morning (yesterday included travel), STATE-only, no JIT
  if (dc.postTravel) {
    return {
      title: "Recovery context",
      body:
        `Yesterday included travel - body may still be carrying load. Log in to prep your state.`,
      variantId: "FB-N1-post-travel",
    };
  }

  if (
    ctx.hasWearableData && ctx.wearable.sleepScore !== null &&
    ctx.wearable.sleepScore < 60
  ) {
    return {
      title: "Short sleep last night",
      body:
        `Last night was light on recovery (Sleep ${ctx.wearable.sleepScore}/100). Today still needs you sharp - log in to prep your state.`,
      variantId: "FB-N1-recovery",
    };
  }
  if (
    ctx.hasWearableData && ctx.wearable.hrvDeltaPct !== null &&
    ctx.wearable.hrvDeltaPct < -15
  ) {
    return {
      title: "Starting from where you are",
      body:
        `Your body is running below baseline (HRV ${ctx.wearable.hrvDeltaPct}%) and ${ctx.eventCount} meeting${
          ctx.eventCount === 1 ? "" : "s"
        } sit ahead. Manage the day rather than react to it - check in to set your intention.`,
      variantId: "FB-N1-hrv",
    };
  }
  if (ctx.highStakesEvents.length > 0) {
    const ev = truncateEventTitle(
      ctx.highStakesEvents[0].title || "high-stakes meeting",
    );
    return {
      title: "Preparing mental performance",
      body:
        `${ev} on the calendar today. Walk in with the edge, not the anxiety - log in to prep your mind.`,
      variantId: "FB-N1-stakes",
    };
  }
  if (ctx.dayType === "heavy" || ctx.dayType === "extreme") {
    return {
      title: "Starting from where you are",
      body:
        `${ctx.eventCount} meetings ahead today. Manage your energy instead of reacting to it - check in to set your intention.`,
      variantId: "FB-N1-heavy",
    };
  }
  if (ctx.dayOfWeek === 6) {
    // V8 - Saturday AM with a meeting: anchored Saturday tone.
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(
        ctx.firstNonNoiseEvent.title || "today's meeting",
      );
      return {
        title: "Saturday with one to land",
        body:
          `${ev} on the calendar today. Land your mind before it arrives - check in to set your intention.`,
        variantId: "FB-N1-sat-anchored",
      };
    }
    // V8 - Saturday AM no meeting: recovery/reset, sets tone for the weekend.
    return {
      title: "Saturday recovery",
      body:
        `No meetings today - a short reset shapes the kind of weekend you actually need. Check in to set your intention.`,
      variantId: "FB-N1-sat-recovery",
    };
  }

  // V8 - Sunday AM habit: recovery/reset before the week forms.
  if (ctx.dayOfWeek === 0) {
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(ctx.firstNonNoiseEvent.title);
      return {
        title: "Sunday reset",
        body:
          `${ev} on the calendar today. A short reset before the day forms - check in to set your intention.`,
        variantId: "FB-N1-sun-anchored",
      };
    }
    return {
      title: "Sunday reset",
      body:
        `Quiet Sunday on the calendar - a short reset lands you before the week forms. Check in to set your intention.`,
      variantId: "FB-N1-sun-reset",
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? "s" : ""}`;
    return {
      title: "Setting the day",
      body:
        `${m} ahead today. Three minutes of clarity now beats reacting to the calendar - check in to set your intention.`,
      variantId: "FB-N1-calendar",
    };
  }
  return {
    title: "Room to breathe today",
    body: `Only ${ctx.eventCount} meeting${
      ctx.eventCount === 1 ? "" : "s"
    } on the calendar today gives you the rare chance to choose what your mind owns. Use the space - check in to set your intention.`,
    variantId: "FB-N1-light",
  };
}

function getFallbackNudgeOneJitCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: "Preparing mental performance",
    body:
      `From your morning Plan: ${ev} in ${minutesUntil} min. Walk in with the edge, not the anxiety - log in to prep your mind.`,
    variantId: "FB-N1-JIT",
  };
}

// V8 - Post-travel JIT variant: lead with travel-recovery awareness, then JIT, then CTA.
function getFallbackNudgeOneJitPostTravelCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: "Preparing mental performance",
    body:
      `From your morning Plan: ${ev} in ${minutesUntil} min. Yesterday included travel - log in to prep your mind.`,
    variantId: "FB-N1-JIT-post-travel",
  };
}

function getFallbackNudgeTwoJitCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  if (minutesUntil <= 120) {
    return {
      title: "Preparing mental performance",
      body:
        `From your plan: ${ev} in ${minutesUntil} min. Walk in sharp - log in to prep your mind.`,
      variantId: "FB-N2-JIT-soon",
    };
  }
  const eventTime = new Date(Date.now() + minutesUntil * 60000);
  const timeStr = eventTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    title: "Preparing mental performance",
    body:
      `From your plan: ${ev} at ${timeStr}. Front-load the prep instead of scrambling later - log in to prep your mind.`,
    variantId: "FB-N2-JIT-later",
  };
}

function getFallbackNudgeTwoPrioritiesCopy(
  remaining: number,
  _priorityTitle: string,
): NudgeCopy {
  const p = `${remaining} practice${remaining > 1 ? "s" : ""}`;
  return {
    title: "Recalibrating mid-day",
    body:
      `${p} still open on today's plan. Stay sharp instead of running on fumes - check in to recalibrate.`,
    variantId: "FB-N2-priorities",
  };
}

function getFallbackNudgeTwoRecalibrateCopy(eventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: "Mid-day reset window",
    body:
      `Your morning state was low and ${ev} is next. This is the recovery window - check in to recalibrate.`,
    variantId: "FB-N2-recal",
  };
}

function getFallbackNudgeTwoReservesCopy(
  nextEventTitle: string,
  signal: "rhr" | "hrv",
): NudgeCopy {
  const ev = truncateEventTitle(nextEventTitle);
  if (signal === "rhr") {
    return {
      title: "Managing the moment",
      body:
        `You're running warm (RHR elevated) and ${ev} is next. Short, sharp, built for right now - log in to prep your state.`,
      variantId: "FB-N2-reserves-rhr",
    };
  }
  return {
    title: "Managing the moment",
    body:
      `You're running low (HRV below baseline) and ${ev} is next. Short, sharp, built for right now - log in to prep your state.`,
    variantId: "FB-N2-reserves-hrv",
  };
}

function getFallbackNudgeTwoConsecutiveLowCopy(daysLow: number): NudgeCopy {
  return {
    title: "Recovery deficit detected",
    body:
      `Your body's been under-recovering for ${daysLow} days. That's a load signal, not a weakness - log in to recalibrate your mind.`,
    variantId: "FB-N2-consec-low",
  };
}

// ── v5.3 - Travel arc + look-ahead fallback copy ──
// Self-sufficient bodies (the in-flight one names the protocol so the user
// can still act if they have no Wi-Fi). All comply with the V8 qualified
// mind-prep CTA contract.
function getFallbackNudgeOnePreFlightCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  const { goal } = travelPhaseFraming("pre");
  return {
    title: "Travel ahead",
    body: `${ev} in ~${minutesUntil} min. ${goal} - log in to prep your state.`,
    variantId: "nudge_one_pre_flight",
  };
}

function getFallbackNudgeTwoInFlightCopy(eventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  const { goal, outcome } = travelPhaseFraming("during");
  return {
    title: "Mid-air reset",
    body:
      `You're in the air on ${ev}. ${goal}. ${outcome} - open in the app, or run it yourself: 4-in / 6-out for 2 minutes.`,
    variantId: "nudge_two_in_flight",
  };
}

function getFallbackNudgeOnePostArrivalCopy(): NudgeCopy {
  const { goal } = travelPhaseFraming("post");
  return {
    title: "Recovery context",
    body:
      `Yesterday included travel - body may still be carrying load. ${goal} - check in to recalibrate.`,
    variantId: "nudge_one_post_arrival",
  };
}

function getFallbackNudgeThreeLookaheadCopy(
  tomorrowEventTitle: string,
): NudgeCopy {
  const ev = truncateEventTitle(tomorrowEventTitle);
  return {
    title: "Tomorrow forms tonight",
    body:
      `${ev} on tomorrow's calendar. A clean close tonight is half the prep - log in to prep your mind tonight.`,
    variantId: "nudge_three_lookahead",
  };
}

function getFallbackNudgeThreeCopy(ctx: NudgeContext): NudgeCopy {
  const prioritiesRemaining = ctx.pendingPracticeIds.length;
  const prioritiesTotal = ctx.completedPracticeIds.length +
    ctx.pendingPracticeIds.length;

  if (ctx.dayOfWeek === 0) {
    const tomorrowCount = ctx.tomorrowEvents.filter((e) =>
      !isNoiseEvent(e.title || "")
    ).length;
    const tomorrowStakes = ctx.tomorrowEvents.filter((e) =>
      isHighStakes(e.title)
    );
    if (tomorrowStakes.length > 0) {
      const ev = truncateEventTitle(tomorrowStakes[0].title);
      return {
        title: "Big Monday - pre-loading now",
        body:
          `Tomorrow opens with ${ev}. Wake up ahead instead of behind - log in to prep your mind tonight.`,
        variantId: "FB-N3-sun-stakes",
      };
    }
    if (tomorrowCount >= 4) {
      return {
        title: "Monday is already mapped",
        body:
          `Tomorrow opens with ${tomorrowCount} meetings. Three minutes of clarity tonight beats two hours of catch-up - check in to set tomorrow.`,
        variantId: "FB-N3-sun-heavy",
      };
    }
    return {
      title: "Carrying the right things into Monday",
      body: `Light Monday ahead - ${tomorrowCount} meeting${
        tomorrowCount === 1 ? "" : "s"
      } on the calendar. Decide what you're bringing in - check in to set tomorrow.`,
      variantId: "FB-N3-sun-default",
    };
  }

  if (ctx.dayOfWeek === 5) {
    if (ctx.eventCount > 0) {
      return {
        title: "Week complete",
        body:
          `${ctx.eventCount} meetings behind you this week. Close the week before it bleeds into the weekend - check in to close the week.`,
        variantId: "FB-N3-fri",
      };
    }
    return {
      title: "Week complete",
      body:
        `Five days of leadership behind you this week. Close the week cleanly so it doesn't bleed into the weekend - check in to close the week.`,
      variantId: "FB-N3-fri-light",
    };
  }

  if (ctx.dayOfWeek === 6) {
    return {
      title: "The body's still catching up",
      body:
        `Recovery from the week isn't instant - even on Saturday. A short check-in tells you what kind of weekend you actually need - check in to land the weekend.`,
      variantId: "FB-N3-sat",
    };
  }

  if (prioritiesRemaining > 0) {
    const p = `${prioritiesRemaining} practice${
      prioritiesRemaining > 1 ? "s" : ""
    }`;
    return {
      title: "Closing strong",
      body:
        `${p} still open on today's plan and the day is winding down. Land the close before tomorrow loads up - check in to close the day.`,
      variantId: "FB-N3-priorities",
    };
  }
  if (prioritiesTotal > 0 && prioritiesRemaining === 0) {
    return {
      title: "Closing strong",
      body: `${prioritiesTotal} practice${
        prioritiesTotal === 1 ? "" : "s"
      } done today. Land it cleanly so tomorrow opens fresh - check in to close the day.`,
      variantId: "FB-N3-done",
    };
  }

  if (ctx.hasWearableData && ctx.wearable.rhrElevated) {
    return {
      title: "Recovery in progress",
      body:
        `Your body ran warm today (RHR elevated). Close the day with a short reset before tomorrow loads up - log in to recalibrate your mind.`,
      variantId: "FB-N3-rhr",
    };
  }
  if (ctx.eventCount >= 6) {
    return {
      title: "Evening cool-down",
      body:
        `${ctx.eventCount} meetings, no real break for your mind today. Close the day before it carries into tomorrow - log in to recalibrate your mind.`,
      variantId: "FB-N3-heavy",
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? "s" : ""}`;
    return {
      title: "Closing the day",
      body:
        `${m} behind you today. Close cleanly so tomorrow opens fresh - check in to close the day.`,
      variantId: "FB-N3-default",
    };
  }
  return {
    title: "Closing the day",
    body:
      `Quiet day on the calendar today, but tomorrow still benefits from a clean close tonight - check in to close the day.`,
    variantId: "FB-N3-light",
  };
}

// ══════════════════════════════════════════════════════════════
// ── MVP Nudge Evaluators (Nudge 1, 2, 3) ──
// ══════════════════════════════════════════════════════════════

/**
 * NUDGE 1, First Touch (earliest relevant moment)
 *
 * Priority order:
 * A) JIT morning event (high-stakes < 2h away) → /executive-home
 * B) Loaded day (3+ meetings, first event < 2h) → /daily-check-in
 * C) Light day → /daily-check-in
 *
 * Calendar-aware timing: adapts window to first meeting start.
 * Gate: No morning check-in yet (or no JIT plan started).
 */
async function evaluateNudgeOne(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  sentEventRefs: Set<string>,
  supabase: SupabaseLoose,
): Promise<QualifiedNudge | null> {
  if (
    alreadySentTypes.has("nudge_one") || alreadySentTypes.has("morning_prep")
  ) return null;

  // ── v5.3 - Travel arc: pre-flight rides the morning slot ──
  if (ctx.dayContext.preFlight) {
    const pf = ctx.dayContext.preFlight;
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeOnePreFlightCopy(pf.eventTitle, pf.minutesUntil),
      ctx,
      "nudge_one_morning",
    );
    if (copy) {
      return {
        type: "nudge_one",
        copy,
        deepLinkRoute: "/recalibrate",
        priority: 0,
        anchorKind: "state",
        slot: "morning",
        signalStrength: 3,
      };
    }
  }

  // ── v5.3 - Post-arrival recovery rides the morning slot ──
  if (ctx.dayContext.postTravel && ctx.morningCheckinOutcome === null) {
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeOnePostArrivalCopy(),
      ctx,
      "nudge_one_morning",
    );
    if (copy) {
      return {
        type: "nudge_one",
        copy,
        deepLinkRoute: "/daily-check-in",
        priority: 0,
        anchorKind: "state",
        slot: "morning",
        signalStrength: 2,
      };
    }
  }

  // ── v5.3 - PTO / public-holiday "light touch": single morning nudge,
  // skip JIT pre-event prep entirely. Falls through to morning anchor.
  const ptoMode = ctx.dayContext.ptoMode === true;

  // V8 weekend morning policy:
  // - Saturday AM with a meeting: fire calendar-anchored (slower entry, Saturday tone).
  // - Saturday AM no meeting: fire recovery/reset state-anchored nudge (09:00–10:30).
  // - Sunday AM: always fire recovery/reset habit nudge (08:00–10:30 if no meeting,
  //   calendar-anchored if a meeting exists).

  // ── A) JIT morning event - check first ──
  // v5: drop the jit_horizons_surfaced requirement so the lure fires on
  // any high-stakes event detected by the JIT scoring layer.
  if (ctx.morningCheckinOutcome === null || ctx.jitEvents.length > 0) {
    if (ptoMode) {
      // PTO: never fire JIT pre-event prep on a day off.
    } else {
      for (const evt of ctx.jitEvents) {
        if (evt.confidenceBand === "none") continue;
        if (sentEventRefs.has(evt.externalId)) continue;
        if (suppressJitForNotificationOnlyCategory(evt.eventTitle)) {
          console.log(
            `[smart-nudges] suppressing JIT for notification-only category event="${
              evt.eventTitle || "unknown"
            }"`,
          );
          continue;
        }

        const minutesUntil = Math.round(
          (new Date(evt.eventStart).getTime() - Date.now()) / 60000,
        );
        if (minutesUntil < 30 || minutesUntil > 180) continue; // 30 min – 3 h window

        // v5: only require the JIT context row not be dismissed; do NOT
        // require horizons to be precomputed (that gate killed almost all
        // JIT lures in production for 7 days running).
        const { data: jitPlan } = await supabase
          .from("jit_event_context")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("id", evt.eventId)
          .eq("dismissed_by_user", false)
          .limit(1);
        if (!jitPlan || jitPlan.length === 0) continue;

        // ── v5.3 - JIT silence when prep is already consumed ──
        // If today's plan ledger marks a matching priority as completed,
        // skip - the user has already done the work.
        const { data: ledgerRows } = await supabase
          .from("daily_ritual_completions")
          .select("plan_ledger")
          .eq("user_id", ctx.userId)
          .eq("ritual_date", ctx.todayStr);
        const ledger = (ledgerRows || []).flatMap((r: any) =>
          (r.plan_ledger as any[]) || []
        );
        const evtBucket = (evt.eventTitle || "").toLowerCase();
        const prepDone = ledger.some((p: any) => {
          const status = String(p?.status || "").toLowerCase();
          const ref = String(p?.event_reference || "").toLowerCase();
          const title = String(p?.title || "").toLowerCase();
          return status === "completed" &&
            (ref === evt.externalId.toLowerCase() ||
              (evtBucket &&
                (ref.includes(evtBucket) || title.includes(evtBucket))));
        });
        if (prepDone) {
          console.log(
            `[smart-nudges][v5.3] JIT silenced (prep_already_done) user=${
              redactUserId(ctx.userId)
            } event=${evt.externalId}`,
          );
          continue;
        }

        const aiCopy = await generateNudgeCopy(ctx, "nudge_one_jit", {
          eventTitle: evt.eventTitle || "Upcoming event",
          minutesUntil,
        }, supabase);
        const copy = aiCopy || validateStaticFallbackCopy(
          ctx.dayContext.postTravel
            ? getFallbackNudgeOneJitPostTravelCopy(
              evt.eventTitle || "Upcoming event",
              minutesUntil,
            )
            : getFallbackNudgeOneJitCopy(
              evt.eventTitle || "Upcoming event",
              minutesUntil,
            ),
          ctx,
          "nudge_one_jit",
        );
        if (!copy) continue;

        // Route by check-in state - if user hasn't done check-in yet, send
        // them to the brief; otherwise send them to the queued plan.
        const route = ctx.morningCheckinOutcome === null
          ? "/daily-check-in"
          : "/executive-home";

        // v7 - pattern-cited JIT outranks plain JIT in the comparator.
        const pat = findEventPattern(ctx.pattern, evt.eventTitle);
        const sigStrength = pat ? 3 : 2;

        return {
          type: "nudge_one",
          copy,
          deepLinkRoute: route,
          eventReference: evt.externalId,
          priority: 0,
          anchorKind: "jit",
          slot: "morning",
          signalStrength: sigStrength,
        };
      }
    }
  }

  // ── B & C) Morning check-in (loaded vs light day) ──
  if (ctx.morningCheckinOutcome !== null) return null; // Already checked in

  // v5 - calendar-anchored morning timing
  // Hard floor: 08:00 local. If a first meeting exists, we anchor 60–90 min
  // before but never earlier than 08:00. If no first meeting, 08:00–09:30.
  if (!isWithinMorningAnchorWindow(ctx)) return null;

  // Don't fire if first event is < 30 min away (we already missed the window)
  if (ctx.firstNonNoiseEvent) {
    const minutesUntil =
      (new Date(ctx.firstNonNoiseEvent.start_time).getTime() - Date.now()) /
      60000;
    if (minutesUntil < 30) return null;
  }

  const aiCopy = await generateNudgeCopy(
    ctx,
    "nudge_one_morning",
    {},
    supabase,
  );
  const copy = aiCopy ||
    validateStaticFallbackCopy(
      getFallbackNudgeOneMorningCopy(ctx),
      ctx,
      "nudge_one_morning",
    );
  if (!copy) return null;

  return {
    type: "nudge_one",
    copy,
    deepLinkRoute: "/daily-check-in",
    priority: 0,
    anchorKind: "state",
    slot: "morning",
    signalStrength: ctx.hasWearableData ? 2 : 1,
  };
}

/**
 * NUDGE 2, Mid-day Action (plan-driven)
 *
 * Priority order:
 * A) JIT event approaching (30-360 min) → /executive-home
 * B) Priorities incomplete (afternoon) → /executive-home
 * C) State-aware recalibrate (low morning + heavy PM) → /daily-check-in
 *
 * Window: 9:30-16:00
 * Gate: Plan must exist (priorities generated or JIT plan)
 */
async function evaluateNudgeTwo(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  sentEventRefs: Set<string>,
  supabase: SupabaseLoose,
): Promise<QualifiedNudge | null> {
  if (
    alreadySentTypes.has("nudge_two") || alreadySentTypes.has("pre_event_prep")
  ) return null;
  if (ctx.localTime < GLOBAL_EARLIEST_LOCAL || ctx.localTime >= 16) return null;

  // ── v5.3 - In-flight reset rides the mid-day slot ──
  if (ctx.dayContext.inFlight) {
    const ifl = ctx.dayContext.inFlight;
    const copy = validateStaticFallbackCopy(
      getFallbackNudgeTwoInFlightCopy(ifl.eventTitle),
      ctx,
      "nudge_two_recalibrate",
    );
    if (copy) {
      return {
        type: "nudge_two",
        copy,
        deepLinkRoute: "/recalibrate",
        priority: 1,
        anchorKind: "state",
        slot: "afternoon",
        signalStrength: 3,
      };
    }
  }

  // ── v5.3 - PTO collapse: no mid-day or JIT on PTO days ──
  if (ctx.dayContext.ptoMode) return null;

  // ── A) JIT event approaching ──
  for (const evt of ctx.jitEvents) {
    if (evt.confidenceBand === "none") continue;
    if (sentEventRefs.has(evt.externalId)) continue;
    if (suppressJitForNotificationOnlyCategory(evt.eventTitle)) {
      console.log(
        `[smart-nudges] suppressing JIT for notification-only category event="${
          evt.eventTitle || "unknown"
        }"`,
      );
      continue;
    }

    const minutesUntil = Math.round(
      (new Date(evt.eventStart).getTime() - Date.now()) / 60000,
    );
    // v5 - focus on the 30 min – 3 h pre-event window
    if (minutesUntil < 30 || minutesUntil > 180) continue;

    // v5 - drop horizons-surfaced gate (was killing all JIT lures in prod)
    const { data: jitPlan } = await supabase
      .from("jit_event_context")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("id", evt.eventId)
      .eq("dismissed_by_user", false)
      .limit(1);
    if (!jitPlan || jitPlan.length === 0) continue;

    const aiCopy = await generateNudgeCopy(ctx, "nudge_two_jit", {
      eventTitle: evt.eventTitle || "Upcoming event",
      minutesUntil,
    }, supabase);
    const copy = aiCopy || validateStaticFallbackCopy(
      getFallbackNudgeTwoJitCopy(
        evt.eventTitle || "Upcoming event",
        minutesUntil,
      ),
      ctx,
      "nudge_two_jit",
    );
    if (!copy) continue;

    // v5 smart routing - brief if check-in pending, plan if check-in done
    const checkedInToday = ctx.morningCheckinOutcome !== null ||
      ctx.afternoonCheckinOutcome !== null;
    const route = checkedInToday ? "/executive-home" : "/daily-check-in";

    const pat = findEventPattern(ctx.pattern, evt.eventTitle);
    const sigStrength = pat ? 3 : 2;

    return {
      type: "nudge_two",
      copy,
      deepLinkRoute: route,
      eventReference: evt.externalId,
      priority: 1,
      anchorKind: "jit",
      slot: "afternoon",
      signalStrength: sigStrength,
    };
  }

  // ── A2) Wearable-state lure (v5 NEW) ──
  // Reserves are down + a high-stakes event remains today + user hasn't
  // opened the app recently → invite into the brief to recalibrate.
  if (ctx.hasWearableData) {
    const reservesDown = ctx.wearable.rhrElevated ||
      (ctx.wearable.hrvDeltaPct !== null && ctx.wearable.hrvDeltaPct < -15);
    const upcomingHighStakes = ctx.highStakesEvents.filter(
      (e) => new Date(e.start_time).getTime() > Date.now(),
    );
    const recentlyOpened = ctx.lastAppOpen &&
      (Date.now() - ctx.lastAppOpen.getTime()) < 4 * 60 * 60 * 1000;
    if (reservesDown && upcomingHighStakes.length > 0 && !recentlyOpened) {
      const evTitle = upcomingHighStakes[0].title ||
        "your next high-stakes meeting";
      const signal: "rhr" | "hrv" = ctx.wearable.rhrElevated ? "rhr" : "hrv";
      const aiCopy = await generateNudgeCopy(ctx, "nudge_two_reserves", {
        eventTitle: evTitle,
        signal,
      }, supabase);
      const copy = aiCopy || validateStaticFallbackCopy(
        getFallbackNudgeTwoReservesCopy(evTitle, signal),
        ctx,
        "nudge_two_reserves",
      );
      if (!copy) {
        // No compliant copy available; skip this lure rather than send V7 phrasing.
      } else {
        return {
          type: "nudge_two",
          copy,
          deepLinkRoute: "/daily-check-in",
          priority: 1,
          anchorKind: "state",
          slot: "afternoon",
          signalStrength: 2,
        };
      }
    }
  }

  // ── B) Priorities incomplete (afternoon, 13:00+) - v7 LEGACY GENERIC ──
  // Suppressed by default; framework retained behind LEGACY_GENERIC_NUDGES_ENABLED.
  if (
    LEGACY_GENERIC_NUDGES_ENABLED && ctx.localTime >= 13 &&
    ctx.pendingPracticeIds.length > 0
  ) {
    const priorityTitle = "Priority 1"; // Generic, we don't have practice names in context
    const remaining = ctx.pendingPracticeIds.length;

    const aiCopy = await generateNudgeCopy(ctx, "nudge_two_priorities", {
      remainingCount: remaining,
      priorityTitle,
    }, supabase);
    const copy = aiCopy || validateStaticFallbackCopy(
      getFallbackNudgeTwoPrioritiesCopy(remaining, priorityTitle),
      ctx,
      "nudge_two_priorities",
    );
    if (!copy) return null;

    return {
      type: "nudge_two",
      copy,
      deepLinkRoute: "/executive-home",
      priority: 1,
      anchorKind: "state",
      slot: "afternoon",
      signalStrength: 1,
    };
  }

  // ── C) State-aware recalibrate (low morning + heavy afternoon) ──
  if (
    !ctx.isWeekend && ctx.morningCheckinOutcome &&
    LOW_TIERS.includes(ctx.morningCheckinOutcome)
  ) {
    const afternoonHighStakes = ctx.highStakesEvents.filter((e) => {
      // Batch B follow-up: filter afternoon events in the user's tz.
      const hour = eventHourInTimezone(e.start_time, ctx.timeZone);
      return hour >= 12;
    });

    if (afternoonHighStakes.length > 0) {
      const eventTitle = afternoonHighStakes[0].title || "your next meeting";
      const aiCopy = await generateNudgeCopy(ctx, "nudge_two_recalibrate", {
        eventTitle,
      }, supabase);
      const copy = aiCopy || validateStaticFallbackCopy(
        getFallbackNudgeTwoRecalibrateCopy(eventTitle),
        ctx,
        "nudge_two_recalibrate",
      );
      if (!copy) return null;

      return {
        type: "nudge_two",
        copy,
        deepLinkRoute: "/daily-check-in",
        priority: 1,
        anchorKind: "state",
        slot: "afternoon",
        signalStrength: 2,
      };
    }
  }

  return null;
}

/**
 * NUDGE 3, Evening Close (reflection + forward-set)
 *
 * Weekday: 18:00-21:30 → /daily-check-in
 * Friday: 18:30-21:30 (close-the-week)
 * Sunday: ONLY 17:00-19:30 (week-prep framing)
 * Saturday: DISABLED (their time)
 *
 * Gate: No evening check-in yet
 * Gate: Exempt from signal richness (drive check-in KPI)
 */
async function evaluateNudgeThree(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
): Promise<QualifiedNudge | null> {
  const log = (reason: string, extra?: unknown) =>
    console.log(
      `[nudge_three] user=${redactUserId(ctx.userId)} reason=${reason}${
        extra !== undefined ? " " + JSON.stringify(extra) : ""
      }`,
    );

  if (
    alreadySentTypes.has("nudge_three") || alreadySentTypes.has("evening_close")
  ) {
    log("already_sent_today");
    return null;
  }

  // ── v5.3 - PTO collapse: no evening close on PTO days ──
  if (ctx.dayContext.ptoMode) {
    log("pto_mode");
    return null;
  }

  // Saturday: NO evening nudge
  if (ctx.dayOfWeek === 6) {
    log("saturday_skip");
    return null;
  }

  // Skip if user already reflected today
  if (ctx.checkinCountToday >= 2) {
    log("checkin_count_ge_2", { count: ctx.checkinCountToday });
    return null;
  }
  if (ctx.afternoonCheckinOutcome !== null) {
    log("afternoon_checkin_present");
    return null;
  }

  let eveningStart = 18;
  let eveningEnd = 21.5;

  // Sunday: ONLY early evening (17:00-19:30) - recovery + mental prep tone
  if (ctx.dayOfWeek === 0) {
    eveningStart = 17;
    eveningEnd = 19.5;
  }
  // Friday: slightly earlier OK
  if (ctx.dayOfWeek === 5) {
    eveningStart = 18.5;
  }

  // v5 hard caps
  eveningStart = Math.max(eveningStart, GLOBAL_EARLIEST_LOCAL);
  eveningEnd = Math.min(eveningEnd, GLOBAL_LATEST_LOCAL);

  if (ctx.localTime < eveningStart || ctx.localTime >= eveningEnd) {
    log("outside_evening_window", {
      localTime: ctx.localTime,
      eveningStart,
      eveningEnd,
    });
    return null;
  }

  // ── v5.3 - Look-ahead overlay: any evening (not just Sunday) where
  // tomorrow has a high-stakes event in the next 18 h gets a forward-set.
  const nowLookahead = Date.now();
  const lookaheadStakes = ctx.tomorrowEvents.find((e) => {
    if (!isHighStakes(e.title)) return false;
    const startMs = new Date(e.start_time).getTime();
    const hours = (startMs - nowLookahead) / 3_600_000;
    return hours >= 0 && hours <= 18;
  });
  if (lookaheadStakes && ctx.dayOfWeek !== 0) {
    const rawLookahead = getFallbackNudgeThreeLookaheadCopy(
      lookaheadStakes.title || "a high-stakes meeting",
    );
    const copy = validateStaticFallbackCopy(rawLookahead, ctx, "nudge_three");
    if (copy) {
      return {
        type: "nudge_three",
        copy,
        deepLinkRoute: "/daily-check-in",
        priority: 2,
        anchorKind: "jit",
        slot: "evening",
        signalStrength: 3,
      };
    } else {
      log("lookahead_copy_rejected", {
        title: lookaheadStakes.title,
        raw: rawLookahead,
      });
    }
  } else {
    log("no_lookahead_match", {
      tomorrowEventCount: ctx.tomorrowEvents.length,
      dayOfWeek: ctx.dayOfWeek,
    });
  }

  const aiCopy = await generateNudgeCopy(ctx, "nudge_three");
  const rawFallback = getFallbackNudgeThreeCopy(ctx);
  const validatedFallback = validateStaticFallbackCopy(
    rawFallback,
    ctx,
    "nudge_three",
  );
  const copy = aiCopy || validatedFallback;
  if (!copy) {
    log("all_copy_paths_failed", {
      aiCopyOk: !!aiCopy,
      fallbackOk: !!validatedFallback,
      rawFallback,
    });
    return null;
  }
  log("emitted", { source: aiCopy ? "ai" : "fallback" });

  // v7 - evening anchors to JIT when tomorrow has a non-noise first meeting,
  // otherwise to STATE (today's load / wearable / Sunday week prep).
  const tomorrowFirst = ctx.tomorrowEvents.find((e) =>
    !isNoiseEvent(e.title || "")
  );
  const anchorKind: "jit" | "state" = tomorrowFirst ? "jit" : "state";

  return {
    type: "nudge_three",
    copy,
    deepLinkRoute: "/daily-check-in",
    priority: 2,
    anchorKind,
    slot: "evening",
    signalStrength: anchorKind === "jit" ? 2 : (ctx.hasWearableData ? 2 : 1),
  };
}

async function projectPlanSlotToNudge(
  ctx: NudgeContext,
  activeSlot: NudgeSlot,
  alreadySentTypes: Set<string>,
  sentEventRefs: Set<string>,
  supabase: SupabaseLoose,
): Promise<QualifiedNudge | null> {
  const slot = (ctx.planSlots ?? []).find((s) => s.slot === activeSlot);
  if (!slot) return null;

  const nudgeType = activeSlot === "morning"
    ? "nudge_one"
    : activeSlot === "afternoon"
    ? "nudge_two"
    : "nudge_three";
  if (alreadySentTypes.has(nudgeType)) return null;

  const slotEventTitle = slot.jitEventTitle || null;
  const matchingJit = slotEventTitle
    ? ctx.jitEvents.find((e) =>
      e.eventTitle?.toLowerCase() === slotEventTitle.toLowerCase()
    ) ?? null
    : null;
  const matchingCalendar = slotEventTitle
    ? ctx.todayEvents.find((e) =>
      e.title?.toLowerCase() === slotEventTitle.toLowerCase()
    ) ?? null
    : null;
  const eventStart = matchingJit?.eventStart ?? matchingCalendar?.start_time ??
    null;
  const minutesUntil = eventStart
    ? Math.round((new Date(eventStart).getTime() - Date.now()) / 60000)
    : null;

  let copy: NudgeCopy | null = null;
  let anchorKind: "jit" | "state" =
    slot.mode === "jit" || slot.mode === "jit+state" || slot.mode === "full_arc"
      ? "jit"
      : "state";
  let eventReference = matchingJit?.externalId ??
    matchingCalendar?.external_id ?? undefined;

  if (activeSlot === "morning" && anchorKind === "jit") {
    const allowMorningJit = slotEventTitle
      ? await shouldAllowProjectedMorningJit(
        ctx,
        slotEventTitle,
        matchingJit,
        minutesUntil,
        sentEventRefs,
        supabase,
      )
      : false;
    if (!allowMorningJit) {
      anchorKind = "state";
      eventReference = undefined;
    }
  }

  if (
    anchorKind === "jit" && slotEventTitle && minutesUntil !== null &&
    minutesUntil >= 0
  ) {
    const aiType = activeSlot === "morning"
      ? "nudge_one_jit"
      : activeSlot === "afternoon"
      ? "nudge_two_jit"
      : "nudge_three";
    const fallback = activeSlot === "morning"
      ? getFallbackNudgeOneJitCopy(slotEventTitle, Math.max(1, minutesUntil))
      : activeSlot === "afternoon"
      ? getFallbackNudgeTwoJitCopy(slotEventTitle, Math.max(1, minutesUntil))
      : getFallbackNudgeThreeLookaheadCopy(slotEventTitle);
    copy = await generateNudgeCopy(ctx, aiType, {
      eventTitle: slotEventTitle,
      minutesUntil: Math.max(1, minutesUntil),
      planSlot: slot,
    }, supabase) || validateStaticFallbackCopy(fallback, ctx, aiType);
  }

  if (!copy) {
    anchorKind = "state";
    if (activeSlot === "morning") {
      if (ctx.morningCheckinOutcome !== null) return null;
      if (!isWithinMorningAnchorWindow(ctx)) return null;
      if (ctx.firstNonNoiseEvent) {
        const minutesUntilFirst =
          (new Date(ctx.firstNonNoiseEvent.start_time).getTime() - Date.now()) /
          60000;
        if (minutesUntilFirst < 30) return null;
      }
    }
    const aiType = activeSlot === "morning"
      ? "nudge_one_morning"
      : activeSlot === "afternoon"
      ? "nudge_two_recalibrate"
      : "nudge_three";
    const fallback = activeSlot === "morning"
      ? getFallbackNudgeOneMorningCopy(ctx)
      : activeSlot === "afternoon"
      ? getFallbackNudgeTwoPrioritiesCopy(
        Math.max(1, ctx.pendingPracticeIds.length || 1),
        "current plan slot",
      )
      : getFallbackNudgeThreeCopy(ctx);
    copy = await generateNudgeCopy(ctx, aiType, {
      planSlot: slot,
      eventTitle: slotEventTitle ?? ctx.firstNonNoiseEvent?.title ?? "today",
    }, supabase) || validateStaticFallbackCopy(fallback, ctx, aiType);
    eventReference = undefined;
  }

  if (!copy) return null;

  return {
    type: nudgeType,
    copy,
    deepLinkRoute: activeSlot === "morning" && anchorKind === "jit" &&
        ctx.morningCheckinOutcome !== null
      ? "/executive-home"
      : "/daily-check-in",
    eventReference,
    priority: activeSlot === "morning" ? 0 : activeSlot === "afternoon" ? 1 : 2,
    anchorKind,
    slot: activeSlot,
    signalStrength: anchorKind === "jit" ? 3 : (ctx.hasWearableData ? 2 : 1),
  };
}

// ══════════════════════════════════════════════════════════════
// ── Week-Ahead Picker Invite (§17.7) ──
// ══════════════════════════════════════════════════════════════

/**
 * Fires 16:00–19:00 local on any active Week-Ahead trigger — weekly
 * planning day (Home Country dependent), end of PTO, end of public holiday,
 * or end of long weekend. Per-reason, per-day dedupe: the caller passes
 * the set of Week-Ahead reasons already delivered today.
 */
async function evaluateWeekAheadPickerInvite(
  ctx: NudgeContext,
  supabase: SupabaseLoose,
  alreadySentReasonsToday: ReadonlySet<string>,
): Promise<QualifiedNudge | null> {
  const log = (reason: string, extra?: unknown) =>
    console.log(
      `[smart-nudges] week_ahead_picker_invite user=${
        redactUserId(ctx.userId)
      } reason=${reason}${
        extra !== undefined ? " " + JSON.stringify(extra) : ""
      }`,
    );

  // Proxy for pickerOpenedToday: any week_ahead_picker signal written today
  // means the user landed in the picker and tagged something. Cheap query,
  // bounded by user_id + occurred_at.
  let pickerOpenedToday = false;
  try {
    const startOfDayIso = new Date(`${ctx.todayStr}T00:00:00Z`).toISOString();
    const { data: openedRows } = await supabase
      .from("event_priority_memory")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("source", "week_ahead_picker")
      .gte("occurred_at", startOfDayIso)
      .limit(1);
    pickerOpenedToday = !!(openedRows && openedRows.length > 0);
  } catch (_) { /* silent - proxy only */ }

  // §17 Week-Ahead - use the hydrated weekAheadInputs bag (built once in
  // buildNudgeContext from real calendar data). Fall back to the legacy
  // best-effort projection only if the bag is somehow missing.
  const wai = ctx.weekAheadInputs ?? {
    ptoTodayAllDay: !!ctx.dayContext.ptoMode,
    ptoTomorrowAllDay: false,
    holidayTodayAllDay: false,
    holidayTomorrowAllDay: false,
    tomorrowIsWorkday: ctx.dayOfWeek >= 0 && ctx.dayOfWeek <= 4,
    consecutiveOffDaysBefore: 0,
    travelDay: ctx.dayContext.kind === "travel-day",
    fullWorkingWeekend: false,
    todayIsOffDay: !!ctx.dayContext.ptoMode || ctx.dayOfWeek === 0 ||
      ctx.dayOfWeek === 6,
    isLastDayOfLongWeekend: false,
    homeCountry: null,
  };
  const wam = evaluateWeekAheadMode({
    dayOfWeek: ctx.dayOfWeek,
    localHour: Math.floor(ctx.localTime),
    homeCountry: wai.homeCountry,
    travelDay: wai.travelDay,
    fullWorkingWeekend: wai.fullWorkingWeekend,
    ptoTodayAllDay: wai.ptoTodayAllDay,
    ptoTomorrowAllDay: wai.ptoTomorrowAllDay,
    holidayAllDayEventToday: wai.holidayTodayAllDay,
    tomorrowIsWorkday: wai.tomorrowIsWorkday,
    isLastDayOfLongWeekend: wai.isLastDayOfLongWeekend,
    todayIsOffDay: wai.todayIsOffDay,
    manualOverride: false,
  });

  const decision = shouldFireWeekAheadPickerInvite({
    dayOfWeek: ctx.dayOfWeek,
    localHour: Math.floor(ctx.localTime),
    weekAheadDecision: wam,
    alreadySentReasonsToday: alreadySentReasonsToday as ReadonlySet<any>,
    pickerOpenedToday,
  });

  // Structured trigger log - always emitted when WAM is active so we can
  // verify the post-PTO / post-holiday / long-weekend branches in edge logs.
  // Filter in supabase__edge_function_logs with `[week-ahead-trigger]`.
  if (
    wam.active || wai.ptoTodayAllDay || wai.holidayTodayAllDay ||
    wai.isLastDayOfLongWeekend
  ) {
    console.log(
      `[week-ahead-trigger] user=${ctx.userId} reason=${
        wam.reason ?? "inactive"
      } fire=${decision.fire} ` +
        `decision_reason=${decision.reason} ` +
        `inputs=${
          JSON.stringify({
            dayOfWeek: ctx.dayOfWeek,
            localHour: Math.floor(ctx.localTime),
            homeCountry: wai.homeCountry,
            ptoTodayAllDay: wai.ptoTodayAllDay,
            ptoTomorrowAllDay: wai.ptoTomorrowAllDay,
            holidayTodayAllDay: wai.holidayTodayAllDay,
            holidayTomorrowAllDay: wai.holidayTomorrowAllDay,
            tomorrowIsWorkday: wai.tomorrowIsWorkday,
            isLastDayOfLongWeekend: wai.isLastDayOfLongWeekend,
            travelDay: wai.travelDay,
            fullWorkingWeekend: wai.fullWorkingWeekend,
            todayIsOffDay: wai.todayIsOffDay,
          })
        } ` +
        `suppressors=${JSON.stringify({ pickerOpenedToday, alreadySentReasonsToday: [...alreadySentReasonsToday] })}`,
    );
  }
  log(`fire=${decision.fire}`, {
    reason: decision.reason,
    wamReason: wam.reason,
    wamActive: wam.active,
    pickerOpenedToday,
  });
  if (!decision.fire) return null;

  // Saturday-planning countries (SA/KW/QA/BH/OM/IL) plan on Saturday
  // evening for a Sunday-start working week; everyone else plans on
  // Sunday for a Monday start. Keep variantId stable (day-neutral) so
  // per-reason dedupe and analytics don't fork.
  const isSaturdayPlanning = planningDayOfWeek(wai.homeCountry) === 6;
  const weeklyPlanningVariant = isSaturdayPlanning
    ? {
        title: "Week reset",
        body:
          "10 priority choices can shape the week before Sunday starts - log in to prep your mind tonight.",
      }
    : {
        title: "Sunday reset",
        body:
          "10 priority choices can shape the week before Monday starts - log in to prep your mind tonight.",
      };
  const variantByReason: Record<string, { title: string; body: string }> = {
    weekly_planning: weeklyPlanningVariant,
    end_of_pto: {
      title: "Last day off",
      body:
        "10 priority choices can shape tomorrow before work restarts - log in to prep your mind.",
    },
    end_of_public_holiday: {
      title: "Re-engaging",
      body:
        "10 priority choices can shape re-entry before work restarts - log in to prep your mind.",
    },
    end_of_long_weekend: {
      title: "Frame the week",
      body:
        "10 priority choices can shape the week before Monday lands - log in to prep your mind.",
    },
  };
  const v = variantByReason[decision.reason] ?? variantByReason.weekly_planning;

  return {
    type: "week_ahead_picker_invite",
    copy: {
      title: v.title,
      body: v.body,
      variantId: `week_ahead_picker_invite::${decision.reason}`,
    },
    deepLinkRoute: "/plan?mode=week-ahead",
    priority: 25,
    anchorKind: "state",
    slot: "evening",
    signalStrength: 2,
  };
}

// ══════════════════════════════════════════════════════════════
// ── Post-MVP Evaluators (wrapped in MVP_POST_LAUNCH flag) ──
// ── Kept for future activation ──
// ══════════════════════════════════════════════════════════════

// P2: Calendar Gap
async function evaluateCalendarGap(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has("calendar_gap")) return null;
  if (ctx.inMeetingNow) return null;
  if (
    ctx.lastCheckinTime &&
    (Date.now() - ctx.lastCheckinTime.getTime()) < 90 * 60000
  ) return null;
  if (ctx.pendingPracticeIds.length === 0) return null;

  const now = Date.now();
  for (const gap of ctx.calendarGaps) {
    const fiveMinIntoGap = gap.startTime.getTime() + 5 * 60000;
    if (now < fiveMinIntoGap || now > gap.endTime.getTime()) continue;
    if (gap.postGapMeetingCount < 2 && !gap.postGapHasHighStakes) continue;

    return {
      type: "calendar_gap",
      copy: {
        title: "Gap Window",
        body:
          `You have ${gap.durationMinutes} minutes. Your next priority is ready.`,
        variantId: "FB-GAP-artifact",
      },
      deepLinkRoute: "/executive-home",
      priority: 3,
      anchorKind: "state",
      slot: "afternoon",
      signalStrength: 1,
    };
  }
  return null;
}

// P3: Coach Commitment + Meeting Match
async function evaluateCoachMeetingMatch(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  supabase: SupabaseLoose,
): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has("coach_meeting_match")) return null;
  if (
    ctx.coach.pendingCommitments.length === 0 &&
    ctx.coach.stressSignals.length === 0
  ) return null;
  if (
    ctx.coach.lastSessionAt &&
    (Date.now() - ctx.coach.lastSessionAt.getTime()) < 2 * 60 * 60 * 1000
  ) return null;

  const { data: todayCoachSessions } = await supabase
    .from("dialogue_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("flow_type", "coach")
    .gte("started_at", `${ctx.todayStr}T00:00:00`)
    .limit(1);
  if (todayCoachSessions && todayCoachSessions.length > 0) return null;

  const now = Date.now();
  const fourHoursLater = now + 4 * 60 * 60 * 1000;
  const upcomingEvents = ctx.nonNoiseEvents.filter((e) => {
    const startMs = new Date(e.start_time).getTime();
    return startMs > now && startMs < fourHoursLater;
  });

  for (const commitment of ctx.coach.pendingCommitments) {
    const commitWords = commitment.text.toLowerCase().split(/\s+/);
    const keyCommitWords = commitWords.filter((w) => w.length > 3);

    for (const event of upcomingEvents) {
      const titleLower = (event.title || "").toLowerCase();
      const matchCount = keyCommitWords.filter((w) =>
        titleLower.includes(w)
      ).length;
      const patternMatch = commitment.patternArea &&
        titleLower.includes(commitment.patternArea.toLowerCase());

      if (matchCount >= 1 || patternMatch) {
        const minutesUntil = Math.round(
          (new Date(event.start_time).getTime() - now) / 60000,
        );
        if (minutesUntil < 45 || minutesUntil > 240) continue;

        return {
          type: "coach_meeting_match",
          copy: {
            title: "Coach Connection",
            body:
              `You committed to work on this – ${event.title} is the moment.`,
            variantId: "FB-COACH",
          },
          deepLinkRoute: `/self-mastery-coach?context=commitment&commitment=${
            encodeURIComponent(commitment.text)
          }&meeting=${encodeURIComponent(event.title || "")}`,
          eventReference: event.external_id,
          commitmentText: commitment.text,
          meetingTitle: event.title || "upcoming meeting",
          priority: 4,
          anchorKind: "jit",
          slot: "afternoon",
          signalStrength: 2,
        };
      }
    }
  }
  return null;
}

// P4: State-Aware Afternoon
async function evaluateStateAwareAfternoon(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (alreadySentTypes.has("state_aware_nudge")) return null;
  if (ctx.isWeekend) return null;
  if (ctx.localTime < 12 || ctx.localTime >= 15) return null;
  if (
    !ctx.morningCheckinOutcome || !LOW_TIERS.includes(ctx.morningCheckinOutcome)
  ) return null;
  if (
    ctx.lastAppOpen &&
    (Date.now() - ctx.lastAppOpen.getTime()) < 3 * 60 * 60 * 1000
  ) return null;

  // Batch B follow-up: classify high-stakes afternoon events in the user's tz.
  const afternoonHighStakes = ctx.highStakesEvents.filter(
    (e) => eventHourInTimezone(e.start_time, ctx.timeZone) >= 12,
  );
  if (afternoonHighStakes.length >= 1) {
    const eventTitle = afternoonHighStakes[0].title || "your next meeting";
    return {
      type: "state_aware_nudge",
      copy: {
        title: "Recalibrate",
        body: `You started low. Recalibrate before ${eventTitle}.`,
        variantId: "FB-STATE-recal",
      },
      deepLinkRoute: "/daily-check-in",
      priority: 5,
      anchorKind: "state",
      slot: "afternoon",
      signalStrength: 2,
    };
  }
  return null;
}

// P6: Pattern Alert
async function evaluatePatternAlert(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  supabase: SupabaseLoose,
): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH || !PATTERN_ALERT_ENABLED) return null;
  if (alreadySentTypes.has("pattern_alert")) return null;
  if (
    ctx.lastAppOpen &&
    (Date.now() - ctx.lastAppOpen.getTime()) < 4 * 60 * 60 * 1000
  ) return null;

  const prettifyPatternLabel = (label: string) =>
    label
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const topEventPattern = [...(ctx.pattern?.event_to_hrv ?? [])]
    .filter((item) => (item.hrvDeltaPct < 0 || item.rhrElevated) && item.n >= 3)
    .sort((a, b) => {
      const confidenceWeight = (value: "strong" | "emerging") =>
        value === "strong" ? 1 : 0;
      return (
        confidenceWeight(b.confidence) - confidenceWeight(a.confidence) ||
        Math.abs(b.hrvDeltaPct) - Math.abs(a.hrvDeltaPct) ||
        b.n - a.n
      );
    })[0] ?? null;

  if (topEventPattern) {
    const eventLabel = prettifyPatternLabel(topEventPattern.event_type);
    const magnitude = Math.abs(Math.round(topEventPattern.hrvDeltaPct));
    return {
      type: "pattern_alert",
      copy: {
        title: "Your pattern is ready",
        body:
          `${eventLabel} is showing up in your data - about ${magnitude}% lower HRV when it hits. See what it is costing you.`,
        variantId: "FB-PATTERN",
      },
      deepLinkRoute: "/insights/performance-causality",
      priority: topEventPattern.confidence === "strong" ? 3 : 2,
      anchorKind: "state",
      slot: "morning",
      signalStrength: topEventPattern.confidence === "strong" ? 2 : 1,
    };
  }

  const consecutiveLoad = ctx.pattern?.consecutive_load;
  if (
    consecutiveLoad && consecutiveLoad.tailDeltaPct < 0 &&
    consecutiveLoad.n >= 3
  ) {
    const magnitude = Math.abs(Math.round(consecutiveLoad.tailDeltaPct));
    return {
      type: "pattern_alert",
      copy: {
        title: "Your pattern is ready",
        body:
          `Consecutive high-load days are showing up in your data - about ${magnitude}% lower recovery at the tail. See what it is costing you.`,
        variantId: "FB-PATTERN",
      },
      deepLinkRoute: "/insights/performance-causality",
      priority: consecutiveLoad.confidence === "strong" ? 3 : 2,
      anchorKind: "state",
      slot: "morning",
      signalStrength: consecutiveLoad.confidence === "strong" ? 2 : 1,
    };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: finding } = await supabase
    .from("causality_findings")
    .select("top_finding_label, top_finding_delta_pct, confidence, generated_at")
    .eq("user_id", ctx.userId)
    .gte("generated_at", monthStart.toISOString())
    .in("confidence", ["strong", "emerging"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (finding?.top_finding_label) {
    return {
      type: "pattern_alert",
      copy: {
        title: "Your pattern is ready",
        body: `${finding.top_finding_label} is showing up in your data. See what it is costing you.`,
        variantId: "FB-PATTERN",
      },
      deepLinkRoute: "/insights/performance-causality",
      priority: finding.confidence === "strong" ? 3 : 2,
      anchorKind: "state",
      slot: "morning",
      signalStrength: finding.confidence === "strong" ? 2 : 1,
    };
  }

  return null;
}

// P7: Daily Fallback
async function evaluateDailyFallback(
  ctx: NudgeContext,
  alreadySentTypes: Set<string>,
  todayLogCount: number,
): Promise<QualifiedNudge | null> {
  if (!MVP_POST_LAUNCH) return null;
  if (todayLogCount > 0) return null;
  if (ctx.localTime < 10 || ctx.localTime >= 12) return null;
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── Signal Richness Gate ──
// ══════════════════════════════════════════════════════════════

function computeSignalRichness(ctx: NudgeContext): {
  hasCalendar: boolean;
  hasWearable: boolean;
  hasCheckin: boolean;
  hasCoach: boolean;
  signalCount: number;
} {
  const hasCalendar = ctx.nonNoiseEvents.length > 0;
  const hasWearable = ctx.hasWearableData;
  const hasCheckin = ctx.checkinCountToday > 0;
  const hasCoach = ctx.coach.pendingCommitments.length > 0 ||
    ctx.coach.sessionsIn7d > 0;
  const signalCount =
    [hasCalendar, hasWearable, hasCheckin, hasCoach].filter(Boolean).length;
  return { hasCalendar, hasWearable, hasCheckin, hasCoach, signalCount };
}

// ══════════════════════════════════════════════════════════════
// ── Day helpers ──
// ══════════════════════════════════════════════════════════════

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

function isInDND(
  hour: number,
  dndStart: number | null,
  dndEnd: number | null,
): boolean {
  if (dndStart === null || dndEnd === null) return false;
  if (dndStart < dndEnd) return hour >= dndStart && hour < dndEnd;
  return hour >= dndStart || hour < dndEnd;
}

type NotificationTraceOutcome =
  | "no_active_device_token"
  | "outside_global_window"
  | "dnd_window"
  | "daily_cap"
  | "two_hour_suppression"
  | "light_day_strong_state"
  | "no_qualified_nudge"
  | "plan_ready_morning_fallback"
  | "week_ahead_not_in_window"
  | "week_ahead_already_sent_this_week"
  | "week_ahead_not_selected"
  | "week_ahead_selected"
  | "leader_pref_weekend_off"
  | "leader_pref_weekend_light_non_morning"
  | "plan_snapshot_empty_fallback"
  | "slot_projection_skipped"
  | "apns_attempted"
  | "apns_accepted"
  | "apns_rejected"
  | "back_to_back_skip"
  | "duplicate_claim";

interface TraceDetails {
  localDate?: string | null;
  localHour?: number | null;
  timezoneOffset?: number | null;
  notificationType?: string | null;
  variantId?: string | null;
  notificationLogId?: string | null;
  apnsStatus?: number | null;
  apnsReason?: string | null;
  tokenPrefix?: string | null;
  metadata?: Record<string, unknown>;
}

// ══════════════════════════════════════════════════════════════
// ── Main Handler ──
// ══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let supabase: SupabaseLoose | null = null;
  let runId: string | null = null;
  let processedUserCount = 0;
  let qualifiedCount = 0;
  let shippedCount = 0;
  let apnsAttemptedCount = 0;
  let apnsSucceededCount = 0;
  let apnsFailedCount = 0;
  const traceRows: Array<Record<string, unknown>> = [];

  // Phase 4 — per-user leader preferences captured at loop entry so
  // every downstream trace() call automatically carries them onto
  // notification_evaluator_traces.metadata.leaderPreferences without
  // having to touch each individual callsite.
  const leaderPrefsByUser = new Map<string, {
    brief_timing_raw: string | null;
    brief_timing: "morning" | "afternoon" | "evening" | null;
    reset_modality_raw: string | null;
    reset_modality: string | null;
    weekend_signals_raw: string | null;
    weekend_signals: "full" | "light" | "off" | null;
    profile_status: string;
  }>();

  const trace = (
    userId: string,
    outcome: NotificationTraceOutcome,
    details: TraceDetails = {},
  ) => {
    const leaderPrefs = leaderPrefsByUser.get(userId);
    const mergedMetadata: Record<string, unknown> = {
      ...(leaderPrefs ? { leaderPreferences: leaderPrefs } : {}),
      ...(details.metadata ?? {}),
    };
    traceRows.push({
      run_id: runId,
      evaluator: "smart-nudges",
      evaluator_version: EVALUATOR_VERSION,
      user_id: userId,
      local_date: details.localDate ?? null,
      local_hour: details.localHour ?? null,
      timezone_offset: details.timezoneOffset ?? null,
      outcome,
      notification_type: details.notificationType ?? null,
      variant_id: details.variantId ?? null,
      notification_log_id: details.notificationLogId ?? null,
      apns_status: details.apnsStatus ?? null,
      apns_reason: details.apnsReason ?? null,
      token_prefix: details.tokenPrefix ?? null,
      metadata: mergedMetadata,
    });
  };

  const flushTraces = async () => {
    if (!supabase || !runId || traceRows.length === 0) return;
    const rows = traceRows.splice(0, traceRows.length).map((row) => ({
      ...row,
      run_id: runId,
    }));
    const { error } = await supabase.from("notification_evaluator_traces")
      .insert(rows);
    if (error) {
      console.warn(
        "[smart-nudges] trace insert failed:",
        error.message ?? error,
      );
    }
  };

  const finishRun = async (topLevelError: string | null = null) => {
    if (!supabase || !runId) return;
    await flushTraces();
    const { error } = await supabase
      .from("notification_evaluator_runs")
      .update({
        finished_at: new Date().toISOString(),
        processed_user_count: processedUserCount,
        qualified_count: qualifiedCount,
        shipped_count: shippedCount,
        apns_attempted_count: apnsAttemptedCount,
        apns_succeeded_count: apnsSucceededCount,
        apns_failed_count: apnsFailedCount,
        top_level_error: topLevelError,
      })
      .eq("id", runId);
    if (error) {
      console.warn("[smart-nudges] run update failed:", error.message ?? error);
    }
  };

  try {
    const platform = detectClientPlatform(req);
    supabase = wrapDbWithCalendarPrimacy(
      createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      ),
      platform,
    );

    const url = new URL(req.url);

    if (url.searchParams.get("diagnostic") === "1") {
      let userId: string;
      try {
        userId = await verifyAuth0JWT(req);
      } catch (authErr) {
        return new Response(
          JSON.stringify({
            error: authErr instanceof Error ? authErr.message : "Unauthorized",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const [
        { data: tokens },
        { data: lastLog },
        { data: lastWeekAheadTrace },
      ] = await Promise.all([
        supabase
          .from("notification_device_tokens")
          .select("platform, is_active, created_at, updated_at, device_token")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("notification_log")
          .select(
            "id, notification_type, variant_id, sent_at, delivery_state, payload",
          )
          .eq("user_id", userId)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("notification_evaluator_traces")
          .select(
            "created_at, local_date, outcome, notification_type, variant_id, apns_status, apns_reason, token_prefix, metadata",
          )
          .eq("user_id", userId)
          .like("outcome", "week_ahead%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const safeTokens = (tokens || []).map((token: any) => ({
        active: token.is_active === true,
        platform: token.platform,
        registered_at: token.created_at,
        updated_at: token.updated_at,
        token_prefix: String(token.device_token || "").substring(0, 12),
        token_length: String(token.device_token || "").length,
        apns_environment: Deno.env.get("APNS_ENVIRONMENT") || "development",
      }));
      const payload = (lastLog as any)?.payload || {};

      return new Response(
        JSON.stringify({
          user_id: userId,
          active_token_exists: safeTokens.some((token) => token.active),
          tokens: safeTokens,
          apns_environment: Deno.env.get("APNS_ENVIRONMENT") || "development",
          apns_host:
            (Deno.env.get("APNS_ENVIRONMENT") || "development") === "production"
              ? "api.push.apple.com"
              : "api.sandbox.push.apple.com",
          last_notification_log: lastLog
            ? {
              id: (lastLog as any).id,
              notification_type: (lastLog as any).notification_type,
              variant_id: (lastLog as any).variant_id,
              sent_at: (lastLog as any).sent_at,
              delivery_state: (lastLog as any).delivery_state,
              apns_status: payload.apns_status ?? null,
              apns_reason: payload.apns_reason ?? null,
              apns_token_prefix: payload.apns_token_prefix ?? null,
            }
            : null,
          last_week_ahead_trace: lastWeekAheadTrace ?? null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Respect admin cron config: if the Notification Evaluator is disabled in
    // admin_cron_job_configs, skip scheduled evaluation entirely. The `?force_user`
    // test path (checked further below) still bypasses this so admins can trigger
    // one-off runs even when the scheduled job is paused.
    const forceUserIdForGate = url.searchParams.get("force_user") ||
      url.searchParams.get("force_user_id") || null;
    if (!forceUserIdForGate) {
      try {
        const { data: cfg } = await supabase
          .from("admin_cron_job_configs")
          .select("enabled")
          .eq("job_key", "notification_evaluator")
          .maybeSingle();
        if (cfg && (cfg as { enabled?: boolean }).enabled === false) {
          console.log(
            "[smart-nudges] notification_evaluator disabled via admin_cron_job_configs; exiting",
          );
          return new Response(
            JSON.stringify({ skipped: true, reason: "job_disabled" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (err) {
        console.warn(
          "[smart-nudges] admin_cron_job_configs lookup failed; proceeding with defaults",
          err,
        );
      }
    }

    const { data: runRow, error: runErr } = await supabase
      .from("notification_evaluator_runs")
      .insert({
        evaluator: "smart-nudges",
        evaluator_version: EVALUATOR_VERSION,
        environment: Deno.env.get("APP_ENV") ||
          Deno.env.get("APNS_ENVIRONMENT") || "unknown",
        metadata: {
          client_platform: platform,
          apns_environment: Deno.env.get("APNS_ENVIRONMENT") || "development",
        },
      })
      .select("id")
      .single();
    if (runErr) {
      console.warn(
        "[smart-nudges] run insert failed:",
        runErr.message ?? runErr,
      );
    }
    runId = runRow?.id ?? null;

    console.log(
      "[smart-nudges] Starting evaluation run (v7 JIT-or-State, prep CTA, unified pattern store)...",
    );

    // V8 test path - `?force_user=<id>` (or `?force_user_id=`) bypasses the
    // global quiet-window + DND checks for that one user so we can trigger
    // the AI copy path on demand and verify Claude→Gemini are reachable in
    // production. All other guards (cooldowns, suppression, anchor presence,
    // V8 validators) still run.
    //
    // Batch A hardening:
    //   • The `force_user` path now REQUIRES a valid Auth0 admin JWT
    //     (allow-listed email). Unauthenticated callers cannot trigger
    //     APNs deliveries to arbitrary users.
    //   • The evaluation loop is restricted to the forced user only —
    //     an admin diagnostic run must NEVER notify unrelated users.
    //   • Delivery contract (Fix B): production delivery is the default.
    //     Dry-run is only entered when APNs credentials are missing, the
    //     caller explicitly passes `?force_dry=1|true|yes`, or an admin
    //     diagnostic is attempted without valid admin auth. See
    //     ./delivery-mode.ts for the canonical resolver.
    const forceUserId = url.searchParams.get("force_user") ||
      url.searchParams.get("force_user_id") ||
      null;
    let adminAuthFailed = false;
    if (forceUserId) {
      const guard = await requireAdmin(req);
      if (guard.errorResponse) {
        console.warn("[smart-nudges][force_user] admin gate rejected caller");
        adminAuthFailed = true;
        await finishRun("force_user_admin_gate_rejected");
        return guard.errorResponse;
      }
      await writeAdminAudit(guard.db, {
        admin: guard.admin!,
        action: "smart_nudges.force_user",
        targetUserId: forceUserId,
        route: "smart-nudges",
        metadata: {
          evaluator_version: EVALUATOR_VERSION,
          // Delivery mode is resolved later once APNs cred presence is known;
          // the audit only captures the intent flag surface here.
          force_dry_param: url.searchParams.get("force_dry") ?? null,
        },
      });
      console.log(
        `[smart-nudges][v8 test] force_user=${redactUserId(forceUserId)} ` +
          `admin=${guard.admin!.adminEmail} force_dry_param=${
            url.searchParams.get("force_dry") ?? "unset"
          }`,
      );
    }

    // 1. Fetch all users with active device tokens
    const { data: tokenRows, error: tokenErr } = await supabase
      .from("notification_device_tokens")
      .select("user_id, device_token, platform, updated_at")
      .eq("is_active", true);

    if (tokenErr) throw tokenErr;
    if (!tokenRows || tokenRows.length === 0) {
      console.log("[smart-nudges] No active device tokens. Exiting.");
      const { data: inactiveTokenUsers } = await supabase
        .from("notification_device_tokens")
        .select("user_id, updated_at")
        .neq("is_active", true);
      const tracedInactive = new Set<string>();
      for (const row of (inactiveTokenUsers || [])) {
        if (tracedInactive.has(row.user_id)) continue;
        tracedInactive.add(row.user_id);
        trace(row.user_id, "no_active_device_token", {
          metadata: {
            latest_inactive_token_updated_at: row.updated_at ?? null,
          },
        });
      }
      if (forceUserId) {
        processedUserCount = 1;
        trace(forceUserId, "no_active_device_token", {
          metadata: { forced: true, token_rows: 0 },
        });
      }
      await finishRun("zero_users_evaluated_no_active_tokens");
      return new Response(JSON.stringify({ processed: 0, notifications: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group tokens by user
    const userTokens = new Map<
      string,
      Array<{ token: string; platform: string }>
    >();
    for (const row of tokenRows) {
      if (!userTokens.has(row.user_id)) userTokens.set(row.user_id, []);
      userTokens.get(row.user_id)!.push({
        token: row.device_token,
        platform: row.platform,
      });
    }

    // Batch A: when an admin passes ?force_user, restrict the evaluation
    // loop to just that user. Prevents a diagnostic run from fanning out
    // pushes to unrelated users.
    const userIds = forceUserId
      ? (userTokens.has(forceUserId) ? [forceUserId] : [])
      : Array.from(userTokens.keys());
    const activeUserSet = new Set(userIds);
    const { data: inactiveOnlyTokenUsers } = await supabase
      .from("notification_device_tokens")
      .select("user_id, updated_at")
      .neq("is_active", true);
    const tracedInactive = new Set<string>();
    for (const row of (inactiveOnlyTokenUsers || [])) {
      if (activeUserSet.has(row.user_id) || tracedInactive.has(row.user_id)) {
        continue;
      }
      tracedInactive.add(row.user_id);
      trace(row.user_id, "no_active_device_token", {
        metadata: { latest_inactive_token_updated_at: row.updated_at ?? null },
      });
    }
    if (forceUserId && !userTokens.has(forceUserId)) {
      trace(forceUserId, "no_active_device_token", {
        metadata: { forced: true, active_token_users: userIds.length },
      });
    }
    processedUserCount = userIds.length;
    console.log(
      `[smart-nudges] Evaluating ${userIds.length} users (MVP 3-nudge v4)`,
    );

    // 2. Batch-fetch profiles, preferences, recent engagements
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
      .toISOString();

    const [
      { data: profiles },
      { data: preferences },
      { data: recentEngagements },
    ] = await Promise.all([
      supabase.from("profiles").select(
        "id, current_streak, timezone_offset, current_timezone, home_timezone",
      ).in("id", userIds),
      supabase.from("notification_preferences").select("*").in(
        "user_id",
        userIds,
      ),
      supabase.from("user_engagements")
        .select("user_id, event_type, timestamp")
        .in("user_id", userIds)
        .eq("event_type", "app_open")
        .gte("timestamp", fourHoursAgo),
    ]);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const prefMap = new Map((preferences || []).map((p) => [p.user_id, p]));

    const lastAppOpenMap = new Map<string, Date>();
    for (const eng of (recentEngagements || [])) {
      const ts = new Date(eng.timestamp);
      const existing = lastAppOpenMap.get(eng.user_id);
      if (!existing || ts > existing) lastAppOpenMap.set(eng.user_id, ts);
    }

    const allNotifications: Array<{
      userId: string;
      type: string;
      copy: NudgeCopy;
      deepLinkRoute: string;
      eventReference?: string;
      commitmentText?: string;
      meetingTitle?: string;
      slot?: NudgeSlot;
      tokens: Array<{ token: string; platform: string }>;
      badge: number;
      isTravel: boolean;
      todayStr: string;
      qualificationWarnings: string[];
      v8Ctx: { eventTitles: string[]; checkinWord: string | null };
      // v1.1 - collapsed/expanded headline + new telemetry buckets.
      subtitle: string;
      headlineVariant: "full" | "reminder" | "post_landing";
      ctaBucket: "weekday" | "weekend_post_holiday";
      requiresAppOpen: boolean;
      weekendCtaGate?: "ok" | "missing_brief" | "missing_plan" | null;
      ttlSeconds: number;
      collapseId: string;
    }> = [];

    // 3. Evaluate each user
    for (const userId of userIds) {
      const profile = profileMap.get(userId);
      const prefs = prefMap.get(userId);
      const timezoneRead = await resolveEffectiveTimezone(
        supabase as any,
        userId,
        profile,
      );
      const clockTimezone = timezoneRead.circadianTimezone ||
        timezoneRead.effectiveTimezone;
      const parts = localParts(clockTimezone);
      const tzOffset = timezoneOffsetMinutes(clockTimezone);
      const localHour = parts.hour;
      const localMinute = parts.minute;
      const todayStr = parts.localDate;
      const dayOfWeek = new Date(`${todayStr}T00:00:00Z`).getUTCDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

      // Phase 4 — load the CoS Leader Profile once per user tick and
      // capture preferences for downstream gates + trace metadata.
      // Null-safe: missing/failed/in_progress profiles resolve to a
      // shell with nulls and behaviour matches today's system.
      let leaderProfile: LeaderProfileContext | null = null;
      try {
        leaderProfile = await loadLeaderProfile(supabase as any, userId);
      } catch (e) {
        console.warn(
          "[smart-nudges][leader-profile] load failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
      const rawBriefTiming = leaderProfile?.preferences.brief_timing ?? null;
      const rawResetModality = leaderProfile?.preferences.reset_modality ??
        null;
      const rawWeekendSignals = leaderProfile?.preferences.weekend_signals ??
        null;
      const prefBriefTiming = normaliseBriefTiming(rawBriefTiming);
      const prefResetModality = normaliseResetModality(rawResetModality);
      const prefWeekendSignals = normaliseWeekendSignal(rawWeekendSignals);
      leaderPrefsByUser.set(userId, {
        brief_timing_raw: rawBriefTiming,
        brief_timing: prefBriefTiming,
        reset_modality_raw: rawResetModality,
        reset_modality: prefResetModality,
        weekend_signals_raw: rawWeekendSignals,
        weekend_signals: prefWeekendSignals,
        profile_status: leaderProfile?.meta.status ?? "missing",
      });

      const traceBase = {
        localDate: todayStr,
        localHour,
        timezoneOffset: tzOffset,
        metadata: {
          effective_timezone: timezoneRead.effectiveTimezone,
          circadian_timezone: timezoneRead.circadianTimezone,
          is_away: timezoneRead.isAway,
        },
      };

      const tomorrowDate = new Date(`${todayStr}T00:00:00Z`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = toDateString(tomorrowDate);

      // ── Quiet Hours: 10pm–6:30am ──
      const localTime = localHour + localMinute / 60;
      const isForcedUser = forceUserId !== null && forceUserId === userId;
      // v5: hard floor at GLOBAL_EARLIEST_LOCAL (08:00) - kills 6/7am sends
      if (
        !isForcedUser &&
        (localTime >= GLOBAL_LATEST_LOCAL || localTime < GLOBAL_EARLIEST_LOCAL)
      ) {
        console.log(
          `[smart-nudges][v5] User ${
            redactUserId(userId)
          } outside global window (${localTime.toFixed(1)}). Skipping.`,
        );
        trace(userId, "outside_global_window", {
          ...traceBase,
          metadata: {
            local_time: localTime,
            earliest: GLOBAL_EARLIEST_LOCAL,
            latest: GLOBAL_LATEST_LOCAL,
          },
        });
        continue;
      }

      // DND check. Quiet/rest days are represented by Plan slots upstream.
      const dndStart = prefs?.dnd_start ?? null;
      const dndEnd = prefs?.dnd_end ?? null;
      // Batch B follow-up: use the shared cross-midnight DND helper
      // (isHourInDndWindow) and emit a rich trace that includes the
      // effective timezone, its source, the local time, and whether the
      // window crossed midnight — so an admin diagnosing a suppressed
      // push has every field they need in one place.
      const dndBlocked = !isForcedUser &&
        isHourInDndWindow(localHour, dndStart, dndEnd);
      if (dndBlocked) {
        trace(userId, "dnd_window", {
          ...traceBase,
          metadata: {
            dnd_start: dndStart,
            dnd_end: dndEnd,
            dnd_crosses_midnight: dndStart != null && dndEnd != null &&
              dndStart > dndEnd,
            local_time: `${String(localHour).padStart(2, "0")}:${
              String(localMinute).padStart(2, "0")
            }`,
            local_date: todayStr,
            effective_timezone: timezoneRead.effectiveTimezone,
            circadian_timezone: timezoneRead.circadianTimezone,
            timezone_source: timezoneRead.isAway
              ? "travel"
              : (profile?.current_timezone
                ? "profile_current"
                : (profile?.home_timezone ? "profile_home" : "fallback_utc")),
            blocked: true,
          },
        });
        continue;
      }

      // Delivery-context: device-token `updated_at` is NOT a heartbeat, so it
      // must not gate push delivery. Push exists to reach inactive users.

      // Convert local midnight to UTC for log queries
      const localMidnightMs = new Date(`${todayStr}T00:00:00Z`).getTime();
      const todayStartUtc = new Date(localMidnightMs + tzOffset * 60000)
        .toISOString();
      const todayEndUtc = new Date(
        localMidnightMs + tzOffset * 60000 + 24 * 60 * 60 * 1000,
      ).toISOString();

      // Fetch today's notification log.
      //
      // CAP SEMANTICS (fix for inflated 48/3, 55/3 counts):
      // Scope to rows the user actually saw or that were genuinely
      // attempted via APNs. This excludes:
      //   • 'suppressed'           - pre-evaluator / back-to-back / post-CTA audit rows
      //   • 'dry_run'              - ?force_user=...&dry_run=1 diagnostic probes
      //   • 'failed'               - APNs rejected, never delivered
      //   • 'expired_before_delivery'
      // The DAILY_NOTIFICATION_CAP and dedupe sets below derive from this
      // query, so "cap" now means "things the user actually saw" - matching
      // the product intent of 3 pushes/day. Suppression and dry-run rows
      // remain in notification_log for SQL auditing but no longer inflate
      // the cap or block legitimate sends.
      // Batch B: single source of truth for what counts toward the cap /
      // 2h suppression / slot suppression. Excludes failed, dry_run,
      // suppressed, validation_rejected, expired_before_delivery,
      // configuration_failed, duplicate_claim, test_push.
      const COUNTABLE_DELIVERY_STATES = SHARED_COUNTABLE_DELIVERY_STATES;
      const { data: todayLogs } = await supabase
        .from("notification_log")
        .select(
          "notification_type, variant_id, sent_at, event_reference, payload",
        )
        .eq("user_id", userId)
        .gte("sent_at", todayStartUtc)
        .lt("sent_at", todayEndUtc)
        .in("delivery_state", COUNTABLE_DELIVERY_STATES as unknown as string[])
        .order("sent_at", { ascending: false });

      // ══════════════════════════════════════════════════════════
      // §17.7 - Week-Ahead Picker Invite dispatch (own bucket).
      // Runs BEFORE the daily cap, 2h suppression, and app-open cool-
      // down. Counts ONLY against its own ISO-weekly cap (max 1 / user).
      // Kill switch: WEEK_AHEAD_PICKER_ENABLED=false to disable.
      // ══════════════════════════════════════════════════════════
      // ctx is shared with the standard-nudge pipeline below - build
      // lazily so a quick-fail (Saturday / out-of-window / kill switch)
      // adds zero DB cost.
      let ctx: NudgeContext | null = null;
      const weekAheadEligibleHour =
        Math.floor(localHour + localMinute / 60) >= 16 &&
        Math.floor(localHour + localMinute / 60) < 19;
      const weekAheadPreflight = WEEK_AHEAD_PICKER_ENABLED &&
        (prefs?.evening_close_enabled ?? true) &&
        weekAheadEligibleHour;
      if (!weekAheadPreflight) {
        trace(userId, "week_ahead_not_in_window", {
          ...traceBase,
          metadata: {
            enabled: WEEK_AHEAD_PICKER_ENABLED,
            evening_close_enabled: prefs?.evening_close_enabled ?? true,
            day_of_week: dayOfWeek,
            local_time: localTime,
            eligible_hour: weekAheadEligibleHour,
          },
        });
      } else {
        // Per-reason, per-day dedupe. Pull today's already-delivered
        // Week-Ahead invites and extract the reason suffix from variant_id
        // (`week_ahead_picker_invite::<reason>`). A prior weekly_planning
        // invite must NOT block a same-day end_of_pto invite.
        const { data: todaysSent } = await supabase
          .from("notification_log")
          .select("id, sent_at, variant_id")
          .eq("user_id", userId)
          .eq("notification_type", "week_ahead_picker_invite")
          .gte("sent_at", todayStartUtc)
          .lt("sent_at", todayEndUtc)
          // dry-run and other non-countable rows must never suppress a
          // real Week-Ahead invite. Only rows that entered the delivery
          // lifecycle count.
          .in(
            "delivery_state",
            COUNTABLE_DELIVERY_STATES as unknown as string[],
          );

        const alreadySentReasonsToday = new Set<string>();
        for (const row of todaysSent ?? []) {
          const vid = String((row as { variant_id?: string }).variant_id ?? "");
          const idx = vid.indexOf("::");
          if (idx >= 0) alreadySentReasonsToday.add(vid.slice(idx + 2));
        }
        if (alreadySentReasonsToday.size > 0) {
          trace(userId, "week_ahead_prior_reasons_today", {
            ...traceBase,
            notificationType: "week_ahead_picker_invite",
            metadata: {
              reasons: [...alreadySentReasonsToday],
            },
          });
        }

        // Build ctx now (will be reused by the standard pipeline below).
        ctx = await buildNudgeContext(
          supabase,
          userId,
          todayStr,
          tomorrowStr,
          localHour,
          localMinute,
          dayOfWeek,
          profile?.current_streak || 0,
          lastAppOpenMap.get(userId) || null,
          clockTimezone,
        );
        ctx.pattern = await loadPatternSummary(supabase, userId);
        // Phase 4 — hydrate leader voice + reset modality preference so
        // the copy generator can append them to the LLM system prompt.
        ctx.leaderVoiceRules = leaderProfile?.voice.cos_brief_rules ?? null;
        ctx.leaderResetModality = prefResetModality;

        const inv = await evaluateWeekAheadPickerInvite(
          ctx,
          supabase,
          alreadySentReasonsToday,
        );
        if (inv) {
          trace(userId, "week_ahead_selected", {
            ...traceBase,
            notificationType: inv.type,
            variantId: inv.copy.variantId,
            metadata: { prior_reasons_today: [...alreadySentReasonsToday] },
          });
          // Direct dispatch - bypasses competitive ranking, daily cap,
          // 2h suppression, slot cap, post-CTA gates. This is a weekly
          // digest, not a behavioural nudge.
          allNotifications.push({
            userId,
            type: inv.type,
            copy: inv.copy,
            deepLinkRoute: inv.deepLinkRoute,
            eventReference: inv.eventReference,
            tokens: userTokens.get(userId) || [],
            badge: ctx.badgeCount ?? 1,
            isTravel: false,
            todayStr,
            qualificationWarnings: [],
            v8Ctx: buildV8CtxForCheck(ctx),
            subtitle: clampSubtitle(inv.copy.title),
            headlineVariant: "full",
            ctaBucket: "weekend_post_holiday",
            requiresAppOpen: true,
            weekendCtaGate: null,
            ttlSeconds: periodTtlSeconds("evening", localTime),
            collapseId: periodCollapseId("evening", todayStr),
          });
          console.log(
            `[smart-nudges] week_ahead_picker_invite dispatched user=${
              redactUserId(userId)
            } variant=${inv.copy.variantId} prior_reasons=${[...alreadySentReasonsToday].join(",") || "none"} (own bucket - bypassing daily cap)`,
          );
        } else {
          trace(userId, "week_ahead_not_selected", {
            ...traceBase,
            notificationType: "week_ahead_picker_invite",
            metadata: { prior_reasons_today: [...alreadySentReasonsToday] },
          });
        }
      }

      // ── DAILY CAP ──
      if (todayLogs && todayLogs.length >= DAILY_NOTIFICATION_CAP) {
        console.log(
          `[smart-nudges] User ${
            redactUserId(userId)
          } hit daily cap (${todayLogs.length}/${DAILY_NOTIFICATION_CAP}). Skipping.`,
        );
        trace(userId, "daily_cap", {
          ...traceBase,
          metadata: { count: todayLogs.length, cap: DAILY_NOTIFICATION_CAP },
        });
        continue;
      }

      // 2-hour suppression check
      const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000)
        .toISOString();
      const { data: recentLogs } = await supabase
        .from("notification_log")
        .select("sent_at")
        .eq("user_id", userId)
        .gte("sent_at", twoHoursAgoIso)
        // Fix C: a diagnostic dry-run in the last 2h must not suppress a
        // real production send. Only rows that actually entered the
        // delivery lifecycle (pending / accepted / delivered / opened /
        // action_completed) count as "recently notified".
        .in("delivery_state", COUNTABLE_DELIVERY_STATES as unknown as string[])
        .order("sent_at", { ascending: false })
        .limit(1);

      const lastSentAt = recentLogs?.[0]
        ? new Date(recentLogs[0].sent_at)
        : null;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const suppressed = lastSentAt !== null && lastSentAt > twoHoursAgo;

      // ── Last app-open is telemetry only; inactivity must not suppress nudges. ──
      const lastAppOpen = lastAppOpenMap.get(userId) || null;

      // ══════════════════════════════════════════════════
      // ── Build NudgeContext (single parallel query) ──
      // ══════════════════════════════════════════════════
      if (!ctx) {
        ctx = await buildNudgeContext(
          supabase,
          userId,
          todayStr,
          tomorrowStr,
          localHour,
          localMinute,
          dayOfWeek,
          profile?.current_streak || 0,
          lastAppOpen,
          clockTimezone,
        );
        // v7 - hydrate unified pattern store (causality_findings.signal_summary)
        ctx.pattern = await loadPatternSummary(supabase, userId);
      }
      // Phase 4 — always hydrate leader voice + reset modality on ctx,
      // even when reused from the week-ahead path above (idempotent set).
      ctx.leaderVoiceRules = leaderProfile?.voice.cos_brief_rules ?? null;
      ctx.leaderResetModality = prefResetModality;

      // MRS snapshot is read for escalation/freshness context only. Missing,
      // awaiting, or strong/light data must never suppress nudges.
      // Never throws: missing snapshot row falls back to existing behaviour.
      let mrsEscalate = false;
      let mrsSnapshotMeta: Record<string, unknown> = {};
      try {
        // Phase 2 - window-scoped snapshot. Prefer current-window row,
        // fall back to latest row for today (legacy / earlier window).
        const nudgeWindow = localHour >= 6 && localHour < 12
          ? "morning"
          : localHour >= 12 && localHour < 18
          ? "afternoon"
          : "evening";
        let snapRow: DailyContextSnapshotRead | null = null;
        {
          const { data } = await supabase
            .from("daily_context_snapshot")
            .select(
              "supply_demand_gap_flag, pattern_signals, readiness_state, readiness_score_baseline, readiness_score_refined",
            )
            .eq("user_id", userId)
            .eq("local_date", todayStr)
            .eq("mrs_window", nudgeWindow)
            .maybeSingle();
          snapRow = data ?? null;
        }
        if (!snapRow) {
          const { data: legacy } = await supabase
            .from("daily_context_snapshot")
            .select(
              "supply_demand_gap_flag, pattern_signals, readiness_state, readiness_score_baseline, readiness_score_refined, mrs_window",
            )
            .eq("user_id", userId)
            .eq("local_date", todayStr)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (legacy) {
            console.warn(
              `[smart-nudges] daily_context_snapshot legacy fallback: no row for window=${nudgeWindow}, using window=${
                legacy.mrs_window ?? "null"
              } user=${redactUserId(userId)}`,
            );
            snapRow = legacy;
          }
        }
        const gapFlag = snapRow?.supply_demand_gap_flag ?? null;
        const ps = snapRow?.pattern_signals ?? null;
        const readinessScorePresent =
          typeof snapRow?.readiness_score_refined === "number" ||
          typeof snapRow?.readiness_score_baseline === "number";
        mrsSnapshotMeta = {
          mrs_readiness_state: snapRow?.readiness_state ?? null,
          mrs_readiness_score_present: readinessScorePresent,
        };
        Object.assign(traceBase.metadata, mrsSnapshotMeta);
        if (!readinessScorePresent) {
          console.log(
            `[smart-nudges][mrs-state1] Optional readiness score fields absent for user=${userId}, continuing with awaiting-safe behaviour.`,
          );
        }
        if (snapRow?.readiness_state === "awaiting") {
          console.log(
            `[smart-nudges][mrs-state1] User ${
              redactUserId(userId)
            } awaiting signals; continuing so nudge can drive sync + check-in.`,
          );
        }
        if (gapFlag === "LIGHT_DAY_STRONG_STATE") {
          console.log(
            `[smart-nudges][mrs-v2] User ${
              redactUserId(userId)
            } LIGHT_DAY_STRONG_STATE read only; Plan slots decide cadence.`,
          );
        }
        if (
          gapFlag === "SUPPLY_DEMAND_GAP" && ps?.sustained_deficit_flag === true
        ) {
          mrsEscalate = true;
          console.log(
            `[smart-nudges][mrs-v2] User ${
              redactUserId(userId)
            } SUPPLY_DEMAND_GAP + sustained_deficit → escalate (bypass 2h suppression).`,
          );
        }
      } catch (snapErr) {
        console.warn(
          "[smart-nudges][mrs-v2] snapshot read failed:",
          snapErr instanceof Error ? snapErr.message : snapErr,
        );
      }
      const suppressedEffective = suppressed && !mrsEscalate;
      if (suppressedEffective) {
        trace(userId, "two_hour_suppression", {
          ...traceBase,
          metadata: {
            last_sent_at: lastSentAt?.toISOString() ?? null,
            escalated: mrsEscalate,
          },
        });
      }

      // Already-sent types today
      const alreadySentTypes = new Set(
        (todayLogs || []).map((l) => l.notification_type),
      );
      const sentEventRefs = new Set(
        (todayLogs || []).map((l) => l.event_reference).filter(
          Boolean,
        ) as string[],
      );

      // Pass 8 (O - strict M/A/E policy) - derive the set of slots that
      // already received a send today. Per the beta spec, each window
      // (morning / afternoon / evening) gets at most ONE nudge. Travel
      // pre-flight rides morning, in-flight rides afternoon - see the
      // slot assignments in evaluateNudgeOne / Two / Three.
      const sentSlotsToday = new Set<"morning" | "afternoon" | "evening">(
        (todayLogs || [])
          .map((l) => slotFromNotificationLogRow(l))
          .filter((s): s is "morning" | "afternoon" | "evening" => s !== null),
      );
      const activeSlot = currentSlotForLocalHour(localHour);

      // Phase 4 — Leader `weekend_signals` preference. Soft gate, applied
      // only when the preference is explicitly set. `full` and null both
      // preserve today's behaviour.
      if (isWeekendDay && prefWeekendSignals === "off") {
        console.info(
          `[smart-nudges] weekend_signals=off, skipping user=${
            redactUserId(userId)
          }`,
        );
        console.info("[smart-nudges][weekend-gate]", {
          userId: redactUserId(userId),
          weekend_signals: prefWeekendSignals,
          activeSlot,
          decision: "skipped_full",
        });
        trace(userId, "leader_pref_weekend_off", {
          ...traceBase,
          metadata: { active_slot: activeSlot, weekend_signals: "off" },
        });
        continue;
      }
      if (
        isWeekendDay && prefWeekendSignals === "light" &&
        activeSlot !== "morning"
      ) {
        console.info(
          `[smart-nudges] weekend_signals=light, skipping non-morning slot user=${
            redactUserId(userId)
          } slot=${activeSlot}`,
        );
        console.info("[smart-nudges][weekend-gate]", {
          userId: redactUserId(userId),
          weekend_signals: prefWeekendSignals,
          activeSlot,
          decision: "skipped",
        });
        trace(userId, "leader_pref_weekend_light_non_morning", {
          ...traceBase,
          metadata: { active_slot: activeSlot, weekend_signals: "light" },
        });
        continue;
      }

      // ══════════════════════════════════════════════════
      // ── MVP 3-Nudge Cascade: Nudge 1 → 2 → 3 ──
      // ══════════════════════════════════════════════════
      const qualified: QualifiedNudge[] = [];

      // FAIL-OPEN CONTRACT
      //
      // The plan snapshot is the PREFERRED source when it is `ready`.
      // When the snapshot is `empty` (persisted but no usable slots) or
      // `missing` (not persisted), we must NOT hard-stop the evaluator
      // — that would leave users with zero nudges whenever Plan is
      // temporarily broken. Instead we log a structured warning and
      // fall through to the legacy 3-nudge cascade so nudges keep
      // shipping.
      const slotPrefEnabled = activeSlot === "morning"
        ? (prefs?.morning_anchor_enabled ?? true)
        : activeSlot === "afternoon"
        ? (prefs?.pre_event_prep_enabled ?? true)
        : (prefs?.evening_close_enabled ?? true);

      if (ctx.planSnapshotStatus === "empty") {
        console.warn("[smart-nudges][plan-empty-fallback]", {
          userId,
          date: todayStr,
          window: ctx.briefWindow,
          activeSlot,
          reason: "plan_snapshot_empty_falling_through_to_legacy_cascade",
        });
        trace(userId, "plan_snapshot_empty_fallback", {
          ...traceBase,
          metadata: {
            reason: "plan_snapshot_empty",
            active_slot: activeSlot,
            plan_slot_count: 0,
            fallback: "legacy_cascade",
          },
        });
        // fall through to the legacy cascade below
      }

      if (ctx.planSnapshotStatus === "ready") {
        if (!slotPrefEnabled) {
          // Slot preference is disabled for the ACTIVE slot only. Do
          // NOT abort the whole user loop — other qualifying nudges,
          // observability traces, and downstream evaluators must still
          // run. Just skip the projected slot for this active window.
          trace(userId, "slot_projection_skipped", {
            ...traceBase,
            metadata: {
              reason: "slot_preference_disabled",
              active_slot: activeSlot,
              intentionally_skipped: true,
            },
          });
        } else {
          let projected: QualifiedNudge | null = null;
          if (!suppressedEffective) {
            projected = await projectPlanSlotToNudge(
              ctx,
              activeSlot,
              alreadySentTypes,
              sentEventRefs,
              supabase,
            );
            if (projected) qualified.push(projected);
          }

          // Morning nudge_one is the user's first-touch anchor and is
          // intentionally exempt from the 2h suppression gate in the
          // legacy cascade. If a ready plan slot produces no copy, fail
          // open to the proven legacy evaluator instead of ending the
          // morning window with no qualified nudge.
          if (
            activeSlot === "morning" &&
            !projected &&
            !alreadySentTypes.has("nudge_one") &&
            !alreadySentTypes.has("morning_prep")
          ) {
            const fallback = await evaluateNudgeOne(
              ctx,
              alreadySentTypes,
              sentEventRefs,
              supabase,
            );
            if (fallback) {
              qualified.push(fallback);
              trace(userId, "plan_ready_morning_fallback", {
                ...traceBase,
                metadata: {
                  reason: suppressedEffective
                    ? "projection_suppressed_falling_through_to_legacy_nudge_one"
                    : "projection_returned_null_falling_through_to_legacy_nudge_one",
                  active_slot: activeSlot,
                  plan_slot_count: ctx.planSlots?.length ?? 0,
                  fallback: "legacy_nudge_one",
                  fallback_variant_id: fallback.copy.variantId,
                },
              });
            }
          }
        }
      }

      // Legacy 3-nudge cascade runs when the plan snapshot is missing OR
      // empty (fail-open). When the snapshot is `ready` we skip it —
      // the plan-driven projection above is the preferred path.
      if (
        ctx.planSnapshotStatus === "missing" ||
        ctx.planSnapshotStatus === "empty"
      ) {
        // Nudge 1: First Touch (exempt from signal gate + 2h suppression for JIT)
        if ((prefs?.morning_anchor_enabled ?? true)) {
          const nudge = await evaluateNudgeOne(
            ctx,
            alreadySentTypes,
            sentEventRefs,
            supabase,
          );
          if (nudge) qualified.push(nudge);
        }

        // Nudge 2: Mid-day Action (exempt from signal gate, respects 2h suppression unless JIT)
        if ((prefs?.pre_event_prep_enabled ?? true) && !suppressedEffective) {
          const nudge = await evaluateNudgeTwo(
            ctx,
            alreadySentTypes,
            sentEventRefs,
            supabase,
          );
          if (nudge) qualified.push(nudge);
        }
        // If suppressed but has JIT, still allow Nudge 2 JIT variant
        if (suppressedEffective && (prefs?.pre_event_prep_enabled ?? true)) {
          const nudge = await evaluateNudgeTwo(
            ctx,
            alreadySentTypes,
            sentEventRefs,
            supabase,
          );
          if (nudge && nudge.deepLinkRoute === "/executive-home") {
            // JIT variant - override suppression
            qualified.push(nudge);
          }
        }

        // Nudge 3: Evening Close (exempt from signal richness gate for MVP)
        if ((prefs?.evening_close_enabled ?? true) && !suppressedEffective) {
          const nudge = await evaluateNudgeThree(ctx, alreadySentTypes);
          if (nudge) qualified.push(nudge);
        }
      }

      // §17.7 - Week-Ahead Picker Invite has its OWN bucket and is
      // dispatched above the daily cap earlier in this loop. It is
      // intentionally not part of the competitive `qualified` queue.

      // Post-MVP evaluators (all gated by MVP_POST_LAUNCH = false)
      if (MVP_POST_LAUNCH) {
        const signals = computeSignalRichness(ctx);
        const signalGatePassed = signals.signalCount >= 2;

        if (!suppressed) {
          const gap = await evaluateCalendarGap(ctx, alreadySentTypes);
          if (gap) qualified.push(gap);

          const coach = await evaluateCoachMeetingMatch(
            ctx,
            alreadySentTypes,
            supabase,
          );
          if (coach) qualified.push(coach);
        }

        if (signalGatePassed && !suppressed) {
          const state = await evaluateStateAwareAfternoon(
            ctx,
            alreadySentTypes,
          );
          if (state) qualified.push(state);

          const pattern = await evaluatePatternAlert(
            ctx,
            alreadySentTypes,
            supabase,
          );
          if (pattern) qualified.push(pattern);
        }

        if (qualified.length === 0 && signalGatePassed) {
          const fallback = await evaluateDailyFallback(
            ctx,
            alreadySentTypes,
            (todayLogs || []).length,
          );
          if (fallback) qualified.push(fallback);
        }
      }

      // ── Select best notification (v7 comparator) ──
      // 1. Slot rank: morning > evening > afternoon
      // 2. Anchor:   JIT > STATE
      // 3. Signal strength (descending)
      // 4. Priority (ascending) as final tiebreaker
      const SLOT_RANK: Record<"morning" | "afternoon" | "evening", number> = {
        morning: 0,
        evening: 1,
        afternoon: 2,
      };
      qualified.sort((a, b) => {
        const sa = SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
        if (sa !== 0) return sa;
        const aa = (a.anchorKind === "jit" ? 0 : 1) -
          (b.anchorKind === "jit" ? 0 : 1);
        if (aa !== 0) return aa;
        const ss = b.signalStrength - a.signalStrength;
        if (ss !== 0) return ss;
        return a.priority - b.priority;
      });

      // Deduplicate by type (in case JIT override added a duplicate)
      const seen = new Set<string>();
      const dedupedByType = qualified.filter((n) => {
        if (seen.has(n.type)) return false;
        seen.add(n.type);
        return true;
      });

      // Pass 8 (O) - strict per-window cap: drop any candidate whose slot
      // already shipped a notification today (durable across cron runs via
      // notification_log). Logged so dashboards can see the suppression.
      const slotCapped = dedupedByType.filter((n) => {
        if (sentSlotsToday.has(n.slot)) {
          console.log(
            `[smart-nudges][pass8] user=${userId} drop_slot_cap type=${n.type} slot=${n.slot} sentSlots=${
              [...sentSlotsToday].join(",")
            }`,
          );
          return false;
        }
        return true;
      });

      // Pass 8 (O) - stale-JIT suppression: any JIT-anchored qualified nudge
      // whose anchor event ended more than 60 min ago is no longer
      // actionable. Suppress before send so we don't ship "prep for X" after
      // X is finished.
      const nowMsStale = Date.now();
      const STALE_MS = 60 * 60 * 1000;
      const eventById = new Map<string, { start: number; end: number }>();
      for (const e of ctx.todayEvents || []) {
        if (!e?.id) continue;
        eventById.set(String(e.id), {
          start: new Date(e.start_time).getTime(),
          end: new Date(e.end_time).getTime(),
        });
      }
      const freshOnly = slotCapped.filter((n) => {
        if (n.anchorKind !== "jit" || !n.eventReference) return true;
        const ev = eventById.get(String(n.eventReference));
        if (!ev) return true; // unknown - let downstream handle
        if (ev.end < nowMsStale - STALE_MS) {
          console.log(
            `[smart-nudges][pass8] user=${userId} drop_stale_jit type=${n.type} event=${n.eventReference} endedMinAgo=${
              Math.round((nowMsStale - ev.end) / 60000)
            }`,
          );
          return false;
        }
        return true;
      });
      const deduped = freshOnly;

      if (deduped.length > 0) {
        const bestNudge = deduped[0];

        // JIT nudges override 2h suppression
        const isJitNudge = bestNudge.deepLinkRoute === "/executive-home" &&
          (bestNudge.type === "nudge_one" || bestNudge.type === "nudge_two");

        if (suppressedEffective && !isJitNudge) {
          console.log(
            `[smart-nudges] User ${
              redactUserId(userId)
            } 2h-suppressed, no JIT. Skipping ${bestNudge.type}.`,
          );
          trace(userId, "two_hour_suppression", {
            ...traceBase,
            notificationType: bestNudge.type,
            variantId: bestNudge.copy.variantId,
            metadata: {
              last_sent_at: lastSentAt?.toISOString() ?? null,
              jit_override: false,
            },
          });
        } else {
          // ── v5.3 - Receipt-feedback: stamp warning if last 3 sends for
          // this family expired before delivery (per-user timing signal).
          const family = nudgeFamily(bestNudge.type);
          const { data: lastThree } = await supabase
            .from("notification_log")
            .select("delivery_state, notification_type")
            .eq("user_id", userId)
            .eq("notification_type", family)
            // Fix C: dry-run rows are evaluations, not delivery attempts.
            // The repeated-expiry warning must reason about the last three
            // real APNs attempts, not diagnostic probes.
            .in("delivery_state", [
              ...COUNTABLE_DELIVERY_STATES,
              "expired_before_delivery",
              "expired",
              "failed",
            ] as unknown as string[])
            .order("sent_at", { ascending: false })
            .limit(3);
          const qualificationWarnings: string[] = [];
          if (
            (lastThree || []).length >= 3 &&
            (lastThree || []).every((r: any) =>
              r.delivery_state === "expired_before_delivery"
            )
          ) {
            qualificationWarnings.push("repeated_expiry");
          }
          const isTravel =
            !!(ctx.dayContext.preFlight || ctx.dayContext.inFlight);

          // ── v1.1 - Back-to-back gap guard ─────────────────────────────
          // Measure the smallest gap between STRICTLY-FUTURE meetings in the
          // next 3 h. Only triggers when at least two future meetings crowd
          // the horizon — a single in-progress meeting is not "back-to-back".
          // Duplicate calendar rows are deduped so a single meeting synced
          // twice cannot collapse the gap to 0.
          const nowMs = Date.now();
          const horizonMs = nowMs + 3 * 60 * 60 * 1000;
          const rawUpcoming = (ctx.todayEvents || [])
            .map((e: any) => ({
              start: new Date(e.start_time).getTime(),
              end: new Date(e.end_time).getTime(),
              title: String(e.title ?? "").trim().toLowerCase().replace(
                /\s+/g,
                " ",
              ),
            }))
            .filter((e) => e.start > nowMs && e.start < horizonMs)
            .sort((a, b) => a.start - b.start);
          const seenDedupe = new Set<string>();
          const upcoming = rawUpcoming.filter((e) => {
            const key = `${e.start}|${e.end}|${e.title}`;
            if (seenDedupe.has(key)) return false;
            seenDedupe.add(key);
            return true;
          });
          let largestGapMin = Number.POSITIVE_INFINITY;
          if (upcoming.length >= 2) {
            let cursor = upcoming[0].end;
            for (let i = 1; i < upcoming.length; i++) {
              const ev = upcoming[i];
              const gap = Math.max(0, Math.round((ev.start - cursor) / 60000));
              if (gap < largestGapMin) largestGapMin = gap;
              cursor = Math.max(cursor, ev.end);
            }
          }
          // Only classify as back-to-back when we actually measured a
          // meeting-to-meeting gap (≥ 2 future meetings).
          const measuredGap = upcoming.length >= 2 &&
            Number.isFinite(largestGapMin);
          const isBackToBack = measuredGap &&
            largestGapMin < BACK_TO_BACK_MIN_GAP_MIN;
          const isReminderGap = measuredGap &&
            largestGapMin >= BACK_TO_BACK_MIN_GAP_MIN &&
            largestGapMin <= REMINDER_GAP_UPPER_MIN;

          if (isBackToBack) {
            // Skip this run's push but do NOT write a `notification_log`
            // row — that would trigger `two_hour_suppression` on every
            // subsequent evaluation and kill the whole evening. Trace only.
            console.log(
              `[smart-nudges][v1.1] User ${
                redactUserId(userId)
              } back_to_back skip (largestGap=${largestGapMin}min, upcoming=${upcoming.length}).`,
            );
            trace(userId, "back_to_back_skip", {
              ...traceBase,
              notificationType: bestNudge.type,
              variantId: bestNudge.copy.variantId,
              metadata: {
                largest_gap_min: largestGapMin,
                upcoming_future_events: upcoming.length,
              },
            });
            continue;
          }

          // ── v1.1 - Weekend / post-PTO CTA gate ───────────────────────
          // Force CTA = "let's prioritise the week ahead" only when:
          //   - today is Saturday/Sunday OR ctx.dayContext.ptoMode is true, AND
          //   - a Brief snapshot exists for today, AND
          //   - a Plan ledger exists for today (non-empty plan_ledger).
          // Otherwise fall back to the standard weekday CTA + /daily-check-in.
          const isWeekendOrPto = (dayOfWeek === 0 || dayOfWeek === 6) ||
            ctx.dayContext.ptoMode === true;
          let ctaBucket: "weekday" | "weekend_post_holiday" = "weekday";
          let weekendCtaGate: "ok" | "missing_brief" | "missing_plan" | null =
            null;
          let resolvedRoute = bestNudge.deepLinkRoute;
          let resolvedBody = bestNudge.copy.body;
          if (isWeekendOrPto) {
            // Brief snapshot presence
            const { data: briefRow } = await supabase
              .from("brief_snapshots")
              .select("id")
              .eq("user_id", userId)
              .eq("local_date", todayStr)
              .limit(1)
              .maybeSingle();
            // Plan ledger presence (non-empty)
            const { data: planRow } = await supabase
              .from("daily_ritual_completions")
              .select("plan_ledger")
              .eq("user_id", userId)
              .eq("local_date", todayStr)
              .limit(1)
              .maybeSingle();
            const hasPlan = planRow &&
              Array.isArray((planRow as any).plan_ledger) &&
              (planRow as any).plan_ledger.length > 0;
            if (!briefRow) weekendCtaGate = "missing_brief";
            else if (!hasPlan) weekendCtaGate = "missing_plan";
            else weekendCtaGate = "ok";

            if (weekendCtaGate === "ok") {
              ctaBucket = "weekend_post_holiday";
              resolvedRoute = WEEKEND_CTA_ROUTE;
              resolvedBody = forceCtaVerb(bestNudge.copy.body, WEEKEND_CTA);
            }
          }

          // ── v1.1 - Reminder downgrade for 30–60 min gap days ─────────
          let headlineVariant: "full" | "reminder" | "post_landing" = "full";
          let requiresAppOpen = true;
          if (isReminderGap && ctaBucket === "weekday") {
            headlineVariant = "reminder";
            requiresAppOpen = false;
            resolvedBody = forceCtaVerb(bestNudge.copy.body, REMINDER_CTA);
          }

          // ── v1.1 - Post-landing window (Nudge 1 slot, no 4th send) ──
          // When landingPlusHighStakes is present and the meeting lands in
          // the 15–60 min window after landing, tag as post_landing and
          // route to /executive-home with a reminder-style CTA.
          const lph = ctx.dayContext.landingPlusHighStakes;
          if (lph && lph.minutesUntil >= 15 && lph.minutesUntil <= 60) {
            headlineVariant = "post_landing";
            requiresAppOpen = false;
            resolvedRoute = "/executive-home";
            resolvedBody = forceCtaVerb(bestNudge.copy.body, REMINDER_CTA);
          }

          // ── Part 1 - Travel push_only delivery override ──────────────
          // When any active brief flag carries landingDeliveryMode='push_only'
          // (travelLandingPlusHighStakes ≤2h, travelDayArrivalFraming,
          //  travelDayDuringPushOnly), suppress the deep-link CTA so the
          // notification stands alone. iOS reads requiresAppOpen=false as
          // "do not deep-link on tap".
          try {
            const pushOnly = (ctx.briefBehaviour?.flagsBrief ?? []).some(
              (f) => f?.landingDeliveryMode === "push_only",
            );
            if (pushOnly) {
              requiresAppOpen = false;
              resolvedRoute = "/executive-home";
              console.log(
                `[smart-nudges] travel push_only override → requiresAppOpen=false user=${userId}`,
              );
            }
          } catch (_e) {
            // Fail-open - never block a notification on the guard.
          }

          if (
            requiresAppOpen && /^nudge_(one|two|three)$/.test(bestNudge.type)
          ) {
            resolvedRoute = "/daily-check-in";
          }

          // Subtitle: original moment headline (3 words / 28 chars cap).
          const adjustedCopy: NudgeCopy = normalizeNotificationCopy({
            ...bestNudge.copy,
            body: resolvedBody,
          });
          const subtitle = clampSubtitle(adjustedCopy.title);

          allNotifications.push({
            userId,
            type: bestNudge.type,
            copy: adjustedCopy,
            deepLinkRoute: resolvedRoute,
            eventReference: bestNudge.eventReference,
            commitmentText: bestNudge.commitmentText,
            meetingTitle: bestNudge.meetingTitle,
            tokens: userTokens.get(userId)!,
            badge: ctx.badgeCount ?? 1,
            isTravel,
            todayStr,
            qualificationWarnings,
            // V8 - capture per-user named-context tokens so the post-CTA
            // recheck can satisfy requiresNamedContextToken() for AI bodies
            // anchored on event titles or the morning check-in word.
            v8Ctx: buildV8CtxForCheck(ctx),
            subtitle,
            headlineVariant,
            ctaBucket,
            requiresAppOpen,
            weekendCtaGate,
            ttlSeconds: requiresAppOpen
              ? periodTtlSeconds(bestNudge.slot, localTime)
              : nudgeTtlSeconds(bestNudge.copy.variantId, bestNudge.type),
            collapseId: requiresAppOpen
              ? periodCollapseId(bestNudge.slot, todayStr)
              : nudgeCollapseId(
                nudgeFamily(bestNudge.type),
                todayStr,
                isTravel,
              ),
          });
        }
      } else {
        trace(userId, "no_qualified_nudge", {
          ...traceBase,
          metadata: {
            qualified_before_filters: qualified.length,
            after_slot_cap: slotCapped.length,
            suppressed_effective: suppressedEffective,
          },
        });
      }
    }

    console.log(
      `[smart-nudges] ${allNotifications.length} notifications qualified`,
    );
    qualifiedCount = allNotifications.length;

    // 4. Send notifications via APNs
    const apnsKey = Deno.env.get("APNS_P8_KEY");
    const apnsKeyId = Deno.env.get("APNS_KEY_ID");
    const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
    // Batch A: validate APP_ENV/APNS_ENVIRONMENT alignment. If APP_ENV is
    // production but APNs env is sandbox we hard-fail the send phase —
    // we do NOT want to insert notification_log rows that later get
    // marked failed and consume the daily cap.
    const apnsEnvCheck = validateApnsEnvironment();
    const apnsBundleId = apnsEnvCheck.bundleId;
    const apnsEnv = apnsEnvCheck.apnsEnv;
    const apnsHost = apnsEnvCheck.apnsHost;
    if (!apnsEnvCheck.ok) {
      console.error("[smart-nudges]", apnsEnvCheck.reason);
      await finishRun("apns_env_mismatch");
      return new Response(
        JSON.stringify({
          error: "apns_env_mismatch",
          reason: apnsEnvCheck.reason,
          app_env: apnsEnvCheck.appEnv,
          apns_env: apnsEnvCheck.apnsEnv,
          qualified: qualifiedCount,
          shipped: 0,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const apnsCredsPresent = !!(apnsKey && apnsKeyId && apnsTeamId);
    const deliveryMode: DeliveryMode = resolveDeliveryMode({
      url,
      apnsCredsPresent,
      adminAuthFailed,
    });
    const isDryRun = deliveryMode.dryRun;

    console.log(
      `[smart-nudges] Execution mode: ${
        describeDeliveryMode(deliveryMode)
      } | reason=${deliveryMode.reason}`,
    );
    if (deliveryMode.reason === "missing_apns_credentials") {
      const missing = [
        !apnsKey && "APNS_P8_KEY",
        !apnsKeyId && "APNS_KEY_ID",
        !apnsTeamId && "APNS_TEAM_ID",
      ].filter(Boolean);
      console.warn(
        `[smart-nudges] DRY RUN – missing secrets: ${missing.join(", ")}`,
      );
    } else if (!isDryRun) {
      console.log(
        `[smart-nudges] APNs config: host=${apnsHost} topic=${apnsBundleId} env=${apnsEnv}`,
      );
    }

    // Persist delivery mode on the run row so operators can audit scheduled
    // executions after the fact without re-parsing logs.
    if (runId) {
      try {
        await supabase
          .from("notification_evaluator_runs")
          .update({
            metadata: {
              client_platform: platform,
              apns_environment: Deno.env.get("APNS_ENVIRONMENT") ||
                "development",
              delivery_mode: describeDeliveryMode(deliveryMode),
              delivery_reason: deliveryMode.reason,
            },
          })
          .eq("id", runId);
      } catch (e) {
        console.warn(
          "[smart-nudges] failed to persist delivery_mode on run row:",
          e,
        );
      }
    }

    let sendSuccess = 0;
    let sendFailed = 0;
    let sendAttempted = 0;
    let suppressedPostCta = 0;
    const shippedNotifications: typeof allNotifications = [];

    let apnsJwt: string | null = null;
    if (!isDryRun) {
      try {
        apnsJwt = await createApnsJwt(apnsKey!, apnsKeyId!, apnsTeamId!);
      } catch (e) {
        console.error("[smart-nudges] Failed to create APNs JWT:", e);
        // Batch A honesty: if JWT creation failed we cannot deliver ANY
        // pushes this run. Fail the whole run cleanly so operators see it
        // in `notification_evaluator_runs.top_level_error` — instead of
        // silently dropping every notification while pretending it shipped.
        await finishRun("apns_jwt_creation_failed");
        return new Response(
          JSON.stringify({
            error: "apns_jwt_creation_failed",
            reason: e instanceof Error ? e.message : String(e),
            qualified: qualifiedCount,
            shipped: 0,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    for (const notif of allNotifications) {
      const effectiveRoute = notif.deepLinkRoute;

      // ── A/B CTA variant assignment (v5.1) ──
      // v1.1 - Weekend / reminder / post-landing buckets bypass the A/B
      // rewrite because the verb is already locked by the gate.
      const skipAbRewrite = notif.ctaBucket === "weekend_post_holiday" ||
        notif.headlineVariant === "reminder" ||
        notif.headlineVariant === "post_landing";
      const ctaVariant = assignCtaVariant(
        notif.userId,
        nudgeFamily(notif.type),
      );
      if (!skipAbRewrite) {
        notif.copy = applyCtaVariant(notif.copy, ctaVariant, effectiveRoute);
      } else {
        notif.copy = {
          ...notif.copy,
          variantId: `${notif.copy.variantId}::${ctaVariant}`,
        };
      }
      notif.copy = normalizeNotificationCopy(notif.copy);

      // V8 - final post-rewrite check. The CTA variant rewriter mutates the
      // trailing verb; if anything in the chain produces a non-V8 body we
      // suppress the send rather than ship V7 phrasing.
      // Pass the per-notification ctx so AI bodies anchored on real event
      // titles or the morning check-in word satisfy requiresNamedContextToken
      // (was previously dropped because ctx was missing).
      const finalViolation = violatesCopyContractV8(
        notif.copy.body,
        notif.v8Ctx,
      );
      if (
        finalViolation &&
        !(isLowContextStaticFallbackVariant(notif.copy.variantId) &&
          isNamedContextViolation(finalViolation))
      ) {
        console.warn(
          `[smart-nudges v8] SUPPRESSED post-CTA send: type=${notif.type} variant=${notif.copy.variantId} reason=${finalViolation} body="${notif.copy.body}"`,
        );
        suppressedPostCta++;
        // Audit-log the suppression so SQL dashboards can see why a qualified
        // notification never shipped. Without this row, finding why the cron
        // run is silent requires scraping function logs.
        await supabase.from("notification_log").insert({
          user_id: notif.userId,
          notification_type: notif.type,
          variant_id: notif.copy.variantId,
          event_reference: notif.eventReference || null,
          delivery_state: "suppressed",
          payload: {
            title: notif.copy.title,
            body: notif.copy.body,
            notification_type: notif.type,
            variant_id: notif.copy.variantId,
            architecture: "cos-mind-v8-meaning-forward",
            prompt_version: BRIEF_PROMPT_VERSION,
            suppression_reason: finalViolation,
            suppression_stage: "post_cta",
            ai_provider_used: notif.copy.aiProvider ?? "static",
          },
        });
        continue;
      }
      if (finalViolation) {
        console.log(
          `[smart-nudges v8] Allowed low-context post-CTA send: type=${notif.type} variant=${notif.copy.variantId} reason=${finalViolation}`,
        );
      }
      shippedNotifications.push(notif);

      const payload: Record<string, unknown> = {
        title: MIND_MODULE_TITLE,
        subtitle: notif.subtitle,
        body: notif.copy.body,
        slot: notif.slot,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        deep_link_route: effectiveRoute,
        dry_run: isDryRun,
        architecture: "cos-mind-v8-meaning-forward",
        prompt_version: BRIEF_PROMPT_VERSION,
        cta_variant: ctaVariant,
        cta_experiment: "cta-action-verb-v2",
        // v5.3 - Per-intent TTL + collapse-id telemetry
        apns_expiration: Math.floor(Date.now() / 1000) + notif.ttlSeconds,
        apns_collapse_id: notif.collapseId,
        badge: notif.badge,
        qualification_warnings: notif.qualificationWarnings,
        // V8 telemetry - also persist under payload.metadata so SQL
        // dashboards that query JSON paths like
        // payload.metadata.architecture see the V8 tags.
        metadata: {
          architecture: "cos-mind-v8-meaning-forward",
          prompt_version: BRIEF_PROMPT_VERSION,
          cta_experiment: "cta-action-verb-v2",
          cta_variant: ctaVariant,
          ai_fallback_chain: "claude-haiku → gemini-flash → static",
          // Which provider in the fallback chain actually produced the
          // copy that shipped. Defensive default 'static' - every NudgeCopy
          // returned to the send loop should carry this stamp.
          ai_provider_used: notif.copy.aiProvider ?? "static",
          // v1.1 - new telemetry fields.
          delivery_skip_reason: null,
          delivery_slot: notif.slot,
          headline_variant: notif.headlineVariant,
          cta_bucket: notif.ctaBucket,
          requires_app_open: notif.requiresAppOpen,
          weekend_cta_gate: notif.weekendCtaGate ?? null,
        },
        decision_trace: {
          variant: notif.copy.variantId,
          route: effectiveRoute,
          type: notif.type,
          cta_variant: ctaVariant,
          ai_provider_used: notif.copy.aiProvider ?? "static",
        },
      };

      // Batch C — atomic dispatch-key claim. Two overlapping cron runs
      // or an admin force-run racing the scheduler must collapse to a
      // single logical send. The claim is inserted with a UNIQUE
      // constraint; the loser trace-logs `duplicate_claim` and exits.
      // Dry-run and Week-Ahead follow the same rule so admin probes
      // cannot double-fire either.
      // Local date is already resolved per-user upstream and stored on
      // each qualified notification as `todayStr`. Fall back to the UTC
      // ISO date only when that plumbing is missing (defensive).
      const dispatchLocalDate = notif.todayStr ??
        new Date().toISOString().slice(0, 10);
      const claim = await claimDispatch(supabase, {
        userId: notif.userId,
        notificationType: notif.type,
        localDate: dispatchLocalDate,
        eventReference: notif.eventReference ?? null,
      });
      if (!claim.claimed) {
        trace(notif.userId, "duplicate_claim", {
          notificationType: notif.type,
          variantId: notif.copy.variantId,
          notificationLogId: claim.existingLogId,
          metadata: {
            dispatch_key: claim.dispatchKey,
            reason: claim.reason ?? "already_claimed",
          },
        });
        console.log(
          `[smart-nudges] duplicate_claim skip user=${
            redactUserId(notif.userId)
          } type=${notif.type} evt=${notif.eventReference ?? "-"}`,
        );
        continue;
      }

      const { data: logRow } = await supabase.from("notification_log").insert({
        user_id: notif.userId,
        notification_type: notif.type,
        variant_id: notif.copy.variantId,
        event_reference: notif.eventReference || null,
        // Dry-run leak fix: stamp dry-run inserts so they remain in the
        // audit trail but are excluded from cap counts (see
        // COUNTABLE_DELIVERY_STATES above). Without this, every
        // ?force_user=...&dry_run=1 probe permanently inflated the
        // user's daily cap count.
        delivery_state: isDryRun ? "dry_run" : "pending",
        payload,
      }).select("id").single();

      const notificationLogId = logRow?.id;
      if (notificationLogId && claim.claimId) {
        // Best-effort: attach the log to the claim so losers observing
        // the claim can point at the canonical send row.
        await attachNotificationLogToClaim(
          supabase,
          claim.claimId,
          notificationLogId,
        );
      }

      if (!isDryRun && apnsJwt) {
        for (const tokenInfo of notif.tokens) {
          if (tokenInfo.platform !== "ios") continue;
          sendAttempted++;
          const normalizedToken = tokenInfo.token.trim().toLowerCase();
          if (!isCanonicalIosApnsToken(normalizedToken)) {
            console.error(
              `[smart-nudges] Deactivating malformed APNs token user=${
                redactUserId(notif.userId)
              } len=${tokenInfo.token.length} prefix=${
                tokenInfo.token.substring(0, 12)
              }...`,
            );
            sendFailed++;
            trace(notif.userId, "apns_rejected", {
              notificationType: notif.type,
              variantId: notif.copy.variantId,
              notificationLogId,
              apnsStatus: 0,
              apnsReason: "MalformedDeviceToken",
              tokenPrefix: tokenInfo.token.substring(0, 12),
              metadata: {
                platform: tokenInfo.platform,
                token_length: tokenInfo.token.length,
              },
            });
            if (notificationLogId) {
              await supabase
                .from("notification_log")
                .update({
                  payload: {
                    ...payload,
                    apns_status: 0,
                    apns_reason: "MalformedDeviceToken",
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                    apns_token_length: tokenInfo.token.length,
                  },
                  delivery_state: "failed",
                })
                .eq("id", notificationLogId);
              // Batch C - per-device attempt row (never blocks the send loop).
              await recordDeliveryAttempt(supabase, {
                notificationLogId,
                userId: notif.userId,
                rawToken: tokenInfo.token,
                platform: tokenInfo.platform,
                apnsEnvironment: apnsEnv,
                apnsStatus: 0,
                apnsReason: "MalformedDeviceToken",
                apnsId: null,
                permanentFailure: true,
              });
            }
            await supabase
              .from("notification_device_tokens")
              .update({ is_active: false })
              .eq("user_id", notif.userId)
              .eq("device_token", tokenInfo.token);
            continue;
          }
          try {
            trace(notif.userId, "apns_attempted", {
              notificationType: notif.type,
              variantId: notif.copy.variantId,
              notificationLogId,
              tokenPrefix: tokenInfo.token.substring(0, 12),
              metadata: {
                platform: tokenInfo.platform,
                apns_host: apnsHost,
                apns_environment: apnsEnv,
              },
            });
            const result = await sendApnsPush(
              normalizedToken,
              apnsJwt,
              apnsBundleId,
              MIND_MODULE_TITLE,
              notif.copy.body,
              {
                notification_type: notif.type,
                variant_id: notif.copy.variantId,
                notification_log_id: notificationLogId || "",
                deep_link_route: effectiveRoute,
                expiration_ts: String((payload as any).apns_expiration ?? ""),
                requires_app_open: String(notif.requiresAppOpen),
                headline_variant: notif.headlineVariant,
              },
              apnsHost,
              {
                ttlSeconds: notif.ttlSeconds,
                collapseId: notif.collapseId,
                badge: notif.badge,
                subtitle: notif.subtitle,
              },
            );
            if (result.ok) sendSuccess++;
            else sendFailed++;
            trace(notif.userId, result.ok ? "apns_accepted" : "apns_rejected", {
              notificationType: notif.type,
              variantId: notif.copy.variantId,
              notificationLogId,
              apnsStatus: result.status,
              apnsReason: result.reason,
              tokenPrefix: tokenInfo.token.substring(0, 12),
              metadata: {
                platform: tokenInfo.platform,
                apns_host: apnsHost,
                apns_environment: apnsEnv,
              },
            });

            // Persist APNs result on the notification_log row for SQL-level debugging.
            if (notificationLogId) {
              await supabase
                .from("notification_log")
                .update({
                  payload: {
                    ...payload,
                    apns_status: result.status,
                    apns_reason: result.reason,
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                    apns_expiration: result.expirationTs,
                    apns_collapse_id: result.collapseId,
                  },
                  delivery_state: result.ok ? "accepted" : "failed",
                })
                .eq("id", notificationLogId);
              // Batch C - per-device attempt. Parent notification_log
              // still gets a last-write for backward compatibility, but
              // multi-device fan-out is now derivable from this table.
              await recordDeliveryAttempt(supabase, {
                notificationLogId,
                userId: notif.userId,
                rawToken: tokenInfo.token,
                platform: tokenInfo.platform,
                apnsEnvironment: apnsEnv,
                apnsStatus: result.status,
                apnsReason: result.reason,
                apnsId: null,
                permanentFailure: !!(result.status === 410 ||
                  (result.status === 400 &&
                    /baddevicetoken/i.test(result.reason || ""))),
              });
            }

            // Auto-deactivate tokens APNs has rejected as permanently bad.
            // 400 BadDeviceToken / 410 Unregistered are the documented contract.
            const reasonLc = (result.reason || "").toLowerCase();
            const shouldDeactivate = result.status === 410 ||
              (result.status === 400 && (
                reasonLc.includes("baddevicetoken") ||
                reasonLc.includes("devicetokennotforTopic".toLowerCase())
              ));
            if (shouldDeactivate) {
              console.log(
                `[smart-nudges] Deactivating dead token user=${
                  redactUserId(notif.userId)
                } prefix=${
                  tokenInfo.token.substring(0, 12)
                }... status=${result.status} reason=${result.reason}`,
              );
              await supabase
                .from("notification_device_tokens")
                .update({ is_active: false })
                .eq("user_id", notif.userId)
                .eq("device_token", tokenInfo.token);
            }
          } catch (e) {
            console.error(
              `[smart-nudges] APNs send error for ${
                redactUserId(notif.userId)
              }:`,
              e,
            );
            sendFailed++;
            trace(notif.userId, "apns_rejected", {
              notificationType: notif.type,
              variantId: notif.copy.variantId,
              notificationLogId,
              apnsStatus: 0,
              apnsReason: "send_threw",
              tokenPrefix: tokenInfo.token.substring(0, 12),
              metadata: { platform: tokenInfo.platform, error: String(e) },
            });
            // Persist the throw so the row doesn't stay 'pending' forever and
            // network/JWT failures are queryable from SQL.
            if (notificationLogId) {
              await supabase
                .from("notification_log")
                .update({
                  payload: {
                    ...payload,
                    apns_status: 0,
                    apns_reason: "send_threw",
                    apns_error: String(e),
                    apns_token_prefix: tokenInfo.token.substring(0, 12),
                  },
                  delivery_state: "failed",
                })
                .eq("id", notificationLogId);
              await recordDeliveryAttempt(supabase, {
                notificationLogId,
                userId: notif.userId,
                rawToken: tokenInfo.token,
                platform: tokenInfo.platform,
                apnsEnvironment: apnsEnv,
                apnsStatus: 0,
                apnsReason: "send_threw",
                apnsId: null,
                extra: { error: String(e) },
              });
            }
          }
        }
      }

      console.log(
        `[smart-nudges] ${
          isDryRun ? "DRY RUN" : "SENT"
        }: ${notif.type}/${notif.copy.variantId} → ${
          redactUserId(notif.userId)
        } | "${notif.copy.body}"`,
      );
    }

    console.log(
      `[smart-nudges] summary qualified=${allNotifications.length} shipped=${shippedNotifications.length} suppressed_post_cta=${suppressedPostCta} attempted=${sendAttempted} sent=${sendSuccess} failed=${sendFailed} mode=${
        describeDeliveryMode(deliveryMode)
      } reason=${deliveryMode.reason}`,
    );

    qualifiedCount = allNotifications.length;
    shippedCount = shippedNotifications.length;
    apnsAttemptedCount = sendAttempted;
    apnsSucceededCount = sendSuccess;
    apnsFailedCount = sendFailed;
    await finishRun(null);

    return new Response(
      JSON.stringify({
        processed: userIds.length,
        notifications: shippedNotifications.length,
        qualified_notifications: allNotifications.length,
        shipped_notifications: shippedNotifications.length,
        suppressed_post_cta: suppressedPostCta,
        apns_attempted: sendAttempted,
        dry_run: isDryRun,
        delivery_mode: describeDeliveryMode(deliveryMode),
        delivery_reason: deliveryMode.reason,
        apns_success: sendSuccess,
        apns_failed: sendFailed,
        architecture: "cos-mind-v8-meaning-forward",
        promptVersion: BRIEF_PROMPT_VERSION,
        details: shippedNotifications.map((n) => ({
          user_id: n.userId,
          type: n.type,
          variant: n.copy.variantId,
          title: n.copy.title,
          body: n.copy.body,
          deep_link: n.deepLinkRoute,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("[smart-nudges] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    await finishRun(message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
