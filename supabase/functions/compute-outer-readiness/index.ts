import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type LeaderProfileContext,
  loadLeaderProfile,
} from "../_shared/leader-profile-loader.ts";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { tzToCountry } from "../_shared/plan/tz-to-country.ts";
import { resolveArchetypeSlug } from "../_shared/archetype-slug.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  callClaudeText,
  callAIText,
  callLovableAIText,
  CLAUDE_MODELS,
} from "../_shared/anthropic.ts";
import { runAnthropicSmokeOnce } from "../_shared/anthropic-smoke.ts";
import { selectLeadEvent } from "../_shared/events/event-classifier.ts";
import {
  detectClientPlatform,
  wrapDbWithCalendarPrimacy,
} from "../_shared/calendar-provider.ts";
// A–H resolution goes through the single canonical entry point so the Brief
// honours user overrides, learned tokens and persisted categories.
import { type ResolveEventInput } from "../_shared/events/resolve-event-category.ts";
import { enrichEvent } from "../_shared/events/enrich-event.ts";
import { primeLearningContext } from "../_shared/events/learning-store.ts";
/** All A–H reads come off the EnrichedEvent returned by enrichEvent(). */
const enrichOf = (input: ResolveEventInput) =>
  enrichEvent(typeof input === "string" ? { title: input } : (input ?? { title: "" }));
/** Canonical A–H pillar display name for an event (null when unresolved). */
const categoryNameOf = (input: ResolveEventInput): string | null =>
  enrichOf(input).category?.name ?? null;
import { EVENT_CATEGORIES } from "../_shared/events/event-categories.ts";
import {
  type Phase,
  phaseForEvent,
} from "../_shared/events/event-phase-map.ts";
import { isTravelTitle } from "../_shared/ceo-behaviour/travel.ts";
import {
  fetchRenderableLoadShape,
  getLoadShapeOrDefault,
  loadShapeWriteEnabled,
} from "../_shared/load-shape/read.ts";
import { briefShapePromptBlock } from "../_shared/load-shape/surfaces.ts";
import { decideTravelFreshness } from "../_shared/travel/freshness.ts";
import { mergeCalendarEvents } from "../_shared/rules/calendarEvents.ts";
import { logMergeStats } from "../_shared/rules/calendar-merge.ts";
import {
  type BehaviourSnapshotResult,
  buildBehaviourSnapshot,
} from "../_shared/behaviour-snapshot.ts";
// §5.1 / §5.2 Atomic Brief Contract validator. Enforced after the per-model
// `normalizeLlmBrief` gate so forbidden words, missing lexicon cluster,
// missing signal evidence, and unanchored pattern references all trigger
// the same retry-once-then-awaiting path as the other validator rejects.
import {
  validateBrief,
  validateNoScoreRestatement,
  validatePillBodyConsistency,
} from "../_shared/brief-validators.ts";
import {
  buildDeterministicBriefFallback,
  type DeterministicBriefBand,
  type DeterministicBriefPillTier,
  type DeterministicBriefResult,
} from "../_shared/brief/deterministic-brief.ts";
import { buildWindowContext } from "../_shared/signal-engine/window-context.ts";
import {
  deriveDayShape,
  formatDayShapeBlock,
  type DayShape,
  type TravelPhase,
} from "../_shared/brief/day-shape.ts";
import {
  formatLeadNarrativeBlock,
  type LeadNarrative,
  resolveLeadNarrative,
} from "../_shared/brief/lead-narrative.ts";

import { BRIEF_PROMPT_VERSION } from "../_shared/brief-prompt-version.ts";
import {
  buildBriefSystemPrompt,
  contextHeaderForSlot,
  mrsConsistencyLine,
  PRE_COMPUTED_USER_NOTICE,
  type ReadinessValence,
} from "../_shared/brief/copy-vocabulary.ts";
import {
  buildLexiconRegex,
  INLINE_LEXICON_WORDS,
} from "../_shared/brief/elastic-lexicon.ts";
import type { ClassifiedEventLite } from "../_shared/signal-engine/types.ts";
import {
  composeDailyContext,
  upsertDailyContextSnapshot,
} from "../_shared/signal-engine/build-daily-context.ts";
import { computeCalendarDemand } from "../_shared/signal-engine/demand-scorer.ts";
import {
  evaluateWeekAheadMode,
  isSaturdayRecoveryDay,
} from "../_shared/plan/week-ahead-mode.ts";
import { planningDayOfWeek } from "../_shared/plan/user-locale.ts";
import { resolveStrategicContext } from "../_shared/signal-engine/strategic-context.ts";
import {
  computeDivergenceFlag,
  computePhysiologicalComposite,
  divergenceProvenance,
  type MrsSource,
} from "../_shared/signal-engine/divergence-flag.ts";
import {
  computeRhr3DayTrend,
  computeSustainedDeficitSeverity,
} from "../_shared/signal-engine/pattern-engine.ts";
import {
  type CalendarMetricsResult,
  getServerCalendarMetrics,
} from "../_shared/signal-engine/db-queries.ts";

function mapDeterministicBriefBand(
  valence: "high" | "mid" | "low" | null,
  score: number | null,
  checkInOutcome: "sharp" | "holding" | "drained" | null,
  hrvDeviation: number | null,
): DeterministicBriefBand {
  if (checkInOutcome === "drained" || (score != null && score < 40)) {
    return "depleted";
  }
  if (valence === "high" && hrvDeviation != null && hrvDeviation >= 10) {
    return "firing";
  }
  if (valence === "high") return "sharp";
  if (valence === "low") return "stretched";
  return "steady";
}

function mapDeterministicCheckInOutcome(
  outcome: string | null,
  clarity: number | null,
  confidence: number | null,
): "sharp" | "holding" | "drained" | null {
  const lower = String(outcome ?? "").toLowerCase();
  if (/drained|overwhelmed|scattered|foggy|low|struggl/.test(lower)) {
    return "drained";
  }
  if (/focused|sharp|steady|strong|thriving|energ/.test(lower)) return "sharp";
  const vals = [clarity, confidence].filter((v): v is number =>
    typeof v === "number" && Number.isFinite(v)
  );
  if (vals.length === 0) return outcome ? "holding" : null;
  const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length;
  if (avg >= 4) return "sharp";
  if (avg <= 2) return "drained";
  return "holding";
}

function briefWeekendDaysForCountry(homeCountry?: string | null): number[] {
  return planningDayOfWeek(homeCountry) === 6 ? [5, 6] : [0, 6];
}

function isBriefWeekendDay(
  dayOfWeek: number,
  homeCountry?: string | null,
): boolean {
  return briefWeekendDaysForCountry(homeCountry).includes(dayOfWeek);
}

function briefRecoveryDay(homeCountry?: string | null): number {
  return planningDayOfWeek(homeCountry) === 6 ? 5 : 6;
}

function briefPlanningDay(homeCountry?: string | null): number {
  return planningDayOfWeek(homeCountry);
}

import {
  type DayContext,
  getDayContext,
  getTimeOfDay,
  getUserTime,
  isLateEvening,
} from "../_shared/signal-engine/day-kind-detector.ts";
import {
  hasMeaningfulDemand,
  isAppleMetricSource,
} from "../_shared/signal-engine/context-builder.ts";
import { deriveWearableDaysConnected } from "./wearable-connection-age.ts";
import {
  type CheckinRow as PqCheckinRow,
  type CoherenceAdjustment,
  type PillTier as PqPillTier,
  type WearableRow as PqWearableRow,
} from "../_shared/signal-engine/checkin-pattern-aggregator.ts";
import {
  derivePills,
  finalizePills,
} from "../_shared/signal-pills/derive-pills.ts";
import {
  resolveSignalFreshness,
  type SignalWindow,
} from "../_shared/signal-engine/signal-freshness.ts";
import {
  type AssessmentContext,
  buildAssessmentContext,
  buildPillContextFromAssessment,
  formatPillAssessmentSection,
} from "../_shared/signal-pills/assessment-context.ts";

// CORS headers are now per-request via getCorsHeaders(req) so the origin
// allowlist can be enforced. See _shared/cors.ts.

// Local helpers for source-provenance + baseline-score derivation.
function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function pillSourceList(
  pill: "decision_readiness" | "physical_reserves" | "resilience_capacity",
  physComposite: number | null,
  demandScore: number | null,
  hasCheckin: boolean,
): MrsSource[] {
  const out: MrsSource[] = [];
  if (physComposite != null) out.push("wearable");
  if (demandScore != null && pill !== "physical_reserves") out.push("calendar");
  if (hasCheckin && pill !== "physical_reserves") out.push("checkin");
  return out;
}

function weightProvenanceIndicatesAwaiting(weightProvenance: any): boolean {
  if (weightProvenance?.awaiting_signals === true) return true;
  if (
    weightProvenance &&
    Object.prototype.hasOwnProperty.call(weightProvenance, "earned")
  ) {
    return !Array.isArray(weightProvenance.earned) ||
      weightProvenance.earned.length === 0;
  }
  return false;
}

type BriefPromptEvent = {
  title: string;
  startTime: string;
  endTime?: string | null;
  isAllDay?: boolean;
  stakesLevel?: string | null;
};

function resolvePromptEventPhase(
  event: BriefPromptEvent,
  now: Date,
): Phase {
  const startMs = new Date(event.startTime).getTime();
  const endMs = event.endTime ? new Date(event.endTime).getTime() : startMs;
  if (Number.isFinite(startMs) && now.getTime() < startMs) return "pre";
  if (
    Number.isFinite(startMs) && Number.isFinite(endMs) &&
    now.getTime() >= startMs && now.getTime() < endMs
  ) {
    return "during";
  }
  return "post";
}

function buildEventCoachingBlock(
  label: string,
  events: BriefPromptEvent[],
  now: Date,
): string {
  const lines = events
    .slice(0, 6)
    .map((event) => {
      const subtype = enrichOf(event.title).subtype;
      if (!subtype) return null;
      const phase = resolvePromptEventPhase(event, now);
      const phaseMeta = phaseForEvent(
        event.title,
        phase,
        event.stakesLevel ?? null,
      );
      const category = EVENT_CATEGORIES[subtype.categoryId];
      const combo = phaseMeta
        ? `${phaseMeta.resolvedCombo.protocol}/${phaseMeta.resolvedCombo.mode}`
        : null;
      return [
        `- ${event.title}`,
        `${category.id} ${category.name}`,
        `type ${subtype.label}`,
        `phase ${phase}${phaseMeta?.timing ? ` (${phaseMeta.timing})` : ""}`,
        combo ? `combo ${combo}` : null,
        phaseMeta?.goal ? `goal ${phaseMeta.goal}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .filter((line): line is string => !!line);

  if (lines.length === 0) return "";
  return `\n\n=== ${label} EVENT COACHING ===\n${lines.join("\n")}`;
}

// ==================== BRIEF SNAPSHOT CACHE ====================
// `BRIEF_PROMPT_VERSION` is now imported from the shared module so Plan and
// Nudges can disambiguate the persisted Brief snapshot using the same value.
// Bump it in `_shared/brief-prompt-version.ts` — a bump intentionally
// invalidates all prior cached briefs.

// Stable JSON.stringify with sorted keys so { a:1, b:2 } and { b:2, a:1 } hash identically.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(
      ",",
    ) + "}";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

// Material inputs that should change the brief content. Anything not listed here
// (timestamps, ordering noise, derived display fields) MUST NOT enter the signature.
interface BriefSignatureInput {
  localDate: string;
  timeWindow: "morning" | "afternoon" | "evening";
  promptVersion: string;
  score: number | null;
  tier: string | null;
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  sharpnessLevel: number | null;
  wearableSummaryDate: string | null;
  hrvDeviation: number | null;
  sleepDeviation: number | null;
  rhrDeviation: number | null;
  wearableTier: string | null;
  calendarLoad: string | null;
  calendarPressure: string | null;
  meetingCount: number | null;
  remainingMeetingCount: number | null;
  remainingHighStakesTitles: string[];
  nextHighStakesTitle: string | null;
  nextHighStakesMinutesUntil: number | null;
  // Coach signals are intentionally null while suppressed in the prompt; keep field
  // shape stable so future re-enablement is a one-line change rather than a v-bump.
  coachStrength: string | null;
  coachGrowthArea: string | null;
  archetype: string | null;
  scoreTrajectory: string | null;
  consecutiveLowDays: number | null;
  typicalDOWOutcome: string | null;
  hrvEventCorrelation: boolean | null;
  wearableTrend: string | null;
  tomorrowLoad: string | null;
  isWeekend: boolean;
  isPublicHoliday: boolean;
}

async function computeInputSignature(
  ctx: BriefSignatureInput,
): Promise<string> {
  const material = {
    ...ctx,
    // Round material number fields to suppress noise that would needlessly invalidate the cache.
    hrvDeviation: ctx.hrvDeviation == null
      ? null
      : Math.round(ctx.hrvDeviation),
    sleepDeviation: ctx.sleepDeviation == null
      ? null
      : Math.round(ctx.sleepDeviation),
    rhrDeviation: ctx.rhrDeviation == null
      ? null
      : Math.round(ctx.rhrDeviation),
    nextHighStakesMinutesUntil: ctx.nextHighStakesMinutesUntil == null
      ? null
      : Math.round(ctx.nextHighStakesMinutesUntil / 5) * 5, // 5-min bucket
    remainingHighStakesTitles: [...(ctx.remainingHighStakesTitles || [])]
      .sort(),
  };
  return await sha256Hex(stableStringify(material));
}

// ==================== TYPES ====================
type EnergyTier = "depleted" | "managing" | "strong" | "peak";
type CalendarLevel = "low" | "medium" | "high";
type ThemeDriver =
  | "pressure+load"
  | "pressure"
  | "load"
  | "morning"
  | "evening"
  | "state"
  // §17.2 — Sunday / last-PTO / last-holiday week-ahead recap.
  | "week_recap"
  // §17.2a — Saturday self-regulation / recovery day, backward-looking.
  | "week_recovery";

interface OuterReadinessResult {
  phrase: string | null;
  context: string | null;
  leanOn: string | null;
  watchFor: string | null;
  driver: ThemeDriver;
  dataSources: string[];
  calendarState?: "active" | "connected_no_events" | "not_connected";
  coachInsightAge?: number;
  coachInsightLabel?: string;
  relationshipPattern?: string;
  integrationStatus?: {
    wearable?: {
      connectionStatus:
        | "connected"
        | "connected_but_waiting_for_data"
        | "sync_delayed"
        | "permission_revoked"
        | "disconnected"
        | "error"
        | "unknown";
      syncStatus:
        | "synced"
        | "waiting_for_data"
        | "sync_delayed"
        | "error"
        | "watch_unavailable"
        | "unknown";
      hasTodayData: boolean;
      hasRecentData: boolean;
      hasHistoricalData: boolean;
      lastSyncAt: string | null;
      lastSampleAt: string | null;
    } | null;
    calendar?: {
      provider: string | null;
      connectionStatus:
        | "connected"
        | "connected_no_events"
        | "permission_revoked"
        | "disconnected"
        | "error";
      needsReconnect: boolean;
      lastSyncAt: string | null;
    } | null;
  };
  // New: State statement + alreadyUsed[] relay for SharedContext
  stateStatement?: string;
  stateAlreadyUsed?: string[];
  compassAlreadyUsed?: string[];
}

interface ComputeRequest {
  innerReadinessTier: EnergyTier;
  innerReadinessScore: number | null;
  /**
   * Lightweight preflight mode for callers that need server-side calendar
   * eligibility before computing inner readiness. Must return before any
   * brief/daily_context_snapshot persistence so it cannot write an awaiting
   * row with null MRS fields.
   */
  contextOnly?: boolean;
  /**
   * Manual refresh (or replay/backfill) override. When true the brief
   * snapshot *read* is skipped so copy is regenerated from the current
   * signals instead of replaying an existing row for this
   * (user, local_date, time_window, input_signature, prompt_version).
   * Regeneration is deterministic on inputs, so an unchanged signal set
   * still yields the same direction — only stale/incorrect copy changes.
   * The write path is untouched: the row is updated in place with a new
   * `updated_at`, and overwrite protection still prevents a null-copy pass
   * from blanking a good brief. Nothing is deleted.
   */
  forceRefresh?: boolean;
  // MRS v3 — soft-guard tier cap (forwarded from compute-inner-readiness).
  // The server mirrors these into daily_context_snapshot so the UI reads
  // the canonical displayed tier without re-deriving from the raw score.
  tierDisplayed?: EnergyTier | null;
  tierCapReason?: "SUSTAINED_DEFICIT" | "CONSECUTIVE_LOAD" | null;
  // MRS v3 §3.3 — refined-score split forwarded by the client (the inner
  // readiness EF already blended the dims into the score). Used here only
  // for persistence + echoing so the UI gets a single round trip.
  innerReadinessScoreBaseline?: number | null;
  innerReadinessScoreRefined?: number | null;
  innerReadinessState?: "baseline" | "refined" | "awaiting" | null;
  innerReadinessRefinedContribution?: number | null;
  // MRS v4 — optional pass-through from compute-inner-readiness so the
  // outer-readiness mirror persists the v4 audit-trail without re-deriving.
  weightProvenance?: unknown | null;
  calendarLoad?: CalendarLevel | null; // legacy client field, ignored if server can query
  calendarPressure?: CalendarLevel | null; // legacy client field, ignored if server can query
  archetype?: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  mentalSharpnessLevel?: number | null;
  // MRS v3 §3.2 — Mind Check-in dimensions (forwarded for persistence/echo only).
  emotionLevel?: number | null;
  pressureLevel?: number | null;
  regulationLevel?: number | null;
  checkInOutcome: string | null;
  timezoneOffset?: number;
  localDate?: string | null;
  mrsWindow?: string | null;
  /**
   * IANA timezone string (e.g. "Europe/London", "America/New_York").
   * Reflects where the user CURRENTLY is — formatting all event times via
   * Intl in this zone guarantees the brief speaks in the user's current
   * local clock even when traveling.
   */
  currentTimezone?: string | null;
  /**
   * IANA timezone string for the user's home base. Used for circadian/jetlag
   * commentary when it differs from currentTimezone. Optional — server falls
   * back to the persisted profiles.home_timezone column.
   */
  homeTimezone?: string | null;
  componentScores?: {
    energyRegulation?: number;
    focusRecovery?: number;
    energyRenewal?: number;
  } | null;
  practicePriorityTag?: string | null;
}

type CachedBriefSnapshot = {
  phrase: string | null;
  body_text: string | null;
  lean_on: string | null;
  lean_on_source: string | null;
  watch_for: string | null;
  watch_for_source: string | null;
  brief_source: "llm" | "deterministic" | "awaiting";
  driver: string | null;
};

// ==================== SERVER-SIDE CALENDAR METRICS ====================
// `CalendarMetricsResult` + `getServerCalendarMetrics` now live in
// `_shared/signal-engine/db-queries.ts` (MRS v2 §5.1).

interface WearableContext {
  hrv: number | null;
  rhr: number | null;
  hr: number | null;
  sleepScore: number | null;
  sleepDuration: number | null;
  hrElevated: boolean; // Derived: HRV significantly below baseline implies sympathetic dominance (elevated HR)
  hrvElevated: boolean; // HRV significantly below baseline
  poorSleep: boolean; // sleep_score < 60 or sleep_duration < 360 min (6h)
  rhrElevated: boolean; // RHR elevated vs personal baseline (deviation-based)
  dataSource: string | null; // e.g. 'apple-healthkit', 'oura', 'whoop'
  sourceRowDate: string | null; // summary_date of the row used
  // Signal Pills v3 — wearable anchor for the Resilience pill.
  // Provider-reported overnight sleep efficiency (0–100). Distinct from
  // sleepScore (overall sleep quality index) and sleepDuration (time
  // asleep). Null when the provider does not expose efficiency.
  sleepEfficiency?: number | null;
}

// Apple sleep sources that report "time in bed" rather than asleep —
// keep this list as the SSOT so new native onboarding paths (HealthKit,
// Apple Watch direct stream, Oura HealthKit bridge) all stay aligned.
// `isAppleSleepSource` lives in `_shared/signal-engine/context-builder.ts`.

type BriefSignalItem = { signal: string; source: string };
type LlmBriefPackage = {
  phrase: string;
  bodyText: string;
  leanOn: BriefSignalItem[];
  watchFor: BriefSignalItem[];
};

// Calendar metrics (load + pressure) are now derived by
// `computeCalendarDemand` from `_shared/signal-engine/demand-scorer.ts`,
// the MRS v2 SSOT. The legacy inline `computeCalendarMetrics` +
// `inferRelationshipPressure` were deleted in Phase C — the shared module
// is bit-equivalent and is exercised by Phase E tests.

// `getServerCalendarMetrics`, time-window helpers (`getUserTime`,
// `getTimeOfDay`, `isLateEvening`, `getDayContext`, `DayContext`) and
// `hasMeaningfulDemand` were extracted to `_shared/signal-engine/` per
// MRS v2 §5.1 and are imported at the top of this file.

// ==================== CONTEXT SUFFIX BUILDER ====================
// Generates 1–2 sentence dynamic suffix connecting body signals to calendar demands.
// RELEVANCE RULE: Never list event titles as standalone items.
// Reference event names ONLY when paired with a strain signal or to characterize the day.
// For many events, use count. For high-stakes, reference by name only when it contextualizes.
function buildContextSuffix(
  todayHighStakes: string[] | undefined,
  eventCount: number | undefined,
  wearable: WearableContext | null | undefined,
  timeOfDay: "morning" | "afternoon" | "evening",
): string {
  const hasStakes = todayHighStakes && todayHighStakes.length > 0;
  const denseCalendar = eventCount && eventCount >= 4;
  const bodyStrained = wearable &&
    (wearable.hrElevated || wearable.hrvElevated || wearable.rhrElevated);
  const hasSleepIssue = wearable?.poorSleep;
  const isEvening = timeOfDay === "evening";

  // ── EVENING: Retrospective framing – acknowledge what was carried, not what to pace ──
  if (isEvening) {
    if (hasStakes && bodyStrained) {
      const stakeRef = todayHighStakes!.length === 1
        ? `'${todayHighStakes![0]}'`
        : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
      return ` You carried ${stakeRef} today while your body ran at elevated strain throughout.`;
    }
    if (hasStakes && denseCalendar) {
      const stakeRef = `'${todayHighStakes![0]}'`;
      return ` You navigated ${stakeRef} and a full calendar today.`;
    }
    if (denseCalendar && bodyStrained) {
      return ` ${eventCount} meetings today, and your heart rate reflected the density throughout.`;
    }
    if (denseCalendar) {
      return ` You navigated a dense calendar today – ${eventCount} meetings.`;
    }
    if (bodyStrained) {
      return " Your body is carrying accumulated strain – the day is done and recovery matters now.";
    }
    if (hasSleepIssue) {
      return " You started today under-recovered and carried that through a full day.";
    }
    return "";
  }

  // ── MORNING / AFTERNOON: Forward-looking framing ──

  // When high-stakes events AND body strain – connect the two signals
  if (hasStakes && bodyStrained) {
    const stakeRef = todayHighStakes!.length === 1
      ? `'${todayHighStakes![0]}'`
      : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
    return ` A day anchored by ${stakeRef} while your body carried elevated strain throughout.`;
  }

  // High-stakes events AND poor sleep (morning) – connect recovery to demands
  if (hasStakes && timeOfDay === "morning" && hasSleepIssue) {
    const stakeRef = todayHighStakes!.length === 1
      ? `'${todayHighStakes![0]}'`
      : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`;
    const sleepDetail = wearable!.sleepScore
      ? `(sleep score: ${wearable!.sleepScore})`
      : "";
    return ` Recovery overnight was incomplete ${sleepDetail} – and ${stakeRef} is ahead.`;
  }

  // High-stakes events, load is also high, body is fine – characterize the day
  if (hasStakes && denseCalendar) {
    const stakeRef = `'${todayHighStakes![0]}'`;
    return ` Your most demanding conditions today, anchored by ${stakeRef}.`;
  }

  // Dense calendar + body strain – connect density to physical signal
  if (denseCalendar && bodyStrained) {
    return ` ${eventCount} meetings with tight gaps, and your heart rate reflected the density.`;
  }

  // Dense calendar, no strain – note the volume (morning/afternoon only)
  if (denseCalendar) {
    return ` ${eventCount} meetings today – pace the gaps.`;
  }

  // Body strain only, light calendar – accumulated strain signal
  if (bodyStrained && (!eventCount || eventCount < 3)) {
    return " Your body is carrying more than your calendar suggests – accumulated strain from recent days.";
  }

  // Morning poor sleep without high-stakes (standalone sleep note)
  if (timeOfDay === "morning" && hasSleepIssue) {
    const detail = wearable!.sleepScore
      ? `sleep score: ${wearable!.sleepScore}`
      : wearable!.sleepDuration
      ? `${Math.round(wearable!.sleepDuration / 60)} hours of sleep`
      : "incomplete recovery";
    return ` Your recovery overnight was incomplete (${detail}).`;
  }

  // Morning RHR elevated (without other flags already caught)
  if (timeOfDay === "morning" && wearable?.rhrElevated && !bodyStrained) {
    return " Your resting heart rate is running above baseline – your system didn't fully reset overnight.";
  }

  // Good recovery state (only if explicitly positive)
  if (
    wearable && wearable.sleepScore && wearable.sleepScore >= 75 &&
    !wearable.hrElevated && !wearable.hrvElevated && !wearable.rhrElevated
  ) {
    return " Your body is well-recovered and ready for what's ahead.";
  }

  return "";
}

// ==================== AFTERNOON CONTEXT BUILDER ====================
// Adds afternoon-specific awareness: accumulated strain + remaining demands.
// RELEVANCE RULE: No standalone event name references. Weave if paired with strain.
function buildAfternoonContext(
  todayHighStakes: string[] | undefined,
  eventCount: number | undefined,
  wearable: WearableContext | null | undefined,
  baseContext: string,
): string {
  const parts: string[] = [];
  const bodyStrained = wearable &&
    (wearable.hrElevated || wearable.hrvElevated);

  if (bodyStrained) {
    parts.push(
      "Your heart rate has been elevated through a dense morning. The afternoon needs a leader who paces, not pushes.",
    );
  } else if (wearable?.hrvElevated) {
    parts.push("Your HRV is showing accumulated strain from the morning.");
  }

  // Only reference high-stakes if paired with strain or as "most critical meeting"
  if (todayHighStakes && todayHighStakes.length > 0 && bodyStrained) {
    parts.push(
      "With your most critical meeting still ahead, the pace of the next few hours matters.",
    );
  } else if (eventCount && eventCount >= 4 && !bodyStrained) {
    parts.push(
      `${eventCount} meetings today – pace the remaining hours deliberately.`,
    );
  }

  if (parts.length === 0) return baseContext;
  return baseContext + " " + parts.join(" ");
}

// ==================== WEEKDAY EVENING THEME BUILDER ====================
// Evening themes: acknowledge today first (validation), then frame tomorrow as recovery motivation.
// Banned: "plan", "prepare", "get ready". Use: "restore", "arrive", "release".
// REMAINING-EVENTS AWARENESS: Split into "day still going" vs "day is done" based on remainingEvents.
function buildWeekdayEveningTheme(
  tier: EnergyTier,
  tomorrowHighStakes?: string[],
  wearable?: WearableContext | null,
  defaultPhrase?: string,
  defaultContext?: string,
  todayHighStakes?: string[],
  eventCount?: number,
  calendarLoad?: CalendarLevel | null,
  calendarPressure?: CalendarLevel | null,
  remainingEvents?: number,
  remainingHighStakes?: string[],
  meetingCount?: number,
  remainingMeetings?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  const hasTomorrowStakes = tomorrowHighStakes && tomorrowHighStakes.length > 0;
  const tomorrowEvent = hasTomorrowStakes ? `'${tomorrowHighStakes[0]}'` : null;
  const bodyStressed = wearable &&
    (wearable.hrElevated || wearable.hrvElevated);
  const hadHeavyDay = calendarLoad === "high" || calendarPressure === "high";
  const hasTodayStakes = todayHighStakes && todayHighStakes.length > 0;
  const todayDense = eventCount && eventCount >= 4;

  // Use filtered meeting counts for user-facing text
  const filteredRemaining = remainingMeetings ?? remainingEvents ?? 0;
  const filteredTotal = meetingCount ?? eventCount ?? 0;
  const pastMeetings = filteredTotal - filteredRemaining;
  const hasRemainingHS = remainingHighStakes && remainingHighStakes.length > 0;

  // Sleep acknowledgment for evening
  const sleepNote = wearable?.poorSleep
    ? " You started today under-recovered and carried that through a full day. Tonight's sleep matters more than usual."
    : "";

  // RHR note for evening
  const rhrNote = wearable?.rhrElevated && !bodyStressed
    ? " Your resting heart rate is still elevated – tonight's recovery is especially important."
    : "";

  // ══════════════════════════════════════════════════════════════
  // BRANCH A: Meetings still ahead (remainingMeetings > 0)
  // Acknowledge past + frame remaining + connect to directive
  // ══════════════════════════════════════════════════════════════
  if (filteredRemaining > 0) {
    const pastLabel = pastMeetings > 0
      ? `${pastMeetings} meeting${pastMeetings !== 1 ? "s" : ""}`
      : null;

    // A-1: Remaining high-stakes events ahead
    if (hasRemainingHS) {
      if (tier === "depleted") {
        return {
          phrase: "Protect what's left.",
          context: `${
            pastLabel
              ? `You've spent most of today's reserves across ${pastLabel}. `
              : ""
          }With '${
            remainingHighStakes![0]
          }' still ahead and your reserves low, protecting what's left means deploying only where it genuinely matters – everything before it is cost, not investment.${sleepNote}${rhrNote}`,
          driver: "evening",
        };
      }
      if (tier === "managing") {
        return {
          phrase: "Stay present for what's left.",
          context: `${
            pastLabel ? `You've navigated ${pastLabel} today. ` : ""
          }With '${
            remainingHighStakes![0]
          }' still ahead, your decision readiness is still operational – staying present for what remains is the highest-value move right now.${sleepNote}${rhrNote}`,
          driver: "evening",
        };
      }
      if (tier === "strong") {
        return {
          phrase: "Carry your edge forward.",
          context: `${
            pastLabel
              ? `You've navigated ${pastLabel} today with above-baseline readiness. `
              : ""
          }'${
            remainingHighStakes![0]
          }' is still ahead – carry that edge forward into the moment that matters most rather than coasting on what's already done.${sleepNote}${rhrNote}`,
          driver: "evening",
        };
      }
      // peak
      return {
        phrase: "Finish at your best.",
        context: `${
          pastLabel ? `${pastLabel} navigated at peak readiness. ` : ""
        }'${
          remainingHighStakes![0]
        }' is still ahead – this state is rare, finish at your best where it counts.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }

    // A-2: Remaining meetings but not high-stakes + body strain
    if (bodyStressed) {
      return {
        phrase: "Pace the remaining hours.",
        context: `${
          pastLabel
            ? `You've carried strain through ${pastLabel} already. `
            : "Your body is carrying accumulated strain. "
        }With ${filteredRemaining} still ahead, pacing the remaining hours protects the quality of your presence for what's left.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }

    // A-3: Remaining meetings, no strain, no high-stakes
    const phrase = defaultPhrase || "Close with care.";
    return {
      phrase,
      context: `${
        pastLabel ? `You've navigated ${pastLabel} so far. ` : ""
      }${filteredRemaining} still ahead – closing with care means bringing the same quality of attention to what remains without borrowing from tomorrow.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // BRANCH B: Day is done (remainingMeetings === 0)
  // Full retrospective + tomorrow as recovery motivation
  // Context connects to the phrase directive
  // ══════════════════════════════════════════════════════════════

  // ── Build todaySummary: acknowledge what the user carried today ──
  const meetingLabel = filteredTotal > 0
    ? `${filteredTotal} meeting${filteredTotal !== 1 ? "s" : ""}`
    : null;
  // Density guard: never emit "dense calendar" / "tight gaps" copy when
  // there were fewer than 3 meetings. A single high-pressure summit can mark
  // the day as "heavy" via pressure, but the literal density phrasing is wrong.
  const trulyDense = filteredTotal >= 3;
  let todaySummary = "";
  if (hadHeavyDay && bodyStressed && hasTodayStakes) {
    todaySummary = `You carried a demanding day – ${
      todayHighStakes!.length >= 2
        ? `${todayHighStakes!.length} high-stakes meetings`
        : `'${todayHighStakes![0]}'`
    } with your heart rate elevated throughout.`;
  } else if (hadHeavyDay && hasTodayStakes) {
    todaySummary = `You navigated '${
      todayHighStakes![0]
    }' and a full calendar today.`;
  } else if (hadHeavyDay && meetingLabel && trulyDense) {
    todaySummary =
      `You navigated a dense calendar – ${meetingLabel} with tight gaps.`;
  } else if (hadHeavyDay && meetingLabel) {
    // Heavy by pressure but only 1–2 meetings — honour the pill, not "density".
    todaySummary = filteredTotal === 1
      ? "You carried one demanding session today."
      : `You carried ${meetingLabel} of demanding work today.`;
  } else if (bodyStressed) {
    todaySummary = wearable!.hrElevated
      ? "Your heart rate ran high through today's demands."
      : "Your HRV is showing accumulated strain from today.";
  } else if (hadHeavyDay) {
    todaySummary = "You carried a full day of demands.";
  } else if (meetingLabel) {
    todaySummary = `You navigated ${meetingLabel} today.`;
  }

  // ── Priority 1: Today was heavy + Tomorrow has high-stakes ──
  if (todaySummary && hasTomorrowStakes) {
    if (tier === "depleted" || tier === "managing") {
      return {
        phrase: "Ground before tomorrow.",
        context:
          `${todaySummary} Tomorrow has ${tomorrowEvent}. Grounding now means what you release tonight determines how sharp you arrive – restoration, not preparation.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }
    return {
      phrase: "Restore for what matters.",
      context:
        `${todaySummary} ${tomorrowEvent} is tomorrow. Restoring tonight is the highest-leverage move – you'll arrive sharper rested than over-rehearsed.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ── Priority 2: Today was heavy, no tomorrow stakes ──
  if (todaySummary && bodyStressed) {
    return {
      phrase: defaultPhrase || "Let the body close.",
      context:
        `${todaySummary} Letting the body close means the cool-down tonight is physical, not just mental – what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ── Priority 3: Light today + heavy tomorrow ──
  if (!hadHeavyDay && hasTomorrowStakes) {
    if (tier === "depleted") {
      return {
        phrase: "Ground before tomorrow.",
        context:
          `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. Grounding tonight is genuine – your reserves are low and tomorrow will ask for them.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }
    return {
      phrase: "Arrive at your best.",
      context:
        `A lighter day is behind you, but ${tomorrowEvent} is tomorrow. Arriving at your best means restoration now determines how you show up – not preparation.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ── Priority 4: Tomorrow has high-stakes (body fine, today unremarkable) ──
  if (hasTomorrowStakes) {
    if (tier === "depleted") {
      return {
        phrase: "Ground before tomorrow.",
        context:
          `You have ${tomorrowEvent} tomorrow and your reserves are low. Grounding tonight means arriving restored, not prepared – what you protect now directly shapes how you show up.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }
    if (tier === "managing") {
      return {
        phrase: "Close with tomorrow in mind.",
        context:
          `${tomorrowEvent} is tomorrow. Closing with tomorrow in mind means a clean finish tonight – you'll show up sharper by resting well than by rehearsing late.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }
    if (tier === "strong") {
      return {
        phrase: "Protect your edge for tomorrow.",
        context:
          `You have ${tomorrowEvent} tomorrow and above-baseline readiness to carry into it. Protecting your edge means a deliberate wind-down tonight, not preparation.${sleepNote}${rhrNote}`,
        driver: "evening",
      };
    }
    // peak
    return {
      phrase: "Arrive at your best.",
      context:
        `${tomorrowEvent} is tomorrow and your readiness is at its peak. Arriving at your best means your only priority tonight is protecting this state through genuine rest.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ── Priority 5: Body stressed, no stakes ──
  if (bodyStressed) {
    const bodySignal = wearable!.hrElevated
      ? "Your heart rate ran high through today's demands"
      : "Your HRV is showing accumulated strain from today";
    return {
      phrase: defaultPhrase || "Let the body close.",
      context:
        `${bodySignal}. Letting the body close means the cool-down is physical, not just mental – what you release now determines how you recover overnight.${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // ── Priority 6: Today acknowledgment without strain – TIER-AWARE directives ──
  if (todaySummary) {
    const phrase = defaultPhrase || "Close before tomorrow.";
    let directive: string;
    if (tier === "depleted") {
      directive =
        "tonight is about release and protection – your system needs genuine recovery before tomorrow's first decisions.";
    } else if (tier === "managing") {
      directive =
        "tonight is about a clean close – releasing the day's residue so you arrive steady tomorrow.";
    } else if (tier === "strong") {
      directive =
        "tonight is about consolidation – protecting the edge you carried today so it's available tomorrow.";
    } else {
      // peak
      directive =
        "tonight is about intentional wind-down – a gentle transition preserves what you built today.";
    }
    return {
      phrase,
      context:
        `${todaySummary} Closing before tomorrow means ${directive}${sleepNote}${rhrNote}`,
      driver: "evening",
    };
  }

  // Default: soft close – tier-aware
  const phrase = defaultPhrase || "Close before tomorrow.";
  let defaultDirective: string;
  if (tier === "depleted") {
    defaultDirective =
      "Tonight is about genuine release – your system needs recovery before tomorrow asks for anything.";
  } else if (tier === "managing") {
    defaultDirective =
      "Tonight is about a clean close – releasing the day so you arrive steady tomorrow.";
  } else if (tier === "strong") {
    defaultDirective =
      "Tonight is about protecting your edge – a deliberate wind-down carries today's advantage into tomorrow.";
  } else {
    defaultDirective =
      "Tonight is about intentional transition – preserving what you built today through genuine rest.";
  }
  let ctx = `${
    defaultContext || defaultDirective
  } Closing before tomorrow protects the quality of how you arrive.`;
  if (sleepNote) ctx += sleepNote;
  if (rhrNote) ctx += rhrNote;
  return { phrase, context: ctx, driver: "evening" };
}

// ==================== MORNING THEME BUILDER (sleep/recovery + calendar-aware) ====================
function buildMorningTheme(
  tier: EnergyTier,
  wearable?: WearableContext | null,
  defaultPhrase?: string,
  defaultContext?: string,
  todayHighStakes?: string[],
  eventCount?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  const hasHighStakes = todayHighStakes && todayHighStakes.length > 0;
  const eventRef = hasHighStakes
    ? todayHighStakes!.length === 1
      ? `'${todayHighStakes![0]}'`
      : `'${todayHighStakes![0]}' and '${todayHighStakes![1]}'`
    : null;

  // RHR morning note (added to relevant contexts)
  const rhrMorningNote = wearable?.rhrElevated
    ? " Your resting heart rate is running above baseline – your system didn't fully reset overnight."
    : "";

  // Priority 1: Poor sleep + high-stakes events today
  if (wearable?.poorSleep && hasHighStakes) {
    const sleepDetail = wearable.sleepScore
      ? `(sleep score: ${wearable.sleepScore})`
      : wearable.sleepDuration
      ? `(${Math.round(wearable.sleepDuration / 60)} hours)`
      : "";
    if (tier === "depleted") {
      return {
        phrase: "Pace from the start.",
        context:
          `Recovery overnight was incomplete ${sleepDetail}, and you have ${eventRef} today. Your system is starting in deficit – pace the opening and deploy carefully where it counts.${rhrMorningNote}`,
        driver: "morning",
      };
    }
    if (tier === "managing") {
      return {
        phrase: "Start steady, not strong.",
        context:
          `Recovery overnight was incomplete ${sleepDetail}, and ${eventRef} is ahead. Your operating baseline is lower than usual – a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}`,
        driver: "morning",
      };
    }
    if (tier === "strong") {
      return {
        phrase: "Guard the morning window.",
        context:
          `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. With ${eventRef} ahead, that advantage is more fragile than usual – protect it through the morning's first demands.${rhrMorningNote}`,
        driver: "morning",
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context:
        `Peak readiness despite a shorter recovery window ${sleepDetail}. ${eventRef} is ahead – this state may not sustain through a full day. Deploy it where it matters most, not where it's spent first.${rhrMorningNote}`,
      driver: "morning",
    };
  }

  // Priority 2: Good recovery + high-stakes events today
  if (
    hasHighStakes && wearable && !wearable.poorSleep && !wearable.hrvElevated
  ) {
    if (tier === "depleted") {
      return {
        phrase: "Pace from the start.",
        context:
          `${eventRef} is ahead today and your reserves are low despite adequate rest. Every early commitment costs more – protect your capacity for the moments that matter.${rhrMorningNote}`,
        driver: "morning",
      };
    }
    if (tier === "managing") {
      return {
        phrase: "Set a sustainable pace.",
        context:
          `Adequate recovery and ${eventRef} ahead. Your operating baseline is solid enough – a steady opening protects the capacity you'll need later.${rhrMorningNote}`,
        driver: "morning",
      };
    }
    // strong/peak
    return {
      phrase: tier === "peak" ? "Protect the peak." : "Protect the window.",
      context:
        `Well-recovered and ${eventRef} is ahead. Your readiness is genuine – protect it through the morning's first demands.${rhrMorningNote}`,
      driver: "morning",
    };
  }

  // Priority 3: Poor sleep only (no high-stakes events)
  if (wearable?.poorSleep) {
    const sleepDetail = wearable.sleepScore
      ? `(sleep score: ${wearable.sleepScore})`
      : wearable.sleepDuration
      ? `(${Math.round(wearable.sleepDuration / 60)} hours)`
      : "";
    // Add event count density note if available
    const densityNote = eventCount && eventCount >= 4
      ? ` ${eventCount} meetings today – pace through the volume deliberately.`
      : "";
    if (tier === "depleted") {
      return {
        phrase: "Pace from the start.",
        context:
          `Recovery overnight was incomplete ${sleepDetail}. Your system is starting in deficit – every early commitment costs more today. Protect the first hours and deploy carefully.${rhrMorningNote}${densityNote}`,
        driver: "morning",
      };
    }
    if (tier === "managing") {
      return {
        phrase: "Start steady, not strong.",
        context:
          `Recovery overnight was incomplete ${sleepDetail}. Your operating baseline is lower than usual – a steady opening protects the capacity you'll need for what matters later.${rhrMorningNote}${densityNote}`,
        driver: "morning",
      };
    }
    if (tier === "strong") {
      return {
        phrase: "Guard the morning window.",
        context:
          `Your readiness is above baseline despite incomplete recovery overnight ${sleepDetail}. That advantage is more fragile than usual – protect it through the morning's first demands.${rhrMorningNote}${densityNote}`,
        driver: "morning",
      };
    }
    // peak
    return {
      phrase: "Protect the peak carefully.",
      context:
        `Peak readiness despite a shorter recovery window ${sleepDetail}. This state may not sustain through a full day – deploy it where it matters most, not where it's spent first.${rhrMorningNote}${densityNote}`,
      driver: "morning",
    };
  }

  // Priority 4: HRV elevated strain (no poor sleep)
  if (wearable?.hrvElevated) {
    const calendarNote = hasHighStakes
      ? ` ${eventRef} is ahead – pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead – pace through the volume.`
      : "";
    return {
      phrase: defaultPhrase || "Ease into the day.",
      context: `Your HRV is signalling accumulated strain from recent days. ${
        defaultContext ||
        "How you pace the opening hours determines your capacity through the rest of the day."
      }${rhrMorningNote}${calendarNote}`,
      driver: "morning",
    };
  }

  // Priority 4b: RHR elevated only (no other strain flags)
  if (wearable?.rhrElevated) {
    const calendarNote = hasHighStakes
      ? ` ${eventRef} is ahead – pace your approach.`
      : eventCount && eventCount >= 4
      ? ` ${eventCount} meetings ahead – pace through the volume.`
      : "";
    return {
      phrase: defaultPhrase || "Ease into the day.",
      context:
        `Your resting heart rate is running above baseline – your system didn't fully reset overnight. ${
          defaultContext ||
          "How you pace the opening hours determines your capacity through the rest of the day."
        }${calendarNote}`,
      driver: "morning",
    };
  }

  // Priority 5: High-stakes events but no wearable data – tier-aware
  if (hasHighStakes) {
    let morningDirective: string;
    if (tier === "depleted") {
      morningDirective =
        `'${eventRef}' is ahead today. Your reserves are low – protecting the opening hours determines how much you have when it matters.`;
    } else if (tier === "managing") {
      morningDirective =
        `'${eventRef}' is ahead today. A steady opening protects the capacity you'll need for what matters later.`;
    } else if (tier === "strong") {
      morningDirective =
        `'${eventRef}' is ahead today. Your readiness is genuine – protect it through the morning's first demands.`;
    } else {
      morningDirective =
        `'${eventRef}' is ahead today. Peak readiness is rare – deploy it where it matters most, not where it's spent first.`;
    }
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: morningDirective,
      driver: "morning",
    };
  }

  // Priority 6: Dense calendar but no wearable / no stakes – tier-aware
  if (eventCount && eventCount >= 4) {
    let denseDirective: string;
    if (tier === "depleted") {
      denseDirective =
        `${eventCount} meetings today. Your reserves are low – pace through the volume and protect the gaps between.`;
    } else if (tier === "managing") {
      denseDirective =
        `${eventCount} meetings today. Sustainable pacing through the volume is the goal – protect the space between demands.`;
    } else if (tier === "strong") {
      denseDirective =
        `${eventCount} meetings today. Your above-baseline readiness handles volume well – sustain the quality across the full day.`;
    } else {
      denseDirective =
        `${eventCount} meetings today. Peak readiness meets a full calendar – the conditions for effortless passage through complex demands.`;
    }
    return {
      phrase: defaultPhrase || "Start with presence.",
      context: denseDirective,
      driver: "morning",
    };
  }

  // Morning default fallback – tier-aware
  let morningDefault: string;
  if (tier === "depleted") {
    morningDefault = defaultContext ||
      "Your reserves are low. How you enter the day determines how much you have for what matters.";
  } else if (tier === "managing") {
    morningDefault = defaultContext ||
      "A steady opening protects the capacity you'll need through the full shape of the day.";
  } else if (tier === "strong") {
    morningDefault = defaultContext ||
      "Strong readiness at the start of the day. How you use the opening hours determines how much of this advantage you carry through.";
  } else {
    morningDefault = defaultContext ||
      "Peak readiness at the start of the day. Every decision about how you use the opening hours is high-leverage.";
  }
  return {
    phrase: defaultPhrase || "Start with presence.",
    context: morningDefault,
    driver: "morning",
  };
}

function getTheme(
  tier: EnergyTier,
  pressure: CalendarLevel | null,
  load: CalendarLevel | null,
  score: number | null,
  hour: number,
  dayOfWeek: number,
  homeCountry?: string | null,
  tomorrowLoad?: CalendarLevel | null,
  tomorrowPressure?: CalendarLevel | null,
  tomorrowHighStakes?: string[],
  wearable?: WearableContext | null,
  todayHighStakes?: string[],
  eventCount?: number,
  remainingEvents?: number,
  remainingHighStakes?: string[],
  meetingCount?: number,
  remainingMeetings?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  if (pressure === null || load === null) {
    return getNoCalendarTheme(
      tier,
      score,
      hour,
      dayOfWeek,
      homeCountry,
      wearable,
      todayHighStakes,
      eventCount,
      remainingEvents,
      remainingHighStakes,
      meetingCount,
      remainingMeetings,
    );
  }

  const timeOfDay = getTimeOfDay(hour);
  const dayCtx = getDayContext(dayOfWeek, homeCountry);

  // Build dynamic context suffix for all tier×load×pressure entries
  const suffix = buildContextSuffix(
    todayHighStakes,
    eventCount,
    wearable,
    timeOfDay,
  );
  const hasDemandAhead = hasMeaningfulDemand(
    load,
    pressure,
    todayHighStakes,
    meetingCount ?? eventCount,
  );

  // DEPLETED TIER
  if (tier === "depleted") {
    // Evening FIRST – always route to retrospective logic
    if (timeOfDay === "evening") {
      if (dayCtx === "sunday") {
        const heavyMon = tomorrowLoad === "high" || tomorrowPressure === "high";
        const lightMon = tomorrowLoad === "low" &&
          (tomorrowPressure === "low" || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead and your reserves are low. What you protect tonight directly determines how you show up for tomorrow's first high-stakes moment."
          : lightMon
          ? "A lighter Monday ahead, but ending the weekend depleted means the week still starts in deficit. Tonight's recovery matters."
          : "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.";
        return {
          phrase: "Close before the week.",
          context: ctx,
          driver: "evening",
        };
      }
      if (dayCtx === "friday") {
        return {
          phrase: "Release the week.",
          context:
            "The week is done. A depleted system needs genuine release, not just the absence of work.",
          driver: "evening",
        };
      }
      return buildWeekdayEveningTheme(
        "depleted",
        tomorrowHighStakes,
        wearable,
        "Close before tomorrow.",
        "What you don't release tonight you carry into tomorrow's first decisions and interactions.",
        todayHighStakes,
        eventCount,
        load,
        pressure,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    // Morning
    if (timeOfDay === "morning") {
      const depletedMorningCtx = hasDemandAhead
        ? "Starting the day in a depleted state with real demands ahead. How you enter each moment today matters more than how much you do."
        : "Starting the day in a depleted state. How you enter the day determines how much you have for what matters.";
      return buildMorningTheme(
        "depleted",
        wearable,
        "Begin with intention.",
        depletedMorningCtx,
        todayHighStakes,
        eventCount,
      );
    }
    // Afternoon
    if (timeOfDay === "afternoon") {
      const base = hasDemandAhead
        ? "Carrying a depleted state through the afternoon with real demands still ahead. How you enter each remaining moment matters more than how much you do."
        : "Carrying a depleted state through the afternoon. How you spend what remains determines how you close the day.";
      return {
        phrase: "Pace the remaining hours.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Pressure×load matrix (morning/afternoon only now)
    if (pressure === "high" && load === "high") {
      return {
        phrase: "One thing at a time.",
        context:
          "A heavy and high-stakes calendar is meeting a leader running below full capacity. What genuinely requires your full presence today, and what can be held or delegated?" +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "medium") {
      return {
        phrase: "Protect what matters.",
        context:
          "Significant stakes ahead with a manageable schedule. The space exists to be selective. Where you spend your capacity today determines the quality of your most important moments." +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "low") {
      return {
        phrase: "Reserve for the moment.",
        context:
          "High stakes on a light schedule, a rare alignment. Your recovery window today is also your preparation window." +
          suffix,
        driver: "pressure",
      };
    }
    if (pressure === "medium" && load === "high") {
      return {
        phrase: "Navigate, don't absorb.",
        context:
          "A dense calendar without the high-stakes pressure of your hardest days. Steady passage through the volume is the goal, not deep engagement with each moment." +
          suffix,
        driver: "load",
      };
    }
    if (load === "high" && pressure === "low") {
      return {
        phrase: "Move through gently.",
        context:
          "High volume without high stakes. The risk today is volume draining what little reserve you have. Move through rather than absorb." +
          suffix,
        driver: "load",
      };
    }
    if (load === "medium") {
      return {
        phrase: "Pace and protect.",
        context:
          "A moderate day that asks you to be present without overspending. Each recovery window between engagements is worth protecting." +
          suffix,
        driver: "load",
      };
    }
    if (load === "low") {
      return {
        phrase: "Rest is the work.",
        context:
          "A light calendar and a depleted system. Today's most productive act is genuine recovery." +
          suffix,
        driver: "load",
      };
    }
    return {
      phrase: "Protect your reserves.",
      context:
        "The day still needs to be met with what you have. Deliberate pacing is your strategy today." +
        suffix,
      driver: "state",
    };
  }

  // MANAGING TIER
  if (tier === "managing") {
    // Evening FIRST
    if (timeOfDay === "evening") {
      if (dayCtx === "sunday") {
        const heavyMon = tomorrowLoad === "high" || tomorrowPressure === "high";
        const lightMon = tomorrowLoad === "low" &&
          (tomorrowPressure === "low" || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead. How you close tonight is how you open the week – a clean transition here protects your capacity for tomorrow's first high-stakes moments."
          : lightMon
          ? "A lighter Monday ahead. A clean close tonight means you can open the week with intention rather than inertia."
          : "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.";
        return {
          phrase: "Close into the week.",
          context: ctx,
          driver: "evening",
        };
      }
      if (dayCtx === "friday") {
        return {
          phrase: "Let the week go.",
          context:
            "You've carried the week at operating capacity. The weekend is a genuine recovery window if you let the work threads close.",
          driver: "evening",
        };
      }
      return buildWeekdayEveningTheme(
        "managing",
        tomorrowHighStakes,
        wearable,
        "Close with care.",
        "You've carried the day's demands at operating capacity. How you close is how you recover.",
        todayHighStakes,
        eventCount,
        load,
        pressure,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    // Morning
    if (timeOfDay === "morning") {
      const managingMorningCtx = hasDemandAhead
        ? "The more meaningful parts of the day are still ahead. How you pace the opening determines whether you finish well."
        : "The day is relatively open. How you pace the opening sets the tone for what follows.";
      return buildMorningTheme(
        "managing",
        wearable,
        "Set a sustainable pace.",
        managingMorningCtx,
        todayHighStakes,
        eventCount,
      );
    }
    // Afternoon
    if (timeOfDay === "afternoon") {
      const base = hasDemandAhead
        ? "The more meaningful parts of the day are still ahead. How you pace the remaining hours determines whether you finish well."
        : "The afternoon is relatively open. How you use this space determines how you close the day.";
      return {
        phrase: "Sustain the pace.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Pressure×load matrix
    if (pressure === "high" && load === "high") {
      return {
        phrase: "Hold your ground.",
        context:
          "Your most demanding conditions are meeting an operational leader. Steadiness through the full weight of the day is both the challenge and the achievement." +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "medium") {
      return {
        phrase: "Steady into the stakes.",
        context:
          "High-stakes moments ahead with a manageable schedule. You have the capacity to show up well for what matters most today." +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "low") {
      return {
        phrase: "Depth over breadth.",
        context:
          "Significant stakes on a clear schedule. Your operating capacity is well-matched to the important moments today if you protect the space around them." +
          suffix,
        driver: "pressure",
      };
    }
    if (pressure === "medium" && load === "high") {
      return {
        phrase: "Rhythm over intensity.",
        context:
          "A dense calendar at your current capacity calls for consistent pacing. Sustainable engagement through the full day rather than peaks and drops." +
          suffix,
        driver: "load",
      };
    }
    if (load === "high" && pressure === "low") {
      return {
        phrase: "Ride the rhythm.",
        context:
          "High volume without high stakes. A day to move steadily through rather than push against." +
          suffix,
        driver: "load",
      };
    }
    if (load === "medium") {
      return {
        phrase: "Steady execution.",
        context:
          "Moderate demands meeting moderate capacity. A well-matched day for consistent, quality output." +
          suffix,
        driver: "load",
      };
    }
    if (load === "low") {
      return {
        phrase: "Build your reserves.",
        context:
          "Light demands on a managing state. A genuine opportunity to invest rather than spend today." +
          suffix,
        driver: "load",
      };
    }
    return {
      phrase: "Maintain your rhythm.",
      context:
        "Today calls for consistent, sustainable engagement. Protecting your operational state through the full shape of what the day holds." +
        suffix,
      driver: "state",
    };
  }

  // STRONG TIER
  if (tier === "strong") {
    // Evening FIRST
    if (timeOfDay === "evening") {
      if (dayCtx === "sunday") {
        const heavyMon = tomorrowLoad === "high" || tomorrowPressure === "high";
        const lightMon = tomorrowLoad === "low" &&
          (tomorrowPressure === "low" || tomorrowPressure === null);
        const ctx = heavyMon
          ? "A demanding Monday is ahead, and your above-baseline readiness is a genuine advantage. Protecting this state tonight is the single highest-leverage move for tomorrow."
          : lightMon
          ? "A lighter Monday ahead and strong readiness to carry into it. Protecting tonight means the week opens from a position of genuine strength."
          : "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday rather than spending it before the week begins.";
        return {
          phrase: "Carry it into Monday.",
          context: ctx,
          driver: "evening",
        };
      }
      if (dayCtx === "friday") {
        return {
          phrase: "Close the week strong.",
          context:
            "Above-baseline readiness at the end of the week. A strong close sets the foundation for genuine weekend recovery.",
          driver: "evening",
        };
      }
      return buildWeekdayEveningTheme(
        "strong",
        tomorrowHighStakes,
        wearable,
        "Close strong.",
        "Above-baseline capacity at close of day. A strong finish is within reach and worth protecting.",
        todayHighStakes,
        eventCount,
        load,
        pressure,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    // Morning
    if (timeOfDay === "morning") {
      return buildMorningTheme(
        "strong",
        wearable,
        "Protect the window.",
        "Strong readiness at the start of the day. How you use the opening hours determines how much of this advantage you carry through.",
        todayHighStakes,
        eventCount,
      );
    }
    // Afternoon
    if (timeOfDay === "afternoon") {
      const base =
        "Strong readiness through the afternoon. How you use the remaining hours determines how much of this advantage you carry into close.";
      return {
        phrase: "Sustain the advantage.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Pressure×load matrix
    if (pressure === "high" && load === "high") {
      return {
        phrase: "Lead from strength.",
        context:
          "Your most demanding conditions are meeting a well-resourced leader. A day where your readiness is genuinely being asked for." +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "medium") {
      return {
        phrase: "Execute with presence.",
        context:
          "Significant stakes ahead with a focused schedule. You have both the capacity and the space to bring your best to the moments that count." +
          suffix,
        driver: "pressure+load",
      };
    }
    if (pressure === "high" && load === "low") {
      return {
        phrase: "Bring your full weight.",
        context:
          "High stakes with room to prepare and recover. Conditions that allow your strongest leadership to show up fully." +
          suffix,
        driver: "pressure",
      };
    }
    if (pressure === "medium" && load === "high") {
      return {
        phrase: "Sustain the quality.",
        context:
          "A dense calendar with real stakes. Your above-baseline capacity is what keeps quality consistent across the full day." +
          suffix,
        driver: "load",
      };
    }
    if (load === "high" && pressure === "low") {
      return {
        phrase: "Move with confidence.",
        context:
          "High volume meets strong capacity. A day you can move through with assurance rather than caution." +
          suffix,
        driver: "load",
      };
    }
    if (load === "medium") {
      return {
        phrase: "Invest the advantage.",
        context:
          "Above-baseline readiness on a selective day. The conditions are there to go deep on what matters rather than wide across everything." +
          suffix,
        driver: "load",
      };
    }
    if (load === "low") {
      return {
        phrase: "Protect and build.",
        context:
          "Strong readiness on a light day. Rare conditions for deep work, strategic thinking, or genuine recovery that compounds forward." +
          suffix,
        driver: "load",
      };
    }
    return {
      phrase: "Leverage your position.",
      context:
        "You are above baseline today. The question is where that advantage is most worth investing." +
        suffix,
      driver: "state",
    };
  }

  // PEAK TIER – evening FIRST
  if (timeOfDay === "evening") {
    if (dayCtx === "sunday") {
      const heavyMon = tomorrowLoad === "high" || tomorrowPressure === "high";
      const lightMon = tomorrowLoad === "low" &&
        (tomorrowPressure === "low" || tomorrowPressure === null);
      const ctx = heavyMon
        ? "Full readiness before a demanding Monday is exceptionally rare and valuable. Your only priority tonight is protecting this state through genuine rest."
        : lightMon
        ? "A lighter Monday ahead and peak readiness to carry into it. Protect this state – the week could open at your absolute best."
        : "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.";
      return {
        phrase: "Protect it for Monday.",
        context: ctx,
        driver: "evening",
      };
    }
    if (dayCtx === "friday") {
      return {
        phrase: "Close at the peak.",
        context:
          "Peak readiness at week's end. A deliberate close tonight protects this state into the weekend.",
        driver: "evening",
      };
    }
    return buildWeekdayEveningTheme(
      "peak",
      tomorrowHighStakes,
      wearable,
      "Close with intention.",
      "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.",
      todayHighStakes,
      eventCount,
      load,
      pressure,
      remainingEvents,
      remainingHighStakes,
      meetingCount,
      remainingMeetings,
    );
  }
  // Morning
  if (timeOfDay === "morning") {
    return buildMorningTheme(
      "peak",
      wearable,
      "Protect the peak.",
      "Peak readiness at the start of the day. Every decision about how you use the opening hours is high-leverage.",
      todayHighStakes,
      eventCount,
    );
  }
  // Afternoon
  if (timeOfDay === "afternoon") {
    const base =
      "Peak readiness through the afternoon. How you use the remaining hours determines how much of this advantage you carry into close.";
    return {
      phrase: "Channel the peak.",
      context: buildAfternoonContext(
        todayHighStakes,
        eventCount,
        wearable,
        base,
      ),
      driver: "state",
    };
  }
  // Pressure×load matrix
  if (pressure === "high" && load === "high") {
    return {
      phrase: "Peak performance day.",
      context:
        "Your most demanding calendar is meeting your fullest readiness. A genuine high-leverage day where your leadership capacity is fully called upon." +
        suffix,
      driver: "pressure+load",
    };
  }
  if (pressure === "high" && load === "medium") {
    return {
      phrase: "Full capacity, focused stakes.",
      context:
        "Significant moments ahead with room to be deliberate. Peak readiness plus space is the best possible condition for your most important leadership." +
        suffix,
      driver: "pressure+load",
    };
  }
  if (pressure === "high" && load === "low") {
    return {
      phrase: "Peak meets opportunity.",
      context:
        "Your strongest readiness and the space to use it fully. A rare condition – deploy on what genuinely matters most to you." +
        suffix,
      driver: "pressure",
    };
  }
  if (pressure === "medium" && load === "high") {
    return {
      phrase: "Flow through the day.",
      context:
        "A full calendar with your strongest capacity. Conditions for effortless passage through complex demands." +
        suffix,
      driver: "load",
    };
  }
  if (load === "high" && pressure === "low") {
    return {
      phrase: "Effortless volume.",
      context:
        "High volume at peak readiness. The rare day where a full schedule doesn't need careful management." +
        suffix,
      driver: "load",
    };
  }
  if (load === "medium") {
    return {
      phrase: "Choose your investments.",
      context:
        "Full readiness on a selective day. The question is not what you can handle, but what deserves this state of readiness." +
        suffix,
      driver: "load",
    };
  }
  if (load === "low") {
    return {
      phrase: "Rare conditions.",
      context:
        "Peak readiness and an open schedule. The rarest combination – conditions for the thinking or decisions you've been waiting for." +
        suffix,
      driver: "load",
    };
  }
  return {
    phrase: "Own your optimal state.",
    context:
      "Full readiness is present. The priority is protecting that state through the full shape of what the day holds." +
      suffix,
    driver: "state",
  };
}

// ==================== NO-CALENDAR FALLBACKS (sub-tier + time-aware) ====================
function getNoCalendarTheme(
  tier: EnergyTier,
  score: number | null,
  hour: number,
  dayOfWeek: number,
  homeCountry?: string | null,
  wearable?: WearableContext | null,
  todayHighStakes?: string[],
  eventCount?: number,
  remainingEvents?: number,
  remainingHighStakes?: string[],
  meetingCount?: number,
  remainingMeetings?: number,
): { phrase: string; context: string; driver: ThemeDriver } {
  const dayCtx = getDayContext(dayOfWeek, homeCountry);
  const lateEvening = isLateEvening(hour);
  const timeOfDay = getTimeOfDay(hour);
  const bodyStressed = wearable &&
    (wearable.hrElevated || wearable.hrvElevated);

  if (score == null) {
    return {
      phrase: "Readiness signals are still coming in.",
      context:
        "The day can stay neutral until a fresh signal lands. Keep the next move small and practical.",
      driver: "state",
    };
  }

  // Build wearable-only suffix for no-calendar contexts
  const wearableSuffix = wearable
    ? (timeOfDay === "morning" && wearable.poorSleep
      ? ` Your recovery overnight was incomplete${
        wearable.sleepScore ? ` (sleep score: ${wearable.sleepScore})` : ""
      }.${
        wearable.rhrElevated
          ? " Your resting heart rate is running above baseline."
          : ""
      }`
      : timeOfDay === "morning" && wearable.rhrElevated
      ? " Your resting heart rate is running above baseline – your system didn't fully reset overnight."
      : wearable.hrElevated
      ? " Your heart rate ran high recently – your body is carrying accumulated strain."
      : wearable.hrvElevated
      ? " Your HRV is signalling accumulated strain."
      : wearable.sleepScore && wearable.sleepScore >= 75 &&
          !wearable.hrElevated && !wearable.hrvElevated && !wearable.rhrElevated
      ? " Your body is well-recovered and ready for what's ahead."
      : "")
    : "";

  if (tier === "depleted") {
    if (lateEvening) {
      if (dayCtx === "sunday") {
        return {
          phrase: "Rest before the week.",
          context:
            "Ending the weekend in a low-reserve state means Monday starts in deficit. What tonight holds matters more than it might feel like it does.",
          driver: "state",
        };
      }
      const bodyNote = bodyStressed
        ? ` Your ${
          wearable!.hrElevated ? "heart rate ran high" : "HRV shows strain"
        } through today – the cool-down is physical, not just mental.`
        : "";
      const sleepNote = wearable?.poorSleep
        ? " You started today under-recovered and carried that through a full day. Tonight's sleep matters more than usual."
        : "";
      const rhrNote = wearable?.rhrElevated && !bodyStressed
        ? " Your resting heart rate is still elevated – tonight's recovery is especially important."
        : "";
      return {
        phrase: "Let the day close.",
        context:
          `Your system has already given what it had. The most important thing now is genuine release and recovery.${bodyNote}${sleepNote}${rhrNote}`,
        driver: "state",
      };
    }
    if (timeOfDay === "morning") {
      return buildMorningTheme(
        "depleted",
        wearable,
        score <= 25 ? "Begin with stillness." : "Protect your reserves.",
        score <= 25
          ? "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual."
          : "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now.",
        todayHighStakes,
        eventCount,
      );
    }
    if (timeOfDay === "afternoon") {
      const base = score <= 25
        ? "Leading from a deeply depleted state through the afternoon. Every remaining interaction carries a higher cost than usual."
        : "Below-baseline readiness shapes every remaining interaction. How much you spend on what's left is the decision that matters.";
      return {
        phrase: "Pace the remaining hours.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Non-late evening (18:00-20:59) – route to weekday evening theme
    if (timeOfDay === "evening") {
      return buildWeekdayEveningTheme(
        "depleted",
        undefined,
        wearable,
        "Close before tomorrow.",
        "What you don't release tonight you carry into tomorrow's first decisions and interactions.",
        todayHighStakes,
        eventCount,
        null,
        null,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    if (score <= 25) {
      return {
        phrase: "Begin with stillness.",
        context:
          "Leading from a deeply depleted state asks more of your self-awareness than almost any other condition. Every interaction and judgment today carries a higher cost than usual." +
          wearableSuffix,
        driver: "state",
      };
    }
    return {
      phrase: "Protect your reserves.",
      context:
        "Below-baseline readiness shapes every interaction today. How much you spend, and on what, is the decision that matters most right now." +
        wearableSuffix,
      driver: "state",
    };
  }
  if (tier === "managing") {
    if (lateEvening) {
      if (dayCtx === "sunday") {
        return {
          phrase: "Close into the week.",
          context:
            "Sunday evening is its own transition. How you close it is how you open the week. A clean close here protects Monday's first hours.",
          driver: "state",
        };
      }
      const bodyNote = bodyStressed
        ? ` Your body is also signalling strain – a deliberate physical wind-down tonight supports tomorrow's recovery.`
        : "";
      const sleepNote = wearable?.poorSleep
        ? " You started today under-recovered – tonight's sleep quality matters more than usual."
        : "";
      const rhrNote = wearable?.rhrElevated && !bodyStressed
        ? " Your resting heart rate is still elevated – tonight's recovery is especially important."
        : "";
      return {
        phrase: "Close the day cleanly.",
        context:
          `Operational capacity has served its purpose today. A clean close now protects tomorrow's opening state.${bodyNote}${sleepNote}${rhrNote}`,
        driver: "state",
      };
    }
    if (timeOfDay === "morning") {
      return buildMorningTheme(
        "managing",
        wearable,
        score <= 49 ? "Operate with care." : "Steady and selective.",
        score <= 49
          ? "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment."
          : "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes.",
        todayHighStakes,
        eventCount,
      );
    }
    if (timeOfDay === "afternoon") {
      const base = score <= 49
        ? "Operational but not at full capacity. The afternoon calls for selective investment of your leadership presence rather than broad deployment."
        : "Baseline readiness is holding. You have capacity to show up well for what remains if you're deliberate about where it goes.";
      return {
        phrase: "Sustain the pace.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Non-late evening
    if (timeOfDay === "evening") {
      return buildWeekdayEveningTheme(
        "managing",
        undefined,
        wearable,
        "Close with care.",
        "You've carried the day's demands at operating capacity. How you close is how you recover.",
        todayHighStakes,
        eventCount,
        null,
        null,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    if (score <= 49) {
      return {
        phrase: "Operate with care.",
        context:
          "Operational but not at full capacity. A day for selective investment of your leadership presence rather than broad deployment." +
          wearableSuffix,
        driver: "state",
      };
    }
    return {
      phrase: "Steady and selective.",
      context:
        "Baseline readiness is present. You have capacity to show up well for what matters if you're deliberate about where it goes." +
        wearableSuffix,
      driver: "state",
    };
  }
  if (tier === "strong") {
    if (lateEvening) {
      if (dayCtx === "sunday") {
        return {
          phrase: "Carry it into Monday.",
          context:
            "Strong readiness at the close of the weekend is a real asset. Protecting tonight means carrying that advantage into Monday.",
          driver: "state",
        };
      }
      const bodyNote = bodyStressed
        ? ` Despite above-baseline readiness, your ${
          wearable!.hrElevated ? "heart rate" : "HRV"
        } is signalling the body needs recovery – honour that tonight.`
        : "";
      const sleepNote = wearable?.poorSleep
        ? " You started today under-recovered – tonight's recovery window is especially valuable."
        : "";
      const rhrNote = wearable?.rhrElevated && !bodyStressed
        ? " Your resting heart rate is still elevated – tonight's recovery is especially important."
        : "";
      return {
        phrase: "Protect tomorrow's advantage.",
        context:
          `Above-baseline readiness at this hour is worth protecting through deliberate wind-down rather than spending.${bodyNote}${sleepNote}${rhrNote}`,
        driver: "state",
      };
    }
    if (timeOfDay === "morning") {
      return buildMorningTheme(
        "strong",
        wearable,
        score <= 69 ? "Lead with confidence." : "Invest your advantage.",
        score <= 69
          ? "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you."
          : "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing.",
        todayHighStakes,
        eventCount,
      );
    }
    if (timeOfDay === "afternoon") {
      const base = score <= 69
        ? "Above-baseline readiness through the afternoon is a real asset. Your presence and judgment are working well for you."
        : "Strong readiness through the afternoon. The question is where that advantage is most worth directing in the remaining hours.";
      return {
        phrase: "Sustain the advantage.",
        context: buildAfternoonContext(
          todayHighStakes,
          eventCount,
          wearable,
          base,
        ),
        driver: "state",
      };
    }
    // Non-late evening
    if (timeOfDay === "evening") {
      return buildWeekdayEveningTheme(
        "strong",
        undefined,
        wearable,
        "Close strong.",
        "Above-baseline capacity at close of day. A strong finish is within reach and worth protecting.",
        todayHighStakes,
        eventCount,
        null,
        null,
        remainingEvents,
        remainingHighStakes,
        meetingCount,
        remainingMeetings,
      );
    }
    if (score <= 69) {
      return {
        phrase: "Lead with confidence.",
        context:
          "Above-baseline readiness is a real leadership asset today. Your presence, judgment, and influence are all working well for you." +
          wearableSuffix,
        driver: "state",
      };
    }
    return {
      phrase: "Invest your advantage.",
      context:
        "Strong readiness gives you the conditions for your best thinking and leadership presence. The question is where that advantage is most worth directing." +
        wearableSuffix,
      driver: "state",
    };
  }
  // Peak
  if (lateEvening) {
    if (dayCtx === "sunday") {
      return {
        phrase: "Protect it for Monday.",
        context:
          "Full readiness on a Sunday evening is worth protecting deliberately. How you close tonight determines whether that state is still available when the week's first demands arrive.",
        driver: "state",
      };
    }
    const bodyNote = bodyStressed
      ? ` Your body is telling a different story to your mind – honour the physical signal with a genuine wind-down.`
      : "";
    const sleepNote = wearable?.poorSleep
      ? " You started today under-recovered – tonight's recovery window is especially valuable."
      : "";
    const rhrNote = wearable?.rhrElevated && !bodyStressed
      ? " Your resting heart rate is still elevated – tonight's recovery is especially important."
      : "";
    return {
      phrase: "Wind down deliberately.",
      context:
        `Peak activation at this hour needs a deliberate transition. Your nervous system needs the wind-down even when your mind doesn't.${bodyNote}${sleepNote}${rhrNote}`,
      driver: "state",
    };
  }
  if (timeOfDay === "morning") {
    return buildMorningTheme(
      "peak",
      wearable,
      score <= 89 ? "Bring your full presence." : "Own your peak.",
      score <= 89
        ? "Full readiness. Your capacity for complex decisions, difficult conversations, and high-stakes leadership is at its highest."
        : "Exceptional readiness is present. A rare state that is worth both using fully and protecting deliberately.",
      todayHighStakes,
      eventCount,
    );
  }
  if (timeOfDay === "afternoon") {
    const base = score <= 89
      ? "Full readiness through the afternoon. Your capacity for complex decisions and high-stakes leadership is at its highest in the remaining hours."
      : "Exceptional readiness is present through the afternoon. A rare state that is worth both using fully and protecting deliberately.";
    return {
      phrase: "Channel the peak.",
      context: buildAfternoonContext(
        todayHighStakes,
        eventCount,
        wearable,
        base,
      ),
      driver: "state",
    };
  }
  // Non-late evening
  if (timeOfDay === "evening") {
    return buildWeekdayEveningTheme(
      "peak",
      undefined,
      wearable,
      "Close with intention.",
      "Peak activation at the close of the day. A structured, intentional close protects tonight's recovery and tomorrow's readiness.",
      todayHighStakes,
      eventCount,
      null,
      null,
      remainingEvents,
      remainingHighStakes,
      meetingCount,
      remainingMeetings,
    );
  }
  if (score <= 89) {
    return {
      phrase: "Bring your full presence.",
      context:
        "Full readiness. Your capacity for complex decisions, difficult conversations, and high-stakes leadership is at its highest." +
        wearableSuffix,
      driver: "state",
    };
  }
  return {
    phrase: "Own your peak.",
    context:
      "Exceptional readiness is present. A rare state that is worth both using fully and protecting deliberately." +
      wearableSuffix,
    driver: "state",
  };
}

// ==================== LEAN ON / WATCH FOR ====================

// ==================== LEAN ON / WATCH FOR — "CHIEF OF STAFF MEMORY" ====================
// These fields represent long-term memory: patterns, archetype traits, coach insights.
// FIREWALL: NEVER reference today's calendar, today's readiness score, today's wearable,
// or today's felt state. Those belong in phrase/body/pills.

// Clarity × Confidence modifier — time-independent, 2-4 word signals only
function getCCModifier(
  clarity: number | null,
  confidence: number | null,
  context?: {
    consecutiveLowDays?: number;
    checkInOutcome?: string | null;
    hrvDeviation?: number | null;
    sleepHardFloor?: boolean;
  },
): { leanOn: string; watchFor: string } | null {
  if (clarity === null && confidence === null) return null;

  const clarityLow = clarity !== null && clarity <= 2;
  const clarityHigh = clarity !== null && clarity >= 4;
  const confidenceLow = confidence !== null && confidence <= 2;
  const confidenceHigh = confidence !== null && confidence >= 4;

  // v6.2 Pattern Preference — when an active pattern exists (sustained low days,
  // sustained HRV deficit, drained/overwhelmed outcome), prefer naming the pattern
  // over the generic trait pair. Source remains 'PATTERN' downstream.
  const consec = context?.consecutiveLowDays ?? 0;
  const outcome = context?.checkInOutcome ?? null;
  const hrvDev = context?.hrvDeviation ?? null;
  if (consec >= 7) {
    return {
      leanOn: `${consec}-day energy deficit`,
      watchFor: "Treating chronic depletion as a one-off",
    };
  }
  if (consec >= 3) {
    return {
      leanOn: `${consec}-day low-energy streak`,
      watchFor: "Treating systemic depletion as situational",
    };
  }
  if (outcome === "drained" || outcome === "overwhelmed") {
    return {
      leanOn: "Mental energy reality",
      watchFor: "Performing through depletion",
    };
  }
  if (hrvDev != null && hrvDev <= -20) {
    return {
      leanOn: "Recovery deficit signal",
      watchFor: "Borrowing from recovery buffer",
    };
  }
  if (context?.sleepHardFloor) {
    return {
      leanOn: "Sleep floor first",
      watchFor: "Trading sleep for output",
    };
  }

  if (clarityLow && confidenceLow) {
    return { leanOn: "Self-Honesty", watchFor: "Premature Commitments" };
  }
  if (clarityHigh && confidenceHigh) {
    return { leanOn: "Full Alignment", watchFor: "Rigidity from Conviction" };
  }
  if (clarityHigh && confidenceLow) {
    return { leanOn: "Clear Direction", watchFor: "Delaying Action" };
  }
  if (clarityLow && confidenceHigh) {
    return {
      leanOn: "Execution Confidence",
      watchFor: "Moving Without Direction",
    };
  }
  if (clarityLow) {
    return { leanOn: "Self-Discernment", watchFor: "Acting Without Anchor" };
  }
  if (confidenceLow) {
    return { leanOn: "Self-Awareness", watchFor: "Projected Confidence" };
  }
  if (clarityHigh) {
    return { leanOn: "Clear Direction", watchFor: "Crowding Perspectives" };
  }
  if (confidenceHigh) {
    return { leanOn: "Conviction Strength", watchFor: "Closing Off Inputs" };
  }

  // Mid-range on both – no modifier
  return null;
}

// Priority 3: Archetype × Tier matrix
const archetypeMatrix: Record<
  string,
  Record<EnergyTier, { leanOn: string; watchFor: string }>
> = {
  "grounded-leader": {
    depleted: {
      leanOn: "Stillness Instinct",
      watchFor: "Absorbing Others' Load",
    },
    managing: { leanOn: "Grounded Stability", watchFor: "Quiet Drain Pattern" },
    strong: { leanOn: "Natural Authority", watchFor: "Maintenance Mode Trap" },
    peak: { leanOn: "Grounded Precision", watchFor: "Tunnel Focus Risk" },
  },
  "resilient-performer": {
    depleted: {
      leanOn: "Recovery Intelligence",
      watchFor: "Performing Resilience",
    },
    managing: {
      leanOn: "Baseline Resilience",
      watchFor: "Settling Operational",
    },
    strong: { leanOn: "Performance Window", watchFor: "Burning Early" },
    peak: { leanOn: "Competitive Edge", watchFor: "Peak Spent Fast" },
  },
  "clear-thinker": {
    depleted: { leanOn: "Economy of Thought", watchFor: "Over-Processing" },
    managing: {
      leanOn: "Analytical Clarity",
      watchFor: "Cognitive Over-Investment",
    },
    strong: { leanOn: "Sharpest Insights", watchFor: "Analysis Past Insight" },
    peak: { leanOn: "Analytical Precision", watchFor: "Complexity Addiction" },
  },
  "intensity-driver": {
    depleted: {
      leanOn: "Rest-as-Fuel Wisdom",
      watchFor: "Forcing Empty Intensity",
    },
    managing: { leanOn: "Directed Drive", watchFor: "Pace Impatience" },
    strong: { leanOn: "Sustainable Intensity", watchFor: "Outpacing the Day" },
    peak: {
      leanOn: "Full-Force Capability",
      watchFor: "Opening Full Intensity",
    },
  },
  "adaptive-navigator": {
    depleted: {
      leanOn: "Situational Awareness",
      watchFor: "Adapting to Demands",
    },
    managing: { leanOn: "Strategic Flexibility", watchFor: "Adaptive vs Firm" },
    strong: { leanOn: "Strategic Read", watchFor: "Over-Navigating" },
    peak: { leanOn: "Strategic Agility", watchFor: "Complexity Over Decision" },
  },
  // Legacy ID fallbacks
  "natural-regulator": {
    depleted: {
      leanOn: "Stillness Instinct",
      watchFor: "Absorbing Others' Load",
    },
    managing: { leanOn: "Grounded Stability", watchFor: "Quiet Drain Pattern" },
    strong: { leanOn: "Natural Authority", watchFor: "Maintenance Mode Trap" },
    peak: { leanOn: "Grounded Precision", watchFor: "Tunnel Focus Risk" },
  },
  "high-octane-performer": {
    depleted: {
      leanOn: "Recovery Intelligence",
      watchFor: "Performing Resilience",
    },
    managing: {
      leanOn: "Baseline Resilience",
      watchFor: "Settling Operational",
    },
    strong: { leanOn: "Performance Window", watchFor: "Burning Early" },
    peak: { leanOn: "Competitive Edge", watchFor: "Peak Spent Fast" },
  },
  "strategic-pauser": {
    depleted: { leanOn: "Economy of Thought", watchFor: "Over-Processing" },
    managing: {
      leanOn: "Analytical Clarity",
      watchFor: "Cognitive Over-Investment",
    },
    strong: { leanOn: "Sharpest Insights", watchFor: "Analysis Past Insight" },
    peak: { leanOn: "Analytical Precision", watchFor: "Complexity Addiction" },
  },
  "awareness-builder": {
    depleted: {
      leanOn: "Rest-as-Fuel Wisdom",
      watchFor: "Forcing Empty Intensity",
    },
    managing: { leanOn: "Directed Drive", watchFor: "Pace Impatience" },
    strong: { leanOn: "Sustainable Intensity", watchFor: "Outpacing the Day" },
    peak: {
      leanOn: "Full-Force Capability",
      watchFor: "Opening Full Intensity",
    },
  },
};

// Tier fallbacks — 2-4 word analytical signals
const tierFallbacks: Record<EnergyTier, { leanOn: string; watchFor: string }> =
  {
    depleted: { leanOn: "State Awareness", watchFor: "Over-Committing" },
    managing: { leanOn: "Operational Steadiness", watchFor: "Over-Extending" },
    strong: {
      leanOn: "Above-Baseline Capacity",
      watchFor: "Diffusing Capacity",
    },
    peak: { leanOn: "Full Capacity", watchFor: "Peak Spent Unchecked" },
  };

// ==================== COACH INSIGHT AGE TIERS ====================
type CoachInsightTier =
  | "recent"
  | "grace"
  | "contextual"
  | "historical"
  | "archived";

function getCoachInsightTier(daysOld: number): CoachInsightTier {
  if (daysOld <= 3) return "recent";
  if (daysOld <= 7) return "grace";
  if (daysOld <= 14) return "contextual";
  if (daysOld <= 30) return "historical";
  return "archived";
}

function detectCCContradiction(
  coachStrength: string,
  coachGrowth: string,
  clarity: number | null,
  confidence: number | null,
): boolean {
  const combined = (coachStrength + " " + coachGrowth).toLowerCase();
  const mentionsClarity = combined.includes("clarity") ||
    combined.includes("clear") || combined.includes("direction") ||
    combined.includes("focus");
  const mentionsConfidence = combined.includes("confidence") ||
    combined.includes("conviction") || combined.includes("certainty") ||
    combined.includes("trust in");

  if (mentionsClarity && (clarity ?? 3) <= 2) return true;
  if (mentionsConfidence && (confidence ?? 3) <= 2) return true;
  return false;
}

// Feature flag for Phase 2 wearable recovery override
const ENABLE_WEARABLE_RECOVERY_TRIGGER = true;

// ==================== PHASE 2: WEARABLE RECOVERY TRIGGER (flagged OFF) ====================
async function checkWearableRecoveryTrigger(
  userId: string,
  db: ReturnType<typeof createClient>,
): Promise<
  {
    triggered: boolean;
    reason: string;
    hrvDeviation: number;
    consecutiveDays: number;
  } | null
> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentHRV } = await db
      .from("wearable_data")
      .select("summary_date, hrv")
      .eq("user_id", userId)
      .gte("summary_date", sevenDaysAgo.toISOString().split("T")[0])
      .order("summary_date", { ascending: false })
      .limit(7);

    if (!recentHRV || recentHRV.length < 3) return null;

    const baseline = recentHRV.reduce((sum: number, d: any) =>
      sum + (d.hrv || 0), 0) / recentHRV.length;
    if (baseline <= 0) {
      return null;
    }

    // Check consecutive days <-20% below baseline
    let consecutiveDays = 0;
    for (const sample of recentHRV) {
      const deviation = (((sample as any).hrv - baseline) / baseline) * 100;
      if (deviation < -20) {
        consecutiveDays++;
      } else break;
    }

    if (consecutiveDays >= 2) {
      const todayDeviation = Math.round(
        (((recentHRV[0] as any).hrv - baseline) / baseline) * 100,
      );
      return {
        triggered: true,
        reason:
          `Sustained HRV deficit detected (${consecutiveDays} consecutive days <-20% below baseline)`,
        hrvDeviation: todayDeviation,
        consecutiveDays,
      };
    }

    // Single-day extreme drop (<-30%)
    const todayDeviation = (((recentHRV[0] as any).hrv - baseline) / baseline) *
      100;
    if (todayDeviation < -30) {
      return {
        triggered: true,
        reason: "Severe single-day HRV drop detected (<-30% below baseline)",
        hrvDeviation: Math.round(todayDeviation),
        consecutiveDays: 1,
      };
    }

    return null;
  } catch (err) {
    console.error(
      "[compute-outer-readiness] Wearable recovery trigger error:",
      err,
    );
    return null;
  }
}

// ==================== LEAN ON / WATCH FOR – "CHIEF OF STAFF MEMORY" ====================
// FIREWALL: These fields represent long-term patterns about the PERSON.
// NEVER reference: today's calendar, today's readiness score, today's wearable, today's felt state.
// Those belong in phrase/body/pills. If no pattern data exists, use Archetype as fallback.
//
// Tenure-Gated Ladder:
//   Day 1 (checkInCountTotal === 0): Archetype × Tier only
//   Days 2–6 (checkInCountTotal 1–6): Coach > C×C > Archetype
//   Day 7+ (checkInCountTotal ≥ 7): Coach > DOW Pattern > HRV Correlation > Score Trajectory > C×C > Archetype > Tier

interface LeanOnWatchForResult {
  leanOn: string;
  watchFor: string;
  source: string;
  coachInsightAge?: number;
  coachInsightLabel?: string;
}

// Day name helper
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getLeanOnWatchFor(
  tier: EnergyTier,
  archetype: string | null,
  clarity: number | null,
  confidence: number | null,
  coachStrength: string | null,
  coachGrowth: string | null,
  coachInsightCreatedAt: string | null,
  checkInCountTotal: number,
  // Day 7+ pattern data
  typicalDOWOutcome: string | null,
  hrvEventCorrelation: string | null,
  scoreTrajectory7d: string | null,
  dayOfWeek: number,
  // Explicit pass-through (fixes ReferenceError when P6 branch fires post-check-in)
  consecutiveLowDays: number = 0,
  checkInOutcome: string | null = null,
  hrvDeviation: number | null = null,
): LeanOnWatchForResult {
  // COACH source: deferred until the coach feature is live for all users.
  // Rather than deleting the coach branches (they stay intact for re-enable),
  // we neutralise the inputs so every coach precondition is false and the
  // resolver jumps straight to PATTERN, then ARCHETYPE, then TIER.
  const COACH_SOURCE_ENABLED = false;
  if (!COACH_SOURCE_ENABLED) {
    coachStrength = null;
    coachGrowth = null;
    coachInsightCreatedAt = null;
  }

  // ── Coach insight age + tier ──
  let coachDaysOld = 0;
  let coachTier: CoachInsightTier = "archived";
  const hasCoachBoth = !!(coachStrength && coachGrowth);

  if (coachInsightCreatedAt) {
    coachDaysOld = Math.floor(
      (Date.now() - new Date(coachInsightCreatedAt).getTime()) / 86400000,
    );
    coachTier = getCoachInsightTier(coachDaysOld);
  }

  const dayName = DAY_NAMES[dayOfWeek] || "Today";

  // ═══════════════════════════════════════
  // DAY 1: Archetype × Tier ONLY
  // ═══════════════════════════════════════
  if (checkInCountTotal === 0) {
    if (archetype && archetypeMatrix[archetype]?.[tier]) {
      const base = archetypeMatrix[archetype][tier];
      return {
        leanOn: base.leanOn,
        watchFor: base.watchFor,
        source: "archetype-tier",
      };
    }
    const base = tierFallbacks[tier];
    return {
      leanOn: base.leanOn,
      watchFor: base.watchFor,
      source: "tier-fallback",
    };
  }

  // ═══════════════════════════════════════
  // DAYS 2–6: Coach > C×C > Archetype
  // ═══════════════════════════════════════
  if (checkInCountTotal < 7) {
    // P1: Coach insights (recent or grace)
    if (hasCoachBoth && (coachTier === "recent" || coachTier === "grace")) {
      return {
        leanOn: coachStrength!,
        watchFor: coachGrowth!,
        source: coachTier === "recent"
          ? "coach-insights-recent"
          : "coach-insights-grace",
        coachInsightAge: coachDaysOld,
      };
    }

    // P2: C×C modifier
    const ccMod = getCCModifier(clarity, confidence); // narrow caller, no context here
    if (ccMod) {
      return {
        leanOn: ccMod.leanOn,
        watchFor: ccMod.watchFor,
        source: "cc-modifier",
      };
    }

    // P3: Archetype × Tier fallback
    if (archetype && archetypeMatrix[archetype]?.[tier]) {
      const base = archetypeMatrix[archetype][tier];
      return {
        leanOn: base.leanOn,
        watchFor: base.watchFor,
        source: "archetype-tier",
      };
    }
    const base = tierFallbacks[tier];
    return {
      leanOn: base.leanOn,
      watchFor: base.watchFor,
      source: "tier-fallback",
    };
  }

  // ═══════════════════════════════════════
  // DAY 7+: Full pattern cascade
  // ═══════════════════════════════════════

  // P1: Coach insights (recent or grace, non-contradicting)
  if (hasCoachBoth && (coachTier === "recent" || coachTier === "grace")) {
    if (
      coachTier === "recent" ||
      !detectCCContradiction(coachStrength!, coachGrowth!, clarity, confidence)
    ) {
      return {
        leanOn: coachStrength!,
        watchFor: coachGrowth!,
        source: coachTier === "recent"
          ? "coach-insights-recent"
          : "coach-insights-grace",
        coachInsightAge: coachDaysOld,
        coachInsightLabel: coachTier === "grace"
          ? `From your last session (${coachDaysOld} days ago)`
          : undefined,
      };
    }
  }

  // P2: DOW Pattern — if typical DOW outcome exists and diverges from current tier
  if (typicalDOWOutcome) {
    const tierOutcomeMap: Record<EnergyTier, string[]> = {
      depleted: ["overwhelmed", "drained"],
      managing: ["scattered", "steady"],
      strong: ["focused", "steady"],
      peak: ["focused"],
    };
    const expectedOutcomes = tierOutcomeMap[tier] || [];
    if (!expectedOutcomes.includes(typicalDOWOutcome)) {
      // Divergence from typical DOW — surface as pattern
      const typicalLabel = typicalDOWOutcome.charAt(0).toUpperCase() +
        typicalDOWOutcome.slice(1);
      return {
        leanOn: `Strong ${dayName} Pattern`,
        watchFor: `${dayName} ${typicalLabel} Trend`,
        source: "dow-pattern",
      };
    }
  }

  // P3: HRV Event Correlation
  if (hrvEventCorrelation) {
    // hrvEventCorrelation is a string like "Board meetings correlate with -15% HRV"
    const shortCorrelation = hrvEventCorrelation.split(/\s+/).slice(0, 4).join(
      " ",
    );
    return {
      leanOn: "Body Pattern Awareness",
      watchFor: shortCorrelation,
      source: "hrv-correlation",
    };
  }

  // P4: Score Trajectory — 7-day declining
  if (scoreTrajectory7d === "declining") {
    return {
      leanOn: "Trajectory Awareness",
      watchFor: "Declining Week Trajectory",
      source: "score-trajectory",
    };
  }

  // P5: Partial coach — mix with archetype
  if (
    coachStrength && !coachGrowth && coachTier !== "historical" &&
    coachTier !== "archived"
  ) {
    const watchFor = archetypeMatrix[archetype || ""]?.[tier]?.watchFor ||
      tierFallbacks[tier].watchFor;
    return {
      leanOn: coachStrength,
      watchFor,
      source: "coach-partial-strength",
      coachInsightAge: coachDaysOld,
    };
  }
  if (
    coachGrowth && !coachStrength && coachTier !== "historical" &&
    coachTier !== "archived"
  ) {
    const leanOn = archetypeMatrix[archetype || ""]?.[tier]?.leanOn ||
      tierFallbacks[tier].leanOn;
    return {
      leanOn,
      watchFor: coachGrowth,
      source: "coach-partial-growth",
      coachInsightAge: coachDaysOld,
    };
  }

  // P6: C×C modifier
  const ccMod = getCCModifier(clarity, confidence, {
    consecutiveLowDays: (consecutiveLowDays as number | undefined) ?? undefined,
    checkInOutcome: (checkInOutcome as string | null | undefined) ?? null,
    hrvDeviation: (hrvDeviation as number | null | undefined) ?? null,
  });
  if (ccMod) {
    return {
      leanOn: ccMod.leanOn,
      watchFor: ccMod.watchFor,
      source: "cc-modifier",
    };
  }

  // P7: Archetype × Tier
  if (archetype && archetypeMatrix[archetype]?.[tier]) {
    const base = archetypeMatrix[archetype][tier];
    return {
      leanOn: base.leanOn,
      watchFor: base.watchFor,
      source: "archetype-tier",
    };
  }

  // P8: Tier fallback
  const base = tierFallbacks[tier];
  return {
    leanOn: base.leanOn,
    watchFor: base.watchFor,
    source: "tier-fallback",
  };
}

// ==================== PATTERN RECOGNITION (all outcomes + C×C) ====================
function getPatternOverride(
  checkIns: Array<
    {
      checkin_date: string;
      outcome: string;
      clarity_level?: number | null;
      confidence_level?: number | null;
    }
  >,
  currentOutcome: string | null,
): string | null {
  if (!checkIns || checkIns.length < 2) return null;

  const sorted = [...checkIns].sort((a, b) =>
    new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
  );

  // ── C×C patterns: 3+ consecutive days of low clarity or low confidence ──
  let lowClarityCount = 0;
  for (const c of sorted) {
    if (c.clarity_level != null && c.clarity_level <= 2) lowClarityCount++;
    else break;
  }
  if (lowClarityCount >= 3) {
    return `Day ${lowClarityCount} with low clarity. Persistent lack of direction across consecutive days points to an unresolved strategic question or missing anchor point. What decision or clarity do you need that you haven't found yet?`;
  }

  let lowConfidenceCount = 0;
  for (const c of sorted) {
    if (c.confidence_level != null && c.confidence_level <= 2) {
      lowConfidenceCount++;
    } else break;
  }
  if (lowConfidenceCount >= 3) {
    return `Day ${lowConfidenceCount} with low confidence. Sustained execution doubt across multiple days is rarely about capability. What pattern of self-trust has been compromised?`;
  }

  // ── Outcome patterns: 3+ consecutive days at same outcome ──
  if (!currentOutcome) return null;

  let outcomeCount = 0;
  for (const c of sorted) {
    if (c.outcome === currentOutcome) outcomeCount++;
    else break;
  }

  if (outcomeCount < 3) return null;

  const outcomeSignals: Record<string, string> = {
    overwhelmed:
      "Sustained overload at this level points to something structural, not something a daily regulation practice alone resolves. What has been consistently missing?",
    drained:
      "A multi-day depletion pattern signals an accumulating recovery deficit, not a single bad night. Your system may need more than the day's margins can provide.",
    scattered:
      "Persistent fragmentation across consecutive days points to unresolved open loops or an unprocessed decision backlog. What is still occupying bandwidth that needs to be closed?",
    steady:
      "Sustained baseline stability is valuable. The question is whether this is protective regulation or avoidance of activation.",
    focused:
      "Consecutive days of high cognitive activation without corresponding rest can lead to burnout masked as productivity. What's sustaining this, and what's the cost?",
  };

  const signal = outcomeSignals[currentOutcome];
  if (!signal) return null;

  return `Day ${outcomeCount} at this state. Your system is showing a pattern. ${signal}`;
}

// ==================== DATA SOURCES BUILDER ====================
function buildDataSources(
  calendarState: "active" | "connected_no_events" | "not_connected",
  archetype: string | null,
  _checkInOutcome: string | null,
  coachUsed: boolean,
  wearableUsed: boolean,
): string[] {
  const sources: string[] = [];
  sources.push("decision readiness score");
  if (calendarState === "active") sources.push("calendar");
  else if (calendarState === "connected_no_events") {
    sources.push("calendar (no upcoming events)");
  }
  if (wearableUsed) sources.push("wearable");
  if (archetype) sources.push("archetype");
  if (coachUsed) sources.push("coach insights");
  return sources;
}

// ==================== MAIN ====================
// Boot-time smoke test for the Anthropic fallback model id. Non-blocking,
// log-only. Catches a stale/incorrect CLAUDE_MODELS.SONNET at cold start
// rather than silently 404'ing on every brief fallback for weeks.
runAnthropicSmokeOnce();

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Hoisted so the outermost catch can still return a 200 with the MRS
  // fields the client forwarded, even if some later assembly step throws.
  // MRS is deterministic (compute-inner-readiness) and must not be gated
  // by an LLM/Brief-copy failure. See top-of-file Brief/MRS contract.
  let recoveryBody: any = null;

  try {
    const body: ComputeRequest & { userId?: string } = await req.json();
    recoveryBody = body;
    // Manual refresh: bypass the brief snapshot replay (read) only. See the
    // `forceRefresh` doc on ComputeRequest — the write path, validator and
    // overwrite protection are all unchanged.
    const forceBriefRefresh = (body as any)?.forceRefresh === true;

    // Auth model:
    //   - Normal user calls: identity is derived from a verified Auth0 JWT.
    //     `body.userId` is IGNORED for these callers.
    //   - Internal/cron/service calls: caller must present either the
    //     service-role bearer or the `x-cron-secret` header matching
    //     CRON_SHARED_SECRET. Only these callers may pass `body.userId`.
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const CRON_SHARED_SECRET = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    const isServiceRoleCall = !!SERVICE_ROLE_KEY &&
      authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
    const isCronSecretCall = !!CRON_SHARED_SECRET &&
      cronSecretHeader === CRON_SHARED_SECRET;
    const isInternalCall = isServiceRoleCall || isCronSecretCall;

    let userId: string;
    if (isInternalCall) {
      if (!body.userId) {
        return new Response(
          JSON.stringify({ error: "Internal call missing userId" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      userId = body.userId;
      console.log(
        "[compute-outer-readiness] Internal call, userId:",
        redactUserId(userId),
      );
    } else {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing authorization header" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      try {
        userId = await verifyAuth0JWT(authHeader, req);
      } catch (_e) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // Non-internal callers can never act on another user's data.
      if (body.userId && body.userId !== userId) {
        return new Response(
          JSON.stringify({ error: "Forbidden: userId mismatch" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const {
      innerReadinessTier,
      innerReadinessScore,
      clarityLevel,
      confidenceLevel,
      mentalSharpnessLevel = null,
      emotionLevel = null,
      pressureLevel = null,
      regulationLevel = null,
      checkInOutcome,
      timezoneOffset = 0,
      localDate: requestedLocalDateRaw = null,
      mrsWindow: requestedMrsWindowRaw = null,
      currentTimezone: clientCurrentTz = null,
      homeTimezone: clientHomeTz = null,
      tierDisplayed: clientTierDisplayed = null,
      tierCapReason: clientTierCapReason = null,
      innerReadinessScoreBaseline: clientScoreBaseline = null,
      innerReadinessScoreRefined: clientScoreRefined = null,
      innerReadinessState: clientReadinessStateRaw = null,
      innerReadinessRefinedContribution: clientRefinedContribution = null,
      weightProvenance: clientWeightProvenance = null,
    } = body;
    // Mutable alias — the V4 wearable-freshness gate (defined further
    // below, once `hasTodayWearableData` is known) may downgrade a
    // forwarded 'refined' to 'baseline'.
    let clientReadinessState: "baseline" | "refined" | "awaiting" | null =
      clientReadinessStateRaw as any;
    const incomingWeightProvenanceAwaiting = weightProvenanceIndicatesAwaiting(
      clientWeightProvenance,
    );

    // Defensive default: if innerReadinessTier is missing (e.g. compute-inner-readiness failed), fall back to 'managing'
    const safeTier: EnergyTier = innerReadinessTier || "managing";
    // MRS v3 — fall back to the raw tier when the client did not forward
    // the displayed value. Never raises a low tier; only mirrors the cap.
    const safeTierDisplayed: EnergyTier =
      (clientTierDisplayed as EnergyTier | null) ?? safeTier;
    const safeTierCapReason: "SUSTAINED_DEFICIT" | "CONSECUTIVE_LOAD" | null =
      clientTierCapReason ?? null;
    // MRS persistence fix (2026-06-26): the previous awaiting rule treated a
    // missing `clientScoreBaseline` as awaiting even when `innerReadinessScore`
    // was a real number. That caused `daily_context_snapshot` to upsert NULL
    // scores + `readiness_state='awaiting'` for live windows, so the MRS card
    // could never read from the snapshot. Derive an effective baseline first
    // and only treat the row as awaiting when there is no usable numeric
    // score from either side.
    const effectiveBaselineScore: number | null =
      typeof clientScoreBaseline === "number"
        ? clientScoreBaseline
        : typeof innerReadinessScore === "number"
        ? innerReadinessScore
        : null;
    const hasUsableInnerScore = typeof innerReadinessScore === "number";
    const hasUsableBaseline = typeof effectiveBaselineScore === "number";
    // Some downstream legacy callers still invoke compute-outer-readiness with
    // only check-in-derived `innerReadinessScore` / tier fields and without the
    // MRS v4 contract from compute-inner-readiness. Those payloads are useful
    // for copy context, but they are not authoritative enough to overwrite a
    // window-scoped daily_context_snapshot MRS row.
    const incomingHasMrsContract = clientReadinessStateRaw != null ||
      clientWeightProvenance != null ||
      clientScoreBaseline != null ||
      clientScoreRefined != null;
    const incomingIsLegacyIncompleteMrsPayload = !incomingHasMrsContract;
    const innerStateIsAwaiting = clientReadinessState === "awaiting" ||
      incomingWeightProvenanceAwaiting ||
      (!hasUsableInnerScore && !hasUsableBaseline);
    const suppressIncomingMrsSnapshot = innerStateIsAwaiting ||
      incomingIsLegacyIncompleteMrsPayload;
    const currentReadingIsReal = !suppressIncomingMrsSnapshot &&
      typeof innerReadinessScore === "number";

    // Compute user's local time
    const userTime = getUserTime(timezoneOffset);
    const userLocalDate = userTime.toISOString().split("T")[0];
    const hour = userTime.getHours();
    const dayOfWeek = userTime.getDay();
    const snapshotLocalDate = typeof requestedLocalDateRaw === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(requestedLocalDateRaw)
      ? requestedLocalDateRaw
      : userLocalDate;
    const requestedMrsWindow = requestedMrsWindowRaw === "morning" ||
        requestedMrsWindowRaw === "afternoon" ||
        requestedMrsWindowRaw === "evening"
      ? requestedMrsWindowRaw
      : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const platform = detectClientPlatform(req);
    const db = wrapDbWithCalendarPrimacy(
      createClient(supabaseUrl, supabaseKey),
      platform,
    );

    // Bind this user's A–H learning context (confirmed titles + learned
    // tokens) to the request so every enrichEvent() below resolves through
    // the same memory the Plan and Week Ahead write to.
    await primeLearningContext(db as any, userId);

    // Leader Profile (from onboarding CoS synthesis). Loaded ONCE, reused
    // by system prompt, user prompt, and brief_snapshots payload. Never
    // throws; returns a shell with nulls when the profile is missing/failed.
    const leaderProfile: LeaderProfileContext = await loadLeaderProfile(
      db as any,
      userId,
    );

    // ── Server-side calendar metrics: today + tomorrow (for evening forward-look)
    // + yesterday (for morning brief pattern context). ──
    const lateEvening = isLateEvening(hour);
    const isEvening = hour >= 18 || lateEvening;
    const needTomorrow = isEvening;
    const isMorning = hour >= 5 && hour < 12;
    const [calendarResult, tomorrowResult, yesterdayResult] = await Promise.all([
      getServerCalendarMetrics(db as any, userId, timezoneOffset, 0, platform),
      needTomorrow
        ? getServerCalendarMetrics(db as any, userId, timezoneOffset, 1, platform)
        : Promise.resolve(null),
      isMorning
        ? getServerCalendarMetrics(db as any, userId, timezoneOffset, -1, platform)
        : Promise.resolve(null),
    ]);
    const calendarLoad: CalendarLevel | null = calendarResult.state === "active"
      ? calendarResult.load
      : null;
    const calendarPressure: CalendarLevel | null =
      calendarResult.state === "active" ? calendarResult.pressure : null;
    const tomorrowLoad: CalendarLevel | null =
      tomorrowResult?.state === "active" ? tomorrowResult.load : null;
    const tomorrowPressure: CalendarLevel | null =
      tomorrowResult?.state === "active" ? tomorrowResult.pressure : null;
    const tomorrowHighStakes: string[] = tomorrowResult?.highStakesEvents || [];
    const todayHighStakes: string[] = calendarResult.highStakesEvents || [];

    if (body.contextOnly === true) {
      const calendarUsable = calendarResult.state === "active" ||
        calendarResult.state === "connected_no_events";
      // MRS v4 demand pillar — the browser client is anon-keyed and cannot
      // read `calendar_events` under RLS, so it can never derive demand for
      // itself. Compute the earned demand scores here (service role) and
      // hand them back: full-day, remaining-only ("now forward") and the
      // realized cost of what already happened. Zero is EARNED data when the
      // calendar is connected — only `not_connected` yields null.
      const rawTodayEvents: any[] = Array.isArray(calendarResult.rawEvents)
        ? calendarResult.rawEvents
        : [];
      const nowMs = Date.now();
      const timeOf = (v: unknown): number | null => {
        if (typeof v !== "string" && !(v instanceof Date)) return null;
        const t = new Date(v as any).getTime();
        return Number.isFinite(t) ? t : null;
      };
      const remainingEventRows = rawTodayEvents.filter((e) => {
        const end = timeOf(e?.end_time);
        return end == null ? true : end > nowMs;
      });
      const completedEventRows = rawTodayEvents.filter((e) => {
        const end = timeOf(e?.end_time);
        return end != null && end <= nowMs;
      });
      const demandOf = (rows: any[]): number | null =>
        calendarUsable ? computeCalendarDemand(rows as any).demandScore : null;
      const fullDayDemandScore = demandOf(rawTodayEvents);
      const remainingDemandScore = demandOf(remainingEventRows);
      const realizedDemandScore = demandOf(completedEventRows);
      return new Response(
        JSON.stringify({
          contextOnly: true,
          calendarState: calendarResult.state,
          calendarUsable,
          hasCalendarSignal: calendarUsable,
          calendarLoad,
          calendarPressure,
          demandScore: fullDayDemandScore,
          fullDayDemandScore,
          remainingDemandScore,
          realizedDemandScore,
          meetingCount: calendarResult.meetingCount ?? null,
          eventCount: calendarResult.eventCount ?? null,
          remainingMeetings: calendarResult.remainingMeetings ?? null,
          remainingHighStakes: calendarResult.remainingHighStakes ?? [],
          todayHighStakes,
          todayHighStakesDetailed: todayHighStakes.map((title) => {
            return { title, localTime: null, category: categoryNameOf(title) };
          }),
          tomorrowLoad,
          tomorrowPressure,
          tomorrowHighStakes,
          tomorrowHighStakesDetailed: tomorrowHighStakes.map((title) => {
            return { title, localTime: null, category: categoryNameOf(title) };
          }),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Fetch wearable data (always – mornings use sleep, evenings use HR/HRV) ──
    let wearableContext: WearableContext | null = null;
    let wearableDataSource: string | null = null;
    try {
      const { data: wearableRow } = await db
        .from("wearable_data")
        .select(
          "hrv, resting_heart_rate, heart_rate, sleep_score, total_sleep_minutes, deep_sleep_minutes, rem_sleep_minutes, sleep_efficiency, raw_data, source, source_provider, source_apps, summary_date",
        )
        .eq("user_id", userId)
        .order("summary_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wearableRow) {
        const rhr = wearableRow.resting_heart_rate ?? null;
        const hrv = wearableRow.hrv ?? null;
        const hr = (wearableRow as any).heart_rate ?? null;
        const sleepScore = wearableRow.sleep_score ?? null;
        const rawSleepDuration = wearableRow.total_sleep_minutes ?? null;
        const source = wearableRow.source ?? null;
        wearableDataSource = source;

        // Apple correction: HealthKit & Apple Watch report "time in bed",
        // not asleep — apply the standard 0.85 multiplier. Oura/Whoop
        // already report true sleep duration so they're left alone.
        const sleepDuration = (rawSleepDuration !== null &&
            isAppleMetricSource(
              "total_sleep_minutes",
              wearableRow as Record<string, unknown>,
            ))
          ? Math.round(rawSleepDuration * 0.85)
          : rawSleepDuration;

        // Sleep efficiency (0–100) — used by Signal Pills v3 as the
        // wearable anchor for the Resilience pill. Prefer the persisted
        // column (populated by persist-wearable-data / sync-oura since
        // the sleep_efficiency migration); fall back to deriving from
        // raw_data for legacy rows synced before the migration.
        const storedEff = (wearableRow as any).sleep_efficiency ?? null;
        let sleepEfficiency: number | null = typeof storedEff === "number"
          ? storedEff
          : null;
        if (sleepEfficiency == null) {
          // Inline fallback — keeps the same priority order as the shared
          // helper (raw_data.efficiency → raw_data.sleep.efficiency →
          // time_in_bed derivation). Importing the helper would force a
          // shared-module reload risk in this hot path, so we mirror it.
          const rawAny = (wearableRow as any).raw_data ?? {};
          if (typeof rawAny?.efficiency === "number") {
            sleepEfficiency = Math.round(rawAny.efficiency);
          } else if (typeof rawAny?.sleep?.efficiency === "number") {
            sleepEfficiency = Math.round(rawAny.sleep.efficiency);
          } else if (
            typeof rawAny?.time_in_bed === "number" && rawSleepDuration != null
          ) {
            const tib = rawAny.time_in_bed;
            const tibMin = tib > 1000 ? Math.round(tib / 60) : tib;
            if (tibMin > 0) {
              sleepEfficiency = Math.round((rawSleepDuration / tibMin) * 100);
            }
          }
          if (sleepEfficiency != null) {
            sleepEfficiency = Math.max(0, Math.min(100, sleepEfficiency));
          }
        }
        (wearableRow as any)._sleepEfficiency = sleepEfficiency;

        // HRV stress: below 30ms absolute (low) – a simple heuristic (will be refined by deviation below)
        const hrvElevated = hrv !== null && hrv < 30;
        // Poor sleep: score < 60 or duration < 6 hours (360 min)
        const poorSleep = (sleepScore !== null && sleepScore < 60) ||
          (sleepDuration !== null && sleepDuration < 360);

        // RHR elevated will be computed from baseline below – placeholder false
        const rhrElevated = false;
        // hrElevated: derived from HRV being significantly depressed (sympathetic dominance = elevated HR)
        // Will be refined by baseline deviation below; initial heuristic: HRV < 25ms
        const hrElevated = hrv !== null && hrv < 25;

        wearableContext = {
          hrv,
          rhr,
          hr,
          sleepScore,
          sleepDuration,
          hrElevated,
          hrvElevated,
          poorSleep,
          rhrElevated,
          dataSource: source,
          sourceRowDate: wearableRow.summary_date ?? null,
          sleepEfficiency: (wearableRow as any)._sleepEfficiency ?? null,
        };
      }
    } catch (err) {
      console.error(
        "[compute-outer-readiness] Wearable data fetch error:",
        err,
      );
    }

    console.log(
      "[compute-outer-readiness] INPUT SUMMARY:",
      JSON.stringify({
        userId: userId.substring(0, 12) + "...",
        tier: safeTier,
        score: innerReadinessScore,
        clarity: clarityLevel,
        confidence: confidenceLevel,
        checkInOutcome,
        calendarState: calendarResult.state,
        calendarEventCount: calendarResult.eventCount,
        calendarLoad,
        calendarPressure,
        todayHighStakes,
        remainingEvents: calendarResult.remainingEvents,
        remainingHighStakes: calendarResult.remainingHighStakes,
        tomorrowLoad,
        tomorrowPressure,
        tomorrowHighStakes,
        wearablePresent: !!wearableContext,
        wearableHRE: wearableContext?.hrElevated,
        wearableHRVE: wearableContext?.hrvElevated,
        wearablePoorSleep: wearableContext?.poorSleep,
        wearableRHRE: wearableContext?.rhrElevated,
        hour,
        dayOfWeek,
      }),
    );

    // Fetch coach insights, check-ins, archetype, coach memory, commitments, and breakthroughs in parallel
    const [
      coachRes,
      checkInRes,
      profileRes,
      coachMemoryRes,
      coachCommitmentsRes,
      coachBreakthroughsRes,
      wearableIntegrationRes,
      calendarConnectionRes,
    ] = await Promise.all([
      db.from("user_coach_insights")
        .select("insight_type, insight_content, created_at")
        .eq("user_id", userId)
        .in("insight_type", ["strength", "growth_area", "relationship_pattern"])
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5),
      db.from("daily_checkins")
        .select(
          "checkin_date, outcome, clarity_level, confidence_level, energy_balance",
        )
        .eq("user_id", userId)
        .gte(
          "checkin_date",
          new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
        )
        .order("checkin_date", { ascending: false })
        .limit(10),
      db.from("profiles")
        .select("user_archetype, component_scores, practice_priority_tag")
        .eq("id", userId)
        .maybeSingle(),
      // Coach memory: recent memories with importance ≥ 5
      db.from("coach_memory_index")
        .select(
          "memory_content, memory_type, pattern_area, key_themes, importance_score, created_at",
        )
        .eq("user_id", userId)
        .gte("importance_score", 5)
        .order("created_at", { ascending: false })
        .limit(10),
      // Coach commitments: pending
      db.from("coach_accountability_tracker")
        .select(
          "commitment_text, status, meta_skill, pattern_area, committed_at",
        )
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("committed_at", { ascending: false })
        .limit(5),
      // Coach breakthrough moments: recent high-impact breakthroughs
      db.from("coach_breakthrough_moments")
        .select(
          "breakthrough_content, breakthrough_type, meta_skill, pattern_area, impact_score, was_acted_on, created_at",
        )
        .eq("user_id", userId)
        .gte("impact_score", 3)
        .order("created_at", { ascending: false })
        .limit(5),
      db.from("user_integrations")
        .select(
          "watch_type, watch_connection_status, watch_sync_status, watch_connected_at, watch_last_sync_at, watch_last_sample_at, watch_last_error, watch_last_error_at, watch_disconnected_at, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("calendar_connections")
        .select("provider, is_active, last_sync")
        .eq("user_id", userId),
    ]);

    const coachInsights = coachRes.data || [];
    const recentCheckIns = checkInRes.data || [];
    // Normalise at read time: v8 CoS profiles store free-text names
    // ("The Architect-Commander"), which must map onto a canonical slug before
    // the archetype x tier matrix can be keyed on it. Null => tier fallback.
    const serverArchetype = resolveArchetypeSlug(
      profileRes.data?.user_archetype ?? null,
    );
    const serverComponentScores = (profileRes.data as any)?.component_scores ||
      body.componentScores || null;
    const serverPracticePriorityTag =
      (profileRes.data as any)?.practice_priority_tag ||
      body.practicePriorityTag || null;
    const coachMemories = coachMemoryRes.data || [];
    const coachCommitments = coachCommitmentsRes.data || [];
    const coachBreakthroughs = coachBreakthroughsRes.data || [];
    const wearableIntegration = wearableIntegrationRes.data ?? null;
    const calendarConnections = calendarConnectionRes.data || [];
    let localeWeekendHomeCountry: string | null = null;

    const strengthInsight = coachInsights.find((i: { insight_type: string }) =>
      i.insight_type === "strength"
    );
    const growthInsight = coachInsights.find((i: { insight_type: string }) =>
      i.insight_type === "growth_area"
    );
    const relationshipInsight = coachInsights.find((
      i: { insight_type: string },
    ) => i.insight_type === "relationship_pattern");
    const coachStrength = strengthInsight?.insight_content || null;
    const coachGrowth = growthInsight?.insight_content || null;
    const relationshipPattern = relationshipInsight?.insight_content || null;
    const coachInsightCreatedAt = strengthInsight?.created_at ||
      growthInsight?.created_at || null;
    const appleCalendarConnection = (calendarConnections as Array<
      {
        provider?: string | null;
        is_active?: boolean | null;
        last_sync?: string | null;
      }
    >).find((conn) => conn.provider === "apple") ?? null;
    const appleCalendarNeedsReconnect = !!appleCalendarConnection &&
      !appleCalendarConnection.is_active;
    const wearableConnectionStatus =
      (wearableIntegration?.watch_connection_status ?? null) as
        | "connected"
        | "connected_but_waiting_for_data"
        | "sync_delayed"
        | "permission_revoked"
        | "disconnected"
        | "error"
        | null;
    const wearableSyncStatus =
      (wearableIntegration?.watch_sync_status ?? null) as
        | "synced"
        | "waiting_for_data"
        | "sync_delayed"
        | "error"
        | "watch_unavailable"
        | null;
    const hasWearableConnectionRecord =
      wearableConnectionStatus === "connected" ||
      wearableConnectionStatus === "connecting" ||
      wearableConnectionStatus === "connected_but_waiting_for_data" ||
      wearableConnectionStatus === "sync_delayed";

    // P0 2026-07-04 — Hoisted above every consumer (theme derivation, weekly
    // logic, awaiting-reason branches, response assembly, snapshot persist,
    // pillCoherence) so no execution path (including nested try/catch blocks
    // and closures created between lines ~2100 and ~6167) can hit a TDZ read.
    // Do NOT default to 0 when we don't know when the wearable was connected —
    // downstream cold-start gates rely on `null` meaning "unknown".
    const wearableDaysConnected = deriveWearableDaysConnected({
      connectedAt: wearableIntegration?.watch_connected_at ?? null,
      fallbackConnectedAt: wearableIntegration?.updated_at ?? null,
      isConnected: hasWearableConnectionRecord,
    });

    const theme = getTheme(
      safeTier,
      calendarPressure,
      calendarLoad,
      innerReadinessScore,
      hour,
      dayOfWeek,
      localeWeekendHomeCountry,
      tomorrowLoad,
      tomorrowPressure,
      tomorrowHighStakes,
      wearableContext,
      todayHighStakes,
      calendarResult.eventCount,
      calendarResult.remainingEvents,
      calendarResult.remainingHighStakes,
      calendarResult.meetingCount,
      calendarResult.remainingMeetings,
    );
    const patternOverride = getPatternOverride(
      recentCheckIns as Array<
        {
          checkin_date: string;
          outcome: string;
          clarity_level?: number | null;
          confidence_level?: number | null;
        }
      >,
      checkInOutcome || null,
    );

    // §17.2 / §17.2a — Driver override based on Week-Ahead Mode and the
    // Saturday recovery predicate. We only flip the `driver` stamp on the
    // brief_snapshots row here; full LLM anchor-block rewrites are tracked
    // as a follow-up. The Plan + Nudges read the same predicates directly.
    try {
      const manualWeekAheadOverride =
        req.headers.get("x-week-ahead-override") === "1";
      const wam = evaluateWeekAheadMode({
        dayOfWeek,
        localHour: hour,
        manualOverride: manualWeekAheadOverride,
      });
      if (wam.active) {
        (theme as { driver: ThemeDriver }).driver = "week_recap";
      } else if (isSaturdayRecoveryDay({ dayOfWeek, localHour: hour })) {
        (theme as { driver: ThemeDriver }).driver = "week_recovery";
      }
    } catch (wamErr) {
      console.warn(
        "[compute-outer-readiness] week-ahead driver override skipped:",
        wamErr instanceof Error ? wamErr.message : wamErr,
      );
    }

    const hasCalendar = calendarLoad !== null && calendarPressure !== null;
    console.log(
      "[compute-outer-readiness] THEME:",
      JSON.stringify({
        phrase: theme.phrase,
        driver: theme.driver,
        hasCalendar,
        calendarState: calendarResult.state,
        todayHighStakes,
        fallbackReason: !hasCalendar
          ? (calendarResult.state === "not_connected"
            ? "no_calendar_connection"
            : calendarResult.state === "connected_no_events"
            ? "connected_no_upcoming_events"
            : "unknown")
          : null,
      }),
    );

    // "Strength without clarity" override – independent signals
    const ccProvided = clarityLevel !== null || confidenceLevel !== null;
    let finalPhrase = theme.phrase;
    let finalContext = patternOverride || theme.context;

    // Same-day state shift detection: compare latest 2 check-ins today
    if (!patternOverride && recentCheckIns.length >= 2) {
      const today = new Date().toISOString().split("T")[0];
      const todayCheckins = recentCheckIns.filter((c: any) =>
        c.checkin_date === today
      );
      if (todayCheckins.length >= 2) {
        const latest = todayCheckins[0];
        const previous = todayCheckins[1];
        const latestEB = latest.energy_balance ?? 50;
        const prevEB = previous.energy_balance ?? 50;
        const drop = prevEB - latestEB;
        const rise = latestEB - prevEB;
        if (drop >= 15) {
          finalContext =
            `Your latest check-in shows a notable drop in readiness since earlier today. ${theme.context}`;
        } else if (rise >= 15) {
          finalContext =
            `Your readiness has recovered since your earlier check-in. ${theme.context}`;
        }
      }
    }

    if (ccProvided && (safeTier === "strong" || safeTier === "peak")) {
      const cLow = clarityLevel !== null && clarityLevel <= 2;
      const confLow = confidenceLevel !== null && confidenceLevel <= 2;
      if (cLow || confLow) {
        finalPhrase = "Strength without clarity.";
        finalContext =
          "Your felt energy is high, but your internal compass – clarity and confidence – is signalling uncertainty. High activation without direction can lead to misplaced effort. Before deploying your readiness, find your anchor.";
      }
    }

    // Phase 2: Wearable recovery check (feature-flagged off)
    let wearableRecovery = null;
    if (ENABLE_WEARABLE_RECOVERY_TRIGGER) {
      wearableRecovery = await checkWearableRecoveryTrigger(userId, db as any);
    }

    // ═══ Forward-declare enrichment variables needed by getLeanOnWatchFor ═══
    // These are populated later in the enrichment block; defaults ensure safe access here.
    let checkInCountTotal = 0;
    try {
      const { count } = await db
        .from("daily_checkins")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      checkInCountTotal = count ?? 0;
    } catch (e) {
      console.error("[compute-outer-readiness] checkin count error:", e);
    }

    let typicalDOWOutcome: string | null = null;
    let hrvEventCorrelation: string | null = null;
    let scoreTrajectory7d: string | null = null;

    // Compute consecutive low-energy day streak from recent check-ins (most-recent-first)
    let consecutiveLowDaysEarly = 0;
    for (const c of recentCheckIns) {
      if ((c as any).energy_balance != null && (c as any).energy_balance < 50) {
        consecutiveLowDaysEarly++;
      } else break;
    }

    const leanOnResult = getLeanOnWatchFor(
      safeTier,
      serverArchetype,
      clarityLevel,
      confidenceLevel,
      coachStrength,
      coachGrowth,
      coachInsightCreatedAt,
      checkInCountTotal,
      typicalDOWOutcome,
      hrvEventCorrelation,
      scoreTrajectory7d,
      dayOfWeek,
      consecutiveLowDaysEarly,
      checkInOutcome ?? null,
      // hrvDeviation is computed later (line ~2293); pass null at this early call site.
      null,
    );

    const coachUsed = leanOnResult.source.startsWith("coach");
    console.log(
      `[lean-on] source=${leanOnResult.source} archetype=${
        serverArchetype ?? "none"
      } rawArchetype=${
        profileRes.data?.user_archetype ?? "null"
      } tier=${safeTier} matrixHit=${
        !!(serverArchetype && archetypeMatrix[serverArchetype]?.[safeTier])
      } leanOn="${leanOnResult.leanOn}"`,
    );
    const wearableUsed = !!wearableContext;
    const dataSources = buildDataSources(
      calendarResult.state,
      serverArchetype,
      checkInOutcome,
      coachUsed,
      wearableUsed,
    );

    // ═══ STATE STATEMENT BUILDER (calendar-aware, co-located) ═══
    // Build the State card's physiological statement here since we have all signals
    const stateAlreadyUsed: string[] = [];
    let stateStatement = "";
    {
      const calLoad = calendarLoad === "high"
        ? "high"
        : (calendarLoad === "medium" ? "medium" : "low");
      const hsCount = todayHighStakes.length;
      const isHeavyDay = calLoad === "high" || hsCount > 0;

      // Detect consecutive tier streak from check-ins
      let consecutiveStreak: { tier: string; count: number } | null = null;
      if (recentCheckIns.length >= 3) {
        const sorted = [...recentCheckIns].sort((a: any, b: any) =>
          new Date(b.checkin_date).getTime() -
          new Date(a.checkin_date).getTime()
        );
        // Map energy_balance to tier
        const getTier = (eb: number) =>
          eb < 40
            ? "depleted"
            : eb < 60
            ? "managing"
            : eb < 75
            ? "strong"
            : "peak";
        const firstTier = getTier(sorted[0].energy_balance ?? 50);
        let count = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (getTier(sorted[i].energy_balance ?? 50) === firstTier) count++;
          else break;
        }
        if (count >= 3) consecutiveStreak = { tier: firstTier, count };
      }

      // Collect wearable signals
      const signals: Array<{ key: string; text: string; divergence: number }> =
        [];
      if (wearableContext) {
        if (wearableContext.hrvElevated) {
          signals.push({
            key: "hrv_deviation",
            text: "HRV below baseline",
            divergence: 25,
          });
        }
        if (wearableContext.poorSleep) {
          const detail = wearableContext.sleepScore
            ? `sleep below baseline (score: ${wearableContext.sleepScore})`
            : "sleep below baseline";
          signals.push({ key: "sleep_score", text: detail, divergence: 20 });
        } else if (
          wearableContext.sleepScore && wearableContext.sleepScore >= 80
        ) {
          signals.push({
            key: "sleep_good",
            text: "solid sleep",
            divergence: 10,
          });
        }
        if (wearableContext.rhrElevated) {
          signals.push({
            key: "rhr_elevated",
            text: "resting heart rate above baseline",
            divergence: 15,
          });
        }
      }
      signals.sort((a, b) => b.divergence - a.divergence);

      // Build statement
      const tierLabel = safeTier === "depleted"
        ? "Low readiness"
        : safeTier === "managing"
        ? "Moderate readiness"
        : safeTier === "strong"
        ? "Strong readiness"
        : "Peak readiness";
      const tod = getTimeOfDay(hour);

      if (!wearableContext && !checkInOutcome) {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push("tier_fallback");
      } else if (isHeavyDay && signals.length >= 2) {
        const notable = signals.filter((s) => s.divergence >= 15);
        if (notable.length >= 2) {
          stateStatement = `${tierLabel} with ${notable[0].text} and ${
            notable[1].text
          } this ${tod}.`;
          notable.slice(0, 2).forEach((s) => stateAlreadyUsed.push(s.key));
        } else if (notable.length === 1) {
          const good = signals.find((s) => s.key === "sleep_good");
          if (good) {
            stateStatement = `${tierLabel} with ${good.text} – but ${
              notable[0].text
            }, signalling physiological load despite the mental clarity.`;
            stateAlreadyUsed.push(notable[0].key, good.key);
          } else {
            stateStatement = `${tierLabel} this ${tod} – ${notable[0].text}.`;
            stateAlreadyUsed.push(notable[0].key);
          }
        } else {
          stateStatement = `${tierLabel} this ${tod}.`;
          stateAlreadyUsed.push("tier_fallback");
        }
      } else if (signals.length > 0) {
        // Light day: single strongest signal
        stateStatement = `${tierLabel}, ${signals[0].text}.`;
        stateAlreadyUsed.push(signals[0].key);
      } else if (checkInOutcome) {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push("checkin_outcome");
      } else {
        stateStatement = `${tierLabel} this ${tod}.`;
        stateAlreadyUsed.push("tier_fallback");
      }

      // Cognitive divergence (second sentence)
      const cHigh = (clarityLevel ?? 3) >= 4;
      const cLow = (clarityLevel ?? 3) <= 2;
      const confHigh = (confidenceLevel ?? 3) >= 4;
      const confLow = (confidenceLevel ?? 3) <= 2;
      if (cHigh && confLow) {
        stateStatement +=
          " Clarity is strong – but confidence is low, which means the thinking is there but the belief in it isn't yet.";
        stateAlreadyUsed.push("clarity_high", "confidence_low");
      } else if (cLow && confHigh) {
        stateStatement +=
          " Confidence is high but clarity is low – certainty about an unclear path.";
        stateAlreadyUsed.push("clarity_low", "confidence_high");
      } else if (cLow && confLow && safeTier !== "depleted") {
        stateStatement +=
          " Both clarity and confidence flagged low in your check-in.";
        stateAlreadyUsed.push("clarity_low", "confidence_low");
      }

      // Streak
      if (consecutiveStreak) {
        stateStatement +=
          ` ${consecutiveStreak.count} days running at this level.`;
        stateAlreadyUsed.push(`streak_${consecutiveStreak.count}d`);
      }
    }

    // ═══ COMPASS INTERSECTION INTELLIGENCE ═══
    // Apply no-repeat rule: if stateAlreadyUsed contains a signal, Compass must not repeat it
    const compassAlreadyUsed = [...stateAlreadyUsed];

    // Coach memory + calendar match for intersection
    if (coachMemories.length > 0 && todayHighStakes.length > 0) {
      // Check if any coach memory relates to an upcoming event type
      const eventTypes = todayHighStakes.map((t) => t.toLowerCase());
      const relevantMemory = coachMemories.find((m: any) => {
        const content = (m.memory_content || "").toLowerCase();
        const themes = (m.key_themes || []).map((t: string) => t.toLowerCase());
        return eventTypes.some((et: string) =>
          content.includes(et.split(" ")[0]) ||
          themes.some((th: string) => et.includes(th))
        );
      });
      if (relevantMemory && !finalContext.includes("coach")) {
        // P1: Coach memory + calendar match – prepend intersection
        const eventRef = `*${todayHighStakes[0]}*`;
        const coachRef = (relevantMemory as any).memory_content.length > 80
          ? (relevantMemory as any).memory_content.substring(0, 77) + "..."
          : (relevantMemory as any).memory_content;
        finalContext =
          `You've explored this territory in coaching – ${eventRef} is that moment. ${finalContext}`;
        compassAlreadyUsed.push("coach_memory_match");
      }
    }

    // Coach commitment + event match
    if (coachCommitments.length > 0 && todayHighStakes.length > 0) {
      const eventRef = `*${todayHighStakes[0]}*`;
      const relevantCommitment = coachCommitments.find((c: any) => {
        const text = (c.commitment_text || "").toLowerCase();
        return todayHighStakes.some((e) =>
          text.includes(e.toLowerCase().split(" ")[0])
        );
      });
      if (relevantCommitment && !finalContext.includes("commitment")) {
        finalContext =
          `You committed to working on this – ${eventRef} is that moment. ${finalContext}`;
        compassAlreadyUsed.push("coach_commitment_match");
      }
    }

    // Coach breakthrough moments + event/pattern match
    if (
      coachBreakthroughs.length > 0 && !finalContext.includes("breakthrough")
    ) {
      const recentBreakthrough = coachBreakthroughs[0];
      const breakthroughArea =
        (recentBreakthrough.pattern_area || recentBreakthrough.meta_skill || "")
          .toLowerCase();

      // Match breakthrough to high-stakes event
      if (todayHighStakes.length > 0 && breakthroughArea) {
        const eventMatch = todayHighStakes.some((e: string) =>
          e.toLowerCase().includes(breakthroughArea) ||
          breakthroughArea.includes(e.toLowerCase().split(" ")[0])
        );
        if (eventMatch) {
          finalContext =
            `A recent coaching breakthrough connects directly to what's ahead today. ${finalContext}`;
          compassAlreadyUsed.push("coach_breakthrough_match");
        }
      }

      // Standalone breakthrough awareness (acted on vs not)
      if (
        !compassAlreadyUsed.includes("coach_breakthrough_match") &&
        recentBreakthrough.impact_score >= 5
      ) {
        if (recentBreakthrough.was_acted_on) {
          finalContext =
            `You've been acting on a recent coaching breakthrough – sustain that momentum today. ${finalContext}`;
        } else {
          finalContext =
            `A significant insight from coaching is still untested – today could be the moment to apply it. ${finalContext}`;
        }
        compassAlreadyUsed.push("coach_breakthrough_awareness");
      }
    }

    // Ensure event titles in Compass context use italic formatting (*event_title*)
    // Wrap any 'event_title' references in the context with * markers
    if (todayHighStakes.length > 0) {
      for (const hs of todayHighStakes) {
        // Replace plain 'Title' with *Title* where it appears wrapped in single quotes
        finalContext = finalContext.replace(
          new RegExp(`'${hs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`, "g"),
          `*${hs}*`,
        );
      }
    }

    if (relationshipPattern) {
      finalContext =
        `A recurring relationship pattern is showing up: ${relationshipPattern}. ${finalContext}`;
    }

    const timeOfDay = getTimeOfDay(hour);
    const today = new Date().toISOString().split("T")[0];
    try {
      await db.from("daily_themes").upsert({
        user_id: userId,
        theme_date: today,
        theme_phrase: finalPhrase,
        theme_driver: theme.driver,
        check_in_outcome: checkInOutcome || null,
        calendar_pressure: calendarPressure || null,
        calendar_load: calendarLoad || null,
        time_of_day: timeOfDay,
        lean_on: leanOnResult.leanOn,
        watch_for: leanOnResult.watchFor,
        inner_readiness_score: innerReadinessScore,
        archetype: serverArchetype,
      }, { onConflict: "user_id,theme_date" });
    } catch (e) {
      console.error("[compute-outer-readiness] Theme persistence error:", e);
    }

    // ═══ Compute additional data for DecisionReadinessBrief ═══
    // IMPORTANT: Declare metric values FIRST so hasWearableData can reference them
    let hrvValue: number | null = wearableContext?.hrv ?? null;
    let sleepScoreVal: number | null = wearableContext?.sleepScore ?? null;
    let sleepDuration: number | null = wearableContext?.sleepDuration ?? null;
    let rhrValue: number | null = wearableContext?.rhr ?? null;

    const hasWearableConnection = !!wearableContext;
    const hasWearableData = hasWearableConnection &&
      (hrvValue != null || sleepDuration != null || sleepScoreVal != null ||
        rhrValue != null);
    const sourceRowDate = wearableContext?.sourceRowDate ?? null;
    const wearableSourceAgeDays = sourceRowDate
      ? Math.max(
        0,
        Math.floor(
          (new Date(`${userLocalDate}T00:00:00Z`).getTime() -
            new Date(`${sourceRowDate}T00:00:00Z`).getTime()) / 86400000,
        ),
      )
      : null;
    // wearableDaysConnected is hoisted above `getTheme(...)` (see block near
    // line ~2100) so every consumer — including nested try/catch blocks — sees
    // it as initialized. Do not redeclare here.
    const hasTodayWearableData = hasWearableData && wearableSourceAgeDays === 0;
    const hasRecentWearableData = hasWearableData &&
      wearableSourceAgeDays === 1;
    const hasStaleWearableData = hasWearableData &&
      wearableSourceAgeDays !== null && wearableSourceAgeDays > 1;
    // Canonical flag: true only when actual metric data exists
    const hasWearable = hasWearableData;
    const hasCal = calendarLoad !== null && calendarPressure !== null;
    const integrationStatus: OuterReadinessResult["integrationStatus"] = {
      wearable: wearableIntegration
        ? {
          connectionStatus: wearableConnectionStatus === "permission_revoked"
            ? "permission_revoked"
            : wearableConnectionStatus === "sync_delayed"
            ? "sync_delayed"
            : wearableConnectionStatus === "connected_but_waiting_for_data"
            ? "connected_but_waiting_for_data"
            : wearableConnectionStatus === "connected"
            ? (hasTodayWearableData || hasRecentWearableData
              ? "connected"
              : (hasWearableData
                ? "connected_but_waiting_for_data"
                : "disconnected"))
            : wearableConnectionStatus === "error"
            ? "error"
            : hasWearableData
            ? "connected"
            : "unknown",
          syncStatus: wearableSyncStatus === "synced" ||
              wearableSyncStatus === "waiting_for_data" ||
              wearableSyncStatus === "sync_delayed" ||
              wearableSyncStatus === "error" ||
              wearableSyncStatus === "watch_unavailable"
            ? wearableSyncStatus
            : hasTodayWearableData
            ? "synced"
            : hasRecentWearableData
            ? "waiting_for_data"
            : hasWearableData
            ? "waiting_for_data"
            : "unknown",
          hasTodayData: hasTodayWearableData,
          hasRecentData: hasRecentWearableData,
          hasHistoricalData: wearableDaysConnected !== null &&
            wearableDaysConnected >= 7,
          lastSyncAt: wearableIntegration?.watch_last_sync_at ?? null,
          lastSampleAt: wearableIntegration?.watch_last_sample_at ?? null,
        }
        : null,
      calendar: {
        provider: appleCalendarConnection?.provider ?? null,
        connectionStatus: appleCalendarNeedsReconnect
          ? "permission_revoked"
          : calendarResult.state === "connected_no_events"
          ? "connected_no_events"
          : calendarResult.state === "active"
          ? "connected"
          : "disconnected",
        needsReconnect: appleCalendarNeedsReconnect,
        lastSyncAt: appleCalendarConnection?.last_sync ?? null,
      },
    };

    // === Readiness Eligibility Contract ===
    // Single source of truth for which readiness states the response may
    // emit. Defined BEFORE the brief is persisted / returned so every
    // downstream consumer (brief_snapshots write, daily_context_snapshot,
    // outer-readiness response) honours the same gate.
    //
    //  stageOneSignal = fresh wearable and/or usable calendar baseline context
    //  checkInFresh   = user submitted today's check-in for this request
    //  mode:
    //    'awaiting_signals' when no Stage 1 signal exists
    //    'early_read'       when Stage 1 exists and no check-in exists
    //    'full_read'        when Stage 1 exists and today's check-in exists
    //
    // RULE: a 'refined' / Full Read state requires Stage 1 plus a current
    // check-in. If the inner pipeline forwarded `refined` without Stage 1,
    // downgrade it to `baseline`.
    // Freshness is window-aware and comes from the single canonical rule in
    // `_shared/signal-engine/signal-freshness.ts` (morning accepts a 0- or
    // 1-day-old row; afternoon/evening require same-day). The gate consts are
    // declared just below, immediately after `signalFreshness` is resolved.

    // ── Current-signal freshness contract (shared by pills + Executive Brief)
    // The brief must never make a current-state claim from a signal the pills
    // consider unavailable for this window. Morning may use the overnight /
    // prior-day wearable row (its existing design); Afternoon and Evening
    // require a same-day row. Check-in values forwarded by the caller are
    // validated against an actual row for today + this window.
    const briefWindow = getTimeOfDay(hour) as SignalWindow;
    let checkInRowCurrentForWindow = false;
    try {
      const { data: _ciRow } = await db
        .from("daily_checkins")
        .select("id,time_window,timestamp")
        .eq("user_id", userId)
        .eq("checkin_date", userLocalDate)
        .eq("skipped", false)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (_ciRow) {
        const rowTs = (_ciRow as any).timestamp
          ? new Date((_ciRow as any).timestamp).getTime()
          : null;
        // Accept the row when it belongs to this window, or when it was
        // submitted moments ago (write/read race on a just-saved check-in).
        const justSubmitted = rowTs != null &&
          Date.now() - rowTs < 90 * 60 * 1000;
        checkInRowCurrentForWindow =
          (_ciRow as any).time_window === briefWindow || justSubmitted;
      }
    } catch (e) {
      console.warn(
        "[compute-outer-readiness] window check-in lookup failed:",
        e instanceof Error ? e.message : e,
      );
      // Fail closed for current-state claims; MRS scoring is unaffected.
      checkInRowCurrentForWindow = false;
    }
    const signalFreshness = resolveSignalFreshness({
      window: briefWindow,
      wearableSourceAgeDays,
      hasWearableData,
      hasCheckInRowForWindow: checkInRowCurrentForWindow,
      localHour: hour,
    });

    const briefWearableUsable = signalFreshness.wearableCurrent;
    // Canonical, window-aware wearable freshness used by the readiness gate,
    // eligibility receipts, pill provenance and MRS contributor rules.
    const wearableFreshForGate = signalFreshness.wearableCurrent;

    // Canonical, window-aware wearable freshness for pills / MRS score / plan.
    // The agreed Gating Rule requires the *existence* of Physiology and Demand, not
    // strict same-window freshness (which is handled by prose/historical rules).
    const wearableUsableForGate = hasWearableData;
    const calendarUsableForGate = calendarResult.state === "active" ||
      calendarResult.state === "connected_no_events";
    // Agreed Gating Rule (Feature Tier 0):
    // Baseline requires BOTH Physiology (any wearable data) AND Demand (valid calendar query)
    const stageOneSignalForGate = wearableUsableForGate && calendarUsableForGate;
    const checkInCurrentForWindow = signalFreshness.checkInCurrent;
    const currentCheckInOutcome = checkInCurrentForWindow
      ? (checkInOutcome ?? null)
      : null;
    const currentClarityLevel = checkInCurrentForWindow
      ? (typeof clarityLevel === "number" ? clarityLevel : null)
      : null;
    const currentConfidenceLevel = checkInCurrentForWindow
      ? (typeof confidenceLevel === "number" ? confidenceLevel : null)
      : null;
    const currentMentalSharpnessLevel = checkInCurrentForWindow
      ? (typeof mentalSharpnessLevel === "number" ? mentalSharpnessLevel : null)
      : null;
    if (
      !checkInCurrentForWindow &&
      (checkInOutcome != null || clarityLevel != null ||
        confidenceLevel != null || mentalSharpnessLevel != null)
    ) {
      console.log(
        `[brief][stale-checkin-dropped] window=${briefWindow} date=${userLocalDate} forwardedOutcome=${
          checkInOutcome ?? "null"
        } forwardedClarity=${clarityLevel ?? "null"}`,
      );
    }
    if (hasWearableData && !briefWearableUsable) {
      console.log(
        `[brief][stale-wearable-dropped] window=${briefWindow} ageDays=${
          wearableSourceAgeDays ?? "null"
        } maxAge=${signalFreshness.maxWearableAgeDays}`,
      );
    }
    const checkInFreshForGate = !!currentCheckInOutcome;
    const readinessEligibilityMode:
      | "awaiting_signals"
      | "early_read"
      | "full_read" = !stageOneSignalForGate
        ? "awaiting_signals"
        : (checkInFreshForGate ? "full_read" : "early_read");
    const readinessEligibilityReason = !stageOneSignalForGate
      ? (hasWearableData
        ? "stage1_missing_calendar_or_wearable_stale"
        : "missing_stage1_signal")
      : (checkInFreshForGate ? "stage1_and_checkin_fresh" : "stage1_only");
    // Downgrade the client-forwarded readiness state if it claims 'refined'
    // without Stage 1. Safe to mutate the let binding; all later reads of
    // `clientReadinessState` will see the gated value.
    if (clientReadinessState === "refined" && !stageOneSignalForGate) {
      console.log(
        `[outer-readiness][readiness-gate] downgrading clientReadinessState 'refined' -> 'baseline' (stageOne=false, wearableFresh=${wearableFreshForGate}, calendarState=${calendarResult.state}, ageDays=${wearableSourceAgeDays})`,
      );
      clientReadinessState = "baseline";
    }
    // Capture the eligibility block once for response + persistence reuse.
    const readinessEligibility = {
      wearableFresh: wearableFreshForGate,
      calendarUsable: calendarUsableForGate,
      stageOneSignal: stageOneSignalForGate,
      checkInFresh: checkInFreshForGate,
      mode: readinessEligibilityMode,
      scoreCanUpdate: stageOneSignalForGate,
      checkInCanRefine: stageOneSignalForGate && checkInFreshForGate,
      reason: readinessEligibilityReason,
    };

    // HRV/sleep/RHR deviation from 30-day baseline
    let hrvDeviation: number | null = null;
    let sleepDeviation: number | null = null;
    let rhrDeviation: number | null = null;
    let hrDeviation: number | null = null;
    let hrvBaseline: number | null = null;
    let sleepBaseline: number | null = null;
    let rhrBaseline: number | null = null;
    let hrBaseline: number | null = null;
    let hrValue: number | null = wearableContext?.hr ?? null;
    // MRS v2 §3.5 — RHR 3-day trend (Physical Reserves input). Computed
    // from the same 30-day baseline pull below so we avoid a second query.
    let rhr3dTrend: "declining" | "stable" | "rising" | "unknown" = "unknown";
    // Signal Pills v3 / W3.5 — canonical finalized payload + prompt context.
    let echoedSignalPills: any[] | null = null;
    let echoedPillQualifiers: any = null;
    let echoedCoherenceWarning: string | null = null;
    let echoedPillCoherence: {
      inSync: boolean;
      adjustments: CoherenceAdjustment[];
    } = { inSync: true, adjustments: [] };
    let echoedBaselineScore: number | null = null;
    let echoedProvenance: {
      mrs: {
        sources: MrsSource[];
        primary: MrsSource | null;
        refinedBy: "checkin" | null;
      };
      brief: {
        sources: MrsSource[];
        briefSource: "llm" | "deterministic" | "awaiting";
      };
      pills: {
        decision_readiness: MrsSource[];
        physical_reserves: MrsSource[];
        resilience_capacity: MrsSource[];
      };
    } | null = null;
    let canonicalInnerScore: number | null =
      typeof innerReadinessScore === "number" ? innerReadinessScore : null;
    let canonicalTier: any = safeTier ?? null;
    let canonicalTierDisplayed: any = safeTierDisplayed ?? null;
    let canonicalTierCapReason: any = safeTierCapReason ?? null;
    let canonicalScoreBaseline: number | null =
      typeof effectiveBaselineScore === "number"
        ? effectiveBaselineScore
        : null;
    let canonicalScoreRefined: number | null =
      typeof clientScoreRefined === "number" ? clientScoreRefined : null;
    let canonicalReadinessState: "baseline" | "refined" | "awaiting" | null =
      clientReadinessState ?? null;
    let canonicalRefinedContribution: number | null =
      typeof clientRefinedContribution === "number"
        ? clientRefinedContribution
        : null;
    let canonicalScoreSource: "incoming" | "preserved_existing_mrs" =
      "incoming";
    let assessmentContext: Readonly<AssessmentContext> | null = null;
    let assessmentSignalPillsPayload: any[] | null = null;
    let assessmentPromptSection = "";
    // Load Shape produced by the dry-run composeDailyContext below. Held so
    // the single real snapshot write can persist it (write gate only; the
    // render gate stays independent).
    let composedLoadShape: import("../_shared/load-shape/types.ts").LoadShape | null = null;
    let composedPatternSignals: {
      hrv_3day_trend: "improving" | "stable" | "declining" | "unknown";
      consecutive_high_load_days: number;
      dow_historical_pattern: {
        typical_hrv_for_dow: number | null;
        typical_load_for_dow: "low" | "medium" | "high" | null;
        samples: number;
      };
      sustained_deficit_flag: boolean;
      hrv_low_high_demand_cooccurrence_7d?: {
        cooccurrence_count: number;
        cooccurrence_ratio: number | null;
        days_observed: number;
      };
    } | null = null;
    let protectionGoals: string[] = [];
    let hrv3dTrend: "improving" | "stable" | "declining" | "unknown" =
      "unknown";
    let consecutiveHighLoadDays = 0;
    let sustainedDeficitFlag = false;
    let cooccurrence7d: {
      cooccurrence_count: number;
      cooccurrence_ratio: number | null;
      days_observed: number;
    } = { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 };
    let typicalLoadForDow: "low" | "medium" | "high" | null = null;
    let hasTodayCheckIn = false;
    let hasFreshWearable = false;
    let hasCalendarSignal = false;
    let hasCalendarConnected = false;
    const assessmentBandValence: ReadinessValence | null = (() => {
      const s = typeof innerReadinessScore === "number"
        ? Math.max(0, Math.min(100, Math.round(innerReadinessScore)))
        : null;
      if (s == null) return null;
      if (s < 50) return "low";
      if (s < 65) return "mid";
      return "high";
    })();

    // ── HR / RHR live-freshness gate ─────────────────────────────────────
    // HR and RHR are real-time metrics and must never appear as "live" if
    // the underlying sample is older than ~24h. HRV / sleep retain the
    // existing tolerance because they are inherently overnight-aggregated.
    if (wearableSourceAgeDays !== null && wearableSourceAgeDays > 1) {
      if (hrValue !== null || rhrValue !== null) {
        console.log(
          "[compute-outer-readiness] HR/RHR stale gate: nullifying live values",
          {
            ageDays: wearableSourceAgeDays,
            sourceRowDate,
          },
        );
      }
      hrValue = null;
      rhrValue = null;
    }
    const hasHistoricalData = wearableDaysConnected !== null &&
      wearableDaysConnected >= 7;
    try {
      if (hasWearable) {
        const thirtyDaysAgo =
          new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const { data: baseline } = await db
          .from("wearable_data")
          .select(
            "hrv, sleep_score, resting_heart_rate, heart_rate, total_sleep_minutes, source, source_provider, source_apps, summary_date",
          )
          .eq("user_id", userId)
          .gte("summary_date", thirtyDaysAgo)
          .order("summary_date", { ascending: false })
          .limit(30);
        if (baseline && baseline.length >= 3) {
          // HRV baseline
          const hrvRows = baseline.filter((r: any) =>
            r.hrv != null && r.hrv > 0
          );
          if (hrvRows.length >= 3) {
            const avgHRV = hrvRows.reduce((s: number, r: any) => s + r.hrv, 0) /
              hrvRows.length;
            hrvBaseline = Math.round(avgHRV);
            if (hrvValue) {
              hrvDeviation = Math.round(((hrvValue - avgHRV) / avgHRV) * 100);
            }
          }

          // Sleep baseline: prefer sleep_score, fallback to duration
          const sleepScoreRows = baseline.filter((r: any) =>
            r.sleep_score != null && r.sleep_score > 0
          );
          if (sleepScoreRows.length >= 3 && sleepScoreVal != null) {
            const avgSleep = sleepScoreRows.reduce((s: number, r: any) =>
              s + r.sleep_score, 0) / sleepScoreRows.length;
            sleepBaseline = Math.round(avgSleep);
            sleepDeviation = Math.round(
              ((sleepScoreVal - avgSleep) / avgSleep) * 100,
            );
          } else if (sleepDuration != null) {
            // Duration-based fallback (Apple Health)
            const durRows = baseline.filter((r: any) =>
              r.total_sleep_minutes != null && r.total_sleep_minutes > 0
            );
            if (durRows.length >= 3) {
              const avgDur = durRows.reduce((s: number, r: any) => {
                const raw = r.total_sleep_minutes;
                return s +
                  (isAppleMetricSource("total_sleep_minutes", r)
                    ? raw * 0.85
                    : raw);
              }, 0) / durRows.length;
              sleepBaseline = Math.round(avgDur);
              sleepDeviation = Math.round(
                ((sleepDuration - avgDur) / avgDur) * 100,
              );
            }
          }

          // RHR baseline (deviation-based, replacing absolute thresholds)
          const rhrRows = baseline.filter((r: any) =>
            r.resting_heart_rate != null && r.resting_heart_rate > 0
          );
          if (rhrRows.length >= 3 && rhrValue != null) {
            const avgRHR = rhrRows.reduce((s: number, r: any) =>
              s + r.resting_heart_rate, 0) / rhrRows.length;
            rhrBaseline = Math.round(avgRHR);
            rhrDeviation = Math.round(((rhrValue - avgRHR) / avgRHR) * 100);
            // Update wearableContext with deviation-based rhrElevated
            if (wearableContext) {
              wearableContext.rhrElevated = rhrDeviation > 10;
            }
          }

          // RHR 3-day trend: feed the trailing rhr samples (date + value)
          // into the shared pattern-engine helper. Returns 'unknown' when
          // < 4 valid days — null-safe.
          rhr3dTrend = computeRhr3DayTrend(
            (baseline as any[]).map((r) => ({
              date: r.summary_date,
              rhr: r.resting_heart_rate,
            })),
          );

          // HR baseline (real average daily HR — preferred over HRV-derived proxy)
          const hrRows = baseline.filter((r: any) =>
            r.heart_rate != null && r.heart_rate > 0
          );
          if (hrRows.length >= 3 && hrValue != null) {
            const avgHR = hrRows.reduce((s: number, r: any) =>
              s + r.heart_rate, 0) / hrRows.length;
            hrBaseline = Math.round(avgHR);
            hrDeviation = Math.round(((hrValue - avgHR) / avgHR) * 100);
          }

          // Refine hrElevated from HRV baseline deviation (>25% below = sympathetic dominance)
          // Prefer real HR deviation when available; fall back to HRV-derived proxy.
          if (wearableContext && hrValue != null && hrDeviation != null) {
            wearableContext.hrElevated = hrDeviation > 10;
          } else if (wearableContext && hrvBaseline && hrvValue != null) {
            const hrvPctBelow = ((hrvBaseline - hrvValue) / hrvBaseline) * 100;
            wearableContext.hrElevated = hrvPctBelow > 25;
          }
        }
      }
    } catch (e) {
      console.error("[compute-outer-readiness] baseline deviation error:", e);
    }

    // checkInCountTotal already queried above (before getLeanOnWatchFor)

    // Consecutive low confidence days
    let consecutiveLowConfidence = 0;
    try {
      const { data: recentConf } = await db
        .from("daily_checkins")
        .select("confidence_level")
        .eq("user_id", userId)
        .order("checkin_date", { ascending: false })
        .limit(10);
      if (recentConf) {
        for (const c of recentConf) {
          if (
            (c as any).confidence_level != null &&
            (c as any).confidence_level <= 2
          ) consecutiveLowConfidence++;
          else break;
        }
      }
    } catch (e) {
      console.error("[compute-outer-readiness] consec confidence error:", e);
    }

    // Consecutive low clarity days
    let consecutiveLowClarity = 0;
    try {
      const { data: recentClarity } = await db
        .from("daily_checkins")
        .select("clarity_level")
        .eq("user_id", userId)
        .order("checkin_date", { ascending: false })
        .limit(10);
      if (recentClarity) {
        for (const c of recentClarity) {
          if (
            (c as any).clarity_level != null && (c as any).clarity_level <= 2
          ) consecutiveLowClarity++;
          else break;
        }
      }
    } catch (e) {
      console.error("[compute-outer-readiness] consec clarity error:", e);
    }

    // Next high-stakes event inside its shared JIT lead-time window.
    let nextHighStakesEvent: {
      title: string;
      minutesUntil: number;
      startTimeUTC: string;
      localHHmm?: string;
    } | null = null;
    try {
      const now = new Date();
      const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60000);
      if (todayHighStakes.length > 0) {
        // Re-check calendar events for timing, then keep only events whose
        // remaining minutes fall inside the subtype's declared JIT lead-time
        // window. This lets Board / investor / strategy events surface
        // earlier than the old hard-coded 90 minute cap.
        const { data: upcoming } = await db
          .from("primary_calendar_events")
          .select(
            "title, start_time, end_time, attendees_count, is_organizer, is_recurring",
          )
          .eq("user_id", userId)
          .gte("start_time", now.toISOString())
          .lte("start_time", twentyFourHoursLater.toISOString())
          .order("start_time", { ascending: true })
          .limit(20);
        const mergedUpcoming = mergeCalendarEvents(
          (upcoming || []) as any[],
          platform,
        );
        logMergeStats(
          "brief.upcoming-24h",
          (upcoming || []).length,
          mergedUpcoming as any,
          { userId },
        );
        if (mergedUpcoming.length > 0) {
          // Restrict to the day's high-stakes set, then let selectLeadEvent rank
          // by canonical stakesScore (Board > Leadership 1:1) — chronological
          // tie-break only when stakes are equal. Shared event subtype lead-time
          // governs whether a given event is "live" for the brief yet.
          const candidates = mergedUpcoming.filter((ev: any) => {
            if (!todayHighStakes.includes(ev.title)) return false;
            const minsUntil = Math.round(
              (new Date(ev.start_time).getTime() - now.getTime()) / 60000,
            );
            const leadTimeMin = enrichEvent({
              title: ev.title,
              startTime: ev.start_time,
              endTime: ev.end_time,
            }).leadTimeMin ?? 90;
            return minsUntil >= 0 && minsUntil <= leadTimeMin;
          });
          const lead = selectLeadEvent(candidates as any);
          if (lead) {
            const mins = Math.round(
              (new Date(lead.event.start_time).getTime() - now.getTime()) /
                60000,
            );
            nextHighStakesEvent = {
              title: lead.event.title as string,
              minutesUntil: mins,
              startTimeUTC: new Date(lead.event.start_time).toISOString(),
            };
          }
        }
      }
    } catch (e) {
      console.error("[compute-outer-readiness] next HS event error:", e);
    }

    // ═══ LLM SYNTHESIS ═══
    let llmBrief: LlmBriefPackage | null = null;
    // v6.6 — spec-compliant deterministic fallback (built AFTER all LLM
    // attempts fail, only when real signals exist). Populated inside the
    // LLM block where all in-scope variables are visible, read further
    // down by the briefSource / responsePhrase / responseBody logic.
    let deterministicBrief: DeterministicBriefResult | null = null;
    let llmFallbackReason: string | null = null;
    // Per-attempt diagnostic records persisted on every brief_snapshots write.
    // Replaces the prior hard-coded `llm_attempts: null`. Each record:
    //   { model, attempt, durationMs, outcome, rawReason, httpStatus, errorMessageHead }
    // outcome ∈ { success | timeout | parse_error | validator_reject | http_error | error }
    const llmAttemptRecords: Array<Record<string, unknown>> = [];
    const llmValidatorRejections: Array<Record<string, unknown>> = [];
    let materialTravelContextActive = false;
    let materialWorkEventTitles: string[] = [];
    const MATERIAL_TRAVEL_BODY_RX =
      /\b(travel|flight|long[- ]haul|circadian|airport|departure|arrival|landing|jet lag|body\/timing|timing load)\b/i;
    const dataCompleteness = checkInCountTotal === 0
      ? "day1"
      : checkInCountTotal <= 6
      ? "early"
      : checkInCountTotal <= 30
      ? "developing"
      : "established";

    // ── Additional enrichment data for the upgraded LLM prompt ──
    let yesterdayScore: number | null = null;
    let scoreTrend: string | null = null;
    let hasBackToBack = false;
    let longestBackToBackHrs: number | null = null;
    let nextEventAny: {
      title: string;
      minutesUntil: number;
      startTimeUTC: string;
      localHHmm?: string;
    } | null = null;
    // Per-event local HH:mm strings paired with each TODAY high-stakes title
    // (same indexes as todayHighStakes). Lets the prompt emit a paired clock
    // time so the LLM never invents or rounds it.
    let todayHighStakesEventTimes: string[] = [];
    let todayHighStakesCategories: string[] = [];
    let practicesCompletedThisWeek = 0;
    let practiceCompletionRate = 0;
    let daysSinceCoachSession: number | null = null;
    let coachSessionImpactDelta: number | null = null;
    let avgScore7d: number | null = null;
    // scoreTrajectory7d, typicalDOWOutcome already declared above (before getLeanOnWatchFor)
    let wearableTrend7d: string | null = null;
    let typicalDOWScore: number | null = null;
    let frictionTrend: string | null = null;
    let dominantOutcome7d: string | null = null;
    let pendingCommitment: string | null = null;
    let recentPattern: string | null = null;
    let divergenceMode: string | null = null;
    let isPublicHoliday = false;
    let holidayName: string | null = null;
    let isDayBeforeRestDay = false;
    let tomorrowFirstEventTime: string | null = null;
    let tomorrowVsTodayLoad: string | null = null;
    let tomorrowHighStakesTitles: string[] = [];
    // Per-event time strings paired with each high-stakes title (same indexes as
    // tomorrowHighStakesTitles). Allows the prompt to emit "14:30 — Intro Call …"
    // structured pairs instead of two free-floating lines the LLM can mis-glue.
    let tomorrowHighStakesEventTimes: string[] = [];
    let tomorrowHighStakesCategories: string[] = [];
    let tomorrowFirstMeetingPair: string | null = null; // e.g. "14:30, Intro Call …"
    // Effective IANA timezone strings — resolved in the holiday block below
    // from request body / profiles columns; nullable when neither is available.
    let effectiveCurrentTz: string | null = null;
    let effectiveHomeTz: string | null = null;
    let weekAheadShape: Record<string, unknown> | null = null;
    // hrvEventCorrelation already declared above (before getLeanOnWatchFor)
    let mostEffectivePractice: string | null = null;
    let stateShiftToday = false;
    let stateShiftDirection: string | null = null;

    // ═══ BRIEF SNAPSHOT CACHE: hoisted declarations ═══
    // These must live in the outer handler scope so the response-assembly block
    // (line ~3846) can read them. Previously declared inside the
    // `if (dataCompleteness !== 'day1')` block, which caused a ReferenceError
    // on every request and blanked the dashboard with "NOT YET ASSESSED".
    let cachedSnapshot: {
      phrase: string | null;
      body_text: string | null;
      lean_on: string | null;
      lean_on_source: string | null;
      watch_for: string | null;
      watch_for_source: string | null;
      brief_source: "llm" | "deterministic" | "awaiting";
      driver: string | null;
    } | null = null;
    let inputSignature = "no-sig";

    // ═══ Shared-module snapshot (Brief ⇄ Plan parity) ═══
    // Computed inside the LLM branch using the shared CEO behaviour,
    // event taxonomy, and M/A/E window-context modules. Stamped onto
    // brief_snapshots.payload_json.behaviour_snapshot so generate-mastery-plan
    // can read the SAME named events / stakes / slot boosts the Brief used.
    let briefBehaviourSnapshot: BehaviourSnapshotResult | null = null;
    // Day shape derived from the snapshot below (holiday / PTO / travel type /
    // conference). Declared here so the prompt scope can read it.
    let briefDayShape: DayShape | null = null;
    let briefTravelPhase: TravelPhase = null;
    // Part 1A — the single resolved narrative (family + anchor + phase +
    // depletion) shared by the LLM prompt, the deterministic renderer, and
    // the Plan parity check.
    let briefLeadNarrative: LeadNarrative | null = null;
    let briefWindowContext: ReturnType<typeof buildWindowContext> | null = null;


    if (dataCompleteness !== "day1") {
      // ── Detect state shift from earlier code (lines 2094-2111 computed todayCheckins) ──
      {
        const today2 = new Date().toISOString().split("T")[0];
        const todayCheckins2 = recentCheckIns.filter((c: any) =>
          c.checkin_date === today2
        );
        if (todayCheckins2.length >= 2) {
          const latestEB = todayCheckins2[0].energy_balance ?? 50;
          const prevEB = todayCheckins2[1].energy_balance ?? 50;
          const delta = latestEB - prevEB;
          if (Math.abs(delta) >= 15) {
            stateShiftToday = true;
            stateShiftDirection = delta > 0 ? "improving" : "declining";
          }
        }
      }

      // ── Wearable divergence mode ──
      if (wearableContext && checkInOutcome) {
        const positiveStates = [
          "thriving",
          "steady",
          "focused",
          "energised",
          "confident",
        ];
        const negativeStates = [
          "drained",
          "scattered",
          "overwhelmed",
          "struggling",
          "depleted",
        ];
        const feltPositive = positiveStates.includes(checkInOutcome);
        const feltNegative = negativeStates.includes(checkInOutcome);
        const wearableStrained = wearableContext.hrvElevated ||
          wearableContext.poorSleep || wearableContext.rhrElevated;
        const wearableGood = !wearableContext.hrvElevated &&
          !wearableContext.poorSleep && !wearableContext.rhrElevated &&
          (wearableContext.sleepScore
            ? wearableContext.sleepScore >= 75
            : true);
        if (feltPositive && wearableStrained) divergenceMode = "MASKED_HIGH";
        else if (feltNegative && wearableGood) {
          divergenceMode = "RECOVERY_UNDERWAY";
        } else divergenceMode = "ALIGNED";
      }

      // ── Static holiday lookup (UK/US/UAE/SG/AU 2025-2026) ──
      const HOLIDAYS: Record<string, Array<{ date: string; name: string }>> = {
        "GB": [
          { date: "2025-01-01", name: "New Year's Day" },
          { date: "2025-04-18", name: "Good Friday" },
          { date: "2025-04-21", name: "Easter Monday" },
          { date: "2025-05-05", name: "Early May Bank Holiday" },
          { date: "2025-05-26", name: "Spring Bank Holiday" },
          { date: "2025-08-25", name: "Summer Bank Holiday" },
          { date: "2025-12-25", name: "Christmas Day" },
          { date: "2025-12-26", name: "Boxing Day" },
          { date: "2026-01-01", name: "New Year's Day" },
          { date: "2026-04-03", name: "Good Friday" },
          { date: "2026-04-06", name: "Easter Monday" },
          { date: "2026-05-04", name: "Early May Bank Holiday" },
          { date: "2026-05-25", name: "Spring Bank Holiday" },
          { date: "2026-08-31", name: "Summer Bank Holiday" },
          { date: "2026-12-25", name: "Christmas Day" },
          { date: "2026-12-28", name: "Boxing Day (substitute)" },
        ],
        "US": [
          { date: "2025-01-01", name: "New Year's Day" },
          { date: "2025-01-20", name: "MLK Day" },
          { date: "2025-02-17", name: "Presidents' Day" },
          { date: "2025-05-26", name: "Memorial Day" },
          { date: "2025-07-04", name: "Independence Day" },
          { date: "2025-09-01", name: "Labor Day" },
          { date: "2025-11-27", name: "Thanksgiving" },
          { date: "2025-12-25", name: "Christmas Day" },
          { date: "2026-01-01", name: "New Year's Day" },
          { date: "2026-01-19", name: "MLK Day" },
          { date: "2026-05-25", name: "Memorial Day" },
          { date: "2026-07-03", name: "Independence Day (observed)" },
          { date: "2026-09-07", name: "Labor Day" },
          { date: "2026-11-26", name: "Thanksgiving" },
          { date: "2026-12-25", name: "Christmas Day" },
        ],
        "AE": [
          { date: "2025-01-01", name: "New Year's Day" },
          { date: "2025-03-30", name: "Eid al-Fitr" },
          { date: "2025-03-31", name: "Eid al-Fitr" },
          { date: "2025-06-06", name: "Eid al-Adha" },
          { date: "2025-06-07", name: "Eid al-Adha" },
          { date: "2025-12-02", name: "National Day" },
          { date: "2025-12-03", name: "National Day" },
          { date: "2026-01-01", name: "New Year's Day" },
          { date: "2026-03-20", name: "Eid al-Fitr" },
          { date: "2026-05-27", name: "Eid al-Adha" },
          { date: "2026-12-02", name: "National Day" },
        ],
        "SG": [
          { date: "2025-01-01", name: "New Year's Day" },
          { date: "2025-01-29", name: "Chinese New Year" },
          { date: "2025-01-30", name: "Chinese New Year" },
          { date: "2025-04-18", name: "Good Friday" },
          { date: "2025-05-01", name: "Labour Day" },
          { date: "2025-05-12", name: "Vesak Day" },
          { date: "2025-06-07", name: "Hari Raya Haji" },
          { date: "2025-08-09", name: "National Day" },
          { date: "2025-10-20", name: "Deepavali" },
          { date: "2025-12-25", name: "Christmas Day" },
          { date: "2026-01-01", name: "New Year's Day" },
          { date: "2026-02-17", name: "Chinese New Year" },
          { date: "2026-02-18", name: "Chinese New Year" },
          { date: "2026-04-03", name: "Good Friday" },
          { date: "2026-05-01", name: "Labour Day" },
          { date: "2026-08-09", name: "National Day" },
          { date: "2026-12-25", name: "Christmas Day" },
        ],
        "AU": [
          { date: "2025-01-01", name: "New Year's Day" },
          { date: "2025-01-27", name: "Australia Day" },
          { date: "2025-04-18", name: "Good Friday" },
          { date: "2025-04-21", name: "Easter Monday" },
          { date: "2025-04-25", name: "ANZAC Day" },
          { date: "2025-12-25", name: "Christmas Day" },
          { date: "2025-12-26", name: "Boxing Day" },
          { date: "2026-01-01", name: "New Year's Day" },
          { date: "2026-01-26", name: "Australia Day" },
          { date: "2026-04-03", name: "Good Friday" },
          { date: "2026-04-06", name: "Easter Monday" },
          { date: "2026-04-25", name: "ANZAC Day" },
          { date: "2026-12-25", name: "Christmas Day" },
          { date: "2026-12-28", name: "Boxing Day (substitute)" },
        ],
      };

      // Country is derived from timezone via the shared canonical map
      // (`_shared/plan/tz-to-country.ts`).
      try {
        // Read persisted IANA zones (added in 2026-04 migration). Fall back to
        // values sent in the request body if the columns aren't populated yet.
        const { data: profileTz } = await db
          .from("profiles")
          .select("home_timezone, current_timezone")
          .eq("id", userId)
          .maybeSingle();
        const persistedCurrentTz = (profileTz as any)?.current_timezone || null;
        const persistedHomeTz = (profileTz as any)?.home_timezone || null;
        // Effective zones: client-provided wins (most up-to-date for travelers),
        // then persisted profile, then nothing.
        effectiveCurrentTz = clientCurrentTz || persistedCurrentTz || null;
        effectiveHomeTz = clientHomeTz || persistedHomeTz ||
          effectiveCurrentTz || null;
        // Derive country from CURRENT zone first (where the user is now), then
        // fall back to home zone for holidays — a UK user travelling in the US
        // is more relevantly subject to US holidays than UK ones.
        // Weekend and planning day always derive from HOME country (D1).
        // A UK user in Dubai keeps a Saturday-Sunday weekend — their planning cycle
        // does not change because they are travelling.
        // currentLocationCountry is kept separately for public holiday lookups only.
        const profileHomeCountry = leaderProfile?.preferences?.home_country ?? null;
        const homeTzCountry = tzToCountry(effectiveHomeTz);
        localeWeekendHomeCountry = profileHomeCountry ?? homeTzCountry;
        const currentLocationCountry = tzToCountry(effectiveCurrentTz) ?? homeTzCountry;
        const localDate = userTime.toISOString().split("T")[0];
        const tomorrowDate =
          new Date(userTime.getTime() + 86400000).toISOString().split("T")[0];

        if (currentLocationCountry && HOLIDAYS[currentLocationCountry]) {
          const todayHol = HOLIDAYS[currentLocationCountry].find((h) =>
            h.date === localDate
          );
          if (todayHol) {
            isPublicHoliday = true;
            holidayName = todayHol.name;
          }
          const tomorrowHol = HOLIDAYS[currentLocationCountry].find((h) =>
            h.date === tomorrowDate
          );
          if (tomorrowHol) isDayBeforeRestDay = true;
        }
      } catch (e) { /* ignore holiday lookup failure */ }

      // Locale-aware "day before rest" for downstream brief framing.
      const localeRecoveryDay = briefRecoveryDay(localeWeekendHomeCountry);
      const localeDayBeforeRest = (localeRecoveryDay + 6) % 7;
      if (dayOfWeek === localeDayBeforeRest) isDayBeforeRestDay = true;

      // Check for personal holiday/OOO in tomorrow's calendar
      if (tomorrowResult && tomorrowResult.state === "active") {
        try {
          const oooPatterns =
            /\b(holiday|ooo|pto|leave|day\s*off|vacation|annual\s*leave|out\s*of\s*office)\b/i;
          const tomorrowDateObj = new Date(userTime.getTime() + 86400000);
          const tStart = new Date(
            Date.UTC(
              tomorrowDateObj.getUTCFullYear(),
              tomorrowDateObj.getUTCMonth(),
              tomorrowDateObj.getUTCDate(),
              0,
              0,
              0,
            ),
          );
          const tEnd = new Date(
            Date.UTC(
              tomorrowDateObj.getUTCFullYear(),
              tomorrowDateObj.getUTCMonth(),
              tomorrowDateObj.getUTCDate(),
              23,
              59,
              59,
            ),
          );
          const tStartUTC = new Date(tStart.getTime() + timezoneOffset * 60000);
          const tEndUTC = new Date(tEnd.getTime() + timezoneOffset * 60000);
          const { data: tomorrowEvents } = await db
            .from("primary_calendar_events")
            .select("title, start_time, end_time")
            .eq("user_id", userId)
            .gte("start_time", tStartUTC.toISOString())
            .lte("start_time", tEndUTC.toISOString());
          const mergedTomorrowEvents = mergeCalendarEvents(
            (tomorrowEvents || []) as any[],
            platform,
          );
          if (mergedTomorrowEvents.length > 0) {
            for (const ev of mergedTomorrowEvents) {
              const dur = (new Date(ev.end_time).getTime() -
                new Date(ev.start_time).getTime()) / 3600000;
              if (dur >= 4 && ev.title && oooPatterns.test(ev.title)) {
                isDayBeforeRestDay = true;
                break;
              }
            }
          }
        } catch (e) { /* ignore */ }
      }

      // ── Parallel enrichment queries ──
      try {
        const nowISO = new Date().toISOString();
        const yesterdayDate =
          new Date(Date.now() - 86400000).toISOString().split("T")[0];
        const sevenAgo =
          new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const fourteenAgo =
          new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
        const thirtyAgo =
          new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];

        const [
          yesterdayRes,
          nextEventRes,
          practicesRes,
          coachSessionRes,
          wearable7dRes,
          dowCheckinsRes,
          commitmentRes,
          patternRes,
          effectivePracticeRes,
          recentCheckinsRes,
        ] = await Promise.all([
          // 1. Yesterday's score
          Promise.resolve(
            db.from("daily_checkins").select("energy_balance").eq(
              "user_id",
              userId,
            ).eq("checkin_date", yesterdayDate).order("created_at", {
              ascending: false,
            }).limit(1).maybeSingle(),
          ).then((r) => r, () => ({ data: null })),
          // 3. Next event (any)
          Promise.resolve(
            db.from("primary_calendar_events").select("title, start_time").eq(
              "user_id",
              userId,
            ).gt("start_time", nowISO).order("start_time", { ascending: true })
              .limit(10),
          ).then((r) => r, () => ({ data: null })),
          // 4. Practice completion this week
          Promise.resolve(
            db.from("sanctuary_events").select("id, content_id").eq(
              "user_id",
              userId,
            ).eq("event_type", "completed").gte("created_at", sevenAgo),
          ).then((r) => r, () => ({ data: null })),
          // 5. Coach session recency
          Promise.resolve(
            db.from("coach_session_summaries").select(
              "created_at, session_id, user_id",
            ).eq("user_id", userId).order("created_at", { ascending: false })
              .limit(1).maybeSingle(),
          ).then((r) => r, () => ({ data: null })),
          // 7. Wearable trend (7d)
          hasWearable
            ? Promise.resolve(
              db.from("wearable_data").select("hrv, summary_date").eq(
                "user_id",
                userId,
              ).gte("summary_date", sevenAgo).order("summary_date", {
                ascending: true,
              }).limit(7),
            ).then((r) => r, () => ({ data: null }))
            : Promise.resolve({ data: null }),
          // 8. DOW checkins (60 days)
          Promise.resolve(
            db.from("daily_checkins").select(
              "outcome, energy_balance, checkin_date",
            ).eq("user_id", userId).gte(
              "checkin_date",
              new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0],
            ),
          ).then((r) => r, () => ({ data: null })),
          // Pending commitment
          Promise.resolve(
            db.from("coach_accountability_tracker").select("commitment_text")
              .eq("user_id", userId).eq("status", "pending").order(
                "created_at",
                { ascending: false },
              ).limit(1).maybeSingle(),
          ).then((r) => r, () => ({ data: null })),
          // Recent pattern
          Promise.resolve(
            db.from("coach_pattern_observations").select("pattern_description")
              .eq("user_id", userId).eq("is_active", true).gte(
                "last_observed_at",
                new Date(Date.now() - 7 * 86400000).toISOString(),
              ).order("observation_count", { ascending: false }).limit(1)
              .maybeSingle(),
          ).then((r) => r, () => ({ data: null })),
          // Most effective practice
          Promise.resolve(
            db.from("sanctuary_events").select(
              "content_id, effectiveness_rating",
            ).eq("user_id", userId).not("effectiveness_rating", "is", null)
              .order("effectiveness_rating", { ascending: false }).limit(10),
          ).then((r) => r, () => ({ data: null })),
          // 14-day checkins for friction trend
          Promise.resolve(
            db.from("daily_checkins").select(
              "outcome, checkin_date, energy_balance",
            ).eq("user_id", userId).gte("checkin_date", fourteenAgo).order(
              "checkin_date",
              { ascending: false },
            ),
          ).then((r) => r, () => ({ data: null })),
        ]);

        // 1. Yesterday score + trend
        if (yesterdayRes.data) {
          yesterdayScore = (yesterdayRes.data as any).energy_balance ?? null;
          if (yesterdayScore != null) {
            if (typeof innerReadinessScore === "number") {
              const delta = innerReadinessScore - yesterdayScore;
              scoreTrend = delta > 5
                ? "improving"
                : delta < -5
                ? "declining"
                : "stable";
            }
          }
        }

        // 2. Back-to-back detection (from calendarResult events — re-query sorted events)
        try {
          if (
            calendarResult.state === "active" && calendarResult.eventCount > 1
          ) {
            const userNow2 = new Date(
              new Date().getTime() - timezoneOffset * 60000,
            );
            const dayStart = new Date(
              Date.UTC(
                userNow2.getUTCFullYear(),
                userNow2.getUTCMonth(),
                userNow2.getUTCDate(),
                0,
                0,
                0,
              ),
            );
            const dayEnd = new Date(
              Date.UTC(
                userNow2.getUTCFullYear(),
                userNow2.getUTCMonth(),
                userNow2.getUTCDate(),
                23,
                59,
                59,
              ),
            );
            const startUTC2 = new Date(
              dayStart.getTime() + timezoneOffset * 60000,
            );
            const endUTC2 = new Date(dayEnd.getTime() + timezoneOffset * 60000);
            const { data: sortedEvts } = await db
              .from("primary_calendar_events")
              .select("start_time, end_time, title")
              .eq("user_id", userId)
              .gte("start_time", startUTC2.toISOString())
              .lte("start_time", endUTC2.toISOString())
              .order("start_time", { ascending: true });
            const mergedSortedEvts = mergeCalendarEvents(
              (sortedEvts || []) as any[],
              platform,
            );
            if (mergedSortedEvts.length > 1) {
              let maxBlock = 0;
              let currentBlock = 0;
              for (let i = 0; i < mergedSortedEvts.length - 1; i++) {
                const gap =
                  (new Date(mergedSortedEvts[i + 1].start_time).getTime() -
                    new Date(mergedSortedEvts[i].end_time).getTime()) / 60000;
                if (gap < 10) {
                  if (currentBlock === 0) {
                    currentBlock =
                      (new Date(mergedSortedEvts[i].end_time).getTime() -
                        new Date(mergedSortedEvts[i].start_time).getTime()) /
                      3600000;
                  }
                  currentBlock +=
                    (new Date(mergedSortedEvts[i + 1].end_time).getTime() -
                      new Date(mergedSortedEvts[i + 1].start_time).getTime()) /
                    3600000;
                  hasBackToBack = true;
                } else {
                  if (currentBlock > maxBlock) maxBlock = currentBlock;
                  currentBlock = 0;
                }
              }
              if (currentBlock > maxBlock) maxBlock = currentBlock;
              if (maxBlock > 0) {
                longestBackToBackHrs = Math.round(maxBlock * 10) / 10;
              }
            }
          }
        } catch (e) { /* ignore */ }

        // 3. Next event (any)
        if (nextEventRes.data) {
          const ev = mergeCalendarEvents(
            (nextEventRes.data || []) as any[],
            platform,
          )[0];
          if (ev) {
            const mins = Math.round(
              (new Date(ev.start_time).getTime() - Date.now()) / 60000,
            );
            if (mins > 0 && mins < 720) {
              nextEventAny = {
                title: ev.title || "Untitled",
                minutesUntil: mins,
                startTimeUTC: new Date(ev.start_time).toISOString(),
              };
            }
          }
        }

        // 4. Practices this week
        if (practicesRes.data) {
          practicesCompletedThisWeek = (practicesRes.data as any[]).length;
          practiceCompletionRate = Math.round(
            (practicesCompletedThisWeek / 7) * 100,
          );
        }

        // 5. Coach session recency + impact
        if (coachSessionRes.data) {
          const sessionDate = new Date(
            (coachSessionRes.data as any).created_at,
          );
          daysSinceCoachSession = Math.floor(
            (Date.now() - sessionDate.getTime()) / 86400000,
          );
          // Impact: compare day-of-session vs next-day check-in
          try {
            const sessionDateStr = sessionDate.toISOString().split("T")[0];
            const nextDayStr =
              new Date(sessionDate.getTime() + 86400000).toISOString().split(
                "T",
              )[0];
            const [{ data: sessionDay }, { data: nextDay }] = await Promise.all(
              [
                db.from("daily_checkins").select("energy_balance").eq(
                  "user_id",
                  userId,
                ).eq("checkin_date", sessionDateStr).order("created_at", {
                  ascending: false,
                }).limit(1).maybeSingle(),
                db.from("daily_checkins").select("energy_balance").eq(
                  "user_id",
                  userId,
                ).eq("checkin_date", nextDayStr).order("created_at", {
                  ascending: false,
                }).limit(1).maybeSingle(),
              ],
            );
            if (
              sessionDay?.energy_balance != null &&
              nextDay?.energy_balance != null
            ) {
              coachSessionImpactDelta = nextDay.energy_balance -
                sessionDay.energy_balance;
            }
          } catch (e) { /* ignore */ }
        }

        // 6. 7-day avg + trajectory from recentCheckIns
        if (recentCheckIns.length >= 2) {
          const scores = recentCheckIns.filter((c: any) =>
            c.energy_balance != null
          ).map((c: any) => c.energy_balance as number);
          if (scores.length >= 2) {
            avgScore7d = Math.round(
              scores.reduce((s, v) => s + v, 0) / scores.length,
            );
            const mid = Math.floor(scores.length / 2);
            const firstHalf = scores.slice(mid); // older (recentCheckIns is desc)
            const secondHalf = scores.slice(0, mid); // newer
            const avgFirst = firstHalf.reduce((s, v) => s + v, 0) /
              firstHalf.length;
            const avgSecond = secondHalf.reduce((s, v) => s + v, 0) /
              secondHalf.length;
            const diff = avgSecond - avgFirst;
            scoreTrajectory7d = diff > 5
              ? "improving"
              : diff < -5
              ? "declining"
              : "stable";
          }
        }

        // 7. Wearable trend (7d)
        if (wearable7dRes.data && (wearable7dRes.data as any[]).length >= 4) {
          const rows = (wearable7dRes.data as any[]).filter((r) =>
            r.hrv != null
          );
          if (rows.length >= 4) {
            const mid = Math.floor(rows.length / 2);
            const first = rows.slice(0, mid);
            const second = rows.slice(mid);
            const avgFirst = first.reduce((s: number, r: any) => s + r.hrv, 0) /
              first.length;
            const avgSecond = second.reduce((s: number, r: any) =>
              s + r.hrv, 0) / second.length;
            const diff = ((avgSecond - avgFirst) / avgFirst) * 100;
            wearableTrend7d = diff > 10
              ? "improving"
              : diff < -10
              ? "declining"
              : "stable";
          }
        }

        // 8. DOW typical outcome + score
        if (dowCheckinsRes.data && (dowCheckinsRes.data as any[]).length >= 4) {
          const allDow = dowCheckinsRes.data as any[];
          const sameDow = allDow.filter((c: any) => {
            const d = new Date(c.checkin_date + "T00:00:00");
            return d.getDay() === dayOfWeek;
          });
          if (sameDow.length >= 4) {
            const counts: Record<string, number> = {};
            for (const c of sameDow) {
              counts[c.outcome] = (counts[c.outcome] || 0) + 1;
            }
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (top) typicalDOWOutcome = top[0];
            const dowScores = sameDow.filter((c: any) =>
              c.energy_balance != null
            ).map((c: any) => c.energy_balance as number);
            if (dowScores.length >= 4) {
              typicalDOWScore = Math.round(
                dowScores.reduce((s, v) => s + v, 0) / dowScores.length,
              );
            }
          }
        }

        // Friction trend + dominant outcome 7d
        if (recentCheckinsRes.data) {
          const allCheckins = recentCheckinsRes.data as any[];
          const frictionOutcomes = ["drained", "scattered", "overwhelmed"];
          const recent7 = allCheckins.filter((c) => c.checkin_date >= sevenAgo);
          const prev7 = allCheckins.filter((c) => c.checkin_date < sevenAgo);
          const recentFriction = recent7.filter((c) =>
            frictionOutcomes.includes(c.outcome)
          ).length;
          const prevFriction = prev7.filter((c) =>
            frictionOutcomes.includes(c.outcome)
          ).length;
          if (prev7.length > 0) {
            const diff = (recentFriction / Math.max(recent7.length, 1)) -
              (prevFriction / Math.max(prev7.length, 1));
            frictionTrend = diff < -0.1
              ? "improving"
              : diff > 0.1
              ? "declining"
              : "stable";
          }
          const counts7: Record<string, number> = {};
          for (const c of recent7) {
            counts7[c.outcome] = (counts7[c.outcome] || 0) + 1;
          }
          const topOutcome = Object.entries(counts7).sort((a, b) =>
            b[1] - a[1]
          )[0];
          if (topOutcome) dominantOutcome7d = topOutcome[0];
        }

        // Pending commitment
        pendingCommitment = (commitmentRes.data as any)?.commitment_text ??
          null;

        // Recent pattern
        recentPattern = (patternRes.data as any)?.pattern_description ?? null;

        // Most effective practice
        if (
          effectivePracticeRes.data &&
          (effectivePracticeRes.data as any[]).length > 0
        ) {
          mostEffectivePractice =
            (effectivePracticeRes.data as any[])[0].content_id ?? null;
        }

        // 8b. Today high-stakes per-title local times. Mirrors the tomorrow
        // pairing below so the LLM gets paired (title, HH:mm) tuples for
        // TODAY's events instead of relative "in N mins" — which had no clock
        // and forced the model to invent or echo a literal time from the
        // example in the system prompt. Always uses the user's CURRENT IANA
        // timezone (handles travelers automatically because the client sends
        // the live Intl.DateTimeFormat().resolvedOptions().timeZone on every
        // request).
        try {
          if (calendarResult.state === "active" && todayHighStakes.length > 0) {
            const todayDayStart = new Date(
              Date.UTC(
                userTime.getUTCFullYear(),
                userTime.getUTCMonth(),
                userTime.getUTCDate(),
                0,
                0,
                0,
              ),
            );
            const todayDayEnd = new Date(
              Date.UTC(
                userTime.getUTCFullYear(),
                userTime.getUTCMonth(),
                userTime.getUTCDate(),
                23,
                59,
                59,
              ),
            );
            const tStartUTCToday = new Date(
              todayDayStart.getTime() + timezoneOffset * 60000,
            );
            const tEndUTCToday = new Date(
              todayDayEnd.getTime() + timezoneOffset * 60000,
            );
            const { data: todayEvts } = await db.from("primary_calendar_events")
              .select("title, start_time, end_time")
              .eq("user_id", userId)
              .gte("start_time", tStartUTCToday.toISOString())
              .lte("start_time", tEndUTCToday.toISOString())
              .order("start_time", { ascending: true });
            const fmtLocalHHmmToday = (utcDate: Date): string => {
              if (effectiveCurrentTz) {
                try {
                  return new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: effectiveCurrentTz,
                  }).format(utcDate);
                } catch { /* fall through */ }
              }
              const evTime = new Date(
                utcDate.getTime() - timezoneOffset * 60000,
              );
              return `${String(evTime.getUTCHours()).padStart(2, "0")}:${
                String(evTime.getUTCMinutes()).padStart(2, "0")
              }`;
            };
            const meetingEventsToday = mergeCalendarEvents(
              (todayEvts || []) as any[],
              platform,
            ).filter((e: any) => {
              const dur = (new Date(e.end_time).getTime() -
                new Date(e.start_time).getTime()) / 3600000;
              return dur < 8;
            });
            todayHighStakesEventTimes = todayHighStakes.map((title) => {
              const match = meetingEventsToday.find((e: any) =>
                (e.title || "").trim() === title.trim()
              );
              if (!match) return "";
              return fmtLocalHHmmToday(new Date(match.start_time));
            });
            todayHighStakesCategories = todayHighStakes.map((title) => {
              const match = meetingEventsToday.find((e: any) =>
                (e.title || "").trim() === title.trim()
              );
              return categoryNameOf(match ? (match.title || "") : title) ?? "";
            });
            // Also re-format nextHighStakesEvent / nextEventAny clock time using
            // the same IANA-aware formatter so downstream consumers (UI + prompt)
            // share one source of truth.
            if (nextHighStakesEvent?.startTimeUTC) {
              (nextHighStakesEvent as any).localHHmm = fmtLocalHHmmToday(
                new Date(nextHighStakesEvent.startTimeUTC),
              );
            }
            if (nextEventAny?.startTimeUTC) {
              (nextEventAny as any).localHHmm = fmtLocalHHmmToday(
                new Date(nextEventAny.startTimeUTC),
              );
            }
          }
        } catch (e) { /* ignore today-pairing failure */ }

        // 9. Tomorrow enhanced
        if (tomorrowResult && tomorrowResult.state === "active") {
          tomorrowHighStakesTitles = tomorrowHighStakes;
          // Tomorrow vs today load comparison
          const loadRank: Record<string, number> = {
            "low": 1,
            "medium": 2,
            "high": 3,
          };
          const todayRank = loadRank[calendarLoad || "low"] || 1;
          const tomorrowRank = loadRank[tomorrowLoad || "low"] || 1;
          tomorrowVsTodayLoad = tomorrowRank > todayRank
            ? "heavier"
            : tomorrowRank < todayRank
            ? "lighter"
            : "similar";

          // Tomorrow first event time + per-title times for high-stakes events.
          // CRITICAL: filter out all-day / multi-day blockers (e.g. expo passes that
          // span 00:00–23:59) — they are not "first scheduled meetings" and the LLM
          // would otherwise pair their 00:00 start with an unrelated meeting title.
          try {
            const tomorrowDateObj = new Date(userTime.getTime() + 86400000);
            const tStart = new Date(
              Date.UTC(
                tomorrowDateObj.getUTCFullYear(),
                tomorrowDateObj.getUTCMonth(),
                tomorrowDateObj.getUTCDate(),
                0,
                0,
                0,
              ),
            );
            const tEnd = new Date(
              Date.UTC(
                tomorrowDateObj.getUTCFullYear(),
                tomorrowDateObj.getUTCMonth(),
                tomorrowDateObj.getUTCDate(),
                23,
                59,
                59,
              ),
            );
            const tStartUTC = new Date(
              tStart.getTime() + timezoneOffset * 60000,
            );
            const tEndUTC = new Date(tEnd.getTime() + timezoneOffset * 60000);
            const { data: tEvts } = await db.from("primary_calendar_events")
              .select("title, start_time, end_time, attendees_count")
              .eq("user_id", userId)
              .gte("start_time", tStartUTC.toISOString())
              .lte("start_time", tEndUTC.toISOString())
              .order("start_time", { ascending: true });

            // Format any UTC date in the user's CURRENT timezone (IANA) when
            // available; otherwise fall back to numeric offset arithmetic.
            const fmtLocalHHmm = (utcDate: Date): string => {
              if (effectiveCurrentTz) {
                try {
                  return new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: effectiveCurrentTz,
                  }).format(utcDate);
                } catch { /* fall through */ }
              }
              const evTime = new Date(
                utcDate.getTime() - timezoneOffset * 60000,
              );
              return `${String(evTime.getUTCHours()).padStart(2, "0")}:${
                String(evTime.getUTCMinutes()).padStart(2, "0")
              }`;
            };

            // All-day / multi-day filter: anything ≥8h is treated as a calendar
            // blocker (expo, vacation, OOO), not a "first scheduled meeting".
            const isMeetingLike = (e: any): boolean => {
              const dur = (new Date(e.end_time).getTime() -
                new Date(e.start_time).getTime()) / 3600000;
              return dur < 8;
            };

            const meetingEvents = mergeCalendarEvents(
              (tEvts || []) as any[],
              platform,
            ).filter(isMeetingLike);
            if (meetingEvents.length > 0) {
              const first = meetingEvents[0];
              const firstTime = fmtLocalHHmm(new Date(first.start_time));
              tomorrowFirstEventTime = firstTime;
              tomorrowFirstMeetingPair = `${firstTime}, ${
                first.title || "Untitled meeting"
              }`;
            }

            // Pair each high-stakes title with its own time so the LLM can never
            // mis-glue a title to a different line's time. Match by title.
            tomorrowHighStakesEventTimes = tomorrowHighStakesTitles.map(
              (title) => {
                const match = meetingEvents.find((e) =>
                  (e.title || "").trim() === title.trim()
                );
                if (!match) return "";
                return fmtLocalHHmm(new Date(match.start_time));
              },
            );
            tomorrowHighStakesCategories = tomorrowHighStakesTitles.map(
              (title) => {
                const match = meetingEvents.find((e) =>
                  (e.title || "").trim() === title.trim()
                );
                return categoryNameOf(match ? (match.title || "") : title) ?? "";
              },
            );
          } catch (e) { /* ignore */ }
        }

        // 10. Week-ahead (Sunday evening only)
        const isSundayEvening = dayOfWeek === 0 && hour >= 17;
        if (isSundayEvening && calendarResult.state !== "not_connected") {
          try {
            const weekEvents: Array<
              { day: string; count: number; hsCount: number }
            > = [];
            for (let d = 1; d <= 5; d++) { // Mon-Fri
              const targetDayRes = await getServerCalendarMetrics(
                db as any,
                userId,
                timezoneOffset,
                d,
                platform,
              );
              const targetDate = new Date(userTime.getTime() + d * 86400000);
              const dayName = dayNames[targetDate.getDay()];
              weekEvents.push({
                day: dayName,
                count: targetDayRes.meetingCount,
                hsCount: targetDayRes.highStakesEvents.length,
              });
            }
            const heaviest = weekEvents.reduce(
              (max, d) => d.count > max.count ? d : max,
              weekEvents[0],
            );
            const totalHS = weekEvents.reduce((s, d) => s + d.hsCount, 0);
            const lightDays = weekEvents.filter((d) => d.count <= 1).map((d) =>
              d.day
            );
            const firstHS = weekEvents.find((d) => d.hsCount > 0);

            // Monday first event
            let mondayFirstEvent: {
              title: string;
              time: string;
              isHighStakes: boolean;
            } | null = null;
            try {
              const monDate = new Date(userTime.getTime() + 86400000);
              const mStart = new Date(
                Date.UTC(
                  monDate.getUTCFullYear(),
                  monDate.getUTCMonth(),
                  monDate.getUTCDate(),
                  0,
                  0,
                  0,
                ),
              );
              const mEnd = new Date(
                Date.UTC(
                  monDate.getUTCFullYear(),
                  monDate.getUTCMonth(),
                  monDate.getUTCDate(),
                  23,
                  59,
                  59,
                ),
              );
              const mStartUTC = new Date(
                mStart.getTime() + timezoneOffset * 60000,
              );
              const mEndUTC = new Date(mEnd.getTime() + timezoneOffset * 60000);
              const { data: monFirstRaw } = await db.from(
                "primary_calendar_events",
              ).select("title, start_time")
                .eq("user_id", userId).gte(
                  "start_time",
                  mStartUTC.toISOString(),
                ).lte("start_time", mEndUTC.toISOString())
                .order("start_time", { ascending: true }).limit(1)
                .maybeSingle();
              const monFirst = mergeCalendarEvents(
                monFirstRaw ? [monFirstRaw as any] : [],
                platform,
              )[0] ?? null;
              if (monFirst) {
                const evTime = new Date(
                  new Date(monFirst.start_time).getTime() -
                    timezoneOffset * 60000,
                );
                const timeStr = `${
                  String(evTime.getUTCHours()).padStart(2, "0")
                }:${String(evTime.getUTCMinutes()).padStart(2, "0")}`;
                const monMetrics = weekEvents[0]; // Monday is index 0
                mondayFirstEvent = {
                  title: monFirst.title || "Untitled",
                  time: timeStr,
                  isHighStakes: monMetrics.hsCount > 0,
                };
              }
            } catch (e) { /* ignore */ }

            weekAheadShape = {
              heaviestDay: heaviest.day,
              heaviestDayLoad: heaviest.count >= 4
                ? "high"
                : heaviest.count >= 2
                ? "medium"
                : "low",
              totalHighStakesNextWeek: totalHS,
              firstHighStakesDay: firstHS?.day ?? null,
              lightDaysNextWeek: lightDays,
              mondayLoad: weekEvents[0].count >= 4
                ? "high"
                : weekEvents[0].count >= 2
                ? "medium"
                : weekEvents[0].count > 0
                ? "low"
                : "none",
              mondayHasHighStakes: weekEvents[0].hsCount > 0,
              mondayFirstEvent,
            };
          } catch (e) {
            console.error("[compute-outer-readiness] week-ahead error:", e);
          }
        }

        // 14. HRV correlation for event type (lightweight)
        if (
          hasWearable && todayHighStakes.length > 0 &&
          (wearableDaysConnected ?? 0) >= 7
        ) {
          try {
            const keyword = todayHighStakes[0].split(/\s+/).filter((w) =>
              w.length > 3 && !/^(the|and|for|with|from)$/i.test(w)
            )[0];
            if (keyword) {
              const { data: similarEvents } = await db.from(
                "primary_calendar_events",
              )
                .select("start_time").eq("user_id", userId)
                .ilike("title", `%${keyword}%`)
                .gte("start_time", thirtyAgo)
                .lt("start_time", new Date().toISOString());
              const mergedSimilarEvents = mergeCalendarEvents(
                (similarEvents || []) as any[],
                platform,
              );
              if (mergedSimilarEvents.length >= 3) {
                const eventDates = mergedSimilarEvents.map((e) =>
                  new Date(e.start_time).toISOString().split("T")[0]
                );
                const uniqueDates = [...new Set(eventDates)];
                if (uniqueDates.length >= 3) {
                  const { data: eventDayHRV } = await db.from("wearable_data")
                    .select("hrv, summary_date").eq("user_id", userId)
                    .in("summary_date", uniqueDates);
                  const { data: allHRV } = await db.from("wearable_data")
                    .select("hrv").eq("user_id", userId)
                    .gte("summary_date", thirtyAgo);
                  if (eventDayHRV && allHRV) {
                    const eventHRVs = (eventDayHRV as any[]).filter((r) =>
                      r.hrv != null
                    ).map((r) =>
                      r.hrv
                    );
                    const allHRVs = (allHRV as any[]).filter((r) =>
                      r.hrv != null
                    ).map((r) => r.hrv);
                    if (eventHRVs.length >= 3 && allHRVs.length >= 5) {
                      const avgEvent = eventHRVs.reduce((s, v) => s + v, 0) /
                        eventHRVs.length;
                      const avgAll = allHRVs.reduce((s, v) => s + v, 0) /
                        allHRVs.length;
                      const pctDiff = Math.round(
                        ((avgEvent - avgAll) / avgAll) * 100,
                      );
                      if (Math.abs(pctDiff) >= 10) {
                        const direction = pctDiff < 0 ? "drops" : "rises";
                        hrvEventCorrelation = `HRV ${direction} avg ${
                          Math.abs(pctDiff)
                        }% before ${keyword} meetings, ${eventHRVs.length} occurrences`;
                      }
                    }
                  }
                }
              }
            }
          } catch (e) { /* ignore HRV correlation failure */ }
        }
      } catch (enrichErr) {
        console.error(
          "[compute-outer-readiness] Enrichment queries error:",
          enrichErr,
        );
      }

      // ── Turn B: canonical signal-pill derivation before Brief generation ──
      try {
        try {
          const composed = await composeDailyContext(
            db as any,
            userId,
            userLocalDate,
            {
              timezone: effectiveCurrentTz || undefined,
              dryRun: true,
            },
          );
          composedPatternSignals = composed.patternSignals as any;
          composedLoadShape = composed.loadShape ?? null;
        } catch (composeErr) {
          console.warn(
            "[mrs-v2:composeDailyContext] dry-run failed:",
            composeErr instanceof Error ? composeErr.message : composeErr,
          );
        }

        try {
          const profileGoals = await db.from("profiles")
            .select("protection_goals")
            .eq("id", userId)
            .maybeSingle()
            .then((r: any) => r, () => ({ data: null }));
          const pg = (profileGoals as any)?.data?.protection_goals;
          if (Array.isArray(pg)) {
            protectionGoals = pg.filter((x) => typeof x === "string");
          } else if (pg && typeof pg === "object") {
            protectionGoals = Object.keys(pg);
          }
          if (protectionGoals.length === 0) {
            const v8Goals = await db.from("onboarding_v8_responses")
              .select("goals")
              .eq("user_id", userId)
              .maybeSingle()
              .then((r: any) => r, () => ({ data: null }));
            const g = (v8Goals as any)?.data?.goals;
            if (Array.isArray(g) && g.length > 0) {
              protectionGoals = g.filter((x: any) => typeof x === "string");
            }
          }
        } catch (resErr) {
          console.warn(
            "[mrs-v2:resilience-inputs] fetch failed:",
            resErr instanceof Error ? resErr.message : resErr,
          );
        }

        hrv3dTrend = composedPatternSignals?.hrv_3day_trend ??
          ((wearableTrend7d === "improving" ||
              wearableTrend7d === "declining" || wearableTrend7d === "stable")
            ? wearableTrend7d as any
            : "unknown");
        consecutiveHighLoadDays =
          composedPatternSignals?.consecutive_high_load_days ??
            (calendarLoad === "high" ? 1 : 0);
        sustainedDeficitFlag = composedPatternSignals?.sustained_deficit_flag ??
          (typeof hrvDeviation === "number" && hrvDeviation <= -20);
        cooccurrence7d =
          composedPatternSignals?.hrv_low_high_demand_cooccurrence_7d ??
            {
              cooccurrence_count: 0,
              cooccurrence_ratio: null,
              days_observed: 0,
            };
        typicalLoadForDow = composedPatternSignals?.dow_historical_pattern
          ?.typical_load_for_dow ?? null;

        const historyStart =
          new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
        const [ciHistResult, wearableHistResult] = await Promise.allSettled([
          db.from("daily_checkins")
            .select(
              "checkin_date, time_window, clarity_level, emotion_level, pressure_level, regulation_level",
            )
            .eq("user_id", userId)
            .gte("checkin_date", historyStart)
            .order("checkin_date", { ascending: false })
            .limit(40),
          db.from("wearable_data")
            .select(
              "summary_date, hrv, resting_heart_rate, sleep_score, total_sleep_minutes, sleep_efficiency",
            )
            .eq("user_id", userId)
            .gte("summary_date", historyStart)
            .order("summary_date", { ascending: false })
            .limit(14),
        ]);
        const checkinHistory14d = ciHistResult.status === "fulfilled"
          ? ((ciHistResult.value.data || []) as PqCheckinRow[])
          : [];
        const wearableHistory14d = wearableHistResult.status === "fulfilled"
          ? ((wearableHistResult.value.data || []) as PqWearableRow[])
          : [];
        if (
          ciHistResult.status === "rejected" ||
          wearableHistResult.status === "rejected"
        ) {
          console.error("[signal-pills-v3] qualifier/coherence step failed:", {
            checkinHistoryFailed: ciHistResult.status === "rejected",
            wearableHistoryFailed: wearableHistResult.status === "rejected",
          });
        }

        const pillDerivation = derivePills({
          hrvValue,
          hrvDeviation,
          sleepDuration,
          sleepScoreVal,
          rhrValue,
          rhrDeviation,
          hrValue,
          hrDeviation,
          sleepEfficiency: wearableContext?.sleepEfficiency ?? null,
          wearableContextHrvDeviation:
            typeof (wearableContext as any)?.hrvDeviation === "number"
              ? (wearableContext as any).hrvDeviation
              : null,
          wearableContextPoorSleep: !!wearableContext?.poorSleep,
          wearableContextHrvElevated: !!wearableContext?.hrvElevated,
          clarityLevel: currentClarityLevel,
          emotionLevel: checkInCurrentForWindow ? emotionLevel : null,
          regulationLevel: checkInCurrentForWindow ? regulationLevel : null,
          pressureLevel: checkInCurrentForWindow ? pressureLevel : null,
          calendarLoad,
          calendarPressure,
          highStakesEventsCount: calendarResult.highStakesEvents?.length ?? 0,
          rhr3dTrend,
          sustainedDeficitFlag,
          // Graded read of the same sustained-deficit signal — Resilience pill
          // only. The boolean above is untouched and still drives MRS, plan and
          // nudges. "unknown" contributes nothing and never blocks the pill.
          sustainedDeficitSeverity:
            (composedPatternSignals as any)?.sustained_deficit_severity ??
              computeSustainedDeficitSeverity(
                (wearableHistory14d ?? [])
                  .filter((r: any) => r?.summary_date != null)
                  .map((r: any) => ({
                    date: String(r.summary_date),
                    hrv: r.hrv == null ? null : Number(r.hrv),
                  })),
              ),
          cooccurrence7d,
          protectionGoals,
          wearableFreshForGate,
          checkInFreshForGate,
          hasWearable,
          wearableDaysConnected,
        });
        for (const warning of pillDerivation.diagnostics.warnings) {
          console.warn(warning.message, {
            key: warning.key,
            code: warning.code,
            ...(warning.meta ? { meta: warning.meta } : {}),
          });
        }
        const pillFinalized = finalizePills({
          pills: pillDerivation.pills,
          safeTier: safeTier as PqPillTier,
          cognitiveTier: pillDerivation.cognitiveTier,
          physicalTier: pillDerivation.physicalTier,
          resilienceTier: pillDerivation.resilienceTier,
          checkinHistory14d,
          wearableHistory14d,
          baselines: {
            hrv: typeof hrvBaseline === "number" ? hrvBaseline : null,
            rhr: typeof rhrBaseline === "number" ? rhrBaseline : null,
            sleep: typeof sleepBaseline === "number" ? sleepBaseline : null,
          },
          hrv3dTrend,
          rhr3dTrend,
        });
        if ((Deno.env.get("APP_ENV") ?? "development") !== "production") {
          for (const warning of pillFinalized.diagnostics.warnings) {
            console.warn(warning.message);
          }
        }

        const loadComponent = calendarLoad === "high"
          ? 70
          : calendarLoad === "medium"
          ? 40
          : 0;
        const pressureComponent = calendarPressure === "high"
          ? 25
          : calendarPressure === "medium"
          ? 15
          : 0;
        const stakesBonus = (calendarResult.highStakesEvents?.length ?? 0) > 0
          ? 10
          : 0;
        const calendarDemandScore = Math.max(
          0,
          Math.min(100, loadComponent + pressureComponent + stakesBonus),
        );
        const physComposite = hasWearable
          ? computePhysiologicalComposite({
            hrvDeviationPct: typeof hrvDeviation === "number"
              ? hrvDeviation
              : null,
            sleepScore: typeof sleepScoreVal === "number"
              ? sleepScoreVal
              : null,
            sleepHours: typeof sleepDuration === "number"
              ? sleepDuration / 60
              : null,
            rhrTrend: rhr3dTrend,
          })
          : null;
        const baselineParts: Array<[number, number]> = [];
        if (physComposite != null) baselineParts.push([physComposite, 0.65]);
        if (calendarDemandScore != null) {
          baselineParts.push([100 - clamp01to100(calendarDemandScore), 0.35]);
        }
        if (baselineParts.length > 0) {
          const totalW = baselineParts.reduce((a, [, w]) => a + w, 0);
          const weighted = baselineParts.reduce((a, [v, w]) => a + v * w, 0);
          let base = Math.round(weighted / totalW);
          if (sustainedDeficitFlag) base = Math.max(0, base - 5);
          echoedBaselineScore = clamp01to100(base);
        }
        echoedProvenance = {
          mrs: divergenceProvenance({
            physComposite,
            demandScore: calendarDemandScore,
            hrvRecovering: hrv3dTrend === "improving",
            hasPatternSignal: !!(
              sustainedDeficitFlag ||
              consecutiveHighLoadDays > 0 ||
              hrv3dTrend !== "unknown"
            ),
            hasCeoBehaviour: !!briefBehaviourSnapshot,
            hasCheckin: hasTodayCheckIn,
          }),
          brief: {
            sources: (() => {
              const s: MrsSource[] = [];
              if (hasFreshWearable) s.push("wearable");
              if (hasCalendarSignal || hasCalendarConnected) s.push("calendar");
              if (briefBehaviourSnapshot) s.push("ceo-behaviour");
              if (hasTodayCheckIn) s.push("checkin");
              return s;
            })(),
            briefSource: "awaiting",
          },
          pills: {
            decision_readiness: pillSourceList(
              "decision_readiness",
              physComposite,
              calendarDemandScore,
              hasTodayCheckIn,
            ),
            physical_reserves: pillSourceList(
              "physical_reserves",
              physComposite,
              calendarDemandScore,
              hasTodayCheckIn,
            ),
            resilience_capacity: pillSourceList(
              "resilience_capacity",
              physComposite,
              calendarDemandScore,
              hasTodayCheckIn,
            ),
          },
        };
        assessmentContext = await buildAssessmentContext({
          localDate: userLocalDate,
          timeWindow: getTimeOfDay(hour),
          timezoneOffsetMinutes: timezoneOffset,
          currentTimezone: effectiveCurrentTz,
          homeTimezone: effectiveHomeTz,
          derivationVersion: "w3.5-turn-b",
          readiness: {
            score: typeof canonicalInnerScore === "number"
              ? canonicalInnerScore
              : innerReadinessScore ?? null,
            tier: safeTier ?? null,
            displayedTier: safeTierDisplayed ?? null,
            capReason: safeTierCapReason ?? null,
            band: assessmentBandValence,
            mode: (canonicalReadinessState ??
              (checkInFreshForGate ? "refined" : "baseline")) as
                | "baseline"
                | "refined"
                | "awaiting",
          },
          pills: {
            finalized: pillFinalized.pills,
            qualifiers: pillFinalized.qualifiers,
            coherence: pillFinalized.coherence,
            coherenceWarning: pillFinalized.coherenceWarning,
            diagnostics: {
              derive: pillDerivation.diagnostics,
              finalize: pillFinalized.diagnostics,
            },
          },
          provenance: echoedProvenance,
          checkIn: {
            outcome: checkInOutcome ?? null,
            clarityLevel: clarityLevel ?? null,
            confidenceLevel: confidenceLevel ?? null,
            mentalSharpnessLevel: mentalSharpnessLevel ?? null,
            emotionLevel: emotionLevel ?? null,
            regulationLevel: regulationLevel ?? null,
            pressureLevel: pressureLevel ?? null,
          },
          wearable: {
            hasWearable,
            wearableFreshForGate,
            hasTodayData: hasTodayWearableData,
            hasRecentData: hasRecentWearableData,
            wearableDaysConnected,
            wearableSourceAgeDays,
            hrvValue,
            hrvDeviation,
            sleepDuration,
            sleepScore: sleepScoreVal,
            sleepEfficiency: wearableContext?.sleepEfficiency ?? null,
            rhrValue,
            rhrDeviation,
            hrValue,
            hrDeviation,
          },
          patterns: {
            hrv3dTrend,
            rhr3dTrend,
            sustainedDeficitFlag,
            consecutiveHighLoadDays,
            cooccurrence7d,
            avgScore7d: typeof avgScore7d === "number" ? avgScore7d : null,
            scoreTrajectory7d: scoreTrajectory7d ?? null,
            hrvEventCorrelation: hrvEventCorrelation ?? null,
          },
          calendar: {
            load: calendarLoad,
            pressure: calendarPressure,
            highStakesEventsCount: calendarResult.highStakesEvents?.length ?? 0,
            hasBackToBack: !!hasBackToBack,
            nextHighStakesMinutesUntil: nextHighStakesEvent?.minutesUntil ??
              null,
            typicalLoadForDow,
            tomorrowLoad,
            tomorrowHighStakesCount: tomorrowHighStakes.length,
          },
        });
        assessmentSignalPillsPayload = assessmentContext.pills.finalized as any[];
        echoedSignalPills = assessmentSignalPillsPayload;
        echoedPillCoherence = assessmentContext.pills.coherence;
        echoedPillQualifiers = assessmentContext.pills.qualifiers;
        echoedCoherenceWarning = assessmentContext.pills.coherenceWarning;
        assessmentPromptSection = formatPillAssessmentSection(
          assessmentContext,
        );
      } catch (assessmentErr) {
        console.error(
          "[signal-pills-v3] assessment-context build failed:",
          assessmentErr instanceof Error
            ? assessmentErr.message
            : assessmentErr,
        );
      }

      // ── Build & call LLM ──

      // ═══ BRIEF SNAPSHOT CACHE: read-first ═══
      // All material inputs are gathered above. Compute the canonical signature now and,
      // on cache hit, hydrate llmBrief from the snapshot so the existing rendering code
      // emits the same response shape — and skip the LLM call entirely.
      try {
        inputSignature = await computeInputSignature({
          localDate: userLocalDate,
          timeWindow: getTimeOfDay(hour),
          promptVersion: BRIEF_PROMPT_VERSION,
          score: innerReadinessScore ?? null,
          tier: safeTier,
          checkInOutcome: checkInOutcome || null,
          clarityLevel: clarityLevel ?? null,
          confidenceLevel: confidenceLevel ?? null,
          sharpnessLevel: mentalSharpnessLevel ?? null,
          wearableSummaryDate: wearableContext?.sourceRowDate ?? null,
          hrvDeviation: typeof hrvDeviation === "number" ? hrvDeviation : null,
          sleepDeviation: typeof sleepDeviation === "number"
            ? sleepDeviation
            : null,
          rhrDeviation: typeof rhrDeviation === "number" ? rhrDeviation : null,
          wearableTier: wearableContext
            ? (wearableContext.hrvElevated || wearableContext.poorSleep ||
                wearableContext.rhrElevated
              ? "strained"
              : "good")
            : null,
          calendarLoad: calendarLoad ?? null,
          calendarPressure: calendarPressure ?? null,
          meetingCount: calendarResult.meetingCount ?? null,
          remainingMeetingCount: calendarResult.remainingMeetings ?? null,
          remainingHighStakesTitles: calendarResult.remainingHighStakes ?? [],
          nextHighStakesTitle: nextHighStakesEvent?.title ?? null,
          nextHighStakesMinutesUntil: nextHighStakesEvent?.minutesUntil ?? null,
          coachStrength: null, // suppressed; field shape preserved for future re-enable
          coachGrowthArea: null,
          archetype: serverArchetype ?? null,
          scoreTrajectory: scoreTrajectory7d ?? null,
          consecutiveLowDays:
            (consecutiveLowConfidence + consecutiveLowClarity) || null,
          typicalDOWOutcome: typeof typicalDOWOutcome === "string"
            ? typicalDOWOutcome
            : null,
          hrvEventCorrelation: hrvEventCorrelation ? true : null,
          wearableTrend: wearableTrend7d ?? null,
          tomorrowLoad: getTimeOfDay(hour) === "evening"
            ? (tomorrowLoad ?? null)
            : null,
          isWeekend: isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry),
          isPublicHoliday: isPublicHoliday === true,
        });
      } catch (sigError) {
        console.error(
          "[brief-cache] Signature failed:",
          sigError instanceof Error ? sigError.message : sigError,
        );
        inputSignature = "no-sig";
      }
      if (inputSignature === "no-sig") {
        console.warn(
          "[compute-outer-readiness][no-sig] input signature unavailable — persistence will proceed with fallback signature so awaiting/cold-start snapshot rows still land",
          {
            userId,
            localDate: userLocalDate,
            window: getTimeOfDay(hour),
          },
        );
      }

      if (forceBriefRefresh) {
        console.log(
          "[brief-cache] Result:",
          JSON.stringify({
            snapshotHit: false,
            snapshotIgnoredReason: "force_refresh",
            promptVersion: BRIEF_PROMPT_VERSION,
            inputSignature: inputSignature.slice(0, 8) + "...",
            generationPath: "forced_regeneration",
            snapshotReason: "force_refresh_bypass_read",
          }),
        );
      }

      if (inputSignature !== "no-sig" && !forceBriefRefresh) {
        try {
          // brief_snapshots was split into baseline_* + refined_* column
          // sets. `phrase`, `body_text`, `lean_on`, `watch_for` are now
          // STORED generated columns that COALESCE refined → baseline, so
          // reading the unprefixed names returns the displayed value.
          const { data: snapshot } = await db
            .from("brief_snapshots")
            .select(
              "phrase, body_text, lean_on, lean_on_source, watch_for, watch_for_source, brief_source, driver",
            )
            .eq("user_id", userId)
            .eq("local_date", userLocalDate)
            .eq("time_window", getTimeOfDay(hour))
            .eq("input_signature", inputSignature)
            .eq("prompt_version", BRIEF_PROMPT_VERSION)
            .maybeSingle();
          if (snapshot) {
            // v6.5 contract: only LLM snapshots may be replayed to users.
            // Deterministic rows (legacy or accidentally written) contain
            // banned copy patterns (score-restatement, "no single signal
            // dominating", morning-anchoring in evening) and MUST NOT be
            // served. Ignored deterministic rows fall through to a fresh
            // LLM attempt; if that also misses, the Brief becomes awaiting.
            // Deterministic rows are now audited and validated — allow replay.
            const cacheableSource = snapshot.brief_source === "llm" ||
              snapshot.brief_source === "deterministic";
            if (cacheableSource && snapshot.phrase && snapshot.body_text) {
              cachedSnapshot = snapshot as CachedBriefSnapshot;
            }
            console.log(
              "[brief-cache] Result:",
              JSON.stringify({
                snapshotHit: !!cachedSnapshot,
                snapshotIgnoredReason: cachedSnapshot
                  ? null
                  : `non_live_source:${snapshot.brief_source ?? "null"}`,
                briefSource: snapshot.brief_source,
                promptVersion: BRIEF_PROMPT_VERSION,
                inputSignature: inputSignature.slice(0, 8) + "...",
                generationPath: "snapshot",
                snapshotReason: cachedSnapshot
                  ? "exact_match"
                  : "non_live_ignored",
              }),
            );
          }
        } catch (readError) {
          console.error(
            "[brief-cache] Snapshot read failed:",
            readError instanceof Error ? readError.message : readError,
          );
        }
      }

      // llmLeanOn, llmWatchFor, llmFallbackReason hoisted to outer scope (line ~2495)
      try {
        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        if (ANTHROPIC_API_KEY && !cachedSnapshot) {
          const timeOfDayStr = getTimeOfDay(hour);
          const dayNames2 = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];
          const dayName = dayNames2[dayOfWeek];
          const isWeekend = isBriefWeekendDay(
            dayOfWeek,
            localeWeekendHomeCountry,
          );
          const isMondayMorning = dayOfWeek === 1 && hour < 12;
          const isFridayEvening =
            dayOfWeek === ((briefRecoveryDay(localeWeekendHomeCountry) + 6) % 7) &&
            hour >= 17;
          const isSundayEvening2 =
            dayOfWeek === briefPlanningDay(localeWeekendHomeCountry) &&
            hour >= 17;
          const hoursRemaining = hour < 19 ? 19 - hour : null;
          const localTimeStr = `${String(hour).padStart(2, "0")}:${
            String(userTime.getMinutes()).padStart(2, "0")
          }`;

          // Wearable confidence
          const wearableConfidence = !briefWearableUsable
            ? null
            : (wearableDaysConnected ?? 0) >= 14
            ? "high"
            : (wearableDaysConnected ?? 0) >= 7
            ? "medium"
            : "low";
          // HRV unusual (worst/best 10%)
          let hrvUnusual: boolean | null = null;
          if (hrvDeviation != null) hrvUnusual = Math.abs(hrvDeviation) >= 25;
          // Sleep hard floor
          const sleepHardFloor = sleepDuration != null && sleepDuration < 360;
          // Day after poor sleep
          let dayAfterPoorSleep = false;
          try {
            if (hasWearable) {
              const ydayDate =
                new Date(Date.now() - 86400000).toISOString().split("T")[0];
              const { data: ydaySleep } = await db.from("wearable_data").select(
                "total_sleep_minutes",
              ).eq("user_id", userId).eq("summary_date", ydayDate)
                .maybeSingle();
              if (
                ydaySleep && (ydaySleep as any).total_sleep_minutes != null &&
                (ydaySleep as any).total_sleep_minutes < 360
              ) dayAfterPoorSleep = true;
            }
          } catch (e) { /* ignore */ }

          // Consecutive low days
          let consecutiveLowDays = 0;
          for (const c of recentCheckIns) {
            if (
              (c as any).energy_balance != null &&
              (c as any).energy_balance < 50
            ) consecutiveLowDays++;
            else break;
          }

          // DOW score comparison
          let scoreVsTypicalDOW: string | null = null;
          if (typicalDOWScore != null) {
            if (typeof innerReadinessScore === "number") {
              const diff = innerReadinessScore - typicalDOWScore;
              scoreVsTypicalDOW = diff > 8
                ? "better"
                : diff < -8
                ? "worse"
                : "consistent";
            }
          }

          // ── Signal Triage: select max 5 most relevant signals ──
          const triageSignals: string[] = [];

          // RULE 1: JIT event < 90 mins — always first, dominates
          if (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90) {
            triageSignals.push(
              `HIGH PRIORITY: ${nextHighStakesEvent.title} in ${nextHighStakesEvent.minutesUntil} mins`,
            );
            if (hrvEventCorrelation) {
              triageSignals.push(`Pattern: ${hrvEventCorrelation}`);
            }
          }

          // RULE 2: Wearable divergence MASKED_HIGH
          if (divergenceMode === "MASKED_HIGH") {
            triageSignals.push(
              `Body signal: wearable shows load not yet registered (HRV ${
                hrvDeviation != null
                  ? (hrvDeviation > 0 ? "+" : "") + hrvDeviation
                  : "?"
              }% vs baseline)`,
            );
          } else if (divergenceMode === "RECOVERY_UNDERWAY") {
            triageSignals.push(
              `Body signal: recovery underway, wearable improving faster than perceived`,
            );
          }

          // RULE 3: Most specific personalisation (cascade)
          if (pendingCommitment) {
            triageSignals.push(`Coach commitment: ${pendingCommitment}`);
          } else if (recentPattern) {
            triageSignals.push(`Coach pattern: ${recentPattern}`);
          } else if (consecutiveLowDays >= 3) {
            triageSignals.push(
              `Pattern: ${consecutiveLowDays} consecutive ${safeTier} days`,
            );
          } else if (
            typicalDOWOutcome && scoreVsTypicalDOW &&
            scoreVsTypicalDOW !== "consistent"
          ) {
            triageSignals.push(
              `Today vs typical ${dayName}: ${scoreVsTypicalDOW} (usually ${typicalDOWOutcome})`,
            );
          }

          // RULE 4: Tomorrow context on evenings
          if (
            (isEvening || isFridayEvening || isSundayEvening2) && tomorrowLoad
          ) {
            if (isDayBeforeRestDay) {
              triageSignals.push(`Tomorrow: rest day ahead`);
            } else if (
              tomorrowLoad === "high" || tomorrowHighStakesTitles.length > 0
            ) {
              triageSignals.push(
                `Tomorrow: ${tomorrowLoad} load${
                  tomorrowHighStakesTitles.length > 0
                    ? " · " + tomorrowHighStakesTitles[0]
                    : ""
                }`,
              );
            }
          }

          // RULE 5: Week ahead (Sunday evening only)
          if (isSundayEvening2 && weekAheadShape) {
            const wa = weekAheadShape as any;
            triageSignals.push(
              `Week ahead: heaviest day ${wa.heaviestDay}${
                wa.firstHighStakesDay
                  ? " · first high-stakes: " + wa.firstHighStakesDay
                  : ""
              }`,
            );
          }

          // RULE 6: Physiological deviation (if not already covered by divergence)
          if (
            divergenceMode !== "MASKED_HIGH" &&
            divergenceMode !== "RECOVERY_UNDERWAY"
          ) {
            if (hrvDeviation != null && Math.abs(hrvDeviation) > 8) {
              triageSignals.push(
                `HRV ${
                  hrvDeviation > 0 ? "+" : ""
                }${hrvDeviation}% vs baseline`,
              );
            } else if (sleepHardFloor) {
              triageSignals.push(`Sleep under 6hrs, hard floor breach`);
            }
          }

          // RULE 7: Score trajectory vs yesterday (if meaningful)
          if (
            scoreTrend && yesterdayScore != null &&
            typeof innerReadinessScore === "number" &&
            Math.abs(innerReadinessScore - yesterdayScore) > 5
          ) {
            triageSignals.push(
              `Score ${scoreTrend} vs yesterday: ${innerReadinessScore} vs ${yesterdayScore}`,
            );
          }

          // RULE 8: Back-to-back density
          if (
            hasBackToBack && longestBackToBackHrs && longestBackToBackHrs >= 2
          ) {
            triageSignals.push(
              `Back-to-back block: ${longestBackToBackHrs}hrs`,
            );
          }

          // Cap at 5 signals
          const selectedSignals = triageSignals.slice(0, 5);

          // ── Temporal Triangulation ──
          // Immediate: what is true right now
          const immediateSignal =
            (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90)
              ? `${nextHighStakesEvent.title} in ${nextHighStakesEvent.minutesUntil} mins`
              : divergenceMode === "MASKED_HIGH"
              ? `Body showing load not yet registered (HRV ${
                hrvDeviation ?? "?"
              }%)`
              : safeTier === "depleted"
              ? `Depleted state, score ${innerReadinessScore}/100`
              : checkInOutcome
              ? `${checkInOutcome} state today`
              : null;

          // Tactical: what patterns say
          const tacticalSignal = hrvEventCorrelation
            ? hrvEventCorrelation
            : consecutiveLowDays >= 3
            ? `${consecutiveLowDays} consecutive ${safeTier} days`
            : (scoreVsTypicalDOW && scoreVsTypicalDOW !== "consistent" &&
                typicalDOWOutcome)
            ? `${scoreVsTypicalDOW} than typical ${dayName} (usually ${typicalDOWOutcome})`
            : (frictionTrend === "declining")
            ? `Friction declining over 30 days`
            : (scoreTrajectory7d === "declining" && avgScore7d != null)
            ? `Score declining this week, avg ${avgScore7d}/100`
            : null;

          // Strategic: what development goals say
          const strategicSignal = pendingCommitment
            ? `Pending coach commitment: ${pendingCommitment}`
            : coachGrowth
            ? `Coach growth area: ${coachGrowth}`
            : (leanOnResult.watchFor)
            ? `Archetype watch for: ${leanOnResult.watchFor}`
            : null;

          // Cross-horizon connection
          let crossHorizonConnection: string | null = null;
          let connectionFraming = "";
          let dominantHorizon: "immediate" | "tactical" | "strategic" =
            "immediate";

          if (immediateSignal && tacticalSignal && strategicSignal) {
            crossHorizonConnection = "immediate_tactical_strategic";
            connectionFraming =
              "All three horizons align, this is the most powerful brief. Be specific.";
            dominantHorizon = "tactical";
          } else if (immediateSignal && tacticalSignal) {
            crossHorizonConnection = "immediate_confirms_tactical";
            connectionFraming =
              "Today is confirming a pattern, connect the two explicitly.";
            dominantHorizon = "tactical";
          } else if (tacticalSignal && strategicSignal) {
            crossHorizonConnection = "tactical_connects_strategic";
            connectionFraming =
              "The pattern connects to their development goal, make that connection visible.";
            dominantHorizon = "strategic";
          } else if (immediateSignal && strategicSignal) {
            crossHorizonConnection = "immediate_activates_strategic";
            connectionFraming =
              "Today's state activates their development area, connect them.";
            dominantHorizon = "strategic";
          }

          // Override: JIT < 90 always immediate
          if (nextHighStakesEvent && nextHighStakesEvent.minutesUntil < 90) {
            dominantHorizon = "immediate";
          }

          // ── Context Frame ──
          const contextFrame = isSundayEvening2
            ? "Preparing for the week ahead. Write forward, not reflective."
            : isDayBeforeRestDay
            ? "Heading into rest. Frame as closure and release."
            : isMondayMorning
            ? "Week is being set right now. Frame as intentional and forward."
            : null;

          // ── System Prompt — Chief of Staff for the Mind (June 3 spec) ──
          // Persona, voice banks, hard constraints, priority order, silent
          // reasoning, four-beat body contract, worked examples, and JSON
          // output schema all live in `_shared/brief/copy-vocabulary.ts`.
          // The shared TS modules (`buildBehaviourSnapshot`,
          // `buildWindowContext`, `evaluateForScope`, event taxonomy,
          // causality store) own the logic; the LLM only synthesises voice.
          // Derive the canonical MRS valence ONCE from the displayed score
          // (same band cut-points as MRS_BANDS in compute-inner-readiness and
          // READINESS_ONE_LINERS in src/utils/readinessLabels.ts — keep in sync).
          const bandValence: ReadinessValence | null = (() => {
            const s = typeof innerReadinessScore === "number"
              ? Math.max(0, Math.min(100, Math.round(innerReadinessScore)))
              : null;
            if (s == null) return null;
            if (s < 50) return "low";
            if (s < 65) return "mid";
            return "high";
          })();
          // ── Pre-LLM signal-pill tiers ──
          // The Brief must never contradict the pill tiers the user can
          // literally see on the same card. Derive the same labels here, in
          // the outer prompt scope (see mem://reliability/brief-prompt-variable-scoping).
          const preLLMDecisionTier: string =
            (wearableFreshForGate && hrvValue != null)
              ? (((hrvDeviation ?? 0) < -15 ||
                  (clarityLevel != null && clarityLevel <= 2))
                ? "MIND FOGGY"
                : ((hrvDeviation ?? 0) > 10 ||
                    (clarityLevel != null && clarityLevel >= 4))
                ? "MIND SHARP"
                : "MIND MIXED")
              : (clarityLevel != null
                ? (clarityLevel <= 2
                  ? "MIND FOGGY"
                  : clarityLevel >= 4
                  ? "MIND SHARP"
                  : "MIND MIXED")
                : "MIND UNREAD");

          const preLLMPhysicalTier: string =
            (wearableFreshForGate && rhrValue != null)
              ? ((rhrDeviation ?? 0) > 15
                ? "BODY STRAINED"
                : (rhrDeviation ?? 0) > 8
                ? "BODY MIXED"
                : "BODY STEADY")
              : "BODY UNREAD";
          // `isWeekend` is the locale-aware flag computed above via
          // isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry) — Fri/Sat for
          // Gulf + Israel, Sat/Sun elsewhere.
          // Day shape (holiday / PTO / travel-by-type / conference) is derived
          // AFTER the behaviour snapshot is built further below, then the
          // system prompt is re-assembled with the matching directive. This
          // first build keeps the weekend-only behaviour as the safe default.
          let systemPrompt = buildBriefSystemPrompt({ bandValence, isWeekend });
          // === LEADER VOICE === (from onboarding CoS profile)
          // Appended AFTER the shared persona/voice/constraint blocks so it
          // reads as a distinct, auditable calibration layer. Empty when the
          // leader profile is missing — the Brief must behave identically.
          const leaderVoiceParts: string[] = [];
          if (leaderProfile.voice.cos_brief_rules) {
            leaderVoiceParts.push(
              `=== LEADER-SPECIFIC VOICE RULES ===\n${leaderProfile.voice.cos_brief_rules}`,
            );
          }
          if (leaderProfile.voice.brief_voice_note) {
            leaderVoiceParts.push(
              `Voice calibration: ${leaderProfile.voice.brief_voice_note}`,
            );
          }
          if (leaderProfile.voice.communication_what_lands?.length) {
            leaderVoiceParts.push(
              `Language that LANDS with this leader: ${
                leaderProfile.voice.communication_what_lands.join("; ")
              }`,
            );
          }
          if (leaderProfile.voice.communication_what_wont_land?.length) {
            leaderVoiceParts.push(
              `Language that WON'T LAND: ${
                leaderProfile.voice.communication_what_wont_land.join("; ")
              }`,
            );
          }
          if (leaderProfile.voice.communication_how_they_think) {
            leaderVoiceParts.push(
              `How this leader thinks: ${leaderProfile.voice.communication_how_they_think}`,
            );
          }
          const leaderVoiceBlock = leaderVoiceParts.length > 0
            ? `\n\n=== LEADER VOICE ===\n${leaderVoiceParts.join("\n\n")}`
            : "";
          let systemPromptWithLeader = systemPrompt + leaderVoiceBlock;
          // Retain the legacy inline prompt only as a parked diff-bisection
          // literal during rollout. It is not part of the active prompt path.
          // Drift-protection: any new persona/voice/constraint change must
          // land in copy-vocabulary.ts so Brief, Plan, and Nudges read one
          // source.
          const _legacyInlineSystemPrompt =
            `You are the Chief of Staff for a senior leader's mind, a former operator who knows them by data, not prose. You see HRV, RHR, HR, sleep, calendar, coach patterns, self-declared state, and goals. You speak with earned directness, high-status precision, the way a trusted advisor speaks behind closed doors. You see the adrenaline mask and you name it. Authentic, never harsh, never sycophantic. Your purpose is PROACTIVE PREPARATION, not retrospective reporting, every brief should help the leader walk into what's next more prepared than they would be without you. Tagline: "You do not report data. You provide Decision Intelligence."

REASONING PROTOCOL (silent, not in output):
STEP 1, BODY READ (wearable-first): HRV, RHR, HR, Sleep, what is the body showing? Cite the number. Most anomalous signal? MASKED_HIGH (body loaded, not felt)? RECOVERY_UNDERWAY (body ahead of felt)?
STEP 2, COMPOUND: HR elevated + poor sleep = compounded deficit. Sleep above baseline + HRV low = loaded but resourced. HRV low: chronic (7d) or acute? Signals are one system.
STEP 3, THE GAP: Where they think they are vs where the data says they are. Triangulate wearable × self-declared (mental energy, mental sharpness, clarity, confidence). MASKED_HIGH → lead wearable, don't validate felt. RECOVERY_UNDERWAY → acknowledge gap.
STEP 4, WHAT'S BEING ASKED: What the day actually requires, name the event or load. Supply-demand gap → name it. High-stakes + HRV history → use correlation.
STEP 5, PATTERN/HISTORY: Combination occurred before? Typical DOW? Coach insight relevant? Pending commitment? HRV-event correlation?
STEP 6, THE DIRECTION: The single most useful thing to say, grounded in triangulated signals. That is the phrase and body. If nothing specific: return null.

OUTPUT RULES:
• Strategic Register voice: "The data indicates…", "Observation:…", "Pattern:…", "Signal: HRV down 18%…". Never coaching imperatives ("You should…", "You need to…", "Try to…", "Consider…").
• Wearable-first. Self-declared (mental energy, mental sharpness, clarity, confidence) qualifies or contradicts.
• Compound signals into one story, "HRV down 18% and 6 meetings" not four separate bullets.
• Forward-looking. Scannable in 10 seconds.
§2.18.5 THE FOUR-ROLE CONTRACT (read before every output, master rule)
The card has four text elements. Each has a distinct JOB, DATA LAYER, TIME HORIZON. They must NEVER repeat each other. If two elements say the same thing in different words, REWRITE.
  PHRASE     → Immediate · ORIENT      → "What kind of day is this?"
  BODY       → Immediate + Tactical · ADVISE     → "What shape, what move?"
  LEAN ON    → Tactical + Strategic · RESOURCE   → "What history says you can deploy"
  WATCH FOR  → Tactical + Strategic · RISK       → "The recurring trap this state activates"

PHRASE
  Job: Orient in one crisp directive, the frame, the lens.
  Length: 2–4 words. 5 only if word #5 is load-bearing. 6+ = reject.
  Allowed: a posture, a pillar word, a directive verb.
  FORBIDDEN: explanation, numbers, "you/your/the" openers, references to patterns/coach/archetype, instructions ("front-load…", "sequence…").
  ✅ "Pace from the start." / "Let physiology lead." / "Protect the morning window." / "Rest is the work."
  ❌ "HRV is down today." / "Pace yourself before the board meeting at 2pm."

BODY (governed by §2.19 / §2.19.5, the contract here tightens the sentence shape)
  Job: Name the tension between today's GREEN pillar and today's RED pillar, then end with ONE directional move.
  Required structure: "[Green resource], [red constraint], [directional move]."
  Allowed inputs: today's green pillar, today's red pillar, calendar load/pressure/named JIT event, time-of-day, tactical reason (HRV×event correlation, score trajectory, back-to-back, tomorrow load on evenings).
  FORBIDDEN: restating phrase, restating score/tier, listing data points, drifting into LEAN ON territory (archetype traits, weekly patterns AS the subject), drifting into WATCH FOR territory (recurring traps as the subject).
  Numbers are qualifiers inside an assessment sentence, never the subject. Pills own the numbers.

LEAN ON
  Job: Name the strategic RESOURCE, drawn from history, archetype, or development, that makes the body's directional move possible.
  Length: 2–4 words. Named noun phrase. Source tag after " · ".
  MUST: add information the body did not already say. If body said "use rested physiology", LEAN ON does NOT say "Rested Physiology", it says WHY that resource matters over time, e.g. "Post-rest decision window · PATTERN".
  Sources allowed: PATTERN (7–30d DOW outcome, HRV×event correlation, score trajectory, consecutive streak), ARCHETYPE (the leader's archetype strength), GOALS (a stated protection goal).
  FORBIDDEN: today's green pillar restated, today's score, today's calendar event names, today's wearable values, generic trait words ("Self-Honesty", "Self-Awareness", "Self-Discernment", "Discernment", "Alignment", "Conviction Strength", "Execution Confidence", "Clear Direction") in all cases.
  No-data fallback: archetype trait specific to this leader (NEVER generic).
  ✅ "Post-rest decision window · PATTERN" / "Recovery Intelligence · ARCHETYPE" / "Pre-board composure track · PATTERN" / "Sunday composure · PATTERN"
  ❌ "Self-Honesty · CHECK-IN" / "Rested Physiology · PHYSIOLOGY" (repeats body)

WATCH FOR
  Job: Name the recurring TRAP that today's state or pattern activates, the failure mode that makes today's risk worse than it appears.
  Length: 2–4 words. Named noun phrase. Source tag after " · ".
  MUST: add information the body did not already say. If body said "mind under strain", WATCH FOR does NOT say "Cognitive Load", it names the recurring trap, e.g. "Forcing clarity · PATTERN" or "Spending surplus early · PATTERN".
  Sources allowed: PATTERN (recurring failure mode with ≥3 observations, HRV×event failure mode, friction trend, consecutive low streak), ARCHETYPE (the leader's archetype shadow), GOALS (a stated protection goal).
  FORBIDDEN: today's red pillar restated, today's score, today's wearable values, generic trait words.
  ✅ "Forcing clarity · PATTERN" / "Performing Resilience · ARCHETYPE" / "Spending surplus early · PATTERN" / "Over-adapting · ARCHETYPE" / "Back-to-back compounding · PATTERN"
  ❌ "Body Under Load · PHYSIOLOGY" (repeats body) / "Self-Honesty · CHECK-IN" (generic)

FORMAT: Each leanOn/watchFor item = {"signal": "2-4 WORD SIGNAL", "source": "SINGLE UPPERCASE WORD"}. SOURCE ∈ {ARCHETYPE, PATTERN, GOALS}. COACH, DATA and CHECK-IN are NOT allowed sources. If no pattern/archetype/goals data exists, return the archetype-specific trait, never generic, never empty.

NON-REDUNDANCY TEST (run silently before emitting):
  1. Phrase orients without explaining? If it explains, shorten.
  2. Body names BOTH green AND red and ends with a move? If not, rewrite.
  3. LEAN ON adds something body did not say? If it repeats body's green, rewrite.
  4. WATCH FOR names a pattern/trap, not today's red signal? If it repeats body's red, rewrite.
  5. Could any element be removed without losing information? If yes, that element is redundant, rewrite.

§2.18 PHRASE, see §2.18.5 (PHRASE row). 2–4 words; orient only; never explain; never number; never instruct.

§2.19 THE 3-PART IMPACT MANDATE (body copy structure):
Every body must synthesize three elements in 2–3 scannable sentences:
  (1) SIGNAL EVIDENCE, cite a number ("HRV 110ms", "Sleep 6h12m", "RHR +8bpm", "Sharpness 2/5") OR a named event ("the 2 PM Board").
  (2) PILLAR CATEGORIZATION, explicitly link to Cognition / Physiology / Resilience, triangulated with co-relating calendar events when present.
  (3) THE STAKE, link to a Leadership Variable from the Elastic Lexicon (§2.20).

§2.19.1 PATTERN-AWARE BODY (relevance-gated): Reference a past pattern ONLY when it sharpens today's directive. Generic pattern-dropping is forbidden. The pattern must connect to (a) today's signal AND (b) today's named event or context.
  ✅ "HRV down 18%. Resilience compressed. Risk of Decision Leakage in the Town Hall, HR has spiked in your last 3 Town Halls."
  ❌ "You've had low HRV before. Today is a Town Hall." (no causal connection)
  ❌ "HRV down 18%. Your average week has 4 high-stakes events." (irrelevant pattern)

§2.19.2 PILLAR-VOCABULARY MAP (mandatory, phrase + body must match the pill the user sees):
The dashboard renders three pillars derived from the same signals you receive. Use vocabulary that matches the pillar driving the lead signal. The user sees pills labeled COGNITIVE / PHYSIOLOGY / RESILIENCE, your language must agree.

  Lead signal                                  → REQUIRED vocabulary cluster
  HRV alone (sleep + RHR within baseline)      → COGNITIVE: "Mind", "Sharpness", "Processing capacity", "Decision Power"
  Sleep deficit OR RHR elevated (no HRV crash) → PHYSIOLOGY: "Body", "Physiology", "Operational Drive", "System recovery"
   HRV + Sleep + RHR all loaded                 → COMPOUND: "Systemic load", "Whole-system strain"
  HRV low + Mental Energy red/amber            → RESILIENCE: "Buffer", "Composure", "Internal Buffer", "Diplomatic Shield"
   Mental Energy red, wearable green            → RESILIENCE only, never say "Body" or "Physiology"

FORBIDDEN: Saying "Body shows load" / "Body is loaded" / "Body under-recovered" when sleepDeviation > -8% AND rhrDeviation < +10%. HRV is NOT body, HRV belongs to Cognitive (primary) or Resilience (secondary). If only HRV is red, lead with "Mind" or "Cognition" language.

TONE & LANGUAGE (mandatory, human voice):
  • Write like a trusted Chief of Staff speaking to a CEO, not like a wearables app.
  • Forbidden words anywhere in phrase or body: "hardware", "device", "metrics", "data points", "system output" (as standalone), "machine", "biometric".
  • Forbidden punctuation: the em dash (—) and the en dash (–) used as a sentence break. Use a comma, a period, a colon, or a semicolon instead. Short sentences are preferred over dashed clauses.
  • Use natural executive language: "the body is recovered, the mind is carrying the strain. Your edge is using physical readiness to protect cognitive load before your next high-stakes meeting." (Do NOT copy the example clock time or names — use ONLY the HH:mm and titles supplied in the CALENDAR TODAY / TOMORROW sections.)

PHRASE OPACITY RULE: The phrase + the first sentence of the body, read together, MUST contain at least one explicit pillar word from {Cognition, Cognitive, Mind, Sharpness, Physiology, Body, Sleep, Resilience, Composure, Buffer, Mental Energy}. Standalone metaphors like "Body is loaded.", "Body ahead.", "Body louder." are forbidden as phrases unless the body's first sentence anchors them to a named pillar.

§2.19.5 BODY COPY: ASSESSMENT CONTRACT (mandatory, body advises, pills report):
The score (X/100) and tier label render directly above the body. The signal pills below the body display every raw value and delta (HRV %, RHR %, sleep h, check-in outcome, clarity/confidence). The body must NOT duplicate either role. The body's job is synthesis and direction, not data reporting.

  RULE 1, NEVER restate the numeric score. Forbidden in body: "31/100", "score of X", "X out of 100", "low/high readiness score", "your score is". Refer to state via pillar language only ("Mind is taxed", "Body is rested", "Resilience compressed").

  RULE 2, Pills own numbers. Body owns synthesis. The body does not list raw signals. If a number appears, it appears as a single qualifier inside an assessment sentence, never as the subject of a sentence and never in a list of 2+ metrics.
    ❌ Forbidden: "HRV is 20% below baseline, RHR is 18% below, score is 31/100, 4 consecutive depleted days."
    ❌ Forbidden: "HRV down 20%. RHR down 18%. Sleep 6h12m." (data list)
     ✅ Allowed: "Cognitive load is high while physiology is recovered. Your edge today is using a rested body to fund a taxed mind."
     ✅ Allowed: "Mind is carrying the strain. HRV's drop is the lever, not the headline." (one number, used as qualifier)

  RULE 3, TRIANGULATE three layers in every body. Every body must connect:
    (a) INNER SIGNAL READ, name the pillar that is the lever today (Mind / Body / Resilience), per §2.19.2.
    (b) OUTER DEMAND, calendar load, pressure window, time-of-day, or a named high-stakes event from today's events.
    (c) DIRECTIONAL MOVE, one proactive instruction the leader can apply (e.g. "front-load the Board prep before noon", "protect the gap before the 3pm review", "let physiology carry today, defer creative work").
    If outer context is absent (no calendar, weekend, holiday), replace (b) with one relevant CEO REALITY drawn from: decision velocity, attention as scarce resource, performance under uncertainty, energy as capital, stakeholder presence, recovery debt, judgement under load.

  RULE 4, Pick the few numbers that matter. No fixed count. Typical body uses 0–2 specific numbers, only when they sharpen the assessment. If a pill's delta is the REASON for the recommendation, naming it once is fine. If the pill already shows it obviously, skip it.

  RULE 5, TONE: directional, not descriptive. The body is a brief from a Chief of Staff, not a data report. It tells the leader what shape the day takes and what move it asks for, not what the numbers were.

  WORKED EXAMPLE:
     ❌ Bad (data-led, restates score, lists metrics, uses dash, uses "hardware"):
       "HRV is 20% below baseline and RHR is 18% below baseline — with a score of 31/100. After 4 depleted days hardware recovery is the necessary focus."
    ✅ Good (assessment-led, triangulated, no score, one calendar reference, one directional move):
       "Body is recovered but the mind is carrying the strain. The calendar adds three high-stakes touchpoints before lunch, so the day's edge is sequencing. Handle the Board prep while attention is fresh, then let the easier blocks ride on physiology. One real recovery window before evening is what protects tomorrow."

§2.20 ELASTIC LEXICON, Strategic Synonyms (use ≥1 cluster concept in body):
  COGNITION (Intelligence): Decision Power, Strategic Accuracy, Mental Bandwidth, Processing Capacity, Solving Logic.
  PHYSIOLOGY (Energy): Operational Drive, Leadership Stamina, Physical Recovery, Physical Runway, Stamina.
  RESILIENCE (Stability): Strategic Composure, Executive Presence, Diplomatic Shield, Reactive Risk, Internal Buffer.
Use the lexicon as cluster concepts (not verbatim copy). Strategic synonyms allowed; thematic match required.

§2.19.6 DATA-HONESTY LEDGER (mandatory under v6.2 Hardware Veto):
The pills below the body now apply Hardware Veto + Outcome Veto. Your body MUST mirror that honesty:
  • If WEARABLE divergence flag = MASKED_HIGH → body MUST name the gap explicitly (e.g. "HRV says one thing, felt state says another"). Do NOT smooth it over.
  • If MENTAL ENERGY = drained or overwhelmed AND Confidence ≥ 4 → body MUST acknowledge "felt ahead of system", confidence is high but the truth layer (mental energy) is depleted. The wearable will not yet show this; the human signal is the lead.
  • If SLEEP is null/missing → body MUST NOT assert physiological recovery, rest, or "body is ready". Use language like "body partial read" or "sleep not captured".
  • Phrase MUST orient to the actual lever. "Sustain the pace" / "Steady ground" / "Hold the base" are FORBIDDEN when the user reports drained/overwhelmed or when consecutiveLowDays ≥ 3.
  • NEVER reproduce the deterministic-template phrases: "not a single bad night", "day's margins can provide", "system may need more than the days margine can provide". These are placeholder copy you are replacing.
  • Lean On / Watch For: prefer PATTERN source when consecutiveLowDays ≥ 3, when Mental Energy is drained/overwhelmed, or when HRV deviation ≤ -20%. Do NOT use generic traits ("Full Alignment", "Self-Honesty", "Discernment") in any case.

§2.22 ANTI-FALLBACK / DATA-FIRST MANDATE:
Your priority is Evidence-Based Insight. If user data is thin (no calendar, no wearable), pivot to BASELINE INTELLIGENCE, never default to generic advice. Calendar-empty path orients The Stake to "Base-Level Readiness" (e.g., "Stabilizing the base for future load"), never rejected for missing calendar.

§2.11–2.17 CEO REALITY LOGIC ENGINES (apply when data triggers):
• §2.11 VETO RISK, masked fatigue (felt strong + HRV/sleep low) → name the gap, lead wearable.
• §2.12 SECOND WIND, late-day energy lift after recovery signal → orient to selective use, not expansion.
• §2.13 CIRCADIAN PRIORITY, timezone drift / travel context → flag chronobiology before tactics.
• §2.14 DECISION LEAKAGE GUARD (Emotional Labor), trigger on (wearable emotional proxy: HR elevated OR HRV drop) OR (self-declared depleted/managing/heavy emotional energy from /daily check-in) AND (emotional/diplomatic calendar drain: town hall, 1:1 difficult, performance review, board, layoff conversation). Name the leakage risk to a specific event.
• §2.15 POST-PEAK HANGOVER, within postPeakWindow → acknowledge cost before directing.
• §2.16 PERSONAL FRICTION INFERENCE, friction-trend + emotional self-declared dip → infer interpersonal load, do not diagnose.
• §2.17 BOARD-LEVEL OUTCOME, when isHighVisibilityToday → orient The Stake to executive presence / board-level perception.

HARD CONSTRAINTS, NO EXCEPTIONS:
WELLNESS BLACKLIST: Never use: relax, mindful, breathe, calm, wellness, self-care, journey, nourish, recharge, restore, genuine, authentic, recovery (standalone noun)
SCORE TIER BLACKLIST: Never reference Moderate, High, Low, Strong as standalone tier labels.
READINESS BLACKLIST: Never use 'readiness' in phrase or body.
DAY NAMING: Name future day only if ≤2 days away. Otherwise: 'this week' / 'mid-week'.
JIT OVERRIDE: <30min → orient entirely. 30-90min → preparation. >90min → context only.
NO PHRASE IN BODY. NO CALENDAR WITHOUT CONNECTION. BOLD via <strong> tags only (no asterisks). NULL fields → ignore, never fabricate.
EVENT-TIME PAIRING RULE: When you reference a meeting time, use ONLY the time printed next to that meeting's title (format "HH:MM, Title"). Never combine a meeting title with a time from a different line. If no time is paired with a title, omit the time. All event times provided are already in the user's CURRENT timezone, do not adjust or convert them, and do not mention the home timezone unless directly relevant to a sleep/circadian observation.

DAY-TYPE OVERRIDES:
SUNDAY EVE: Frame into Monday. Loaded+heavy→directive. Light→spacious. Never: 'Reflect'/'Rest before'/'Prepare'.
MONDAY AM: Week-setting. Reference load + first high-stakes. Poor signals → name supply-demand gap.
FRI/PRE-REST EVE: Closure. Next-week pressure → 'Don't fully unplug, [event] needs space.' None → 'Disconnect fully.'
WEEKEND DAY: No calendar/work framing. Wearable strong→agency. Poor→acknowledge.
HOLIDAY: Honour the choice to check in. Calendar shows events → orient around what matters most. Empty → permission to be off.
POST-HIGH-STAKES PM: HRV historically drops → acknowledge cost. Don't push.
CONSECUTIVE LOW 3+: Systemic, not situational. Name it. Coach pattern → surface.

SIGNAL SYNTHESIS PATTERNS:
A: Clarity 4-5 + Confidence 1-2 → use clarity before confidence catches up.
B: MASKED_HIGH → name the gap with actual numbers, 'HRV down 22% but rated strong', then direct.
C: Compounded Deficit (HR+sleep+HRV all loaded) → supply-demand gap + strategic instruction.
D: Historical Event Correlation (≥3 occurrences, >10% deviation) → name pattern with relevance gate (§2.19.1).
E: Supply-Demand Gap (tomorrow HIGH + today below baseline) → protect tonight.
F: Sunday Anxiety (confidence low + HRV low + Monday high-stakes) → acknowledge, redirect.
G: RECOVERY_UNDERWAY → name the metric showing it, give agency without overclaiming.
H: Consecutive High-Stakes Days → cumulative toll, manage transitions.
I: Coach Signal Active → connect to today's state.

COLD START (Day 1-7): Day 1 use archetype+goals+available data. Day 2-6 reference trajectory. Day 7 reference week pattern. Never generic, never reference missing data.

FEW-SHOT EXAMPLES (architectural templates, synthesize, don't copy):
EXAMPLE 1, Day 1 · No Wearable · Onboarding Only:
{"phrase":"Baseline day.","body":"Pattern recognition is your archetype edge and Composure your goal, <strong>Internal Buffer is the variable to track</strong>. Tomorrow we begin reading the signals.","leanOn":[{"signal":"Pattern Recognition","source":"ARCHETYPE"}],"watchFor":[{"signal":"Over-Analysis Early","source":"ARCHETYPE"}]}

EXAMPLE 2, Sunday Evening · Heavy Week · High-Stakes Monday:
{"phrase":"Monday is loaded.","body":"HRV down 14%, investor call at 9am, <strong>Strategic Composure depends on how you close tonight</strong>. The first hour sets the week.","leanOn":[{"signal":"Sunday composure","source":"PATTERN"}],"watchFor":[{"signal":"Over-preparing tonight","source":"PATTERN"}]}

EXAMPLE 3, Decision Leakage (Emotional Labor):
{"phrase":"Town Hall risk.","body":"HRV down 18%, mental energy depleted. Resilience compressed, <strong>Decision Leakage risk in the 2 PM Town Hall</strong>. HR has spiked in your last 3 Town Halls.","leanOn":[{"signal":"Pre-Town-Hall composure track","source":"PATTERN"}],"watchFor":[{"signal":"Late-session reactivity","source":"PATTERN"}]}

EXAMPLE 4, MASKED_HIGH · Veto Risk:
{"phrase":"Body is louder.","body":"Confidence 5/5, HRV 22% below, sleep 5.1hrs, <strong>Operational Drive is borrowed, not earned</strong>. Board prep at 11am: protect the 2 hours before.","leanOn":[{"signal":"Recovery Intelligence","source":"ARCHETYPE"}],"watchFor":[{"signal":"Performing Resilience","source":"ARCHETYPE"}]}

EXAMPLE 5, Baseline Intelligence (no calendar, no wearable):
{"phrase":"Holding base.","body":"Mental sharpness 3/5, no calendar pressure, <strong>Internal Buffer stable for future load</strong>. Hardware Recovery is the hold today.","leanOn":[{"signal":"Composure Instinct","source":"ARCHETYPE"}],"watchFor":[{"signal":"Spreading energy wide","source":"PATTERN"}]}

Output ONLY valid JSON: {"phrase":"...","body":"...","leanOn":[{"signal":"...","source":"..."}],"watchFor":[{"signal":"...","source":"..."}]}`;
          // ── User Prompt (v4 structured data sections) ──
          const isEveningForPrompt = hour >= 17;

          // Outer-scope copy of the consecutive-low-days streak for the prompt.
          // The inner-scope `consecutiveLowDays` (declared ~line 3040) is out of scope here;
          // referencing it caused a ReferenceError that blanked the post-check-in brief.
          // See mem://reliability/brief-prompt-variable-scoping.
          let consecutiveLowDaysForPrompt = 0;
          for (const c of recentCheckIns) {
            if (
              (c as any).energy_balance != null &&
              (c as any).energy_balance < 50
            ) consecutiveLowDaysForPrompt++;
            else break;
          }

          // Persisted causality patterns for Bucket 3 — read-only, non-blocking.
          // signal_summary is computed daily by cause-effect-engine and cached
          // in causality_findings. Missing row = brief proceeds without it.
          type CausalitySignalSummary = {
              event_to_hrv?: Array<
                { event_type: string; n: number; hrvDeltaPct: number; confidence: string }
              >;
              event_to_rhr?: Array<
                { event_type: string; n: number; rhrDeltaPct: number; confidence: string }
              >;
              event_to_cognition?: Array<
                {
                  event_type: string;
                  dim: string;
                  tierDelta: number;
                  n: number;
                  confidence: string;
                }
              >;
              sleep_to_prs?:
                | { lowSleepPrsDeltaPct: number; n: number; confidence: string }
                | null;
              consecutive_load?:
                | { tailDeltaPct: number; n: number; confidence: string }
                | null;
              performance_lift?: {
                hr_event_lift?: Array<
                  {
                    bucket: string;
                    categoryName: string;
                    hrDeltaBpm: number;
                    n: number;
                    confidence: string;
                  }
                >;
                category_lift?: Array<
                  {
                    categoryName: string;
                    compositeLift: number;
                    n: number;
                    confidence: string;
                  }
                >;
              };
          };
          let causalitySignalSummary: CausalitySignalSummary | null = null;
          {
            const _causalityT0 = Date.now();
            try {
              const { data: causalityRow } = await db
                .from("causality_findings")
                .select("signal_summary")
                .eq("user_id", userId)
                .eq("pattern_kind", "cause_effect_v2")
                .eq("computed_for_date", userLocalDate)
                .maybeSingle();
              if ((causalityRow as any)?.signal_summary) {
                causalitySignalSummary =
                  (causalityRow as any).signal_summary as CausalitySignalSummary;
              }
            } catch (_e) {
              causalitySignalSummary = null;
            }
            console.log(
              `[brief][causality] read ms=${
                Date.now() - _causalityT0
              } hit=${causalitySignalSummary ? "yes" : "no"}`,
            );
          }

          // §8 canonical block header — replaces the legacy `=== TIME ===`
          // block. `dayKind` (travel / PTO / holiday / weekend / conference)
          // is carried inside this CONTEXT block via the shared
          // `buildWindowContext()` output appended further below.
          const _contextHeader = `=== CONTEXT: ${
            contextHeaderForSlot(timeOfDayStr)
          } ===`;
          let userPrompt = `${PRE_COMPUTED_USER_NOTICE}\n\n${_contextHeader}\nTime: ${localTimeStr} · Slot: ${timeOfDayStr} · Day: ${dayName}\nIs weekend: ${
              isWeekend ? "yes" : "no"
            } · Is Sunday evening: ${
              isSundayEvening2 ? "yes" : "no"
            } · Is Monday morning: ${
              isMondayMorning ? "yes" : "no"
            }\nIs Friday evening: ${
              isFridayEvening ? "yes" : "no"
            } · Is day before rest day: ${
              isDayBeforeRestDay ? "yes" : "no"
            }\nIs public holiday: ${isPublicHoliday ? "yes" : "no"}${
              holidayName ? " · Holiday: " + holidayName : ""
            }\nHours remaining in workday: ${hoursRemaining ?? "null"}`;

          // ══════════════════════════════════════════════════════════════
          // BUCKET 1 — PHYSIOLOGICAL STATE
          // "What is the body and mind doing right now?"
          // ══════════════════════════════════════════════════════════════
          userPrompt += `\n\n=== BUCKET 1: PHYSIOLOGICAL STATE ===`;
          userPrompt += `\nWhat the body and mind are doing right now.`;

          // === READINESS ===
          userPrompt += `\n\n=== READINESS ===\nScore: ${
            typeof innerReadinessScore === "number"
              ? `${innerReadinessScore}/100`
              : "awaiting"
          } · Tier: ${safeTier} ← reasoning context only, never echo in output\nScore yesterday: ${
            yesterdayScore ?? "null"
          } · Trend: ${scoreTrend ?? "stable"}`;
          {
            const _mrsLine = mrsConsistencyLine(bandValence);
            if (_mrsLine) userPrompt += `\n${_mrsLine}`;
          }
          if (typicalDOWScore != null) {
            userPrompt += `\nScore vs typical ${dayName}: ${
              scoreVsTypicalDOW ?? "null"
            }`;
          }
          // Mental Energy = /daily-check-in outcome (emotional self-declared); Mental Sharpness = /check-in-detail slider
          userPrompt += `\nMental Energy (self-declared, /daily-check-in): ${
            currentCheckInOutcome ?? "null"
          }`;
          userPrompt += `\nMental Sharpness (slider, /check-in-detail): ${
            currentMentalSharpnessLevel ?? "null"
          }/5 · Clarity: ${currentClarityLevel ?? "null"}/5 · Confidence: ${
            currentConfidenceLevel ?? "null"
          }/5`;
          userPrompt +=
            `\nEmotional self-declared (Decision Leakage trigger source): ${
              currentCheckInOutcome ?? "null"
            }`;
          userPrompt +=
            `\nConsecutive low days: ${consecutiveLowDaysForPrompt}`;
          if (stateShiftToday) {
            userPrompt +=
              ` · State shift today: yes · Direction: ${stateShiftDirection}`;
          }

          // === SIGNAL PILL TIERS ===
          userPrompt += `\n\n=== SIGNAL PILL TIERS ===`;
          userPrompt +=
            `\nDecision Readiness pill the user will see: ${preLLMDecisionTier}`;
          userPrompt +=
            `\nPhysical Reserves pill the user will see: ${preLLMPhysicalTier}`;
          userPrompt +=
            `\nPILL CONSISTENCY RULE (hard): body must never contradict these tiers.`;
          userPrompt +=
            `\nMIND FOGGY → never write "sharp", "clear", "decision power high".`;
          userPrompt +=
            `\nMIND SHARP → never write "spent", "taxed", "foggy", "mind is carrying".`;
          userPrompt +=
            `\nBODY STRAINED/BODY DEPLETED → never write "body is recovered", "physical runway clear".`;
          userPrompt +=
            `\nWhen pill tier and felt-state contradict: name both in beat (a) without resolving — the tension IS the story.`;
          // MRS awareness — reasoning context only, never displayed.
          userPrompt += `\nMRS the user will see: ${
            typeof innerReadinessScore === "number"
              ? innerReadinessScore
              : "awaiting"
          }/100 · band: ${bandValence ?? "unknown"} · tier: ${safeTier}`;
          userPrompt +=
            `\nMRS CONSISTENCY RULE (hard): never state or imply the numeric score or the tier word in the output, but the prose direction must match the band — low = constrained/protective, mid = selective/uneven, high = capacity available.`;
          userPrompt +=
            `\nIf the MRS band and the pill tiers disagree, lead beat (a) with the pill tier the user can literally see and let the band shape posture only.`;

          userPrompt += `\n\n=== DATA AVAILABILITY CONTRACT ===`;
          if (briefWearableUsable) {
            userPrompt +=
              `\nWearable signals are present. You may reference ONLY the wearable fields explicitly printed in the WEARABLE section below.`;
          } else {
            userPrompt +=
              `\nNo wearable signal exists for this brief. Do NOT mention HRV, RHR, heart rate, sleep, baseline, recovery metrics, or imply that the body is recovered / rested / under-recovered from wearable evidence.`;
            if (signalFreshness.wearableHistoricalOnly) {
              userPrompt +=
                `\nOlder wearable rows exist (age ${
                  signalFreshness.wearableSourceAgeDays ?? "unknown"
                } days) but they are NOT current for the ${briefWindow} window. They may only inform baselines/trends and must never be stated as today's physiology.`;
            }
          }
          if (
            currentCheckInOutcome || currentMentalSharpnessLevel != null ||
            currentClarityLevel != null || currentConfidenceLevel != null
          ) {
            userPrompt +=
              `\nCurrent-period check-in is present. You may reference ONLY the check-in fields explicitly printed in the READINESS section above.`;
          } else {
            userPrompt +=
              `\nNo current-period check-in exists for this brief. Do NOT mention mental energy, clarity, confidence, sharpness, felt state, self-declared state, or the check-in.`;
          }
          userPrompt +=
            `\nIf a source is absent, pivot to the sources that are present. Never fabricate missing evidence.`;
          if (assessmentPromptSection) userPrompt += assessmentPromptSection;

          // === WEARABLE ===
          if (briefWearableUsable) {
            userPrompt += `\n\n=== WEARABLE ===`;
            if (hrvValue != null) {
              userPrompt += `\nHRV: ${hrvValue}ms · Baseline: ${
                hrvBaseline ?? "null"
              }ms · Deviation: ${
                hrvDeviation != null
                  ? (hrvDeviation >= 0 ? "+" : "") + hrvDeviation
                  : "null"
              }% · Unusual: ${hrvUnusual ? "yes" : "no"}`;
            }
            if (sleepDuration != null) {
              const sleepHrs = (sleepDuration / 60).toFixed(1);
              const sleepBaseHrs = sleepBaseline
                ? (sleepBaseline / 60).toFixed(1)
                : "null";
              userPrompt +=
                `\nSleep: ${sleepHrs}hrs · Baseline: ${sleepBaseHrs}hrs · Deviation: ${
                  sleepDeviation != null
                    ? (sleepDeviation >= 0 ? "+" : "") + sleepDeviation
                    : "null"
                }% · Below 6hr floor: ${sleepHardFloor ? "yes" : "no"}`;
            } else if (sleepScoreVal != null) {
              userPrompt += `\nSleep score: ${sleepScoreVal} · Baseline: ${
                sleepBaseline ?? "null"
              } · Deviation: ${
                sleepDeviation != null
                  ? (sleepDeviation >= 0 ? "+" : "") + sleepDeviation
                  : "null"
              }%`;
            }
            if (rhrValue != null) {
              userPrompt += `\nRHR: ${rhrValue}bpm · Baseline: ${
                rhrBaseline ?? "null"
              }bpm · Deviation: ${
                rhrDeviation != null
                  ? (rhrDeviation >= 0 ? "+" : "") + rhrDeviation
                  : "null"
              }%`;
            }
            // Heart Rate (proxy via HRV-derived hrElevated until raw HR column exists; see hr-elevated-proxy-logic memory)
            const hrElevatedFlag =
              (wearableContext as any)?.hrElevated === true;
            userPrompt += `\nHeart Rate (elevated proxy): ${
              hrElevatedFlag ? "yes (sympathetic dominance)" : "no"
            }`;
            userPrompt += `\nDivergence: ${divergenceMode ?? "null"}`;
            if (wearableTrend7d) {
              userPrompt += `\nWearable trend (7d): ${wearableTrend7d}`;
            }
            userPrompt += `\nWearable confidence: ${
              wearableConfidence ?? "null"
            }`;
          }

          // ══════════════════════════════════════════════════════════════
          // BUCKET 2 — CALENDAR & DAY SHAPE
          // "What does today, yesterday, and tomorrow demand?"
          // ══════════════════════════════════════════════════════════════
          userPrompt += `\n\n=== BUCKET 2: CALENDAR & DAY SHAPE ===`;
          userPrompt +=
            `\nWhat today, yesterday, and tomorrow demand — and what kind of day this is.`;

          // === CALENDAR TODAY ===
          if (calendarLoad) {
            userPrompt += `\n\n=== CALENDAR TODAY ===`;
            userPrompt +=
              `\nLoad: ${calendarLoad} · High-stakes meetings: ${todayHighStakes.length}`;
            // Pair every high-stakes title with its own local HH:mm and A-H
            // category suffix so the LLM never invents or rounds the clock and
            // understands the relative importance of each moment.
            if (todayHighStakes.length > 0) {
              const pairedToday = todayHighStakes.map((t, i) => {
                const tm = todayHighStakesEventTimes[i];
                const cat = todayHighStakesCategories[i];
                const suffix = cat ? ` [${cat}]` : "";
                return tm ? `${tm} ${t}${suffix}` : `${t}${suffix}`;
              }).join("; ");
              userPrompt += `\nHigh-stakes (local time, title [category]): ${pairedToday}`;
            }
            userPrompt += `\nTotal meetings: ${
              calendarResult.meetingCount ?? 0
            }`;
            if (hasBackToBack) {
              userPrompt +=
                `\nBack-to-back: yes · Longest block: ${longestBackToBackHrs}hrs`;
            }
            if (nextEventAny) {
              const t = (nextEventAny as any).localHHmm;
              userPrompt += `\nNext event: ${nextEventAny.title}${
                t ? ` at ${t}` : ""
              } (in ${nextEventAny.minutesUntil}mins)`;
            }
            if (nextHighStakesEvent) {
              const t = (nextHighStakesEvent as any).localHHmm;
              const nextCat = categoryNameOf(nextHighStakesEvent.title || "");
              const nextSuffix = nextCat ? ` [${nextCat}]` : "";
              userPrompt += `\nNext high-stakes: ${nextHighStakesEvent.title}${nextSuffix}${
                t ? ` at ${t}` : ""
              } (in ${nextHighStakesEvent.minutesUntil}mins)`;
            }
            userPrompt +=
              `\nCLOCK TIME RULE: When referencing any event time in the body, use ONLY the HH:mm strings provided above, character-for-character. Never invent, round, shift, or reformat clock times. If no time is provided for an event, omit the time entirely rather than guessing.`;
            userPrompt +=
              `\nEVENT IMPORTANCE GUIDE (A highest → H lowest): A=Board & Governance (board, audit, regulatory), B=Influence & Persuasion (pitch, investor, key negotiation), C=Visibility & Communication (media, town hall, keynote), D=Interpersonal High-Stakes (1:1 hard talk, performance, layoff), E=Deep Work & Strategy (planning, review, writing), F=Conferences & External Events, G=Travel, H=Daily Rhythm & Baseline. Focus beat (c) on the highest-category event.`;
          }

          // === TOMORROW === (evenings, Friday, Sunday)
          if (
            (isEveningForPrompt || isFridayEvening || isSundayEvening2) &&
            tomorrowLoad
          ) {
            const dayNames3 = [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ];
            const tomorrowDayName = dayNames3[(dayOfWeek + 1) % 7];
            userPrompt += `\n\n=== TOMORROW ===`;
            userPrompt += `\nDay: ${tomorrowDayName} · Load: ${tomorrowLoad}`;
            // Pair every high-stakes title with its own local time and A-H
            // category suffix so the LLM cannot mis-glue a title to an unrelated
            // line's time and understands relative importance.
            if (tomorrowHighStakesTitles.length > 0) {
              const paired = tomorrowHighStakesTitles.map((t, i) => {
                const tm = tomorrowHighStakesEventTimes[i];
                const cat = tomorrowHighStakesCategories[i];
                const suffix = cat ? ` [${cat}]` : "";
                return tm ? `${tm}, ${t}${suffix}` : `${t}${suffix}`;
              }).join(", ");
              userPrompt +=
                `\nHigh-stakes meetings (with local times [category]): ${paired}`;
            }
            if (tomorrowFirstMeetingPair) {
              userPrompt +=
                `\nFirst scheduled meeting: ${tomorrowFirstMeetingPair}`;
            }
            if (tomorrowVsTodayLoad) {
              userPrompt += `\nTomorrow vs today: ${tomorrowVsTodayLoad}`;
            }
          }

          // === WEEK AHEAD === (Sunday evening only)
          if (isSundayEvening2 && weekAheadShape) {
            const wa = weekAheadShape as any;
            userPrompt += `\n\n=== WEEK AHEAD ===`;
            userPrompt += `\nMonday: load ${
              wa.mondayLoad ?? "null"
            } · High-stakes: ${wa.mondayHasHighStakes ? "yes" : "no"}`;
            if (wa.mondayFirstEvent) {
              userPrompt +=
                `\nMonday first event: ${wa.mondayFirstEvent.title} · ${wa.mondayFirstEvent.time}`;
            }
            userPrompt += `\nHeaviest day: ${wa.heaviestDay ?? "null"}`;
            if (wa.firstHighStakesDay) {
              userPrompt += `\nFirst high-stakes: ${wa.firstHighStakesDay}`;
            }
            userPrompt += `\nTotal high-stakes next week: ${
              wa.totalHighStakesNextWeek ?? 0
            }`;
            if (wa.lightDaysNextWeek?.length > 0) {
              userPrompt += ` · Light days: ${wa.lightDaysNextWeek.join(", ")}`;
            }
          }

          // ══════════════════════════════════════════════════════════════
          // BUCKET 3 — PATTERNS & HISTORY
          // "What has this person's history taught us?"
          // ══════════════════════════════════════════════════════════════
          userPrompt += `\n\n=== BUCKET 3: PATTERNS & HISTORY ===`;
          userPrompt +=
            `\nWhat this person's own history has taught us. Never state a pattern without its confidence tag and a tie to today.`;

          // Causality patterns from cause-effect-engine's cached signal_summary.
          // Personalised event→physiology / event→cognition correlations so the
          // brief can name a pattern that is true for THIS person.
          if (causalitySignalSummary) {
            const todayEventTypes = new Set(
              (todayHighStakes ?? [])
                .map((t: string) => enrichOf(t).subtype?.bucket ?? null)
                .filter(Boolean) as string[],
            );

            // HR × event — the PRIMARY event-level signal (intraday, measured
            // during the event window). HRV is overnight recovery, not in-event.
            const sortedHrCorr =
              (causalitySignalSummary.performance_lift?.hr_event_lift ?? [])
                .filter((f) => f.n >= 3 && Math.abs(f.hrDeltaBpm) >= 8)
                .sort((a, b) => Math.abs(b.hrDeltaBpm) - Math.abs(a.hrDeltaBpm));
            const todayHrCorr = sortedHrCorr.filter((f) =>
              todayEventTypes.has(f.bucket)
            );
            const hrCorrToShow = [
              ...todayHrCorr,
              ...sortedHrCorr.filter((f) => !todayEventTypes.has(f.bucket)),
            ].slice(0, 2);
            if (hrCorrToShow.length > 0) {
              userPrompt +=
                `\n\nHeart Rate × event correlations (what happens to your body DURING these events):`;
              userPrompt +=
                `\nNote: HR is the intraday signal — measured in real time during the event window, not overnight.`;
              for (const f of hrCorrToShow) {
                const todayFlag = todayEventTypes.has(f.bucket) ? " ← TODAY" : "";
                userPrompt += `\n${f.categoryName}: peak HR rises +${
                  Math.round(f.hrDeltaBpm)
                } bpm above resting · n=${f.n} · ${f.confidence}${todayFlag}`;
              }
              if (todayHrCorr.length > 0) {
                userPrompt +=
                  `\nIf today contains a ← TODAY event: name this pattern in beat (c).`;
              }
            }

            // RHR × event — next-morning recovery signal.
            const sortedRhrCorr = (causalitySignalSummary.event_to_rhr ?? [])
              .filter((f) => f.n >= 3 && f.rhrDeltaPct > 10)
              .sort((a, b) => b.rhrDeltaPct - a.rhrDeltaPct)
              .slice(0, 2);
            if (sortedRhrCorr.length > 0) {
              userPrompt +=
                `\n\nRecovery after events (next-morning RHR elevation = body still recovering):`;
              for (const f of sortedRhrCorr) {
                const todayFlag = todayEventTypes.has(f.event_type)
                  ? " ← TODAY"
                  : "";
                userPrompt += `\n${f.event_type}: next-morning RHR elevated +${
                  Math.round(f.rhrDeltaPct)
                }% · n=${f.n} · ${f.confidence}${todayFlag}`;
              }
            }

            // HRV × event — overnight recovery only, max one line.
            const sortedHrvCorr = (causalitySignalSummary.event_to_hrv ?? [])
              .filter((f) => f.n >= 3 && Math.abs(f.hrvDeltaPct) >= 15)
              .sort((a, b) => Math.abs(b.hrvDeltaPct) - Math.abs(a.hrvDeltaPct))
              .slice(0, 1);
            for (const f of sortedHrvCorr) {
              const todayFlag = todayEventTypes.has(f.event_type) ? " ← TODAY" : "";
              userPrompt +=
                `\n\nPost-event overnight recovery (HRV next morning — recovery signal only, not in-event):`;
              userPrompt += `\n${f.event_type}: next-morning HRV ${
                f.hrvDeltaPct < 0 ? "lower" : "higher"
              } by ~${Math.abs(Math.round(f.hrvDeltaPct))}% · n=${f.n} · ${f.confidence}${todayFlag}`;
            }

            // Cognition × event — which events drain clarity / sharpness.
            const sortedCogCorr = (causalitySignalSummary.event_to_cognition ?? [])
              .filter((f) => f.n >= 3 && f.tierDelta < -0.4)
              .sort((a, b) => a.tierDelta - b.tierDelta)
              .slice(0, 2);
            if (sortedCogCorr.length > 0) {
              userPrompt +=
                `\n\nCognition × event correlations (documented clarity/sharpness impact):`;
              for (const f of sortedCogCorr) {
                const todayFlag = todayEventTypes.has(f.event_type)
                  ? " ← TODAY"
                  : "";
                userPrompt += `\n${f.event_type}: ${f.dim} drops ~${
                  Math.abs(f.tierDelta).toFixed(1)
                } tiers · n=${f.n} · ${f.confidence}${todayFlag}`;
              }
            }

            const sp = causalitySignalSummary.sleep_to_prs;
            if (sp && Math.abs(sp.lowSleepPrsDeltaPct) >= 8) {
              userPrompt +=
                `\nSleep → next-day score: low-sleep nights reduce next-day score by ~${
                  Math.abs(Math.round(sp.lowSleepPrsDeltaPct))
                }% · n=${sp.n} · ${sp.confidence}`;
            }

            const cl = causalitySignalSummary.consecutive_load;
            if (cl && Math.abs(cl.tailDeltaPct) >= 8) {
              userPrompt +=
                `\nBack-to-back heavy days: recovery drops ~${
                  Math.abs(Math.round(cl.tailDeltaPct))
                }% after 2+ heavy calendar days · n=${cl.n} · ${cl.confidence}`;
            }

            const positiveCategories =
              (causalitySignalSummary.performance_lift?.category_lift ?? [])
                .filter((c) => c.compositeLift > 5)
                .slice(0, 2);
            if (positiveCategories.length > 0) {
              userPrompt +=
                `\nEvents that correlate with better performance for this person: ${
                  positiveCategories.map((c) =>
                    `${c.categoryName} (+${c.compositeLift.toFixed(0)}% PRS, n=${c.n})`
                  ).join("; ")
                }`;
            }
          }

          // === PATTERNS === (conditional on check-in count)
          if (checkInCountTotal >= 3) {
            userPrompt += `\n\n=== PATTERNS ===`;
            if (avgScore7d != null) {
              userPrompt += `\n7d avg score: ${avgScore7d} · Trajectory: ${
                scoreTrajectory7d ?? "stable"
              }`;
            }
            if (dominantOutcome7d) {
              userPrompt += `\nDominant state this week: ${dominantOutcome7d}`;
            }
            if (wearableTrend7d) {
              userPrompt += `\nWearable trend (7d): ${wearableTrend7d}`;
            }
            if (practiceCompletionRate > 0) {
              userPrompt += `\nPractice completion: ${practiceCompletionRate}%`;
            }
            if (daysSinceCoachSession != null) {
              userPrompt += `\nDays since last coach: ${daysSinceCoachSession}`;
            }
            if (coachSessionImpactDelta != null) {
              userPrompt += ` · Coach impact delta: ${
                coachSessionImpactDelta > 0 ? "+" : ""
              }${coachSessionImpactDelta} pts`;
            }

            if (checkInCountTotal >= 7) {
              // W3: `Score: N` intentionally removed from the LLM-facing
              // typical-DOW block. The qualitative `Score vs typical …`
              // line (better / worse / consistent / unavailable) upstream
              // is the only comparison the body may express. Leaking the
              // raw integer here caused occasional numeric-score-restatement
              // in bodies ("the score's at 70") that then had to be caught
              // by validateNoScoreRestatement — remove the temptation at
              // the source.
              if (typicalDOWOutcome) {
                userPrompt +=
                  `\nTypical ${dayName} outcome: ${typicalDOWOutcome}`;
              }
              if (frictionTrend) {
                userPrompt += `\nFriction trend (30d): ${frictionTrend}`;
              }
              if (hrvEventCorrelation) {
                userPrompt += `\nHRV correlation: ${hrvEventCorrelation}`;
              }
              if (mostEffectivePractice) {
                userPrompt +=
                  `\nMost effective practice: ${mostEffectivePractice}`;
              }
            }

            if (checkInCountTotal >= 30) {
              if (serverArchetype) {
                userPrompt += `\nArchetype: ${serverArchetype}`;
              }
              if (leanOnResult.leanOn) {
                userPrompt += ` · Lean-on: ${leanOnResult.leanOn}`;
              }
              if (leanOnResult.watchFor) {
                userPrompt += ` · Watch-for: ${leanOnResult.watchFor}`;
              }
              if (coachStrength) {
                userPrompt += `\nCoach strength: ${coachStrength}`;
              }
              if (coachGrowth) {
                userPrompt += `\nCoach growth area: ${coachGrowth}`;
              }
              if (pendingCommitment) {
                userPrompt +=
                  `\nPending coach commitment: ${pendingCommitment}`;
              }
              if (recentPattern) {
                userPrompt += `\nRecent coach pattern: ${recentPattern}`;
              }
            }
          }

          // === ONBOARDING === (always when available)
          {
            const onboardingParts: string[] = [];
            if (serverPracticePriorityTag) {
              const goalLabels: Record<string, string> = {
                regulation_composure: "Composure under pressure",
                regulation_early: "Early signal detection",
                recovery_resilience: "Recovery and resilience",
                energy_endurance: "Energy endurance",
                focus_clarity: "Focus and clarity",
                mindset_reframe: "Mindset reframing",
              };
              onboardingParts.push(
                `Goals: ${
                  goalLabels[serverPracticePriorityTag] ||
                  serverPracticePriorityTag
                }`,
              );
            }
            if (serverArchetype) {
              let archLine = `Archetype: ${serverArchetype}`;
              if (leanOnResult.leanOn) {
                archLine += ` · Lean-on: ${leanOnResult.leanOn}`;
              }
              if (leanOnResult.watchFor) {
                archLine += ` · Watch-for: ${leanOnResult.watchFor}`;
              }
              onboardingParts.push(archLine);
            }
            if (serverComponentScores) {
              const cs = serverComponentScores as any;
              const dims = [
                { name: "Recalibration", score: cs.energyRegulation || 0 },
                { name: "Clarity", score: cs.focusRecovery || 0 },
                { name: "Renewal", score: cs.energyRenewal || 0 },
              ].sort((a, b) => b.score - a.score);
              onboardingParts.push(
                `Strength: ${dims[0].name} · Development area: ${
                  dims[dims.length - 1].name
                }`,
              );
            }
            if (onboardingParts.length > 0) {
              userPrompt += `\n\n=== ONBOARDING ===\n${
                onboardingParts.join("\n")
              }`;
            }
          }

          // === LEADER PROFILE === (from onboarding CoS synthesis)
          // Additive block — only rendered when fields are present. Existing
          // ONBOARDING block above is preserved.
          {
            const leaderParts: string[] = [];
            if (leaderProfile.goals.declared.length > 0) {
              leaderParts.push(
                `Leader goals: ${leaderProfile.goals.declared.join(", ")}`,
              );
            }
            if (leaderProfile.priors.high_stakes_map?.declared_events?.length) {
              leaderParts.push(
                `Declared high-stakes events: ${
                  leaderProfile.priors.high_stakes_map.declared_events.join(
                    ", ",
                  )
                }`,
              );
            }
            if (leaderProfile.analysis.archetype) {
              leaderParts.push(
                `Provisional archetype: ${leaderProfile.analysis.archetype}`,
              );
            }
            if (leaderProfile.goals.cos_accountability_note) {
              leaderParts.push(
                `CoS accountability note: ${leaderProfile.goals.cos_accountability_note}`,
              );
            }
            if (leaderParts.length > 0) {
              userPrompt += `\n\n=== LEADER PROFILE ===\n${
                leaderParts.join("\n")
              }`;
            }
          }

          // === TRIAGE SIGNALS === (top 5 for emphasis)
          if (selectedSignals.length > 0) {
            userPrompt += `\n\n=== KEY SIGNALS ===\n${
              selectedSignals.join("\n")
            }`;
          }

          // === GLOBAL & ENVIRONMENTAL LOAD === (timezone-derived; rest null until instrumented)
          {
            const tzHours = Math.round(-timezoneOffset / 60); // user's UTC offset in hours
            userPrompt += `\n\n=== GLOBAL & ENVIRONMENTAL LOAD ===`;
            userPrompt += `\nUser timezone offset (UTC): ${
              tzHours >= 0 ? "+" : ""
            }${tzHours}h`;
            // Traveling = current zone differs from home zone. Surface to the LLM
            // so it can apply §2.13 CIRCADIAN PRIORITY when relevant.
            if (
              effectiveCurrentTz && effectiveHomeTz &&
              effectiveCurrentTz !== effectiveHomeTz
            ) {
              userPrompt +=
                `\nTraveling: home ${effectiveHomeTz}, currently ${effectiveCurrentTz} (all event times above are in CURRENT zone)`;
            } else {
              userPrompt += `\nTravel/circadian drift: none`;
            }
            userPrompt +=
              `\nExternal market/macro pressure: null (not instrumented)`;
          }

          // === STRATEGIC CONTEXT === (derivable today)
          {
            // postPeakWindow: within 3h after a high-stakes event ended
            let postPeakWindow = false;
            if (
              todayHighStakes.length > 0 && nextHighStakesEvent &&
              nextHighStakesEvent.minutesUntil < 0 &&
              Math.abs(nextHighStakesEvent.minutesUntil) <= 180
            ) {
              postPeakWindow = true;
            }
            // isHighVisibilityToday: any high-stakes event today (board, town hall, investor, all-hands keywords)
            const visibilityRegex =
              /\b(board|town hall|townhall|investor|all-hands|allhands|earnings|press|keynote)\b/i;
            const isHighVisibilityToday = todayHighStakes.some((t: string) =>
              visibilityRegex.test(t)
            );
            userPrompt += `\n\n=== STRATEGIC CONTEXT ===`;
            userPrompt += `\npostPeakWindow: ${postPeakWindow ? "yes" : "no"}`;
            userPrompt += `\nisHighVisibilityToday: ${
              isHighVisibilityToday ? "yes" : "no"
            }`;

            // MRS v2 Phase D — snapshot-first hydration of patternSignals +
            // strategic_context + calendar_demand_score. Snapshot row is the
            // canonical SSOT (written by compute-outer-readiness mirror block
            // on every prior run; orchestrator backfills for cron callers).
            // Falls back to a dry-run composeDailyContext when the row is
            // missing (cold start) so the LLM still sees the v2 fields.
            // Never throws — readiness must keep flowing.
            try {
              let snap: any = null;
              try {
                // Phase 2 — window-scoped snapshot. Prefer current-window
                // row; fall back to latest row for today (legacy single-row
                // schema or earlier window in same day).
                const { data: snapRow } = await (db as any)
                  .from("daily_context_snapshot")
                  .select(
                    "pattern_signals, strategic_context, calendar_demand_score, supply_demand_gap_flag",
                  )
                  .eq("user_id", userId)
                  .eq("local_date", userLocalDate)
                  .eq("mrs_window", timeOfDayStr)
                  .maybeSingle();
                snap = snapRow ?? null;
                if (!snap) {
                  const { data: legacy } = await (db as any)
                    .from("daily_context_snapshot")
                    .select(
                      "pattern_signals, strategic_context, calendar_demand_score, supply_demand_gap_flag, mrs_window",
                    )
                    .eq("user_id", userId)
                    .eq("local_date", userLocalDate)
                    .order("updated_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (legacy) {
                    console.warn(
                      `[compute-outer-readiness] daily_context_snapshot legacy fallback (brief): no row for window=${timeOfDayStr}, using window=${
                        (legacy as any)?.mrs_window ?? "null"
                      }`,
                    );
                    snap = legacy;
                  }
                }
              } catch (_snapErr) { /* fall through to compose */ }

              let ps: any = snap?.pattern_signals ?? null;
              let strat: any = snap?.strategic_context ?? null;
              let demandScore: number | null =
                typeof snap?.calendar_demand_score === "number"
                  ? snap.calendar_demand_score
                  : null;
              const gapFlag: string | null = snap?.supply_demand_gap_flag ??
                null;

              if (!ps || !strat || demandScore == null) {
                try {
                  const composed = await composeDailyContext(
                    db as any,
                    userId,
                    userLocalDate,
                    {
                      timezone: effectiveCurrentTz ?? undefined,
                      dryRun: true,
                    },
                  );
                  ps = ps ?? composed.patternSignals;
                  strat = strat ?? composed.strategicContext;
                  demandScore = demandScore ?? composed.calendarDemandScore;
                } catch (composeErr) {
                  console.warn(
                    "[mrs-v2:brief] compose fallback failed:",
                    composeErr instanceof Error
                      ? composeErr.message
                      : composeErr,
                  );
                }
              }

              if (ps) {
                userPrompt += `\nhrv_3day_trend: ${
                  ps.hrv_3day_trend ?? "unknown"
                }`;
                userPrompt += `\nconsecutive_high_load_days: ${
                  ps.consecutive_high_load_days ?? 0
                }`;
                userPrompt += `\nsustained_deficit_flag: ${
                  ps.sustained_deficit_flag ? "yes" : "no"
                }`;
              }
              if (demandScore != null) {
                userPrompt += `\ncalendar_demand_score: ${demandScore}`;
              }
              if (gapFlag) {
                userPrompt += `\nsupply_demand_gap_flag: ${gapFlag}`;
              }
              if (strat) {
                if (strat.user_archetype) {
                  userPrompt += `\narchetype: ${strat.user_archetype}`;
                }
                if (strat.pressure_profile) {
                  userPrompt += `\npressure_profile: ${strat.pressure_profile}`;
                }
                if (
                  Array.isArray(strat.protection_goals) &&
                  strat.protection_goals.length > 0
                ) {
                  userPrompt += `\nprotection_goals: ${
                    strat.protection_goals.slice(0, 3).join(", ")
                  }`;
                }
              }
            } catch (e) {
              console.warn(
                "[mrs-v2:brief] snapshot hydration skipped:",
                e instanceof Error ? e.message : e,
              );
            }
          }

          // === TRIANGULATION ===
          if (crossHorizonConnection) {
            userPrompt += `\n\n=== TRIANGULATION ===`;
            if (immediateSignal) userPrompt += `\nNow: ${immediateSignal}`;
            if (tacticalSignal) userPrompt += `\nPattern: ${tacticalSignal}`;
            if (strategicSignal) {
              userPrompt += `\nDevelopment: ${strategicSignal}`;
            }
            userPrompt +=
              `\nConnection: ${crossHorizonConnection}, ${connectionFraming}`;
            userPrompt += `\nLead with: ${dominantHorizon}`;
          }

          // ═══════════════════════════════════════════════════════════════
          // SHARED-MODULE CONTEXT: CEO Behaviours + Event Taxonomy + M/A/E
          // ─────────────────────────────────────────────────────────────
          // Authoritative source for the Brief. Builds ONE SignalCoverageInput
          // from today's full event list (not just the next high-stakes one),
          // tomorrow's events, the wearable readings, and the check-in, then:
          //   1. buildBehaviourSnapshot → evaluates CEO behaviour rules for
          //      BOTH 'brief' and 'plan' scopes against an identical context.
          //      Returns flags + slotBoosts + a pre-formatted taxonomy block.
          //      Stored on brief_snapshots so generate-mastery-plan reads the
          //      SAME named events / stakes / boosts the Brief used.
          //   2. buildWindowContext → returns the Morning / Afternoon / Evening
          //      slice that matches the user's local clock (§3.1 evening JIT
          //      gear-shift included). Summarised into the prompt so body copy
          //      keys off the same window the Plan and Nudges will use.
          //
          // The LLM never re-states pillar copy or rule bodies — it consumes
          // the pre-formatted blocks from the shared modules. Any change to
          // CEO rules, event taxonomy, or window logic lands in
          // _shared/* and propagates here automatically.
          try {
            const wearableForCtx = briefWearableUsable
              ? {
                hrvDeviationPct: hrvDeviation ?? null,
                hrvUnusual: !!hrvUnusual,
                sleepHours: sleepDuration != null ? sleepDuration / 60 : null,
                sleepDeviationPct: sleepDeviation ?? null,
                rhrDeviationPct: rhrDeviation ?? null,
                hrElevatedProxy: (wearableContext as any)?.hrElevated === true,
              }
              : null;

            // Full event slice from the SHARED calendar fetcher. Falls back to
            // a synthesised single entry only when the calendar fetcher
            // returned no rows (e.g. disconnected) but we still have a known
            // next high-stakes event from upstream selection.
            let eventsForCtx = (calendarResult as any)?.briefEvents ?? [];
            if (
              (!eventsForCtx || eventsForCtx.length === 0) &&
              nextHighStakesEvent
            ) {
              eventsForCtx = [{
                title: nextHighStakesEvent.title as string,
                startTime: new Date(
                  Date.now() + (nextHighStakesEvent.minutesUntil ?? 0) * 60_000,
                ).toISOString(),
                endTime: new Date(
                  Date.now() +
                    ((nextHighStakesEvent.minutesUntil ?? 0) + 60) * 60_000,
                ).toISOString(),
                isAllDay: false,
                stakesLevel: "external" as const,
              }];
            }
            const tomorrowEventsForCtx = (tomorrowResult as any)?.briefEvents ??
              [];
            const yesterdayEventsForCtx = (yesterdayResult as any)?.briefEvents ??
              [];

            // Part 1 — hydrate travel_state so awayFromHome / travelTier are
            // populated on the matrix. Fail-open: any error leaves the
            // travelState field undefined and rules behave exactly as before.
            //
            // Sprint 10 / Phase 9B: STALENESS GUARD.
            //   • We do NOT trust `updated_at` — the travel-state-sync producer
            //     touches it on skip runs for freshness bookkeeping only.
            //   • We trust only `last_state_change_at` (real state transition)
            //     or `last_location_at` (real coord fix). If neither is fresh,
            //     we ignore the row and let day-type / behaviour rules fall back
            //     to calendar-title travel detection (see day-type.ts:142).
            let travelStateForCtx:
              | { state?: string | null; distanceFromHomeKm?: number | null }
              | null = null;
            try {
              const { data: tsRow } = await (db as any)
                .from("travel_state")
                .select(
                  "state, distance_from_home_km, last_state_change_at, last_location_at",
                )
                .eq("user_id", userId)
                .maybeSingle();
              const freshness = decideTravelFreshness({
                state: (tsRow as any)?.state ?? null,
                lastStateChangeAt: (tsRow as any)?.last_state_change_at ?? null,
                lastLocationAt: (tsRow as any)?.last_location_at ?? null,
                now: new Date(),
              });
              console.log("[travel-state][consumer]", {
                fn: "compute-outer-readiness",
                used: freshness.used,
                reason: freshness.reason,
                hasRow: !!tsRow,
                state: (tsRow as any)?.state ?? null,
              });
              if (tsRow && freshness.used) {
                travelStateForCtx = {
                  state: (tsRow as any).state ?? null,
                  distanceFromHomeKm: (tsRow as any).distance_from_home_km ??
                    null,
                };
              }
            } catch (tsErr) {
              console.warn(
                "[compute-outer-readiness] travel_state hydration skipped:",
                tsErr instanceof Error ? tsErr.message : tsErr,
              );
            }

            briefBehaviourSnapshot = buildBehaviourSnapshot({
              coverage: {
                wearable: wearableForCtx,
                checkIn: {
                  emotionalSelfDeclared: currentCheckInOutcome,
                  mentalSharpness: currentMentalSharpnessLevel,
                  confidence: currentConfidenceLevel,
                  clarity: currentClarityLevel,
                },
                scoreToday: innerReadinessScore ?? null,
                scoreYesterday: yesterdayScore ?? null,
                trailingClarityAvg: null,
                timezone: {
                  offsetMinutes: -timezoneOffset,
                  shift48hHours: null,
                  travelDay: !!(effectiveCurrentTz && effectiveHomeTz &&
                    effectiveCurrentTz !== effectiveHomeTz),
                },
                travelState: travelStateForCtx,
                events: eventsForCtx,
                tomorrowEvents: tomorrowEventsForCtx,
                now: new Date(),
              },
              extras: { dayOfWeek },
            });

            const promptLocalNow = new Date(
              Date.now() - timezoneOffset * 60000,
            );
            const eventCoachingToday = buildEventCoachingBlock(
              "TODAY",
              eventsForCtx as BriefPromptEvent[],
              promptLocalNow,
            );
            const eventCoachingTomorrow = buildEventCoachingBlock(
              "TOMORROW",
              tomorrowEventsForCtx as BriefPromptEvent[],
              promptLocalNow,
            );
            if (eventCoachingToday) userPrompt += eventCoachingToday;
            if (eventCoachingTomorrow) userPrompt += eventCoachingTomorrow;

            // Brief/Plan parity: when travel is a material Plan anchor, make
            // the combined day story explicit. The behaviour/taxonomy blocks
            // below are detailed enough for rules, but the LLM can still
            // over-focus on the first work event unless the body/timing load
            // and work demands are summarized together in one short line.
            try {
              const travelFlags = new Set([
                "travelPreFlightMandatory",
                "travelLandingOffload",
                "travelLandingPlusHighStakes",
                "longHaulRecovery",
                "postTripReentry",
                "travelInFlightConnection",
                "circadianPriority",
              ]);
              const allFlags = [
                ...briefBehaviourSnapshot.flagsBrief,
                ...briefBehaviourSnapshot.flagsPlan,
              ];
              const hasTravelFlag = allFlags.some((f) =>
                travelFlags.has(String(f.rule))
              );
              const travelEvents = (eventsForCtx as BriefPromptEvent[])
                .filter((e) => isTravelTitle(e?.title))
                .map((e) => e.title)
                .filter(Boolean);
              const workEvents = (eventsForCtx as BriefPromptEvent[])
                .filter((e) => !isTravelTitle(e?.title) && !e.isAllDay)
                .map((e) => e.title)
                .filter(Boolean)
                .slice(0, 3);
              if (
                (hasTravelFlag || travelEvents.length > 0) &&
                workEvents.length > 0
              ) {
                materialTravelContextActive = true;
                materialWorkEventTitles = workEvents;
                const travelLabel = travelEvents[0]
                  ? `travel (${travelEvents[0]})`
                  : "travel";
                userPrompt += [
                  "",
                  "",
                  "=== MATERIAL DAY CONTEXT ===",
                  `${travelLabel} is the body/timing load; ${
                    workEvents.join(" and ")
                  } ${workEvents.length === 1 ? "is" : "are"} the work demand${
                    workEvents.length === 1 ? "" : "s"
                  }.`,
                  "The Brief body must acknowledge both when Plan uses travel as an anchor.",
                ].join("\n");
              }
            } catch (_e) {
              materialTravelContextActive = false;
              materialWorkEventTitles = [];
            }

            // ── DAY SHAPE (read-only projection of Plan/JIT v2 signals) ──
            // No new detection: `briefBehaviourSnapshot.signals` is the SAME
            // matrix the Plan reads (PTO / holiday / travel-by-type /
            // conference / full-day events). The Brief now states the day
            // shape explicitly and the system prompt gets the matching
            // directive so Brief and Plan tell one story.
            try {
              const shape = deriveDayShape(briefBehaviourSnapshot.signals, {
                isPublicHoliday,
                holidayName,
                isWeekend,
              });
              briefDayShape = shape.shape;
              briefTravelPhase = shape.travelPhase;
              userPrompt += formatDayShapeBlock(shape);
              systemPrompt = buildBriefSystemPrompt({
                bandValence,
                isWeekend,
                dayShape: shape.shape,
                travelPhase: shape.travelPhase,
              });
              systemPromptWithLeader = systemPrompt + leaderVoiceBlock;
              console.log(
                `[compute-outer-readiness] day-shape=${shape.shape} travelPhase=${
                  shape.travelPhase ?? "none"
                } reason="${shape.reason}"`,
              );
            } catch (e) {
              console.warn(
                "[compute-outer-readiness] day-shape derivation skipped:",
                e instanceof Error ? e.message : e,
              );
            }

            // ── LEAD NARRATIVE (Part 1A) ──
            // One resolved story for today: family, anchor event (A–H category
            // + subtype via the single resolver), phase, depletion overlay and
            // the day-level aggregates the scenario copy needs. Consumed by the
            // LLM prompt below AND by the deterministic renderer, so the two
            // paths cannot disagree about which event is the story.
            try {
              briefLeadNarrative = resolveLeadNarrative({
                events: (eventsForCtx ?? []) as Array<
                  {
                    title: string;
                    startTime: string;
                    endTime?: string | null;
                    isAllDay?: boolean;
                  }
                >,
                now: new Date(),
                dayShape: briefDayShape,
                travelPhase: briefTravelPhase,
                travelTier: briefBehaviourSnapshot?.signals?.travelTier ?? null,
                conferenceDayNumber:
                  briefBehaviourSnapshot?.signals?.conferenceDayNumber ?? null,
                conferenceTotalDays:
                  briefBehaviourSnapshot?.signals?.conferenceTotalDays ?? null,
                sleepScore: typeof sleepScoreVal === "number"
                  ? sleepScoreVal
                  : null,
                checkInOutcome: currentCheckInOutcome as
                  | "sharp"
                  | "holding"
                  | "drained"
                  | null,
                yesterdayScore: yesterdayScore ?? null,
              });
              userPrompt += formatLeadNarrativeBlock(briefLeadNarrative);
              console.log("[compute-outer-readiness] lead-narrative", {
                family: briefLeadNarrative.family,
                phase: briefLeadNarrative.phase,
                anchor: briefLeadNarrative.anchor?.title ?? null,
                category: briefLeadNarrative.anchor?.categoryId ?? null,
                depletion: briefLeadNarrative.depletion,
                reason: briefLeadNarrative.reason,
              });
            } catch (e) {
              briefLeadNarrative = null;
              console.warn(
                "[compute-outer-readiness] lead-narrative resolution skipped:",
                e instanceof Error ? e.message : e,
              );
            }



            // ── LOAD SHAPE (reader; gated by LOAD_SHAPE_RENDER_ENABLED) ──
            // Read-only: the shape was classified once by build-daily-context
            // and stored on daily_context_snapshot. Silent when the gate is
            // closed, nothing is stored, or the shape is not launch-ready.
            try {
              const loadShape = getLoadShapeOrDefault(
                await fetchRenderableLoadShape(
                  db,
                  userId,
                  userLocalDate,
                )
              );
              const shapeBlock = briefShapePromptBlock(loadShape);
              if (shapeBlock) {
                userPrompt += shapeBlock;
                console.log(
                  `[compute-outer-readiness] load-shape=${loadShape?.shapeId}`,
                );
              }
            } catch (e) {
              console.warn(
                "[compute-outer-readiness] load-shape read skipped:",
                e instanceof Error ? e.message : e,
              );
            }

            // Append shared event-coaching context first, then the taxonomy
            // block (pure event labelling), then the behaviour block
            // (rule outputs, deterministic). Order matters: behaviour rules
            // reference event names; the preceding blocks ground those names
            // in phase, pillar focus, and protocol intent.
            if (briefBehaviourSnapshot.taxonomyBlock) {
              userPrompt += briefBehaviourSnapshot.taxonomyBlock;
            }
            if (briefBehaviourSnapshot.promptBlockBrief) {
              userPrompt += briefBehaviourSnapshot.promptBlockBrief;
            }

            // ── Brief↔Plan parity probe (logging only, no behaviour change) ──
            // If today's events include a travel-titled event but no travel
            // behaviour rule fired for the Brief, the Brief LLM will silently
            // omit the travel arc while Plan still anchors on it via JIT/
            // event-taxonomy. Surface that drift in logs so future regressions
            // are caught early. travelDay/longHaulFlight self-derivation in
            // brief-signal-coverage.ts should keep this from firing.
            try {
              const hasTravelEvent = (eventsForCtx as Array<{ title?: string }>)
                .some(
                  (e) => isTravelTitle(e?.title),
                );
              if (hasTravelEvent) {
                const travelRuleFired = briefBehaviourSnapshot.flagsBrief.some(
                  (f) =>
                    f.rule === "travelPreFlightMandatory" ||
                    f.rule === "travelLandingOffload" ||
                    f.rule === "travelLandingPlusHighStakes" ||
                    f.rule === "longHaulRecovery",
                );
                if (!travelRuleFired) {
                  console.warn(
                    `[compute-outer-readiness] PARITY DRIFT: travel event on calendar but no travel rule fired for Brief. sig=${briefBehaviourSnapshot.signatureHash} flagsBrief=${
                      briefBehaviourSnapshot.flagsBrief.map((f) => f.rule).join(
                        ",",
                      ) || "none"
                    }`,
                  );
                }
              }
            } catch (_e) { /* probe must never throw */ }

            // ── Window context (Morning / Afternoon / Evening) ──
            // Pure derivation from the same event list. Summarised, not
            // re-stated as raw signals (the LLM doesn't need every field).
            try {
              const toClassified = (
                arr: Array<
                  {
                    title: string;
                    startTime: string;
                    endTime: string;
                    isAllDay: boolean;
                  }
                >,
              ): ClassifiedEventLite[] =>
                arr.map((e) => ({
                  start_time: e.startTime,
                  end_time: e.endTime,
                  is_organizer: false,
                  attendees_count: 0,
                  is_recurring: false,
                  title: e.title,
                  event_metadata: null,
                }));
              briefWindowContext = buildWindowContext({
                now: promptLocalNow,
                todayEvents: toClassified(eventsForCtx),
                tomorrowEvents: toClassified(tomorrowEventsForCtx),
                yesterdayEvents: toClassified(yesterdayEventsForCtx),
                wearable: {
                  hrvToday: typeof hrvValue === "number" ? hrvValue : null,
                  hrvBaseline30d: typeof hrvBaseline === "number"
                    ? hrvBaseline
                    : null,
                  rhrToday: typeof rhrValue === "number" ? rhrValue : null,
                  rhrBaseline30d: typeof rhrBaseline === "number"
                    ? rhrBaseline
                    : null,
                  sleepHours: sleepDuration != null ? sleepDuration / 60 : null,
                  sleepScore: typeof sleepScoreVal === "number"
                    ? sleepScoreVal
                    : null,
                  sleepScoreBaseline30d: typeof sleepBaseline === "number"
                    ? sleepBaseline
                    : null,
                },
                conferenceDayNumber: null,
              });
              if (briefWindowContext) {
                const w = briefWindowContext as any;
                userPrompt += `\n\n=== WINDOW CONTEXT (${w.window}) ===`;
                if (w.window === "morning") {
                  userPrompt +=
                    `\nyesterday_load: ${w.yesterdayLoad} (score ${w.yesterdayLoadScore})`;
                  userPrompt += `\nyesterday_had_high_stakes: ${
                    w.yesterdayHadHighStakes ? "yes" : "no"
                  }`;
                  if (yesterdayEventsForCtx.length > 0 && w.yesterdayHadHighStakes) {
                    const yHighStakes = yesterdayEventsForCtx
                      .filter((e: any) => {
                        return categoryNameOf(e.title || "") !== null;
                      })
                      .slice(0, 3)
                      .map((e: any) => {
                        return `${e.title} [${categoryNameOf(e.title || "")}]`;
                      })
                      .join("; ");
                    if (yHighStakes) {
                      userPrompt += `\nyesterday_high_stakes_events: ${yHighStakes}`;
                    }
                  }
                  userPrompt += `\nsleep_quality: ${
                    w.sleepQuality ?? "unknown"
                  }`;
                  userPrompt += `\ntoday_meeting_count: ${w.todayMeetingCount}`;
                  if (w.todayFirstHighStakes) {
                    userPrompt +=
                      `\ntoday_first_high_stakes: ${w.todayFirstHighStakes.title}`;
                  }
                  if (w.vetoRisk) userPrompt += `\nveto_risk: yes`;
                } else if (w.window === "afternoon") {
                  userPrompt += `\nmeetings_completed: ${w.meetingsCompleted}`;
                  userPrompt += `\nmeetings_remaining: ${w.meetingsRemaining}`;
                  if (w.highestRemainingStakes) {
                    userPrompt +=
                      `\nhighest_remaining_stakes: ${w.highestRemainingStakes.title}`;
                  }
                  if (w.backToBackRemainingHours > 0) {
                    userPrompt +=
                      `\nback_to_back_remaining_hours: ${w.backToBackRemainingHours}`;
                  }
                  if (w.decisionLeakageRisk) {
                    userPrompt += `\ndecision_leakage_risk: yes`;
                  }
                  if (w.jitEventsRemaining > 0) {
                    userPrompt +=
                      `\njit_events_remaining: ${w.jitEventsRemaining}`;
                  }
                } else if (w.window === "evening") {
                  userPrompt += `\nmode: ${w.mode}`;
                  userPrompt +=
                    `\ntoday_completed_count: ${w.todayCompletedCount}`;
                  userPrompt += `\ntoday_had_high_stakes: ${
                    w.todayHadHighStakes ? "yes" : "no"
                  }`;
                  if (w.bodyLoadElevated) {
                    userPrompt += `\nbody_load_elevated: yes`;
                  }
                  userPrompt += `\nrecovery_note: ${w.recoveryNote}`;
                  if (w.tomorrowFirstHighStakes) {
                    userPrompt +=
                      `\ntomorrow_first_high_stakes: ${w.tomorrowFirstHighStakes.title}`;
                  }
                  if (w.tomorrowIsHeavy) {
                    userPrompt += `\ntomorrow_is_heavy: yes`;
                  }
                  if (w.jitRemainingEvening) {
                    userPrompt +=
                      `\njit_remaining_evening: yes (Close framing suppressed; finish JIT prep before close)`;
                  }
                }
              }
            } catch (we) {
              console.warn(
                "[compute-outer-readiness] window-context skipped:",
                we,
              );
            }

            console.log("[compute-outer-readiness] shared-module snapshot", {
              window: (briefWindowContext as any)?.window ?? null,
              flagsBrief: briefBehaviourSnapshot.flagsBrief.length,
              flagsPlan: briefBehaviourSnapshot.flagsPlan.length,
              slotBoosts: briefBehaviourSnapshot.slotBoosts.length,
              taxonomyBlock: briefBehaviourSnapshot.taxonomyBlock
                ? "yes"
                : "no",
              signatureHash: briefBehaviourSnapshot.signatureHash,
              todayEvents: eventsForCtx.length,
              tomorrowEvents: tomorrowEventsForCtx.length,
            });
          } catch (e) {
            console.warn(
              "[compute-outer-readiness] shared-module snapshot skipped:",
              e,
            );
          }

          const sysPromptLen = systemPrompt.length;
          const userPromptLen = userPrompt.length;
          console.log(
            `[compute-outer-readiness] [LLM] Prompt sizes: system=${sysPromptLen} user=${userPromptLen} total=${
              sysPromptLen + userPromptLen
            } chars`,
          );
          console.log(
            "[compute-outer-readiness] [LLM] Signals:",
            JSON.stringify({
              checkInOutcome,
              clarityLevel,
              confidenceLevel,
              calendarLoad,
              meetingCount: calendarResult.meetingCount,
              isWeekend,
              checkInCountTotal,
              dataCompleteness,
              hasWearable,
              wearableDaysConnected,
            }),
          );

          // ── v6.1 Post-Generation Validation ──
          const WELLNESS_BLACKLIST =
            /\b(relax|mindful|breathe|calm|wellness|self-care|journey|nourish|recharge|restore|genuine|authentic|hardware|biometric|machine|device)\b/i;
          // Forbid em dash (—) and en dash (–) used as sentence breaks. We allow numeric ranges like "0–2" / "2-3"
          // but reject any dash surrounded by letters or whitespace, which is the typographic clause break.
          const DASH_BREAK = /(?:\s[—–]\s|[A-Za-z]\s*[—–]\s*[A-Za-z])/;
          // Allow compound words like "high-stakes", "high-pressure", "low-energy" — only reject standalone tier words
          const TIER_BLACKLIST = /\b(moderate|high|low|strong)\b(?![-‑])/i;
          const READINESS_WORD = /\breadiness\b/i;

          // §2.18 Phrase Priority Weight: forbidden openers + coaching imperatives
          const PHRASE_FORBIDDEN_OPENER = /^(you|your|the)\b/i;
          const COACHING_IMPERATIVE =
            /\b(you should|you need to|try to|consider|make sure|remember to)\b/i;

          // §2.20 Elastic Lexicon clusters — body must contain ≥1 cluster concept.
          // Word lists are SSOT'd in _shared/brief/elastic-lexicon.ts and shared
          // with the atomic validator + the LLM prompt's LEXICON ANCHOR block.
          // buildLexiconRegex produces the exact same alternations these
          // literals used before — no rule or threshold change.
          const LEXICON_COGNITION = buildLexiconRegex(
            INLINE_LEXICON_WORDS.cognition,
          );
          const LEXICON_PHYSIOLOGY = buildLexiconRegex(
            INLINE_LEXICON_WORDS.physiology,
          );
          const LEXICON_RESILIENCE = buildLexiconRegex(
            INLINE_LEXICON_WORDS.resilience,
          );
          // Executive-context cluster (additive) — CEO-behaviour-driven copy
          // grounded in the leader's day: board room, travel, high-stakes work.
          const LEXICON_EXECUTIVE_CONTEXT = buildLexiconRegex(
            INLINE_LEXICON_WORDS.executiveContext,
          );

          // Approved state-quality words (additive Signal-Evidence acceptance).
          // Natural executive prose that names grounded state without raw
          // numbers should still pass body_no_signal_evidence.
          const STATE_QUALITY_WORDS =
            /\b(recovery|sleep|rested|fatigued|sharp|foggy|drained|steady|compressed|elevated|shifted|heavy|light|loaded)\b/i;
          // §2.22 Calendar-empty whitelist
          const BASELINE_LEXICON =
            /\b(base[- ]?level|baseline intelligence|stabili[sz]ing|base for future load|hold the base)\b/i;

          // §2.19.1 Pattern-relevance gate: if pattern keywords used, require today-context anchor
          const PATTERN_KEYWORDS =
            /\b(previously|pattern|last\s+\d|consistently|spiked in|in your last|every|recurring)\b/i;

          // SSOT four-beat validator. Do not create a third validator.
          function validateV61Output(
            parsed: any,
            phraseText: string | null,
            bodyTextStr: string | null,
            opts: { strict?: boolean } = {},
          ): { valid: boolean; reason: string; softReject?: boolean } {
            // Phrase validation
            if (!phraseText) return { valid: false, reason: "phrase_missing" };
            if (WELLNESS_BLACKLIST.test(phraseText)) {
              return { valid: false, reason: "phrase_wellness_word" };
            }
            if (DASH_BREAK.test(phraseText)) {
              return { valid: false, reason: "phrase_em_dash" };
            }
            if (TIER_BLACKLIST.test(phraseText)) {
              return { valid: false, reason: "phrase_tier_word" };
            }
            if (READINESS_WORD.test(phraseText)) {
              return { valid: false, reason: "phrase_readiness_word" };
            }
            if (PHRASE_FORBIDDEN_OPENER.test(phraseText.trim())) {
              return { valid: false, reason: "phrase_forbidden_opener" };
            }
            if (COACHING_IMPERATIVE.test(phraseText)) {
              return { valid: false, reason: "phrase_coaching_imperative" };
            }

            // §2.18 Phrase length (loosened): 2–4 words accepted, 5 words
            // soft-reject (retry once with stricter instruction), 6+ hard-reject.
            // Many valid CoS phrases are naturally 4 words.
            const phraseWords = phraseText.trim().replace(/[.!?,;:]/g, "")
              .split(/\s+/).filter(Boolean);
            if (phraseWords.length >= 6) {
              return {
                valid: false,
                reason: `phrase_hard_reject_${phraseWords.length}w`,
              };
            }
            if (phraseWords.length === 5 && !opts.strict) {
              return {
                valid: false,
                reason: "phrase_soft_reject_5w",
                softReject: true,
              };
            }

            const GENERIC_PHRASE =
              /\b(awareness|prevents?|regrets?|future|potential|inner|strength|power|courage|deserve|believe|transform|unlock|embrace|overcome|thrive)\b/i;
            if (
              GENERIC_PHRASE.test(phraseText) && !/\d/.test(phraseText) &&
              !todayHighStakes.some((e: string) =>
                phraseText!.toLowerCase().includes(
                  e.trim().toLowerCase().slice(0, 10),
                )
              )
            ) {
              return { valid: false, reason: "phrase_generic_motivational" };
            }

            // Body validation
            if (!bodyTextStr) return { valid: false, reason: "body_missing" };
            if (READINESS_WORD.test(bodyTextStr)) {
              return { valid: false, reason: "body_readiness_word" };
            }
            if (WELLNESS_BLACKLIST.test(bodyTextStr)) {
              return { valid: false, reason: "body_wellness_or_hardware_word" };
            }
            if (DASH_BREAK.test(bodyTextStr)) {
              return { valid: false, reason: "body_em_dash" };
            }
            const strippedBody = bodyTextStr.replace(/<[^>]+>/g, "");
            const wordCount = strippedBody.split(/\s+/).length;
            // v6.4 — body is visible analysis, four beat-weighted beats,
            // hard cap 60 words (target 45–55). The work directive (beat c)
            // is the most load-bearing beat and needs room to be specific;
            // self-regulation (beat d) is a 3–6 word closing clause.
            if (wordCount > 60) {
              return { valid: false, reason: `body_too_long_${wordCount}w` };
            }

            // v2.1 — body must not echo any of the 5 one-line score reads verbatim.
            const ONE_LINE_READS: string[] = [
              "full strength - go after it",
              "full strength — go after it",
              "ready and clear",
              "holding the line - solid, not your peak",
              "holding the line — solid, not your peak",
              "running on reserves - pick your battles",
              "running on reserves — pick your battles",
              "running on empty - today's about protecting yourself",
              "running on empty — today's about protecting yourself",
            ];
            const bodyLowerNorm = strippedBody.toLowerCase();
            for (const r of ONE_LINE_READS) {
              if (bodyLowerNorm.includes(r.toLowerCase())) {
                return { valid: false, reason: "body_restates_one_line_read" };
              }
            }
            if (
              materialTravelContextActive &&
              !MATERIAL_TRAVEL_BODY_RX.test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_omits_material_travel_context",
              };
            }
            if (
              materialTravelContextActive && materialWorkEventTitles.length > 0
            ) {
              const significantWorkTokenMentioned = materialWorkEventTitles
                .some((title) => {
                  const tokens = String(title || "")
                    .toLowerCase()
                    .split(/[^a-z0-9]+/)
                    .filter((token) =>
                      token.length >= 4 &&
                      !["with", "from", "today", "review", "meeting"].includes(
                        token,
                      )
                    );
                  return tokens.some((token) => bodyLowerNorm.includes(token));
                });
              if (!significantWorkTokenMentioned) {
                return {
                  valid: false,
                  reason: "body_omits_material_work_context",
                };
              }
            }

            // v2.1 — abstract system phrases banned in body.
            const ABSTRACT_SYSTEM_PHRASES = [
              "come down clean",
              "hold the base",
              "mask the surge",
              "optimise the window",
              "optimize the window",
              "leverage your physiological runway",
            ];
            for (const p of ABSTRACT_SYSTEM_PHRASES) {
              if (bodyLowerNorm.includes(p)) {
                return { valid: false, reason: "body_abstract_system_phrase" };
              }
            }

            // v2.1 — body must not restate the phrase verbatim.
            if (phraseText) {
              const phraseNorm = phraseText.trim().toLowerCase().replace(
                /[.!?,;:"']/g,
                "",
              );
              if (
                phraseNorm.length >= 6 && bodyLowerNorm.includes(phraseNorm)
              ) {
                return { valid: false, reason: "body_restates_phrase" };
              }
            }

            // v2.1 — light non-repetition check: reject any repeated 4-word run.
            {
              const tokens = bodyLowerNorm
                .replace(/[.,;:!?"'()]/g, " ")
                .split(/\s+/)
                .filter(Boolean);
              const seen = new Set<string>();
              for (let i = 0; i + 4 <= tokens.length; i++) {
                const gram = tokens.slice(i, i + 4).join(" ");
                if (seen.has(gram)) {
                  return { valid: false, reason: "body_repeated_4gram" };
                }
                seen.add(gram);
              }
            }

            // §2.19.5 RULE 1 — body must not restate the numeric score or tier label
            // Forbidden patterns: "31/100", "score of 31", "31 out of 100", "your score is", "low/high readiness score"
            if (/\b\d{1,3}\s*\/\s*100\b/.test(strippedBody)) {
              return { valid: false, reason: "body_restates_score_xx_100" };
            }
            if (
              /\b(score\s+(of|is)|your\s+score|readiness\s+score)\b/i.test(
                strippedBody,
              )
            ) return { valid: false, reason: "body_restates_score_phrase" };
            if (/\b\d{1,3}\s+out\s+of\s+100\b/i.test(strippedBody)) {
              return { valid: false, reason: "body_restates_score_out_of_100" };
            }
            // 2026-07-11 — tightened after "Readiness sits at 79" leaked. Cover
            // conversational score restatements the earlier regexes missed:
            //   "Readiness sits at 79", "score reads 79", "you're at 79",
            //   "sitting at 79", "coming in at 79", "landing at 79".
            if (
              /\breadiness\s+(sits\s+at|reads|is\s+at|at|stands\s+at|came\s+in\s+at)\s+\d{1,3}\b/i
                .test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_restates_readiness_sits_at",
              };
            }
            if (
              /\bscore\s+(sits\s+at|reads|came\s+in\s+at|stands\s+at)\s+\d{1,3}\b/i
                .test(strippedBody)
            ) {
              return { valid: false, reason: "body_restates_score_reads" };
            }
            if (
              /\b(you(?:'re| are)\s+at|sitting\s+at|landing\s+at|coming\s+in\s+at)\s+\d{1,3}\b(?!\s*(?:am|pm|o'clock|min|hour|h\b|%))/i
                .test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_restates_conversational_score",
              };
            }
            // Tier label restatement (e.g. "you're depleted today", "in peak today")
            if (
              /\b(you(?:'re|\sare)\s+(depleted|managing|strong|peak)|(?:in|at)\s+(depleted|managing|strong|peak)\s+(?:state|tier|today))\b/i
                .test(strippedBody)
            ) {
              return { valid: false, reason: "body_restates_tier_label" };
            }

            // §2.19.5 RULE 2 — body must not be a data list (≥2 metric qualifiers in close proximity)
            // Match patterns like "HRV down 20%", "RHR -18%", "sleep 6h", "HRV is 20% below"
            const metricPattern =
              /\b(HRV|RHR|HR|sleep|bpm)\b[^.,;]{0,40}?(\d+\s*(%|h\b|hr|hrs|hours?|bpm|min)|\d+\s*(?:%|h\b)\s*(?:below|above|under|over|down|up))/gi;
            const metricMatches = strippedBody.match(metricPattern) || [];
            if (metricMatches.length >= 2) {
              return {
                valid: false,
                reason: `body_metric_list_${metricMatches.length}`,
              };
            }

            // §2.19 Signal Evidence — number OR named event
            const hasNumberOrEvent = /\d/.test(strippedBody) ||
              (todayHighStakes.length > 0 &&
                todayHighStakes.some((e: string) =>
                  strippedBody.toLowerCase().includes(
                    e.trim().toLowerCase().slice(0, 12),
                  )
                ));
            // Calendar-empty path: also accept if Baseline Intelligence lexicon is present
            const isCalendarEmpty = todayHighStakes.length === 0 &&
              (calendarLoad === "low" || !calendarLoad);
            const baselineOK = isCalendarEmpty &&
              BASELINE_LEXICON.test(strippedBody);

            if (!hasNumberOrEvent && !baselineOK) {
              // Fallback to legacy data-vocab check to keep cold-start days valid
              const hasLegacyDataRef =
                /\b(HRV|RHR|HR|bpm|hrs?|hours?|sleep|baseline|pattern|streak|consecutive|archetype|goal|coach|meetings?|calendar|clarity|confidence|composure|sharpness|energy)\b/i
                  .test(strippedBody);
              // Additive loosening: also accept natural state-quality prose
              // ("recovery was short", "afternoon is heavy") without raw metrics.
              const hasStateQuality = STATE_QUALITY_WORDS.test(strippedBody);
              if (!hasLegacyDataRef && !hasStateQuality) {
                return { valid: false, reason: "body_no_signal_evidence" };
              }
            }

            // §2.20 Elastic Lexicon — body must contain ≥1 cluster concept
            // (cognition / physiology / resilience / executive-context), or
            // baseline lexicon when calendar-empty. Executive-context is
            // additive to support CEO-behaviour-driven copy.
            const hasLexicon = LEXICON_COGNITION.test(strippedBody) ||
              LEXICON_PHYSIOLOGY.test(strippedBody) ||
              LEXICON_RESILIENCE.test(strippedBody) ||
              LEXICON_EXECUTIVE_CONTEXT.test(strippedBody) || baselineOK;
            if (!hasLexicon) {
              return { valid: false, reason: "body_no_lexicon_cluster" };
            }

            // §2.19.1 Pattern-relevance gate: if pattern reference used, require today-signal AND today-context anchor
            if (PATTERN_KEYWORDS.test(strippedBody)) {
              const hasTodaySignal = /\d/.test(strippedBody);
              const hasTodayContext = todayHighStakes.some((e: string) =>
                strippedBody.toLowerCase().includes(
                  e.trim().toLowerCase().slice(0, 8),
                )
              ) ||
                /\b(today|tonight|this morning|this afternoon|this evening|now)\b/i
                  .test(strippedBody);
              if (!hasTodaySignal || !hasTodayContext) {
                return { valid: false, reason: "body_pattern_irrelevant" };
              }
            }

            // ── MRS Band-Gate (deterministic valence check) ──
            // Hard-reject bodies whose tone contradicts the canonical band.
            // Lists are intentionally short and high-confidence to avoid false
            // positives. Source of truth: bandValenceDirective() in
            // _shared/brief/copy-vocabulary.ts and resolveBand() in
            // compute-inner-readiness/index.ts.
            if (bandValence) {
              const _b = strippedBody.toLowerCase();
              const PUSH_TONE = [
                "push hard",
                "go after the day",
                "lead the charge",
                "spend the edge",
                "open the room",
                "own the room",
                "go after them",
                "front of the room",
              ];
              const PROTECT_TONE = [
                "protect yourself",
                "pull back",
                "do less today",
                "conserve your",
                "guard your reserves",
                "sit it out",
                "hold back today",
              ];
              const IMPROVE_SCORE =
                /\b(raise|lift|boost|improve|fix)\s+(your\s+)?(score|readiness|number)\b/i;
              if (IMPROVE_SCORE.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_prescribes_score_improvement",
                };
              }
              if (
                bandValence === "low" && PUSH_TONE.some((p) => _b.includes(p))
              ) {
                return {
                  valid: false,
                  reason: "body_valence_mismatch_low_push",
                };
              }
              if (
                bandValence === "high" &&
                PROTECT_TONE.some((p) => _b.includes(p))
              ) {
                return {
                  valid: false,
                  reason: "body_valence_mismatch_high_protect",
                };
              }
            }

            if (bodyTextStr.includes("**") || bodyTextStr.includes("* ")) {
              return { valid: false, reason: "body_asterisks" };
            }

            // 2026-07-11 — Time-of-day framing gate. Prevents morning framing
            // ("Anchor the first hour") landing in the evening and vice
            // versa. `hour` is captured from the outer request scope.
            // 2026-08-28 — Window now comes from the canonical SSOT
            // (getTimeOfDay: morning 05–11, afternoon 12–17, evening 18–04).
            // The old inline `hour < 12` split classified 00:00–04:59 as
            // MORNING while the snapshot row for those hours is written as
            // EVENING, so overnight briefs were rejected with
            // `body_evening_framing_in_morning` for using correct evening copy.
            {
              const _tw = getTimeOfDay(hour);

              const MORNING_PHRASES =
                /\b(first hour|start (?:of )?the day|morning block|front[- ]load(?:ing)? the morning|set the day|begin with|opening hours|open the day)\b/i;
              const EVENING_PHRASES =
                /\b(close (?:out )?the day|protect the evening|tonight|wind down|winding down|tomorrow morning|before sleep|before bed)\b/i;
              if (_tw === "evening" && MORNING_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_morning_framing_in_evening",
                };
              }
              if (_tw === "morning" && EVENING_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_evening_framing_in_morning",
                };
              }
            }

            // 2026-07-11 — False-neutrality gate. When physiological /
            // cognitive signals disagree (MASKED_HIGH or RECOVERY_UNDERWAY),
            // the body must not claim the day is neutral or that nothing is
            // standing out. `divergenceMode` is captured from the outer
            // request scope.
            if (divergenceMode && divergenceMode !== "ALIGNED") {
              const NEUTRAL_PHRASES =
                /\b(neutral day|no\s+(?:single\s+)?signal\s+dominat|evenly balanced|nothing\s+(?:is\s+)?(?:standing\s+out|dominant|clear))\b/i;
              if (NEUTRAL_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_false_neutrality_when_divergent",
                };
              }
            }

            // LeanOn/WatchFor validation
            const validateItems = (items: any[], label: string) => {
              if (!Array.isArray(items) || items.length === 0) {
                return { valid: false, reason: `${label}_missing_or_empty` };
              }
              for (const item of items) {
                if (
                  typeof item?.signal !== "string" ||
                  typeof item?.source !== "string"
                ) return { valid: false, reason: `${label}_missing_field` };
                const signal = item.signal.trim();
                const source = item.source.trim();
                if (!signal || !source) {
                  return { valid: false, reason: `${label}_missing_field` };
                }
                if (signal.split(/\s+/).length > 10) {
                  return {
                    valid: false,
                    reason: `${label}_too_long_${signal.split(/\s+/).length}w`,
                  };
                }
                if (signal.length > 60) {
                  return { valid: false, reason: `${label}_too_wide` };
                }
                if (WELLNESS_BLACKLIST.test(signal)) {
                  return { valid: false, reason: `${label}_bad_vocabulary` };
                }
                if (DASH_BREAK.test(signal)) {
                  return { valid: false, reason: `${label}_em_dash` };
                }

                // §2.18.5 Source must be ARCHETYPE | PATTERN | GOALS (COACH retired)
                const sourceUpper = source.toUpperCase();
                if (
                  !["ARCHETYPE", "PATTERN", "GOALS"].includes(
                    sourceUpper,
                  )
                ) {
                  return {
                    valid: false,
                    reason: `${label}_invalid_source_${sourceUpper}`,
                  };
                }

                // §2.18.5 Generic-trait blocklist (no source exception — COACH retired)
                const GENERIC_TRAIT =
                  /\b(self[- ]?honesty|self[- ]?awareness|self[- ]?discernment|discernment|alignment|conviction strength|execution confidence|clear direction)\b/i;
                if (GENERIC_TRAIT.test(signal)) {
                  return { valid: false, reason: `${label}_generic_trait` };
                }

                // v6.2: substring-overlap rule removed. It formed a trap with the
                // generic-trait gate (forced LLM into trait words → trait blocked →
                // fallback). Body↔Lean On overlap is now a soft signal — log only.
                if (bodyTextStr) {
                  const bodyLower = bodyTextStr.replace(/<[^>]+>/g, "")
                    .toLowerCase();
                  const signalLower = signal.toLowerCase();
                  if (
                    signalLower.length >= 8 && bodyLower.includes(signalLower)
                  ) {
                    console.log(
                      `[validator-soft] ${label} overlaps body, allowed but flagged`,
                    );
                  }
                }
              }
              return null;
            };
            const leanOnValidation = validateItems(parsed.leanOn, "leanOn");
            if (leanOnValidation) return leanOnValidation;
            const watchForValidation = validateItems(
              parsed.watchFor,
              "watchFor",
            );
            if (watchForValidation) return watchForValidation;
            return { valid: true, reason: "" };
          }

          const normalizeLlmBrief = (
            parsed: any,
            opts: { strict?: boolean } = {},
          ): {
            brief: LlmBriefPackage | null;
            reason: string;
            softReject?: boolean;
          } => {
            // Style-only punctuation normalization. The em/en dash used as a
            // clause break is a stylistic issue, not a semantic contract
            // violation. We rewrite it to a comma (or period when the dash
            // is preceded by a full clause) BEFORE validation so an
            // otherwise-valid brief is not blanked by punctuation alone.
            // Semantic validators (forbidden vocab, missing evidence, band
            // mismatch, invalid source labels, length caps) run unchanged.
            const normalizePunct = (input: string | null): string | null => {
              if (input == null) return input;
              let s = String(input);
              // Smart quotes → straight quotes.
              s = s.replace(/[\u2018\u2019]/g, "'").replace(
                /[\u201C\u201D]/g,
                '"',
              );
              // Space-em-dash-space / space-en-dash-space → ", ".
              s = s.replace(/\s+[—–]\s+/g, ", ");
              // Letter—letter (no spaces) as clause break → ", ".
              s = s.replace(/([A-Za-z])[—–]([A-Za-z])/g, "$1, $2");
              // Collapse ", ," and stray double spaces created above.
              s = s.replace(/,\s*,+/g, ",").replace(/\s{2,}/g, " ").trim();
              return s;
            };

            const rawPhrase =
              typeof parsed?.phrase === "string" && parsed.phrase !== "null"
                ? parsed.phrase.trim()
                : null;
            const rawBody =
              typeof parsed?.body === "string" && parsed.body !== "null"
                ? parsed.body.trim()
                : typeof parsed?.bodyText === "string" &&
                    parsed.bodyText !== "null"
                ? parsed.bodyText.trim()
                : null;
            const phrase = normalizePunct(rawPhrase);
            const bodyText = normalizePunct(rawBody);
            const rawLeanOn = Array.isArray(parsed?.leanOn)
              ? parsed.leanOn
              : null;
            const rawWatchFor = Array.isArray(parsed?.watchFor)
              ? parsed.watchFor
              : null;
            const normalizeItems = (items: any[] | null) =>
              items == null
                ? null
                : items.map((it) =>
                  it && typeof it === "object"
                    ? {
                      ...it,
                      signal: typeof it.signal === "string"
                        ? normalizePunct(it.signal)
                        : it.signal,
                    }
                    : it
                );
            const leanOn = normalizeItems(rawLeanOn);
            const watchFor = normalizeItems(rawWatchFor);

            const punctuationChanged = rawPhrase !== phrase ||
              rawBody !== bodyText ||
              JSON.stringify(rawLeanOn) !== JSON.stringify(leanOn) ||
              JSON.stringify(rawWatchFor) !== JSON.stringify(watchFor);

            const validation = validateV61Output(
              { ...parsed, leanOn, watchFor },
              phrase,
              bodyText,
              opts,
            );
            if (!validation.valid) {
              return {
                brief: null,
                reason: `validation_${validation.reason}`,
                softReject: validation.softReject,
              };
            }
            if (punctuationChanged) {
              console.log(
                "[compute-outer-readiness] [LLM] punctuation normalized and accepted",
              );
            }

            return {
              brief: {
                phrase: phrase!,
                bodyText: bodyText!,
                leanOn: leanOn!.map((item: BriefSignalItem) => ({
                  signal: item.signal.trim(),
                  source: item.source.trim(),
                })),
                watchFor: watchFor!.map((item: BriefSignalItem) => ({
                  signal: item.signal.trim(),
                  source: item.source.trim(),
                })),
              },
              reason: "",
            };
          };

          // ── Two-tier LLM strategy: fast Gemini first, Claude backup ──
          // v6.4 — timeouts raised. The brief synthesises 6–8 input blocks
          // through a 6-step reasoning chain and emits constrained JSON;
          // 4s is a budget for a light task, this is moderate-to-heavy.
          // Perceived latency cost of a few extra seconds is far lower than
          // a deterministic-fallback rate.
          // P0 2026-06-21 — bumped Gemini Flash timeout from 7000ms to 8000ms
          // (top of the spec'd 6-8s range) so transient gateway latency does
          // not push us into the deterministic-fallback path (now removed
          // from rendered output — see briefIsAwaiting gate below).
          const llmAttempts: Array<
            { model: string; timeoutMs: number; useGateway: boolean }
          > = [
            {
              model: "google/gemini-2.5-flash",
              timeoutMs: 15000,
              useGateway: true,
            },
            {
              model: CLAUDE_MODELS.SONNET,
              timeoutMs: 10000,
              useGateway: false,
            },
            // 2026-08-07 — Attempt 3 (second Claude Sonnet pass) removed.
            // Ladder is now exactly one attempt per provider:
            // Gemini -> Claude -> deterministic/awaiting. A third paid call
            // repeating the same validator failure is pure cost.
          ];

          // §2.18 stricter retry instruction appended on soft-reject (legacy
          // generic fallback). Used only if the targeted retry below is
          // unavailable for the given rule.
          const STRICT_PHRASE_RETRY =
            `\n\nSTRICT RETRY: Phrase MUST be 2–4 words. 5 words only if unavoidable and genuinely load-bearing; never 6+. Do not start with "you", "your", or "the".`;
          const FOUR_BEAT_RETRY_GUIDANCE =
            `\n\nRETRY BODY GUIDANCE: Structure your body as: [evidence clause] + [judgment clause] + [work-direction clause] + [closing protective clause]. Each beat can be a phrase, not a full sentence. The work-direction clause must contain a concrete work move tied to today's real demand, such as the board prep, the next call, the review block, the investor room, or the first decision window.`;

          // v6.4 — corrective retry: feed the SPECIFIC validator rule that
          // failed on attempt 1 into the retry prompt instead of a generic
          // "be stricter" nudge. Mapped from `normalized.reason`.
          const correctiveRetryInstruction = (rule: string): string => {
            const r = String(rule || "");
            const wordBan = r.match(
              /^(?:validation_)?(?:body|phrase)_(?:wellness_or_hardware_word|wellness_word|tier_word|readiness_word|forbidden_word).*$/i,
            );
            const wordCountMatch = r.match(
              /(?:body_too_long_|word_count_exceeded:?)(\d+)w?/i,
            );
            let cause: string;
            if (wordCountMatch) {
              cause = `your body exceeded 60 words (was ${
                wordCountMatch[1]
              } words). Tighten beats (a)–(c) and keep (d) to a 3–6 word closing clause.`;
            } else if (/forbidden_opener/i.test(r)) {
              cause =
                `your phrase started with a forbidden word ("you", "your", or "the"). Open with a verb or noun.`;
            } else if (/coaching_imperative/i.test(r)) {
              cause =
                `your phrase used a coaching imperative ("try", "consider", "should", "you need"). Make it a direct call, not advice.`;
            } else if (/phrase_hard_reject|phrase_soft_reject/i.test(r)) {
              cause =
                `your phrase length was wrong. MUST be 2–4 words; 5 only if unavoidable and genuinely load-bearing; never 6+.`;
            } else if (/phrase_generic_motivational/i.test(r)) {
              cause =
                `your phrase used a generic motivational word (e.g. "potential", "strength", "transform"). Anchor to today's evidence.`;
            } else if (/wellness/i.test(r) || wordBan) {
              cause =
                `you used a banned wellness/clinical/tier/hardware word. Use the executive substitutes: "settle", "steady", "hold your line", "keep your edge", "stay sharp", "pace yourself", "protect the next hour".`;
            } else if (/readiness_word/i.test(r)) {
              cause =
                `you used the word "readiness". Name the state in plain executive English instead.`;
            } else if (/em_dash/i.test(r)) {
              cause =
                `you used an em dash (—) inside the phrase or body. Use a comma or period instead.`;
            } else if (/WORK DIRECTIVE/i.test(r)) {
              cause =
                `your body was missing a clear work-facing directive beat. Add an explicit executive action such as protect, anchor, narrow, lead, hold, deploy, or ground.`;
            } else if (/SELF-REGULATION/i.test(r)) {
              cause =
                `your body was missing a short protective close. End with a brief 2–12 word closing clause, either after a connector or as a final directive-led sentence.`;
            } else if (/restates_one_line_read/i.test(r)) {
              cause =
                `your body echoed one of the canned one-line state reads. Reach a fresh judgement, do not restate the band line.`;
            } else if (/omits_material_travel_context/i.test(r)) {
              cause =
                `your body omitted the material travel / circadian context. Name it.`;
            } else if (/omits_material_work_context/i.test(r)) {
              cause =
                `your body omitted the material named work event. Name it.`;
            } else if (
              /missing_signal_evidence/i.test(r) || /lexicon/i.test(r)
            ) {
              cause =
                `your body was missing a grounded signal anchor — use a number with a unit, a named calendar event, or plain-language state evidence tied to real signals.`;
            } else if (/phrase_missing|body_missing/i.test(r)) {
              cause =
                `you returned null or empty for a required field. Both phrase and body must be present.`;
            } else if (/band_gate/i.test(r)) {
              cause =
                `your tone violated the band-gate (protective on a low day / permissive on a high day). Match the band.`;
            } else {
              cause = `validator rule "${r}".`;
            }
            return `\n\nCORRECTIVE RETRY: Your previous attempt failed validation: ${cause}\nFix ONLY that issue. Do not start over or add more analysis — just correct the specific problem named above.`;
          };

          for (let attempt = 1; attempt <= llmAttempts.length; attempt++) {
            const { model, timeoutMs, useGateway } = llmAttempts[attempt - 1];
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const startMs = Date.now();
            // v6.4 — when attempt N validator-rejected, prepend a targeted
            // corrective instruction to attempt N+1's user prompt so Claude
            // is told the specific rule that failed, not just "be stricter".
            const priorReject = llmAttemptRecords.length > 0
              ? llmAttemptRecords[llmAttemptRecords.length - 1]
              : null;
            const priorRule =
              priorReject && typeof priorReject.validatorRule === "string"
                ? String(priorReject.validatorRule)
                : null;
            const shouldUseRetryGuidance = !!priorReject &&
              (priorReject.outcome === "validator_reject" ||
                priorReject.outcome === "atomic_validator_reject");
            const attemptUserPrompt = shouldUseRetryGuidance
              ? userPrompt +
                (priorRule ? correctiveRetryInstruction(priorRule) : "") +
                FOUR_BEAT_RETRY_GUIDANCE
              : userPrompt;

            try {
              let content: string;
              if (useGateway) {
                content = await callLovableAIText({
                  system: systemPromptWithLeader,
                  messages: [{ role: "user", content: attemptUserPrompt }],
                  model,
                  max_tokens: 380,
                  response_format: { type: "json_object" },
                  signal: controller.signal,
                });
              } else {
                content = await callAIText({
                  system: systemPromptWithLeader,
                  messages: [{ role: "user", content: attemptUserPrompt }],
                  model,
                  max_tokens: 380,
                  cacheSystemPrompt: true,
                  response_format: { type: "json_object" },
                  signal: controller.signal,
                });
              }
              clearTimeout(timeout);
              const durationMs = Date.now() - startMs;
              console.log(
                `[compute-outer-readiness] [LLM] Attempt ${attempt} (${model}) completed in ${durationMs}ms`,
              );

              if (content) {
                try {
                  let jsonStr = content.trim();
                  if (jsonStr.startsWith("```")) {
                    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(
                      /```/g,
                      "",
                    ).trim();
                  }
                  const parsed = JSON.parse(jsonStr);

                  let normalized = normalizeLlmBrief(parsed);

                  // §2.18 Soft-reject on 5-word phrase: retry ONCE with stricter prompt (same model)
                  if (!normalized.brief && normalized.softReject) {
                    console.log(
                      `[compute-outer-readiness] [LLM] Attempt ${attempt} soft-reject (${normalized.reason}), retrying with STRICT_PHRASE_RETRY`,
                    );
                    const retryController = new AbortController();
                    const retryTimeout = setTimeout(
                      () => retryController.abort(),
                      timeoutMs,
                    );
                    try {
                      // v6.4 — targeted corrective retry; falls back to the
                      // generic STRICT_PHRASE_RETRY only for the 4-word
                      // phrase soft-reject path that historically used it.
                      const targeted = correctiveRetryInstruction(
                        normalized.reason,
                      );
                      const retryUserPrompt = userPrompt + FOUR_BEAT_RETRY_GUIDANCE + (targeted || STRICT_PHRASE_RETRY);
                      let retryContent: string;
                      if (useGateway) {
                        retryContent = await callLovableAIText({
                          system: systemPromptWithLeader,
                          messages: [{
                            role: "user",
                            content: retryUserPrompt,
                          }],
                          model,
                          max_tokens: 380,
                          response_format: { type: "json_object" },
                          signal: retryController.signal,
                        });
                      } else {
                        retryContent = await callAIText({
                          system: systemPromptWithLeader,
                          messages: [{
                            role: "user",
                            content: retryUserPrompt,
                          }],
                          model,
                          max_tokens: 380,
                          cacheSystemPrompt: true,
                          response_format: { type: "json_object" },
                          signal: retryController.signal,
                        });
                      }
                      clearTimeout(retryTimeout);
                      let retryJsonStr = retryContent.trim();
                      if (retryJsonStr.startsWith("```")) {
                        retryJsonStr = retryJsonStr.replace(/```json?\n?/g, "")
                          .replace(/```/g, "").trim();
                      }
                      const retryParsed = JSON.parse(retryJsonStr);
                      // Run validator in strict mode (4-word phrase now passes if other rules satisfied)
                      normalized = normalizeLlmBrief(retryParsed, {
                        strict: true,
                      });
                    } catch (retryErr) {
                      clearTimeout(retryTimeout);
                      console.warn(
                        `[compute-outer-readiness] [LLM] Strict-retry failed:`,
                        retryErr,
                      );
                    }
                  }

                  if (!normalized.brief) {
                    llmFallbackReason =
                      `attempt${attempt}_${normalized.reason}`;
                    const _bp = parsed?.body
                      ? String(parsed.body).replace(/<[^>]+>/g, "").slice(
                        0,
                        100,
                      )
                      : "(empty)";
                    console.warn(
                      `[compute-outer-readiness] [LLM] Attempt ${attempt} rejected: ${normalized.reason} | model=${model} | duration=${durationMs}ms`,
                    );
                    llmAttemptRecords.push({
                      model,
                      attempt,
                      durationMs,
                      outcome: "validator_reject",
                      rawReason: `attempt${attempt}_${normalized.reason}`,
                      validatorRule: normalized.reason,
                      httpStatus: null,
                      errorMessageHead: null,
                    });
                    llmValidatorRejections.push({
                      attempt,
                      model,
                      rule: normalized.reason,
                      phrasePreview: typeof parsed?.phrase === "string"
                        ? parsed.phrase.slice(0, 80)
                        : null,
                      bodyPreview: _bp,
                    });
                    continue; // Try next model
                  }

                  // ── §5.1 / §5.2 Atomic Brief Contract gate ──
                  // Runs after normalizeLlmBrief so the forbidden-word,
                  // Elastic Lexicon cluster, Signal Evidence, and §2.19.1
                  // pattern-relevance checks are enforced at runtime rather
                  // than being prompt-only. Rejection is treated exactly
                  // like the normaliser's validator_reject: log + push
                  // per-attempt diagnostics + `continue` to the next model.
                  // If every attempt fails, `llmBrief` stays null and the
                  // downstream `briefIsAwaiting` gate returns an awaiting
                  // Brief — never deterministic fallback prose.
                  const atomicCtx: any = {
                    signals: {
                      hrvDeviationPct: briefWearableUsable
                        ? (hrvDeviation ?? null)
                        : null,
                      hrvUnusual: briefWearableUsable && !!hrvUnusual,
                      sleepHours: briefWearableUsable && sleepDuration != null
                        ? sleepDuration / 60
                        : null,
                      sleepDeviationPct: briefWearableUsable
                        ? (sleepDeviation ?? null)
                        : null,
                      sleepBelow6h: briefWearableUsable && !!sleepHardFloor,
                      rhrDeviationPct: briefWearableUsable
                        ? (rhrDeviation ?? null)
                        : null,
                      hrElevatedProxy: briefWearableUsable &&
                        (wearableContext as any)?.hrElevated === true,
                      emotionalSelfDeclared: currentCheckInOutcome,
                      mentalSharpness: currentMentalSharpnessLevel,
                      confidence: currentConfidenceLevel,
                      timezoneOffsetMinutes: null,
                      timezoneShift48hHours: null,
                      travelDay: false,
                      yesterdayScore: yesterdayScore ?? null,
                      todayScore: innerReadinessScore ?? null,
                      postPeakWindow: false,
                      isHighVisibilityToday: false,
                      loadShape: typeof loadShape !== 'undefined' ? loadShape : null,
                      highStakesEventInNext24h: nextHighStakesEvent
                        ? {
                          title: nextHighStakesEvent.title,
                          minutesUntil: nextHighStakesEvent.minutesUntil,
                        }
                        : null,
                      emotionalDrainEventInNext4h: null,
                      morningWasCompressed: false,
                      middayRecoveryDetected: false,
                      clarityDropFromTrailingAvg: null,
                    },
                    behaviourFlags: [
                      ...(briefBehaviourSnapshot?.flagsBrief ?? []),
                      ...(briefBehaviourSnapshot?.flagsPlan ?? []),
                    ],
                    lexiconClusters: [],
                    forbiddenWords: [],
                    allowedPatternKeywords: [],
                  };
                  // W3 §4: pass the actual MRS into the shared validator
                  // so numeric restatement of the header score is rejected
                  // at the LLM entry point (before repair/retry). Pill
                  // context is not yet finalized here — the persistence-
                  // time revalidation below re-runs the pill/body gate
                  // once tiers are known.
                  const atomic = validateBrief(
                    normalized.brief.phrase,
                    normalized.brief.bodyText,
                    atomicCtx,
                    {
                      mrsScore: assessmentContext?.readiness.score ??
                        (typeof innerReadinessScore === "number"
                          ? innerReadinessScore
                          : null),
                      pillContext: assessmentContext
                        ? buildPillContextFromAssessment(assessmentContext)
                        : null,
                    },
                  );
                  if (!atomic.ok) {
                    const reason = atomic.reason || "atomic_reject";
                    llmFallbackReason = `attempt${attempt}_atomic_${reason}`;
                    console.warn(
                      `[compute-outer-readiness] [LLM] Attempt ${attempt} atomic-rejected: ${reason} | model=${model} | duration=${durationMs}ms`,
                    );
                    llmAttemptRecords.push({
                      model,
                      attempt,
                      durationMs,
                      outcome: "atomic_validator_reject",
                      rawReason: `attempt${attempt}_atomic_${reason}`,
                      validatorRule: reason,
                      httpStatus: 200,
                      errorMessageHead: null,
                    });
                    llmValidatorRejections.push({
                      attempt,
                      model,
                      rule: reason,
                      layer: "atomic",
                      phrasePreview: normalized.brief.phrase.slice(0, 80),
                      bodyPreview: normalized.brief.bodyText.slice(0, 100),
                    });
                    continue; // Try next model; retry-once-then-awaiting.
                  }

                  llmBrief = normalized.brief;
                  llmFallbackReason = null;
                  llmAttemptRecords.push({
                    model,
                    attempt,
                    durationMs,
                    outcome: "success",
                    rawReason: null,
                    httpStatus: 200,
                    errorMessageHead: null,
                  });
                  console.log(
                    `[compute-outer-readiness] [LLM] Attempt ${attempt} ACCEPTED (normaliser + atomic) in ${durationMs}ms | model=${model} | leanOn=${llmBrief.leanOn.length} watchFor=${llmBrief.watchFor.length} | promptChars=${
                      sysPromptLen + userPromptLen
                    }`,
                  );
                  try {
                    console.log(
                      "[compute-outer-readiness][llm-accepted]",
                      JSON.stringify({
                        localDate: userLocalDate,
                        timeWindow: getTimeOfDay(hour),
                        model,
                        attempt,
                        durationMs,
                        leanOnCount: llmBrief.leanOn.length,
                        watchForCount: llmBrief.watchFor.length,
                      }),
                    );
                  } catch {}
                  break;
                } catch (parseErr) {
                  llmFallbackReason = `attempt${attempt}_parse_failed`;
                  console.error(
                    `[compute-outer-readiness] [LLM] Attempt ${attempt} parse failed | model=${model} | duration=${durationMs}ms | rawLen=${content.length}`,
                  );
                  llmAttemptRecords.push({
                    model,
                    attempt,
                    durationMs,
                    outcome: "parse_error",
                    rawReason: `attempt${attempt}_parse_failed`,
                    httpStatus: 200,
                    errorMessageHead: (parseErr instanceof Error
                      ? parseErr.message
                      : String(parseErr)).slice(0, 200),
                    rawContentHead: typeof content === "string"
                      ? content.slice(0, 200)
                      : null,
                  });
                  continue; // Try next model
                }
              } else {
                llmFallbackReason = `attempt${attempt}_returned_null`;
                llmAttemptRecords.push({
                  model,
                  attempt,
                  durationMs,
                  outcome: "error",
                  rawReason: `attempt${attempt}_returned_null`,
                  httpStatus: null,
                  errorMessageHead: "empty content from provider",
                });
                continue;
              }
            } catch (err: any) {
              clearTimeout(timeout);
              const durationMs = Date.now() - startMs;
              const isAbort = err instanceof DOMException &&
                err.name === "AbortError";
              const httpStatus = typeof err?.status === "number"
                ? err.status
                : null;
              const errBodyHead = typeof err?.body === "string"
                ? err.body.slice(0, 200)
                : null;
              const errMsgHead =
                (err instanceof Error ? err.message : String(err ?? "")).slice(
                  0,
                  200,
                );
              // F2a — Surface known provider failure modes by name so logs +
              // llm_attempts.raw_reason name the real cause (credit
              // exhaustion, invalid key, rate limit) instead of a generic
              // attemptN_error.
              const bodyLower = (errBodyHead ?? "").toLowerCase();
              let providerReason: string | null = null;
              let terminalOperational: "workspace_credit_limit" | null = null;
              if (httpStatus === 401) providerReason = "invalid_key";
              else if (
                httpStatus === 403 && bodyLower.includes("credit_limit_reached")
              ) {
                providerReason = "gateway_credit_limit_reached";
                terminalOperational = "workspace_credit_limit";
                console.error(
                  `[compute-outer-readiness] [LLM] provider unavailable — workspace AI credit limit reached | model=${model} | attempt=${attempt} | httpStatus=${httpStatus} (billing limit, not a content or key failure)`,
                );
              } else if (httpStatus === 403) {
                providerReason = "gateway_forbidden";
              } else if (httpStatus === 429) providerReason = "rate_limited";
              else if (
                httpStatus === 402 ||
                (httpStatus === 400 && bodyLower.includes("credit balance"))
              ) {
                providerReason = "anthropic_402_credits";
                // Anthropic billing exhaustion is a hard operational failure
                // (not transient). Treat it identically to the gateway credit
                // ceiling so we short-circuit remaining Claude attempts —
                // otherwise every attempt burns its full 10s timeout budget
                // trying to hit an account with $0 balance, which pushes the
                // total function latency past the platform timeout and the
                // edge runtime surfaces a 503 to the client. MRS is
                // deterministic and must never be gated by LLM billing.
                terminalOperational = "workspace_credit_limit";
                console.error(
                  `[compute-outer-readiness] [LLM] provider unavailable — credits exhausted | model=${model} | attempt=${attempt} | httpStatus=${httpStatus} (operational dependency failure, not a content failure)`,
                );
              }
              llmFallbackReason = isAbort
                ? `attempt${attempt}_timeout_${timeoutMs}ms`
                : (providerReason
                  ? `attempt${attempt}_${providerReason}`
                  : `attempt${attempt}_error`);
              llmAttemptRecords.push({
                model,
                attempt,
                durationMs,
                outcome: isAbort
                  ? "timeout"
                  : (httpStatus ? "http_error" : "error"),
                rawReason: llmFallbackReason,
                httpStatus,
                errorMessageHead: errMsgHead,
                errorBodyHead: errBodyHead,
                timeoutMs: isAbort ? timeoutMs : null,
              });
              console.error(
                `[compute-outer-readiness] [LLM] Attempt ${attempt} ${
                  isAbort ? "TIMEOUT" : "ERROR"
                } | model=${model} | timeout=${timeoutMs}ms | elapsed=${durationMs}ms | promptChars=${
                  sysPromptLen + userPromptLen
                }`,
                isAbort ? "" : err,
              );
              // Terminal operational dependency failure: workspace AI credit
              // ceiling reached. Do NOT chain to attempt 2 (Anthropic) — that
              // just yields a second noisy provider-billing error and buries
              // the real actionable cause. Short-circuit with a single clean
              // summarized fallback reason; per-attempt diagnostics above
              // preserve the raw provider detail for debugging.
              if (terminalOperational === "workspace_credit_limit") {
                llmFallbackReason = "workspace_credit_limit";
                console.error(
                  `[compute-outer-readiness] [LLM] terminal operational failure: workspace_credit_limit — skipping remaining ${
                    llmAttempts.length - attempt
                  } attempt(s) and falling to awaiting Brief`,
                );
                break;
              }
              continue; // Try next model
            }
          }
          if (!llmBrief) {
            // v6.5 contract: LLM miss no longer renders deterministic prose.
            // v6.6 update: attempt a spec-compliant deterministic brief as a
            // last resort. It must pass validateBrief() before it is served;
            // if it fails validation, the response falls to `awaiting`
            // (see briefIsAwaiting below).
            console.log(
              `[compute-outer-readiness] [LLM] FALLBACK to awaiting | reason=${
                llmFallbackReason || "unknown"
              } | models_tried=${
                llmAttempts.map((a) => a.model).join(",")
              } | promptChars=${sysPromptLen + userPromptLen}`,
            );

            try {
              const pillContext = assessmentContext
                ? buildPillContextFromAssessment(assessmentContext)
                : null;
              const normalizeTier = (tier: unknown):
                DeterministicBriefPillTier => {
                if (tier === "green" || tier === "amber" || tier === "red") {
                  return tier;
                }
                return "unread";
              };
              const deterministicCheckIn = mapDeterministicCheckInOutcome(
                currentCheckInOutcome,
                currentClarityLevel,
                currentConfidenceLevel,
              );
              const scoreForBand = assessmentContext?.readiness.score ??
                (typeof innerReadinessScore === "number"
                  ? innerReadinessScore
                  : null);
              const hrvForBand = briefWearableUsable &&
                  typeof hrvDeviation === "number"
                ? hrvDeviation
                : null;
              const wearableFactForSpec = !briefWearableUsable
                ? null
                : hrvForBand != null
                ? (hrvForBand >= 10
                  ? "Recovery is running above its usual range"
                  : hrvForBand <= -20
                  ? "Recovery is significantly under its usual range"
                  : hrvForBand <= -10
                  ? "Recovery is below its usual range"
                  : "The wearable read is in")
                : (typeof sleepScoreVal === "number"
                  ? (sleepScoreVal < 65
                    ? "Sleep ran short last night"
                    : sleepScoreVal >= 80
                    ? "Sleep was solid last night"
                    : "The wearable read is in")
                  : null);
              const specBuilt = buildDeterministicBriefFallback({
                band: mapDeterministicBriefBand(
                  (bandValence as "high" | "mid" | "low" | null) ?? null,
                  scoreForBand,
                  deterministicCheckIn,
                  hrvForBand,
                ),
                hasWearable: briefWearableUsable,
                hasCurrentWearable: briefWearableUsable,
                hasCurrentCheckIn: checkInCurrentForWindow,
                checkInOutcome: deterministicCheckIn,
                cognitivePillTier: normalizeTier(
                  pillContext?.decisionReadiness,
                ),
                physicalPillTier: normalizeTier(pillContext?.physicalReserves),
                wearableFact: wearableFactForSpec,
                window: getTimeOfDay(hour) as "morning" | "afternoon" | "evening",
                todayHighStakes: Array.isArray(todayHighStakes)
                  ? todayHighStakes
                  : [],
                // Time-to-event precision: the deterministic copy says
                // "in 45 minutes" / "in about 3 hours" instead of a generic
                // "today" whenever the lead event's timing is known.
                highStakesTiming: nextHighStakesEvent
                  ? [{
                    title: nextHighStakesEvent.title,
                    minutesUntil: nextHighStakesEvent.minutesUntil,
                  }]
                  : [],
                calendarLoad: calendarLoad === "low" ||
                    calendarLoad === "medium" || calendarLoad === "high"
                  ? calendarLoad
                  : null,
                meetingCount: calendarResult?.meetingCount ??
                  calendarResult?.eventCount ?? 0,
                // Window-correct volume: afternoon / evening copy speaks to
                // what is still ahead, not to the whole day.
                remainingMeetings: calendarResult?.remainingMeetings ?? null,
                sleepScore: briefWearableUsable &&
                    typeof sleepScoreVal === "number"
                  ? sleepScoreVal
                  : null,
                hasBackToBack: !!hasBackToBack,
                isWeekend: isBriefWeekendDay(dayOfWeek, localeWeekendHomeCountry),
                // Same day-awareness the Plan uses: holiday / PTO / personal
                // travel take the non-workday copy branches.
                isNonWorkday: briefDayShape === "public_holiday" ||
                  briefDayShape === "pto" ||
                  briefDayShape === "personal_holiday" ||
                  briefDayShape === "personal_travel",
                // Full day-shape context so the deterministic path mirrors the
                // LLM path (travel, conference, off-day) instead of collapsing
                // a Sunday flight into plain weekend copy.
                dayShape: briefDayShape ?? null,
                travelPhase: briefTravelPhase ?? null,
                longHaulFlight:
                  !!briefBehaviourSnapshot?.signals?.longHaulFlight,
                conferenceDayNumber:
                  briefBehaviourSnapshot?.signals?.conferenceDayNumber ?? null,
                conferenceTitle:
                  briefBehaviourSnapshot?.signals?.conferenceEventTitle ?? null,
                travelEventTitle:
                  briefBehaviourSnapshot?.signals?.nextTravelEventTitle ?? null,
                ceoFlags: (briefBehaviourSnapshot?.flagsBrief ?? [])
                  // deno-lint-ignore no-explicit-any
                  .map((f: any) => ({
                    rule: String(f?.rule ?? ""),
                    severity: (f?.severity ?? "medium") as "high" | "medium" | "low",
                    copyHint: typeof f?.copyHint === "string" ? f.copyHint : undefined,
                    stake: typeof f?.stake === "string" ? f.stake : undefined,
                    evidence: Array.isArray(f?.evidence)
                      ? f.evidence.map((e: unknown) => String(e))
                      : undefined,
                    anchorEvent: typeof f?.anchorEvent === "string"
                      ? f.anchorEvent
                      : undefined,
                  }))
                  .filter((f) => !!f.rule),
                // Part 1A/1B — the resolved story drives the four beats.
                leadNarrative: briefLeadNarrative,
                variantSeed: `${userId}|${userLocalDate}|${
                  getTimeOfDay(hour)
                }`,
              });

              // DETERMINISTIC VALIDATION: the validator now gates deterministic
              // output. deterministic-brief.ts is built by construction, but the
              // validator catches drift (copy regressions, banned words, score
              // restatement, pill/body inconsistency). If validation fails, fall
              // back to the awaiting-signals state rather than shipping invalid copy.
              if (specBuilt) {
                const specValidation = validateBrief(
                  specBuilt.phrase,
                  specBuilt.body,
                  {
                    signals: {
                      highStakesEventInNext24h: nextHighStakesEvent
                        ? {
                          title: nextHighStakesEvent.title,
                          minutesUntil: nextHighStakesEvent.minutesUntil,
                        }
                        : null,
                      emotionalDrainEventInNext4h: null,
                    },
                    behaviourFlags: [
                      ...(briefBehaviourSnapshot?.flagsBrief ?? []),
                      ...(briefBehaviourSnapshot?.flagsPlan ?? []),
                    ],
                    lexiconClusters: [],
                    forbiddenWords: [],
                    allowedPatternKeywords: [],
                  } as any,
                  {
                    mrsScore: scoreForBand,
                    pillContext,
                  },
                );
                if (specValidation.ok) {
                  deterministicBrief = specBuilt;
                  console.log(
                    `[compute-outer-readiness] [DETERMINISTIC] ACCEPTED (deterministic-brief-a8) | band=${specBuilt.phrase} | validatorOk=true`,
                  );
                } else {
                  deterministicBrief = null;
                  console.warn(
                    `[compute-outer-readiness] [DETERMINISTIC] REJECTED | reason=${specValidation.reason} | family=${briefLeadNarrative?.family ?? "unknown"} | window=${getTimeOfDay(hour)} | body="${specBuilt.body.slice(0, 80)}..."`,
                  );
                }
              }

            } catch (detSpecErr) {
              console.error(
                "[compute-outer-readiness] [DETERMINISTIC] A8 build error:",
                detSpecErr,
              );
            }

          }
        }
      } catch (llmErr) {
        console.error("[compute-outer-readiness] LLM synthesis error:", llmErr);
      }
    }

    // ═══ SAFEGUARD: post-LLM scope verification (temporary observability) ═══
    // Confirms that cachedSnapshot and inputSignature survived past the LLM block
    // and are visible to the response-assembly code below. Remove after ~48h of clean logs.
    console.log("[compute-outer-readiness] post-LLM state", {
      hasCachedSnapshot: !!cachedSnapshot,
      hasInputSignature: !!inputSignature && inputSignature !== "no-sig",
      hasLlmBrief: !!llmBrief,
    });

    console.log(
      `[compute-outer-readiness] DRB brief source: ${
        llmBrief ? "llm" : "awaiting"
      }`,
    );

    // Map leanOn source to human-readable label
    const sourceMap: Record<string, string> = {
      "coach-insights-recent": "coach-insights-recent",
      "coach-insights-grace": "coach-insights-grace",
      "cc-modifier": "cc-modifier",
      "cc-modifier-with-context": "cc-modifier-with-context",
      "coach-partial-strength": "coach-partial-strength",
      "coach-partial-growth": "coach-partial-growth",
      "archetype-tier": "archetype-tier",
      "tier-fallback": "tier-fallback",
      "dow-pattern": "dow-pattern",
      "hrv-correlation": "hrv-correlation",
      "score-trajectory": "score-trajectory",
    };

    // Helper: format a shared-module signal row (rule/pattern derivation) into
    // the "SIGNAL · SOURCE" pill format used by the Chief of Staff Memory
    // strip. These strings are surfaced alongside — not instead of — the LLM
    // brief; the v6.5 contract removed the prose-fallback path entirely.
    const formatFallbackSignal = (text: string, source: string): string => {
      // Strip existing parenthetical source if present
      let cleaned = text.replace(/\s*\([^)]*\)\s*$/, "").trim();
      // Strip "Your " prefix
      cleaned = cleaned.replace(/^Your\s+/i, "");
      // Cap at 4 words for crisp signal
      const signal = cleaned.split(/\s+/).slice(0, 4).join(" ");
      // Map source key to uppercase single-word label
      const sourceLabels: Record<string, string> = {
        "archetype-tier": "ARCHETYPE",
        "tier-fallback": "TIER",
        "coach-insights-recent": "COACH",
        "coach-insights-grace": "COACH",
        "coach-partial-strength": "COACH",
        "coach-partial-growth": "COACH",
        "cc-modifier": "PATTERN",
        "cc-modifier-with-context": "PATTERN",
        "dow-pattern": "PATTERN",
        "hrv-correlation": "PATTERN",
        "score-trajectory": "PATTERN",
      };
      return `${signal} · ${sourceLabels[source] || "SYSTEM"}`;
    };

    // Named for legacy parity with older writes; these are now the
    // formatted shared-module signal strings, not a prose fallback.
    const formattedDeterministicLeanOn = formatFallbackSignal(
      leanOnResult.leanOn,
      leanOnResult.source,
    );
    const formattedDeterministicWatchFor = formatFallbackSignal(
      leanOnResult.watchFor,
      leanOnResult.source,
    );

    // ═══ SAFEGUARD: defensive guard before first cachedSnapshot use ═══
    if (typeof cachedSnapshot === "undefined") {
      console.error(
        "[compute-outer-readiness] cachedSnapshot unexpectedly undefined, scope regression",
      );
    }

    // ═══ SAFEGUARD: response-assembly try/catch ═══
    // If anything below throws (scope regression, undefined access, etc.), fail soft with a
    // 200 + deterministic fallback so the dashboard never blanks to "NOT YET ASSESSED".
    try {
      // ═══ BRIEF SIGNAL CONTRACT (day-scoped) ═══
      // Hoisted above the briefSource decision so the deterministic
      // fallback (Sprint 7 / Phase 9A) can honour the awaiting rules. The
      // Brief reflects *today*: ANY non-skipped check-in for the user's
      // local date satisfies the contract regardless of which time_window
      // stamp it carries.
      const currentPeriod = getTimeOfDay(hour);
      let hasTodayCheckInDB = false;
      let latestCheckinId: string | null = null;
      let latestCheckinWindow: string | null = null;
      try {
        const { data: anyCheckin } = await db
          .from("daily_checkins")
          .select("id, time_window, timestamp")
          .eq("user_id", userId)
          .eq("checkin_date", userLocalDate)
          .eq("skipped", false)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        hasTodayCheckInDB = !!anyCheckin;
        latestCheckinId = anyCheckin?.id ?? null;
        latestCheckinWindow = anyCheckin?.time_window ?? null;
      } catch (e) {
        console.warn(
          "[compute-outer-readiness] Day-scoped check-in lookup failed:",
          e,
        );
        hasTodayCheckInDB = !!checkInOutcome;
      }
      hasTodayCheckIn = hasTodayCheckInDB;
      hasFreshWearable = !!wearableContext; // Presence of data, not strict freshness
      hasCalendarSignal = calendarResult?.state === "active" || calendarResult?.state === "connected_no_events";
      hasCalendarConnected = !!calendarResult?.state &&
        calendarResult.state !== "not_connected";
      // Brief Gate: needs Physiology (any wearable data) AND Demand (calendar connected/usable)
      const hasStage1Signal = hasFreshWearable && hasCalendarSignal;
      
      const briefSignalContractMet = hasStage1Signal;
      const awaitingSignals = !briefSignalContractMet;
      
      // Brief Has Current Personal Signal: uses same logic
      const briefHasCurrentPersonalSignal = briefWearableUsable && hasCalendarConnected;
        
      const briefAwaitingSignals = !briefHasCurrentPersonalSignal;

      const awaitingReason: string | null = awaitingSignals
        ? "cold-start-no-context"
        : null;
      console.log("[compute-outer-readiness] signal-gate", {
        userId,
        userLocalDate,
        currentPeriod,
        hasTodayCheckIn,
        latestCheckinId,
        latestCheckinWindow,
        hasFreshWearable,
        hasCalendarSignal,
        hasStage1Signal,
        awaitingSignals,
      });

      // v6.5-no-deterministic-fallback (2026-07-11): the legacy deterministic
      // Brief path was removed here. Contract is now:
      //   cache hit (LLM-only) → LLM winner → awaiting.
      // A fresh deterministic system (spec: "Deterministic Fallback Final")
      // must pass validateBrief() before shipping and is not implemented
      // here. Do NOT reintroduce buildDeterministicBrief / decideBriefFallback
      // / capDeterministicBody at this call site.
      if (!cachedSnapshot && !llmBrief && !deterministicBrief) {
        console.log(
          "[compute-outer-readiness][brief-fallback]",
          JSON.stringify({
            source: "awaiting",
            reason: awaitingSignals
              ? "awaiting_signals"
              : innerStateIsAwaiting
              ? "inner_state_awaiting"
              : (llmFallbackReason || "llm_miss_no_deterministic"),
            llmAttempted: llmAttemptRecords.length > 0,
            validatorRejectReason: llmValidatorRejections.length > 0
              ? (llmValidatorRejections[
                llmValidatorRejections.length - 1
              ] as any)?.rule ?? null
              : null,
            awaiting: true,
            snapshotPersisted: true,
            blockedBy: "v6.6-deterministic-invalid-or-absent",
          }),
        );
      }

      // Sprint 13.2 — Brief MUST await whenever MRS/inner-state is awaiting
      // OR the signal contract is not met. Deterministic fallback is already
      // blocked in decideBriefFallback for these cases, but a
      // previously-accepted LLM brief could still leak copy through. We
      // gate the response + persistence on `briefMustAwait` so calendar-only
      // and inner-awaiting runs never emit Brief prose.
      // A valid deterministic brief or an adopted canonical score means the user
      // should always see content — never force awaiting when either exists.
      const hasDeterministicBrief = deterministicBrief !== null;
      // The Brief is forced to awaiting when no current personal signal exists,
      // regardless of a cached LLM/deterministic brief or a canonical score.
      // This preserves MRS/Plan/Calendar signals while preventing calendar-only
      // or stale-cache brief prose from reaching the user.
      const briefMustAwait = briefAwaitingSignals ||
        ((awaitingSignals || innerStateIsAwaiting) &&
          !hasDeterministicBrief &&
          typeof canonicalInnerScore !== "number");

      const briefIsAwaiting = briefMustAwait ||
        (!cachedSnapshot && !llmBrief && !deterministicBrief);
      const briefSource: "llm" | "deterministic" | "awaiting" = briefMustAwait
        ? "awaiting"
        : cachedSnapshot
        ? (cachedSnapshot.brief_source as "llm" | "deterministic" | "awaiting")
        : (llmBrief
          ? "llm"
          : deterministicBrief
          ? "deterministic"
          : "awaiting");
      const responsePhrase = briefIsAwaiting
        ? null
        : (cachedSnapshot?.phrase ?? llmBrief?.phrase ??
          deterministicBrief?.phrase ?? finalPhrase);
      const rawResponseBody = briefIsAwaiting
        ? null
        : (cachedSnapshot?.body_text ??
          llmBrief?.bodyText ??
          deterministicBrief?.body ??
          finalContext);
      // Strip stray markdown emphasis the LLM occasionally emits (e.g.
      // "*Board Meeting *"). The client renderer still parses **bold** spans
      // so we intentionally do NOT touch them — only lone-asterisk noise.
      const responseBody = (() => {
        if (typeof rawResponseBody !== "string") return rawResponseBody;
        let s = rawResponseBody;
        s = s.replace(
          /(^|[\s(])\*(?!\*)\s?([^*\n]+?)\s?\*(?!\*)(?=[\s.,;:!?)]|$)/g,
          "$1$2",
        );
        s = s.replace(/(^|\s)\*(\s)/g, "$1$2");
        s = s.replace(/[ \t]{2,}/g, " ");
        if (materialTravelContextActive && !MATERIAL_TRAVEL_BODY_RX.test(s)) {
          const work = materialWorkEventTitles[0]
            ? ` ${materialWorkEventTitles[0]} is the work demand.`
            : "";
          s = `Travel is the body/timing load;${work} ${s}`;
        }
        if (materialTravelContextActive && materialWorkEventTitles[0]) {
          const workTitle = materialWorkEventTitles[0];
          const workTokens = String(workTitle)
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((token) =>
              token.length >= 4 &&
              !["with", "from", "today", "review", "meeting"].includes(token)
            );
          const mentionsWork = workTokens.some((token) =>
            s.toLowerCase().includes(token)
          );
          if (!mentionsWork) {
            s = `${workTitle} is the work demand. ${s}`;
          }
        }
        return s.trim();
      })();

      // Signal-contract (awaitingSignals / awaitingReason / hasTodayCheckIn
      // / hasFreshWearable / hasStage1Signal) is now hoisted above the
      // briefSource decision — see the "BRIEF SIGNAL CONTRACT (day-scoped)"
      // block earlier in this handler.
      // Truncate LLM signals to max 4 words server-side as safety net
      const truncSignal = (s: string) => {
        const w = s.split(/\s+/);
        return w.length > 4 ? w.slice(0, 4).join(" ") : s;
      };
      const formattedLeanOn = cachedSnapshot?.lean_on ??
        (llmBrief
          ? llmBrief.leanOn.map((item) =>
            `${truncSignal(item.signal)} · ${item.source}`
          ).join("\n")
          : formattedDeterministicLeanOn);
      const formattedWatchFor = cachedSnapshot?.watch_for ??
        (llmBrief
          ? llmBrief.watchFor.map((item) =>
            `${truncSignal(item.signal)} · ${item.source}`
          ).join("\n")
          : formattedDeterministicWatchFor);
      const finalLeanOnSource = cachedSnapshot?.lean_on_source ??
        (llmBrief ? "llm-v4" : leanOnResult.source);
      const finalWatchForSource = cachedSnapshot?.watch_for_source ??
        (llmBrief ? "llm-v4" : leanOnResult.source);

      // ═══ BRIEF SNAPSHOT CACHE: persist on cache miss ═══
      // Fire-and-forget upsert. Never block the response. Stores both LLM and deterministic outputs
      // so a failed/timed-out LLM call still produces a stable canonical brief on next refresh.
      // Note: snapshot id resolution for the response is done synchronously below
      // (best-effort) so the client can key feedback by it.
      let resolvedBriefId: string | null = null;
      // Persistence receipts surfaced back to the cron orchestrator so
      // `[exec-home-cron]` logs can tell at a glance whether the two
      // snapshot rows for this run actually landed.
      let mrsSnapshotWritten = false;
      let briefSnapshotWritten = false;
      if (cachedSnapshot && inputSignature !== "no-sig") {
        try {
          const { data: idRow } = await db
            .from("brief_snapshots")
            .select("id")
            .eq("user_id", userId)
            .eq("local_date", userLocalDate)
            .eq("time_window", getTimeOfDay(hour))
            .eq("input_signature", inputSignature)
            .eq("prompt_version", BRIEF_PROMPT_VERSION)
            .maybeSingle();
          resolvedBriefId = (idRow as any)?.id ?? null;
        } catch { /* ignore, non-fatal for response */ }
      }
      // ── Resolve the latest daily_checkins.id for (user_id, local_date, current time_window) ──
      // Used to link this brief snapshot to the specific check-in row that informed it.
      // Fail-safe: if no check-in exists or the lookup throws, store null.
      let linkedDailyCheckinId: string | null = null;
      try {
        const { data: linkedCheckin } = await db
          .from("daily_checkins")
          .select("id")
          .eq("user_id", userId)
          .eq("checkin_date", userLocalDate)
          .eq("time_window", getTimeOfDay(hour))
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        linkedDailyCheckinId = (linkedCheckin as any)?.id ?? null;
      } catch (linkErr) {
        console.warn(
          "[brief-cache] daily_checkin_id lookup failed:",
          linkErr instanceof Error ? linkErr.message : linkErr,
        );
        linkedDailyCheckinId = null;
      }

      // Persistence contract (cron/snapshot-read model):
      // Always attempt to persist both `daily_context_snapshot` (MRS mirror)
      // and `brief_snapshots` on every run that isn't a same-signature cache
      // hit — including cold-start / awaiting / no-sig runs. Suppression of
      // score payload and copy is handled INSIDE this block via
      // `suppressScorePayload` / `suppressBriefCopy`, so an awaiting run
      // writes an explicit awaiting row (state='awaiting', copy=null,
      // brief_source='awaiting') instead of leaving no row at all.
      if (!cachedSnapshot) {
        try {
          const signalPillsPayload = assessmentSignalPillsPayload ?? echoedSignalPills ?? null;
          if (!signalPillsPayload || !assessmentContext) {
            throw new Error("assessment_context_unavailable");
          }

          // MRS v2 — mirror canonical pill payload + demand into daily_context_snapshot.
          // Best-effort, non-blocking (errors are logged inside the helper).
          try {
            const strategic = await resolveStrategicContext(db, userId);

            // ── Derive demand score from already-computed load/pressure/stakes ──
            // Mirrors the band used by demand-scorer.ts so inner-readiness and the
            // snapshot agree without re-fetching events.
            const _hasStakes =
              (calendarResult.highStakesEvents?.length ?? 0) > 0;
            const loadComponent = calendarLoad === "high"
              ? 70
              : calendarLoad === "medium"
              ? 40
              : 0;
            const pressureComponent = calendarPressure === "high"
              ? 25
              : calendarPressure === "medium"
              ? 15
              : 0;
            const stakesBonus = _hasStakes ? 10 : 0;
            const calendarDemandScore = Math.max(
              0,
              Math.min(100, loadComponent + pressureComponent + stakesBonus),
            );

            // ── Pattern signals: prefer orchestrator-derived (real 14d HRV
            // trend, real 3-day load count, real DOW pattern). Fall back to
            // single-day approximations only when compose failed upstream.
            const patternSignals = composedPatternSignals ?? {
              hrv_3day_trend: hrv3dTrend,
              consecutive_high_load_days: consecutiveHighLoadDays,
              dow_historical_pattern: {
                typical_hrv_for_dow: null,
                typical_load_for_dow: null,
                samples: 0,
              },
              sustained_deficit_flag: sustainedDeficitFlag,
              hrv_low_high_demand_cooccurrence_7d: cooccurrence7d,
            };

            // ── Divergence flag + weighting mode (MRS v2 §3.3 / §3.4) ──
            // Composite math via shared classifier — single source of truth.
            const physComposite = hasWearable
              ? computePhysiologicalComposite({
                hrvDeviationPct: typeof hrvDeviation === "number"
                  ? hrvDeviation
                  : null,
                sleepScore: typeof sleepScoreVal === "number"
                  ? sleepScoreVal
                  : null,
                // sleepDuration is stored in minutes; composite expects hours.
                sleepHours: typeof sleepDuration === "number"
                  ? sleepDuration / 60
                  : null,
                // RHR 3-day trend (P2): contributes 15% to the composite
                // when known. Falls through to HRV+Sleep when 'unknown'.
                rhrTrend: rhr3dTrend,
              })
              : null;
            const supplyDemandGapFlag = computeDivergenceFlag({
              physComposite,
              demandScore: calendarDemandScore,
              hrvRecovering: patternSignals.hrv_3day_trend === "improving",
            });
            // MRS source provenance + baseline-only score. Baseline blends
            // wearable composite (heavier when present) with calendar demand
            // pressure (inverted: higher demand pulls score down). Pattern
            // signals tilt the baseline by ±5 when sustained deficit fires.
            // Always in [0, 100]. Used for client provenance audit and to
            // expose the "pre-refiner" number when a check-in lands.
            const baselineParts: Array<[number, number]> = [];
            if (physComposite != null) {
              baselineParts.push([physComposite, 0.65]);
            }
            if (calendarDemandScore != null) {
              baselineParts.push([
                100 - clamp01to100(calendarDemandScore),
                0.35,
              ]);
            }
            if (baselineParts.length > 0) {
              const totalW = baselineParts.reduce((a, [, w]) => a + w, 0);
              const weighted = baselineParts.reduce(
                (a, [v, w]) => a + v * w,
                0,
              );
              let base = Math.round(weighted / totalW);
              if (patternSignals?.sustained_deficit_flag) {
                base = Math.max(0, base - 5);
              }
              echoedBaselineScore = clamp01to100(base);
            }
            echoedProvenance = {
              mrs: divergenceProvenance({
                physComposite,
                demandScore: calendarDemandScore,
                hrvRecovering: patternSignals.hrv_3day_trend === "improving",
                hasPatternSignal: !!(patternSignals && (
                  patternSignals.sustained_deficit_flag ||
                  patternSignals.consecutive_high_load_days > 0 ||
                  patternSignals.hrv_3day_trend !== "unknown"
                )),
                hasCeoBehaviour: !!briefBehaviourSnapshot,
                hasCheckin: hasTodayCheckIn,
              }),
              brief: {
                sources: (() => {
                  const s: MrsSource[] = [];
                  if (hasFreshWearable) s.push("wearable");
                  if (hasCalendarSignal || hasCalendarConnected) {
                    s.push("calendar");
                  }
                  if (briefBehaviourSnapshot) s.push("ceo-behaviour");
                  if (hasTodayCheckIn) s.push("checkin");
                  return s;
                })(),
                briefSource,
              },
              pills: {
                decision_readiness: pillSourceList(
                  "decision_readiness",
                  physComposite,
                  calendarDemandScore,
                  hasTodayCheckIn,
                ),
                physical_reserves: pillSourceList(
                  "physical_reserves",
                  physComposite,
                  calendarDemandScore,
                  hasTodayCheckIn,
                ),
                resilience_capacity: pillSourceList(
                  "resilience_capacity",
                  physComposite,
                  calendarDemandScore,
                  hasTodayCheckIn,
                ),
              },
            };
            const weightingMode:
              | "no_wearable"
              | "aligned"
              | "supply_demand_gap"
              | "recovery_window" = !hasWearable
                ? "no_wearable"
                : supplyDemandGapFlag === "SUPPLY_DEMAND_GAP"
                ? "supply_demand_gap"
                : supplyDemandGapFlag === "RECOVERY_UNDERWAY"
                ? "recovery_window"
                : "aligned";

            const timeWindow = requestedMrsWindow ?? getTimeOfDay(hour);
            let existingMorningBaselineScore: number | null = null;
            try {
              // Phase 2 — anchor lives on the morning-window row.
              const { data: existingSnapshot } = await db
                .from("daily_context_snapshot")
                .select("morning_baseline_score")
                .eq("user_id", userId)
                .eq("local_date", snapshotLocalDate)
                .eq("mrs_window", "morning")
                .maybeSingle();
              existingMorningBaselineScore =
                (existingSnapshot as any)?.morning_baseline_score ?? null;
            } catch (_snapReadErr) {
              existingMorningBaselineScore = null;
            }
            // Preserve-existing guard: if this run is awaiting (no usable
            // inner score) but a prior run for the SAME (user, date, window)
            // already persisted a real numeric MRS, do NOT clobber it with
            // NULL/awaiting values. This prevents a later awaiting brief
            // refresh from wiping an already-ready MRS snapshot.
            let existingWindowMrs: {
              inner_score: number | null;
              inner_tier: string | null;
              readiness_score_baseline: number | null;
              readiness_score_refined: number | null;
              readiness_state: string | null;
              tier_displayed: string | null;
              tier_cap_reason: string | null;
              refined_contribution: number | null;
              weight_provenance: any | null;
            } | null = null;
            try {
              const { data: existingWindowRow } = await db
                .from("daily_context_snapshot")
                .select(
                  "inner_score, inner_tier, readiness_score_baseline, readiness_score_refined, readiness_state, tier_displayed, tier_cap_reason, refined_contribution, weight_provenance",
                )
                .eq("user_id", userId)
                .eq("local_date", snapshotLocalDate)
                .eq("mrs_window", timeWindow)
                .maybeSingle();
              existingWindowMrs = (existingWindowRow as any) ?? null;
            } catch (_readErr) {
              existingWindowMrs = null;
            }
            // Preserve only when the existing row represents a genuinely ready
            // MRS — not a prior awaiting/fallback write. A row with
            // weight_provenance.awaiting_signals === true or an empty `earned`
            // array is a fallback and must not shield fresh awaiting runs.
            const existingWp: any = existingWindowMrs?.weight_provenance ??
              null;
            const existingWpAwaiting = weightProvenanceIndicatesAwaiting(
              existingWp,
            );
            const existingEarned = Array.isArray(existingWp?.earned)
              ? existingWp.earned
              : null;
            const existingIsReadyRow = existingWindowMrs != null &&
              typeof existingWindowMrs.inner_score === "number" &&
              typeof existingWindowMrs.readiness_score_baseline === "number" &&
              existingWindowMrs.readiness_state !== "awaiting" &&
              !existingWpAwaiting &&
              (
                existingWp == null || // legacy row w/ valid baseline
                (existingEarned != null && existingEarned.length > 0)
              );
            // Read-first contract: the cron / orchestrator (service role or
            // cron secret) OWNS the MRS number for a given
            // (user, local_date, mrs_window). Browser-originated calls
            // (Auth0 token → isInternalCall === false) must ADOPT the
            // persisted ready row rather than overwrite it with a
            // client-supplied score. This removes the second writer that
            // caused MRS oscillation between Home, MrsPage and the Brief.
            const adoptExistingMrs = existingIsReadyRow && !isInternalCall;
            const shouldPreserveExistingMrs =
              (suppressIncomingMrsSnapshot || adoptExistingMrs) &&
              existingIsReadyRow;
            if (adoptExistingMrs) {
              console.log(
                "[canonical-mrs] adopted_existing_snapshot",
                {
                  userId,
                  localDate: snapshotLocalDate,
                  window: timeWindow,
                  incomingScore: typeof innerReadinessScore === "number"
                    ? innerReadinessScore
                    : null,
                  existingScore: existingWindowMrs?.inner_score ?? null,
                  isInternalCall,
                },
              );
            }
            if (shouldPreserveExistingMrs) {
              console.warn(
                "[daily_context_snapshot] preserving existing ready MRS; incoming run is awaiting",
                {
                  userId,
                  localDate: snapshotLocalDate,
                  window: timeWindow,
                  existingInnerScore: existingWindowMrs?.inner_score,
                  existingState: existingWindowMrs?.readiness_state,
                  reason: suppressIncomingMrsSnapshot
                    ? (innerStateIsAwaiting
                      ? "incoming_awaiting"
                      : "legacy_incomplete_mrs_payload")
                    : "browser_read_first",
                },
              );
            } else if (
              innerStateIsAwaiting && existingWindowMrs != null &&
              typeof existingWindowMrs.inner_score === "number"
            ) {
              console.warn(
                "[daily_context_snapshot] overwriting existing fallback MRS row; not a ready snapshot",
                {
                  userId,
                  localDate: snapshotLocalDate,
                  window: timeWindow,
                  existingInnerScore: existingWindowMrs?.inner_score,
                  existingState: existingWindowMrs?.readiness_state,
                  weightProvenance: existingWp,
                },
              );
            }
            // Adopt the preserved existing MRS as canonical so brief_snapshots
            // and the client response echo cannot show a different (lower/
            // stale/awaiting) score than daily_context_snapshot for the same
            // window. Without this, MrsPage and DecisionReadinessBrief could
            // diverge (e.g. MRS=78 evening vs Brief=50).
            if (shouldPreserveExistingMrs) {
              if (
                typeof innerReadinessScore === "number" &&
                typeof existingWindowMrs!.inner_score === "number" &&
                innerReadinessScore !== existingWindowMrs!.inner_score
              ) {
                console.warn(
                  "[canonical-mrs] incoming score differs from preserved existing MRS — preserving existing",
                  {
                    userId,
                    localDate: snapshotLocalDate,
                    window: timeWindow,
                    incomingScore: innerReadinessScore,
                    existingScore: existingWindowMrs!.inner_score,
                  },
                );
              }
              canonicalInnerScore = existingWindowMrs!.inner_score ??
                canonicalInnerScore;
              canonicalTier = (existingWindowMrs!.inner_tier as any) ??
                canonicalTier;
              canonicalTierDisplayed =
                (existingWindowMrs!.tier_displayed as any) ??
                  canonicalTierDisplayed;
              canonicalTierCapReason =
                (existingWindowMrs!.tier_cap_reason as any) ??
                  canonicalTierCapReason;
              canonicalScoreBaseline =
                existingWindowMrs!.readiness_score_baseline ??
                  canonicalScoreBaseline;
              canonicalScoreRefined =
                existingWindowMrs!.readiness_score_refined ??
                  canonicalScoreRefined;
              canonicalReadinessState =
                (existingWindowMrs!.readiness_state as any) ??
                  canonicalReadinessState ?? "baseline";
              canonicalRefinedContribution =
                existingWindowMrs!.refined_contribution ??
                  canonicalRefinedContribution;
              canonicalScoreSource = "preserved_existing_mrs";
            }
            const currentBaselineForAnchor =
              typeof clientScoreBaseline === "number"
                ? clientScoreBaseline
                : (typeof innerReadinessScore === "number"
                  ? innerReadinessScore
                  : null);
            const shouldWriteMorningAnchor = timeWindow === "morning" &&
              currentReadingIsReal;
            const shouldBackfillMorningAnchor = timeWindow === "afternoon" &&
              currentReadingIsReal &&
              existingMorningBaselineScore == null &&
              (clientWeightProvenance as any)?.awaiting_signals !== true;

            await upsertDailyContextSnapshot(db, {
              userId,
              localDate: snapshotLocalDate,
              // Load Shape — persisted only when the write gate is open, the
              // shape was actually classified, and it belongs to the same day
              // as this row. Never fabricated, never inferred here.
              ...(loadShapeWriteEnabled() && composedLoadShape &&
                  snapshotLocalDate === userLocalDate
                ? { loadShape: composedLoadShape }
                : {}),
              // Lead narrative — the one story the Brief led on for this
              // window. Persisted so the Plan/JIT parity guard can check it
              // picked practices for the same day the Brief described.
              ...(briefLeadNarrative && snapshotLocalDate === userLocalDate
                ? {
                  leadNarrative: {
                    family: briefLeadNarrative.family,
                    phase: briefLeadNarrative.phase,
                    depletion: briefLeadNarrative.depletion,
                    reason: briefLeadNarrative.reason,
                    anchor: briefLeadNarrative.anchor
                      ? {
                        title: briefLeadNarrative.anchor.title,
                        durationMinutes:
                          briefLeadNarrative.anchor.durationMinutes ?? null,

                        categoryId: briefLeadNarrative.anchor.categoryId,
                        subtype: briefLeadNarrative.anchor.subtypeId ?? null,
                        minutesUntil:
                          briefLeadNarrative.anchor.minutesUntil ?? null,
                      }
                      : null,
                  },
                }
                : {}),

              patternSignals: patternSignals as any,
              strategicContext: strategic,
              calendarDemandScore,
              demandLoad: (calendarLoad as any) ?? null,
              demandPressure: (calendarPressure as any) ?? null,
              hasHighStakes: _hasStakes,
              innerScore: shouldPreserveExistingMrs
                ? (existingWindowMrs!.inner_score ?? null)
                : (suppressIncomingMrsSnapshot
                  ? null
                  : (innerReadinessScore ?? null)),
              innerTier: shouldPreserveExistingMrs
                ? (existingWindowMrs!.inner_tier ?? null)
                : (suppressIncomingMrsSnapshot ? null : (safeTier ?? null)),
              pillarMode: hasWearable && checkInOutcome
                ? "full"
                : hasWearable
                ? "wearable"
                : checkInOutcome
                ? "checkin"
                : "unknown",
              weightingMode,
              supplyDemandGapFlag,
              signalPills: signalPillsPayload,
              // MRS v3 — soft-guard tier cap mirror.
              tierDisplayed: shouldPreserveExistingMrs
                ? ((existingWindowMrs!.tier_displayed as any) ?? null)
                : (suppressIncomingMrsSnapshot ? null : safeTierDisplayed),
              tierCapReason: shouldPreserveExistingMrs
                ? ((existingWindowMrs!.tier_cap_reason as any) ?? null)
                : (suppressIncomingMrsSnapshot ? null : safeTierCapReason),
              // MRS v3 §3.3 — refined-score split mirror. Falls back to the
              // displayed `innerReadinessScore` when the client didn't forward
              // a baseline (back-compat with older client builds).
              readinessScoreBaseline: shouldPreserveExistingMrs
                ? (existingWindowMrs!.readiness_score_baseline ?? null)
                : (suppressIncomingMrsSnapshot
                  ? null
                  : currentBaselineForAnchor),
              readinessScoreRefined: shouldPreserveExistingMrs
                ? (existingWindowMrs!.readiness_score_refined ?? null)
                : (suppressIncomingMrsSnapshot ? null : clientScoreRefined),
              readinessState: shouldPreserveExistingMrs
                ? ((existingWindowMrs!.readiness_state as any) ?? "baseline")
                : (suppressIncomingMrsSnapshot
                  ? "awaiting"
                  : (clientReadinessState ?? (hasTodayCheckIn ? "refined" : "baseline"))),
              refinedContribution: shouldPreserveExistingMrs
                ? (existingWindowMrs!.refined_contribution ?? null)
                : (suppressIncomingMrsSnapshot
                  ? null
                  : (clientRefinedContribution ?? null)),
              // MRS v4 — window resolution + morning-anchor management.
              // Morning writes the anchor; afternoon/evening leave it
              // untouched (omitted ⇒ existing column value preserved).
              mrsWindow: timeWindow,
              ...(shouldWriteMorningAnchor
                ? { morningBaselineScore: currentBaselineForAnchor }
                : {}),
              ...(shouldBackfillMorningAnchor
                ? { morningBaselineScore: currentBaselineForAnchor }
                : {}),
              // Mirror v4 audit JSONB when inner-readiness forwarded it.
              // When preserving an existing ready row, also preserve its
              // original weight_provenance — never overwrite a numeric MRS
              // with an awaiting provenance (that produces contradictory
              // rows like inner_score=78 + awaiting_signals=true).
              ...(shouldPreserveExistingMrs
                ? { weightProvenance: existingWp }
                : (clientWeightProvenance !== null
                  ? { weightProvenance: clientWeightProvenance }
                  : {})),
            });
            mrsSnapshotWritten = true;
            console.log(
              "[compute-outer-readiness][mrs-snapshot-written]",
              JSON.stringify({
                userId,
                localDate: snapshotLocalDate,
                window: timeWindow,
                innerScore: shouldPreserveExistingMrs
                  ? (existingWindowMrs!.inner_score ?? null)
                  : (suppressIncomingMrsSnapshot
                    ? null
                    : (innerReadinessScore ?? null)),
                readinessState: shouldPreserveExistingMrs
                  ? ((existingWindowMrs!.readiness_state as any) ?? "baseline")
                  : (suppressIncomingMrsSnapshot
                    ? "awaiting"
                    : (clientReadinessState ?? (hasTodayCheckIn ? "refined" : "baseline"))),
              }),
            );
            // Phase 2 — morning anchor lives on the MORNING-window row. When
            // we're backfilling from an afternoon run, write the anchor into
            // the morning row in a separate idempotent upsert so downstream
            // readers (which now key by mrs_window='morning') find it.
            if (shouldBackfillMorningAnchor) {
              try {
                await db
                  .from("daily_context_snapshot")
                  .upsert(
                    {
                      user_id: userId,
                      local_date: snapshotLocalDate,
                      mrs_window: "morning",
                      morning_baseline_score: currentBaselineForAnchor,
                    },
                    { onConflict: "user_id,local_date,mrs_window" },
                  );
              } catch (anchorErr) {
                console.warn(
                  "[daily_context_snapshot] morning-anchor backfill failed:",
                  anchorErr instanceof Error ? anchorErr.message : anchorErr,
                );
              }
            }
          } catch (snapErr) {
            console.warn(
              "[daily_context_snapshot] mirror failed:",
              snapErr instanceof Error ? snapErr.message : snapErr,
            );
          }

          // Canonical override: when we adopted a preserved existing MRS
          // snapshot (or otherwise have a real canonical score), we MUST NOT
          // null the score payload just because the incoming run is
          // awaiting/lower-quality.
          // NOTE: declared here (before first use) — a later `const` caused a
          // TDZ ReferenceError that aborted every brief_snapshots write.
          const hasCanonicalScore = typeof canonicalInnerScore === "number";
          const suppressScorePayload =
            (awaitingSignals || innerStateIsAwaiting) && !hasCanonicalScore;

          // Mirror into inner_readiness_scores for Insights historical timeseries (MRS Fix I1)
          // Values come from the canonical MRS bindings in this handler scope.
          const mirrorScore: number | null =
            typeof canonicalInnerScore === "number"
              ? canonicalInnerScore
              : (typeof innerReadinessScore === "number"
                ? innerReadinessScore
                : null);
          if (!suppressScorePayload && typeof mirrorScore === "number") {
            try {
              await db.from("inner_readiness_scores").upsert(
                {
                  user_id: userId,
                  score_date: snapshotLocalDate,
                  composite_score: Math.round(mirrorScore),
                  energy_tier: innerReadinessTier ?? "managing",
                  time_of_day: getTimeOfDay(hour),
                  check_in_outcome: checkInOutcome ?? null,
                  clarity_level: clarityLevel ?? null,
                  confidence_level: confidenceLevel ?? null,
                  hrv_deviation: typeof hrvDeviation === "number"
                    ? hrvDeviation
                    : null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,score_date,time_of_day" }
              );
            } catch (irsErr) {
              console.warn(
                "[compute-outer-readiness] inner_readiness_scores upsert failed:",
                irsErr instanceof Error ? irsErr.message : irsErr
              );
            }
          }

          // brief_snapshots was split into baseline_* + refined_* column sets.
          // `phrase`, `body_text`, `lean_on`, `watch_for`, `score`, `tier`,
          // `signal_pills` now exist only as GENERATED columns that COALESCE
          // refined → baseline. We must write to the canonical baseline_* or
          // refined_* set based on the current readiness state, otherwise the
          // upsert fails with "cannot insert into generated column".
          // P0 2026-06-21 — when LLM generation failed (briefIsAwaiting),
          // persist nulls for phrase/body/leanOn/watchFor so the cache cannot
          // resurrect deterministic fallback strings on a later read. Score,
          // tier, and signal pills still persist because they come from
          // wearable/calendar/check-in pipelines, not the LLM.
          // Split suppression: LLM copy failure (briefIsAwaiting) must NOT
          // erase score/tier/signal_pills, which come from wearable/calendar/
          // check-in pipelines. Only signal-contract awaiting or inner-state
          // awaiting nulls the score payload.
          // Accepted LLM copy MUST be persisted even when the signal contract
          // is otherwise flagged awaiting — the LLM already reasoned over
          // whatever signals were available and the accepted output is the
          // canonical brief prose. Only null the copy when we truly have no
          // brief output to persist (no LLM, no cached snapshot).
          const hasAcceptedBriefCopy =
            (briefSource === "llm" || briefSource === "deterministic") &&
            typeof responsePhrase === "string" && responsePhrase.length > 0 &&
            typeof responseBody === "string" && responseBody.length > 0;
          const suppressBriefCopy = !hasAcceptedBriefCopy && (
            briefIsAwaiting || awaitingSignals || innerStateIsAwaiting
          );
          // Canonical override: when we adopted a preserved existing MRS
          // snapshot (or otherwise have a real canonical score), we MUST NOT
          // null the score payload just because the incoming run is
          // awaiting/lower-quality. Otherwise brief_snapshots would end up
          // with score=null while daily_context_snapshot has 78.
          if ((awaitingSignals || innerStateIsAwaiting) && hasCanonicalScore) {
            console.warn(
              "[canonical-mrs] brief_snapshots score persistence realigned to preserved MRS",
              {
                userId,
                localDate: userLocalDate,
                window: getTimeOfDay(hour),
                canonicalInnerScore,
                canonicalReadinessState,
                canonicalScoreSource,
              },
            );
          }
          let persistPhrase: string | null = suppressBriefCopy
            ? null
            : responsePhrase;
          let persistBody: string | null = suppressBriefCopy
            ? null
            : responseBody;
          let persistLeanOn: string | null = suppressBriefCopy
            ? null
            : formattedLeanOn;
          let persistWatchFor: string | null = suppressBriefCopy
            ? null
            : formattedWatchFor;
          let persistLeanOnSource: string | null = suppressBriefCopy
            ? null
            : finalLeanOnSource;
          let persistWatchForSource: string | null = suppressBriefCopy
            ? null
            : finalWatchForSource;
          let effectiveBriefSource: "llm" | "deterministic" | "awaiting" =
            briefSource;

          // ── W3 §8: persistence-time coherence revalidation ─────────────
          // signalPillsPayload has already been finalized (including the
          // coherence auto-correction pass) and is the same reference that
          // the response echo and DB write use. Revalidate the body against
          // the FINAL pill tiers and the FINAL MRS. If a body slipped past
          // the LLM validator with a numeric restatement, OR if a
          // coherence adjustment silently reconciled pills to a tier the
          // body now contradicts, we null the copy and downgrade to
          // awaiting rather than persisting a self-contradictory brief.
          if (persistBody && persistPhrase) {
            try {
              const finalPillContext = assessmentContext
                ? buildPillContextFromAssessment(assessmentContext)
                : null;
              const finalMrsForCheck: number | null =
                typeof canonicalInnerScore === "number"
                  ? canonicalInnerScore
                  : (typeof innerReadinessScore === "number"
                    ? innerReadinessScore
                    : null);
              const numericGuard = validateNoScoreRestatement(persistBody, {
                mrsScore: finalMrsForCheck,
              });
              const pillGuard = validatePillBodyConsistency(
                persistBody,
                finalPillContext,
              );
              if (!numericGuard.ok || !pillGuard.ok) {
                console.warn(
                  "[compute-outer-readiness][w3-persist-revalidate] rejecting persisted brief copy",
                  {
                    localDate: userLocalDate,
                    window: getTimeOfDay(hour),
                    numericGuard: numericGuard.ok ? null : numericGuard.reason,
                    pillGuard: pillGuard.ok ? null : pillGuard.reason,
                    briefSource,
                    finalPillContext,
                    fingerprints: assessmentContext?.deterministic ?? null,
                  },
                );
                // Null the copy and downgrade to awaiting so the row stays
                // consistent (score + pills preserved; contradictory body
                // dropped). Downstream overwrite-protection still runs.
                persistPhrase = null;
                persistBody = null;
                persistLeanOn = null;
                persistWatchFor = null;
                persistLeanOnSource = null;
                persistWatchForSource = null;
                effectiveBriefSource = "awaiting";
              }
            } catch (revalErr) {
              console.error(
                "[compute-outer-readiness][w3-persist-revalidate] guard threw — allowing copy to persist:",
                revalErr instanceof Error ? revalErr.message : revalErr,
              );
            }
          }

          // ── Overwrite protection ──────────────────────────────────────
          // Read the existing current-window row FIRST. If it already has
          // non-null LLM copy, never let a later awaiting/null-copy pass
          // wipe it. Preserve the prior phrase/body/leanOn/watchFor and
          // brief_source='llm' on a null-write.
          let overwriteDecision:
            | "no_existing"
            | "overwrite_applied"
            | "overwrite_prevented"
            | "overwrite_forced_awaiting"
            | "none" = "none";
          try {
            // Overwrite protection is scoped to (user_id, local_date,
            // time_window) — NOT input_signature / prompt_version. This
            // prevents a later different-signature awaiting/null-copy row
            // from silently shadowing a valid earlier LLM brief for the
            // same day+window (which readers surface by latest row).
            const { data: existingRows } = await db
              .from("brief_snapshots")
              .select(
                "id, brief_source, baseline_phrase, baseline_body_text, baseline_lean_on, baseline_lean_on_source, baseline_watch_for, baseline_watch_for_source, refined_phrase, refined_body_text, refined_lean_on, refined_lean_on_source, refined_watch_for, refined_watch_for_source, updated_at",
              )
              .eq("user_id", userId)
              .eq("local_date", userLocalDate)
              .eq("time_window", getTimeOfDay(hour))
              .order("updated_at", { ascending: false })
              .limit(1);
            const existingRow =
              Array.isArray(existingRows) && existingRows.length > 0
                ? existingRows[0]
                : null;
            if (!existingRow) {
              overwriteDecision = "no_existing";
              // Cold-start / first-run for this window: if we have no copy
              // to write, still persist an explicit awaiting row rather
              // than a mislabelled 'llm'/'deterministic' null-copy row.
              const newHasCopy = !!persistPhrase && !!persistBody;
              if (!newHasCopy) {
                effectiveBriefSource = "awaiting";
              }
            } else {
              // Pick whichever tier of copy actually exists on the prior row
              // — prefer the incoming write's tier, but fall back to the
              // other tier so a refined pass never silently loses an earlier
              // baseline LLM brief (or vice-versa).
              const isRefined =
                (canonicalReadinessState ?? "baseline") === "refined";
              const refinedHas = !!(existingRow as any).refined_phrase &&
                !!(existingRow as any).refined_body_text;
              const baselineHas = !!(existingRow as any).baseline_phrase &&
                !!(existingRow as any).baseline_body_text;
              const useRefined = isRefined
                ? refinedHas
                : (!baselineHas && refinedHas);
              const existingPhrase = (useRefined
                ? (existingRow as any).refined_phrase
                : (existingRow as any).baseline_phrase) ?? null;
              const existingBody = (useRefined
                ? (existingRow as any).refined_body_text
                : (existingRow as any).baseline_body_text) ?? null;
              const existingLeanOn = (useRefined
                ? (existingRow as any).refined_lean_on
                : (existingRow as any).baseline_lean_on) ?? null;
              const existingLeanOnSrc = (useRefined
                ? (existingRow as any).refined_lean_on_source
                : (existingRow as any).baseline_lean_on_source) ?? null;
              const existingWatchFor = (useRefined
                ? (existingRow as any).refined_watch_for
                : (existingRow as any).baseline_watch_for) ?? null;
              const existingWatchForSrc = (useRefined
                ? (existingRow as any).refined_watch_for_source
                : (existingRow as any).baseline_watch_for_source) ?? null;
              const existingBriefSource = (existingRow as any).brief_source as
                | "llm"
                | "deterministic"
                | "awaiting"
                | null;

              const existingHasCopy = !!existingPhrase && !!existingBody;
              const newHasCopy = !!persistPhrase && !!persistBody;
              if (suppressBriefCopy) {
                // Personal-signal contract is not met for this window, or inner state is awaiting.
                // Force an explicit awaiting row and do NOT preserve a prior LLM or
                // deterministic brief — the frontend must not restore stale
                // prose when the server has decided the signal is missing or being suppressed.
                persistPhrase = null;
                persistBody = null;
                persistLeanOn = null;
                persistWatchFor = null;
                persistLeanOnSource = null;
                persistWatchForSource = null;
                effectiveBriefSource = "awaiting";
                overwriteDecision = "overwrite_forced_awaiting";
              } else if (existingHasCopy && !newHasCopy) {
                // Prevent wipe — keep prior copy and brief_source.
                persistPhrase = existingPhrase;
                persistBody = existingBody;
                persistLeanOn = existingLeanOn ?? persistLeanOn;
                persistLeanOnSource = existingLeanOnSrc ?? persistLeanOnSource;
                persistWatchFor = existingWatchFor ?? persistWatchFor;
                persistWatchForSource = existingWatchForSrc ??
                  persistWatchForSource;
                if (
                  existingBriefSource === "llm" ||
                  existingBriefSource === "deterministic"
                ) {
                  effectiveBriefSource = existingBriefSource;
                }
                overwriteDecision = "overwrite_prevented";
              } else if (newHasCopy) {
                overwriteDecision = "overwrite_applied";
              } else {
                // No prior copy AND no new copy — this is an explicit
                // awaiting row. Persist `brief_source='awaiting'` so the
                // reader can distinguish "missing row" from "awaiting row"
                // from "real score-bearing row".
                effectiveBriefSource = "awaiting";
                overwriteDecision = "none";
              }

              console.log("[brief-cache][copy-persist]", {
                userId,
                localDate: userLocalDate,
                window: getTimeOfDay(hour),
                existingRowId: (existingRow as any).id,
                existingBriefSource,
                existingHasCopy,
                newHasCopy,
                hasAcceptedBriefCopy,
                suppressBriefCopy,
                briefIsAwaiting,
                awaitingSignals,
                innerStateIsAwaiting,
                incomingBriefSource: briefSource,
                effectiveBriefSource,
                decision: overwriteDecision,
              });
            }
          } catch (readErr) {
            console.warn(
              "[brief-cache][copy-persist] pre-read failed:",
              readErr instanceof Error ? readErr.message : readErr,
            );
          }
          const isRefinedWrite =
            (canonicalReadinessState ?? "baseline") === "refined";
          // State reflects score-payload readiness, not copy readiness.
          const awaitingStateLabel = suppressScorePayload
            ? "awaiting"
            : (canonicalReadinessState ?? "baseline");
            
          // Brief Gate: The Brief requires BOTH a fresh wearable and calendar.
          // Even if MRS has a score (e.g. calendar only), the Brief must await
          // if its stricter gate (briefMustAwait) fails.
          const briefAwaitingStateLabel = (suppressScorePayload || briefMustAwait)
            ? "awaiting"
            : awaitingStateLabel;
            
          const briefSuppressScore = suppressScorePayload || briefMustAwait;

          const stateColumns = isRefinedWrite
            ? {
              refined_state: briefAwaitingStateLabel,
              refined_phrase: persistPhrase,
              refined_body_text: persistBody,
              refined_lean_on: persistLeanOn,
              refined_lean_on_source: persistLeanOnSource,
              refined_watch_for: persistWatchFor,
              refined_watch_for_source: persistWatchForSource,
              refined_score: briefSuppressScore
                ? null
                : (canonicalInnerScore ?? null),
              refined_tier: briefSuppressScore
                ? null
                : (canonicalTier ?? null),
              refined_signal_pills: briefSuppressScore ? null : signalPillsPayload,
            }
            : {
              baseline_state: briefAwaitingStateLabel,
              baseline_phrase: persistPhrase,
              baseline_body_text: persistBody,
              baseline_lean_on: persistLeanOn,
              baseline_lean_on_source: persistLeanOnSource,
              baseline_watch_for: persistWatchFor,
              baseline_watch_for_source: persistWatchForSource,
              baseline_score: briefSuppressScore
                ? null
                : (canonicalInnerScore ?? null),
              baseline_tier: briefSuppressScore
                ? null
                : (canonicalTier ?? null),
              baseline_signal_pills: briefSuppressScore ? null : signalPillsPayload,
            };
          const { data: upsertRow, error: upsertError } = await db
            .from("brief_snapshots")
            .upsert(
              ((): Record<string, unknown> => {
                const payload: Record<string, unknown> = {
                  user_id: userId,
                  local_date: userLocalDate,
                  time_window: getTimeOfDay(hour),
                  input_signature: inputSignature,
                  prompt_version: BRIEF_PROMPT_VERSION,
                  daily_checkin_id: linkedDailyCheckinId,
                  ...stateColumns,
                  brief_source: effectiveBriefSource,
                  driver: theme.driver,
                  // Phase 1A — preserve EVERY attempt's reason instead of only the
                  // last one. `llmFallbackReason` is overwritten between attempts,
                  // so derive the persisted summary from `llmAttemptRecords` which
                  // retains the full Flash → Claude chain. Null only on success.
                  llm_fallback_reason: llmBrief ? null : (llmAttemptRecords
                    .map((
                      r,
                    ) => (typeof r.rawReason === "string" ? r.rawReason : null))
                    .filter(Boolean)
                    .join(" | ") || llmFallbackReason || null),
                  // Per-attempt diagnostics — see hoisted `llmAttemptRecords` above.
                  // Each row carries the full Flash → Claude attempt chain, so we can
                  // measure the timeout/parse/validator/http_error split without
                  // relying on the (overwritten) llm_fallback_reason field.
                  llm_attempts: llmAttemptRecords.length > 0
                    ? llmAttemptRecords
                    : null,
                  validator_rejections: llmValidatorRejections.length > 0
                    ? llmValidatorRejections
                    : null,
                  pillar_mode: hasWearable && checkInOutcome
                    ? "full"
                    : hasWearable
                    ? "wearable"
                    : checkInOutcome
                    ? "checkin"
                    : "unknown",
                  payload_json: {
                    signal_freshness: {
                      window: briefWindow,
                      wearableCurrentForWindow: briefWearableUsable,
                      checkInCurrentForWindow,
                      wearableSourceAgeDays,
                      maxWearableAgeDays: signalFreshness.maxWearableAgeDays,
                      currentSignals: [
                        ...(briefWearableUsable ? ["wearable"] : []),
                        ...(checkInCurrentForWindow ? ["check_in"] : []),
                      ],
                    },
                    signals: {
                      checkInOutcome: checkInOutcome || null,
                      clarityLevel,
                      confidenceLevel,
                      mentalSharpnessLevel,
                      hrvDeviation,
                      sleepDeviation,
                      rhrDeviation,
                      calendarLoad,
                      calendarPressure,
                      meetingCount: calendarResult.meetingCount,
                      remainingMeetings: calendarResult.remainingMeetings,
                      remainingHighStakes: calendarResult.remainingHighStakes,
                      nextHighStakesEvent,
                      isWeekend: isBriefWeekendDay(
                        dayOfWeek,
                        localeWeekendHomeCountry,
                      ),
                      consecutiveLowConfidence,
                      consecutiveLowClarity,
                      scoreTrajectory7d,
                      wearableTrend7d,
                      typicalDOWOutcome,
                      tomorrowLoad,
                      isPublicHoliday,
                    },
                    // Shared-module snapshot — single source of truth used by the
                    // Brief at generation time, exposed here so generate-mastery-plan
                    // (and Insights / Nudges) read the SAME named events, stakes
                    // and slot boosts the Brief reasoned over. Schema lives in
                    // _shared/behaviour-snapshot.ts.
                    behaviour_snapshot: briefBehaviourSnapshot
                      ? {
                        signatureHash: briefBehaviourSnapshot.signatureHash,
                        flagsBrief: briefBehaviourSnapshot.flagsBrief,
                        flagsPlan: briefBehaviourSnapshot.flagsPlan,
                        slotBoosts: briefBehaviourSnapshot.slotBoosts,
                        taxonomyBlock: briefBehaviourSnapshot.taxonomyBlock,
                        // Pre-formatted CEO behaviour blocks. Persisted so Plan and
                        // Nudges that load the snapshot from the DB (rather than the
                        // same-request inline cache) see the EXACT prompt fragment the
                        // Brief reasoned over. Without this they would re-derive an
                        // empty block and the CEO behaviour context would silently
                        // vanish — the structural Brief↔Plan drift this layer exists
                        // to prevent.
                        promptBlockBrief:
                          briefBehaviourSnapshot.promptBlockBrief,
                        promptBlockPlan: briefBehaviourSnapshot.promptBlockPlan,
                      }
                      : null,
                    window_context: briefWindowContext ?? null,
                    // Leader Profile summary — persisted so Plan / Nudges / Insights
                    // that load the brief snapshot see the exact CoS context the
                    // Brief reasoned over. Never contains full cos_profile — only
                    // the fields consumed downstream.
                    leaderProfile: {
                      goals: leaderProfile.goals,
                      voice: {
                        cos_brief_rules: leaderProfile.voice.cos_brief_rules,
                        brief_voice_note: leaderProfile.voice.brief_voice_note,
                      },
                      archetype: leaderProfile.analysis.archetype,
                      preferences: leaderProfile.preferences,
                      meta: leaderProfile.meta,
                    },
                  },
                  // Structured wearable snapshot — full set of readings + baselines + deviations
                  // captured at brief generation time. Past briefs and Insights read this directly
                  // so the same pills (Decision Readiness / Physical Reserves / Resilience Capacity)
                  // and the same evidence rows (HRV 18.1ms, RHR 64bpm, etc.) can be reproduced
                  // without re-querying wearable_data.
                  wearable_snapshot: {
                    hrv: hrvValue,
                    hrvDeviation,
                    hrvBaseline,
                    rhr: rhrValue,
                    rhrDeviation,
                    rhrBaseline,
                    hr: hrValue,
                    hrDeviation,
                    hrBaseline,
                    sleepDuration,
                    sleepScore: sleepScoreVal,
                    sleepDeviation,
                    sleepBaseline,
                    wearableConnected: hasWearableConnection,
                    wearableTrend7d,
                    scoreTrajectory7d,
                    dataSource: wearableDataSource,
                    sourceRowDate,
                    capturedAt: new Date().toISOString(),
                  },
                  // Check-in snapshot — sliders + outcome that drove the brief, frozen in time.
                  checkin_snapshot: {
                    checkInOutcome: checkInOutcome || null,
                    clarityLevel,
                    confidenceLevel,
                    mentalSharpnessLevel,
                    consecutiveLowConfidence,
                    consecutiveLowClarity,
                  },
                  updated_at: new Date().toISOString(),
                };
                try {
                  console.log(
                    "[compute-outer-readiness][brief-snapshot-write]",
                    JSON.stringify({
                      userId,
                      localDate: userLocalDate,
                      timeWindow: getTimeOfDay(hour),
                      briefSource: effectiveBriefSource,
                      incomingBriefSource: briefSource,
                      phrase: persistPhrase,
                      bodyText: persistBody,
                      leanOn: persistLeanOn,
                      watchFor: persistWatchFor,
                      suppressBriefCopy,
                      suppressScorePayload,
                      hasAcceptedBriefCopy,
                      overwriteDecision,
                      isRefinedWrite,
                    }),
                  );
                } catch {}
                return payload;
              })(),
              {
                onConflict:
                  "user_id,local_date,time_window,input_signature,prompt_version",
              },
            )
            .select("id, phrase, body_text, brief_source")
            .maybeSingle();
          if (upsertError) {
            console.error(
              "[brief-cache] Snapshot write failed:",
              upsertError.message,
            );
            try {
              console.error(
                "[compute-outer-readiness][brief-snapshot-written]",
                JSON.stringify({
                  userId,
                  localDate: userLocalDate,
                  timeWindow: getTimeOfDay(hour),
                  ok: false,
                  error: upsertError.message,
                  briefSource: effectiveBriefSource,
                }),
              );
            } catch {}
          } else {
            resolvedBriefId = (upsertRow as any)?.id ?? null;
            briefSnapshotWritten = resolvedBriefId !== null;
            try {
              console.log(
                "[compute-outer-readiness][brief-snapshot-written]",
                JSON.stringify({
                  userId,
                  localDate: userLocalDate,
                  timeWindow: getTimeOfDay(hour),
                  ok: true,
                  briefId: resolvedBriefId,
                  // Values echoed BACK from the row we just wrote. These are the
                  // generated-column values (COALESCE refined → baseline) that a
                  // subsequent get-current-brief-snapshot read will see.
                  storedPhrase: (upsertRow as any)?.phrase ?? null,
                  storedBodyText: (upsertRow as any)?.body_text ?? null,
                  storedBriefSource: (upsertRow as any)?.brief_source ?? null,
                  intendedBriefSource: effectiveBriefSource,
                  intendedPhrase: persistPhrase,
                  intendedBody: persistBody,
                  overwriteDecision,
                }),
              );
            } catch {}
            console.log(
              "[brief-cache] Result:",
              JSON.stringify({
                snapshotHit: false,
                briefId: resolvedBriefId,
                briefSource,
                promptVersion: BRIEF_PROMPT_VERSION,
                inputSignature: inputSignature.slice(0, 8) + "...",
                generationPath: briefSource === "llm"
                  ? "fresh_llm"
                  : briefSource === "awaiting"
                  ? "fresh_awaiting"
                  : "fresh_deterministic",
                snapshotReason: "miss_fresh_generation",
              }),
            );
          }
        } catch (writeError) {
          console.error(
            "[brief-cache] Snapshot write failed:",
            writeError instanceof Error ? writeError.message : writeError,
          );
        }
      }

      const result: OuterReadinessResult & Record<string, unknown> = {
        // P0 2026-06-21 — brief-copy fields null out for BOTH
        // `awaitingSignals` (no fresh check-in/wearable) AND `briefIsAwaiting`
        // (LLM generation failed after all retries). The frontend never
        // receives deterministic "Close strong." / "Steady the system…" /
        // "protecting the edge" strings anymore.
        phrase: (awaitingSignals || briefIsAwaiting) ? null : responsePhrase,
        context: (awaitingSignals || briefIsAwaiting) ? null : responseBody,
        leanOn: (awaitingSignals || briefIsAwaiting) ? null : formattedLeanOn,
        watchFor: (awaitingSignals || briefIsAwaiting)
          ? null
          : formattedWatchFor,
        relationshipPattern: (awaitingSignals || briefIsAwaiting)
          ? null
          : relationshipPattern,
        awaitingSignals,
        awaitingReason,
        // ── LLM diagnostics (frontend browser-console only) ─────────────
        // Exposed so [PRB][llm] logs can distinguish provider vs validator
        // vs true cold-start awaiting. Persisted equivalents live on
        // `brief_snapshots.llm_fallback_reason` / `.validator_rejections`.
        // No prompts, tokens, or user content — reason codes only.
        llmFallbackReason: llmFallbackReason ?? null,
        validatorRejections: llmValidatorRejections.length > 0
          ? llmValidatorRejections.map((r) => {
            const row = (r || {}) as Record<string, unknown>;
            return {
              attempt: row.attempt ?? null,
              reason: row.reason ?? null,
              rule: row.rule ?? null,
              field: row.field ?? null,
            };
          })
          : null,
        // briefMode is the canonical client-facing signal source contract.
        //   • 'cold-start' — no current personal signal (wearable/check-in) OR
        //                    no usable inner score. Calendar-only is cold-start
        //                    for the Brief, even though MRS/Plan still use it.
        //   • 'baseline'   — window-fresh wearable present, no check-in for today
        //   • 'refined'    — check-in present (with or without wearable/calendar)
        // Client rule: only render skeleton when briefMode === 'cold-start'.
        // In baseline mode pills, score, brief and Plan must all render.
        briefMode: (
          awaitingSignals || briefAwaitingSignals || innerStateIsAwaiting
            ? "cold-start"
            : (hasTodayCheckIn ? "refined" : "baseline")
        ) as "cold-start" | "baseline" | "refined",

        // Source provenance + pill↔MRS coherence + baseline-only score.
        // Surfaced for client audit chips and so MRS + pills are not
        // operating in isolation. `pillCoherence.inSync === false` means
        // the deterministic pill engine had to be reconciled against the
        // MRS tier — UI may choose to surface a subtle hint.
        sourceProvenance: awaitingSignals ? null : echoedProvenance,
        pillCoherence: awaitingSignals ? null : echoedPillCoherence,
        baselineReadinessScore: awaitingSignals ? null : echoedBaselineScore,
        // Explicit period-scoped flags so the client never has to infer
        // "is this period live?" from leaked day-scoped fields like
        // `checkInOutcome` or `innerReadinessScore`.
        hasCurrentPeriodCheckIn: hasTodayCheckIn,
        hasFreshWearable,
        hasCurrentPeriodSignal: briefSignalContractMet && !innerStateIsAwaiting,
        driver: theme.driver,
        dataSources,
        calendarState: calendarResult.state,
        coachInsightAge: leanOnResult.coachInsightAge,
        coachInsightLabel: leanOnResult.coachInsightLabel,
        stateStatement,
        stateAlreadyUsed,
        compassAlreadyUsed,
        // DecisionReadinessBrief fields — coherent source
        bodyText: (awaitingSignals || briefIsAwaiting) ? null : responseBody,
        briefSource,
        leanOnSource: (awaitingSignals || briefIsAwaiting)
          ? null
          : (llmBrief ? "llm-v4" : leanOnResult.source),
        watchForSource: (awaitingSignals || briefIsAwaiting)
          ? null
          : (llmBrief ? "llm-v4" : leanOnResult.source),
        hasWearable,
        wearableDaysConnected,
        wearableStatus: {
          isConnected: hasWearableConnection,
          hasTodayData: hasTodayWearableData,
          hasRecentData: hasRecentWearableData,
          isStale: hasStaleWearableData,
          sourceAgeDays: wearableSourceAgeDays,
          metricsAvailable: {
            hrv: hrvValue != null,
            sleep: sleepDuration != null || sleepScoreVal != null,
            rhr: rhrValue != null,
            hr: hrValue != null,
          },
          sourceRowDate,
          dataSource: wearableDataSource,
        },
        integrationStatus,
        remainingMeetings: calendarResult.remainingMeetings ?? 0,
        hrvDeviation,
        sleepDeviation,
        rhrDeviation,
        hrDeviation,
        sleepDuration,
        rhrValue,
        hrValue,
        hrBaseline,
        sleepScore: sleepScoreVal,
        hrvValue,
        hrvBaseline,
        sleepBaseline,
        rhrBaseline,
        wearableDataSource,
        hasHistoricalData,
        hasCalendar: hasCal,
        calendarLoad: calendarLoad || "low",
        meetingCount: calendarResult.meetingCount,
        highStakesEvents: todayHighStakes,
        highStakesEventsDetailed: todayHighStakes.map((title, i) => ({
          title,
          localTime: todayHighStakesEventTimes[i] || null,
          category: todayHighStakesCategories[i] || null,
        })),
        remainingHighStakes: calendarResult.remainingHighStakes ?? [],
        nextHighStakesEvent,
        checkInCountTotal,
        consecutiveLowConfidence,
        consecutiveLowClarity,
        coachStrength,
        clarityLevel: clarityLevel,
        confidenceLevel: confidenceLevel,
        mentalSharpnessLevel: mentalSharpnessLevel,
        // Signal Pills v3 — Mind Check-in dimensions echoed verbatim so the
        // Resilience + Cognitive pills can compute their refined-state tier
        // client-side without re-querying daily_checkins. Emitted on the same
        // terms as `clarityLevel` above — awaiting-state suppression happens
        // downstream in the pill freshness gate, not here, so the Resilience
        // badge cannot disagree with Decision Readiness.
        emotionLevel: emotionLevel,
        pressureLevel: pressureLevel,
        regulationLevel: regulationLevel,
        // Wearable anchor for the Resilience pill — overnight restoration
        // quality (0–100). Null when provider does not expose it.
        sleepEfficiency: wearableContext?.sleepEfficiency ?? null,
        // Signal Pills v3 — divergence flags surfaced for pill cap/floor
        // application. supplyDemandGap caps Cognitive GREEN → AMBER;
        // regulationRisk floors Resilience at AMBER. Booleans only.
        // Lightweight inline derivation so we don't depend on a flag that
        // is only computed inside the snapshot-mirror try block.
        supplyDemandGap: (() => {
          const demandHigh = calendarLoad === "high" ||
            calendarPressure === "high";
          const bodyDown =
            (typeof (wearableContext as any)?.hrvDeviation === "number" &&
              (wearableContext as any).hrvDeviation <= -10) ||
            !!wearableContext?.poorSleep ||
            !!wearableContext?.hrvElevated;
          return demandHigh && bodyDown;
        })(),
        regulationRisk: regulationLevel != null && regulationLevel <= 2,
        // New enrichment fields
        yesterdayScore,
        scoreTrend,
        hasBackToBack,
        longestBackToBackHrs,
        nextEvent: nextEventAny,
        practicesCompletedThisWeek,
        practiceCompletionRate,
        daysSinceCoachSession,
        coachSessionImpactDelta,
        avgScore7d,
        scoreTrajectory7d,
        wearableTrend7d,
        typicalDOWScore,
        divergenceMode,
        weekAheadShape,
        hrvEventCorrelation,
        mostEffectivePractice,
        divergence: {
          cognitiveMasked: divergenceMode === "MASKED_HIGH",
          resilienceFeltAhead: (checkInOutcome === "drained" ||
            checkInOutcome === "overwhelmed") &&
            (confidenceLevel != null && confidenceLevel >= 4),
          sleepUnread: sleepDuration == null && sleepScoreVal == null,
        },
        // Echo inner readiness so client doesn't need a separate computeEnergyState call.
        // Uses the canonical MRS payload so a preserved existing MRS row can
        // never be undercut by a stale/awaiting incoming score in the echo.
        // When there is genuinely no canonical score (fully awaiting), we
        // suppress the period-sensitive fields exactly as before so the UI
        // doesn't re-use an older check-in's score/outcome.
        innerReadinessScore: (() => {
          if (typeof canonicalInnerScore === "number") {
            return canonicalInnerScore;
          }
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : innerReadinessScore;
        })(),
        innerReadinessTier: (() => {
          if (
            canonicalScoreSource === "preserved_existing_mrs" &&
            canonicalTier != null
          ) return canonicalTier;
          return (awaitingSignals || innerStateIsAwaiting) ? null : safeTier;
        })(),
        innerReadinessTierDisplayed: (() => {
          if (
            canonicalScoreSource === "preserved_existing_mrs" &&
            canonicalTierDisplayed != null
          ) return canonicalTierDisplayed;
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : safeTierDisplayed;
        })(),
        innerReadinessTierCapReason: (() => {
          if (canonicalScoreSource === "preserved_existing_mrs") {
            return canonicalTierCapReason;
          }
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : safeTierCapReason;
        })(),
        innerReadinessScoreBaseline: (() => {
          if (
            canonicalScoreSource === "preserved_existing_mrs" &&
            canonicalScoreBaseline != null
          ) return canonicalScoreBaseline;
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : effectiveBaselineScore;
        })(),
        innerReadinessScoreRefined: (() => {
          if (canonicalScoreSource === "preserved_existing_mrs") {
            return canonicalScoreRefined;
          }
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : clientScoreRefined;
        })(),
        innerReadinessState: (() => {
          if (
            canonicalScoreSource === "preserved_existing_mrs" &&
            canonicalReadinessState != null
          ) return canonicalReadinessState;
          return awaitingSignals
            ? null
            : (innerStateIsAwaiting
              ? "awaiting"
              : (clientReadinessState ?? "baseline"));
        })(),
        innerReadinessRefinedContribution: (() => {
          if (canonicalScoreSource === "preserved_existing_mrs") {
            return canonicalRefinedContribution;
          }
          return (awaitingSignals || innerStateIsAwaiting)
            ? null
            : (clientRefinedContribution ?? null);
        })(),
        // MRS V4 — explicit eligibility contract. Frontend MUST prefer this
        // over deriving state from individual fields. See helper definition
        // near `wearableFreshForGate` for the rule table.
        readinessEligibility,
        checkInOutcome: awaitingSignals ? null : (checkInOutcome || null),
        briefId: resolvedBriefId,
        // Explicit flag: true only when a brief_snapshots row exists for this
        // request (cache hit OR successful upsert). The client uses this to
        // decide whether to track a brief_view event for Recent history.
        briefPersisted: resolvedBriefId !== null,
        // Cron persistence receipts. `briefSnapshotWritten` is true only when
        // this run performed a fresh upsert (not just a same-signature cache
        // hit); `mrsSnapshotWritten` mirrors the daily_context_snapshot write.
        briefSnapshotId: resolvedBriefId,
        briefSnapshotWritten,
        mrsSnapshotWritten,
        // Signal Pills v3 — echo server-built pill payload + bracketed
        // qualifiers so the client renders identical numbers to Insights
        // without recomputing aggregates. `coherenceWarning` is suppressed
        // in production (dev/QA only — see assertPillCoherence).
        signalPills: echoedSignalPills,
        pillQualifiers: awaitingSignals ? null : echoedPillQualifiers,
        coherenceWarning: echoedCoherenceWarning,
        // Surface the deterministic shared-module snapshot the Brief reasoned
        // over so a same-request handoff to `generate-mastery-plan` (passed via
        // `outerReadinessCache.behaviourSnapshot`) avoids a second DB read.
        // Schema mirrors what we persist on brief_snapshots.payload_json.behaviour_snapshot
        // — see _shared/load-brief-behaviour-snapshot.ts for the consumer contract.
        behaviourSnapshot: briefBehaviourSnapshot
          ? {
            signatureHash: briefBehaviourSnapshot.signatureHash,
            flagsBrief: briefBehaviourSnapshot.flagsBrief,
            flagsPlan: briefBehaviourSnapshot.flagsPlan,
            slotBoosts: briefBehaviourSnapshot.slotBoosts,
            taxonomyBlock: briefBehaviourSnapshot.taxonomyBlock,
            promptBlockBrief: briefBehaviourSnapshot.promptBlockBrief,
            promptBlockPlan: briefBehaviourSnapshot.promptBlockPlan,
          }
          : null,
      };

      console.log(
        "[compute-outer-readiness] RESULT:",
        JSON.stringify({
          phrase: responsePhrase,
          briefSource,
          llmFallbackReason,
          driver: theme.driver,
          source: leanOnResult.source,
          coachInsightAge: leanOnResult.coachInsightAge,
          dataSources,
          calendarState: calendarResult.state,
          todayHighStakes,
          wearableStatus: {
            hasTodayData: hasTodayWearableData,
            hasRecentData: hasRecentWearableData,
            isStale: hasStaleWearableData,
            sourceRowDate,
            sourceAgeDays: wearableSourceAgeDays,
          },
        }),
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (assemblyErr) {
      const aMsg = assemblyErr instanceof Error
        ? assemblyErr.message
        : String(assemblyErr);
      console.error(
        "[compute-outer-readiness] Response assembly failed, soft-fallback served:",
        aMsg,
      );
      // P0 2026-06-21 — assembly-error soft-fallback no longer serves
      // deterministic copy ("Steady ground." / "Continue with what you
      // know works."). Returns awaiting contract so the UI shows the
      // proper sync-and-check-in prompt instead of fake-personalised text.
      return new Response(
        JSON.stringify({
          fallback: true,
          phrase: null,
          context: null,
          bodyText: null,
          leanOn: null,
          watchFor: null,
          awaitingSignals: true,
          awaitingReason: "assembly_error",
          briefSource: "awaiting",
          leanOnSource: null,
          watchForSource: null,
          dataSources: [],
          calendarState: "unknown",
          hasWearable: false,
          wearableDaysConnected: null,
          innerReadinessScore: typeof innerReadinessScore === "number"
            ? innerReadinessScore
            : null,
          innerReadinessTier: typeof safeTier === "string" ? safeTier : null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[compute-outer-readiness] Error:", msg);
    const status =
      msg === "Invalid token" || msg === "Missing authorization header"
        ? 401
        : 500;
    // MRS-preservation fallback: if the caller forwarded deterministic
    // MRS fields (compute-inner-readiness output), return HTTP 200 with
    // an awaiting Brief but keep the numeric MRS payload intact so the
    // MRS gauge and Brief-page score never blank just because the LLM
    // Brief path (or a later assembly helper) threw. Only 5xx-class
    // failures qualify; auth failures still surface as 401 so the UI
    // routes to sign-in.
    if (
      status === 500 &&
      recoveryBody &&
      typeof recoveryBody === "object" &&
      (typeof recoveryBody.innerReadinessScore === "number" ||
        typeof recoveryBody.innerReadinessScoreBaseline === "number" ||
        typeof recoveryBody.innerReadinessScoreRefined === "number")
    ) {
      const rb = recoveryBody as Record<string, unknown>;
      const numOrNull = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      console.error(
        "[compute-outer-readiness] returning 200 awaiting-brief with preserved MRS (recovery from fatal):",
        msg,
      );
      return new Response(
        JSON.stringify({
          fallback: true,
          recovered: true,
          phrase: null,
          context: null,
          bodyText: null,
          leanOn: null,
          watchFor: null,
          awaitingSignals: true,
          awaitingReason: "fatal_recovered",
          briefSource: "awaiting",
          leanOnSource: null,
          watchForSource: null,
          dataSources: [],
          calendarState: "unknown",
          hasWearable: false,
          wearableDaysConnected: null,
          innerReadinessScore: numOrNull(rb.innerReadinessScore),
          innerReadinessTier: typeof rb.innerReadinessTier === "string"
            ? rb.innerReadinessTier
            : null,
          innerReadinessTierDisplayed: typeof rb.tierDisplayed === "string"
            ? rb.tierDisplayed
            : (typeof rb.innerReadinessTier === "string"
              ? rb.innerReadinessTier
              : null),
          innerReadinessScoreBaseline: numOrNull(
            rb.innerReadinessScoreBaseline,
          ),
          innerReadinessScoreRefined: numOrNull(
            rb.innerReadinessScoreRefined,
          ),
          innerReadinessState:
            rb.innerReadinessState === "refined" ||
                rb.innerReadinessState === "baseline" ||
                rb.innerReadinessState === "awaiting"
              ? rb.innerReadinessState
              : null,
          mrsSnapshotWritten: false,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
