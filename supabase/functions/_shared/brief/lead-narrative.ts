// OWNERSHIP: engineering. SINGLE narrative resolver for the Brief.
//
// Part 1A of the "best-in-class deterministic brief" work. This module answers
// ONE question, once per (user, local date, window):
//
//     "What is today's story, and which event carries it?"
//
// It detects nothing new. Every input is already resolved upstream:
//   • day shape / travel phase  → _shared/brief/day-shape.ts
//   • A–H category + subtype    → _shared/events/enrich-event.ts (the ONLY resolver)
//   • load / compression flags  → _shared/brief-signal-coverage.ts (SignalMatrix)
//
// The resolved object is consumed by BOTH output paths — the deterministic
// renderer and the LLM prompt block — so the two can never disagree about
// which event is the story. It is also persisted onto daily_context_snapshot
// so the Plan's JIT v2 selection can be parity-checked against it.

import { enrichEvent } from "../events/enrich-event.ts";
import type { EventCategoryId } from "../events/event-categories.ts";
import type { DayShape, TravelPhase } from "./day-shape.ts";

export type BriefNarrativeFamily =
  | "travel_long_haul"
  | "travel_short_haul"
  | "travel_intercity"
  | "persuasion_pre"
  | "visibility_pre"
  | "visibility_post"
  | "conference_arc"
  | "back_to_back"
  | "weight_heavy"
  | "volume_heavy"
  | "context_switching"
  | "baseline";

export type NarrativePhase = "pre" | "in_transit" | "during" | "post" | null;

export interface LeadNarrativeAnchor {
  title: string;
  categoryId: EventCategoryId | null;
  subtypeId: string | null;
  minutesUntil: number | null;
  /** Duration in minutes when both ends are known. */
  durationMinutes: number | null;
}

export interface LeadNarrativeAggregates {
  /** Timed, non-all-day events today. */
  meetingCount: number;
  /** Distinct A–H categories across today's timed events. */
  distinctCategories: number;
  /** Category letters present today, in first-occurrence order. */
  categorySequence: EventCategoryId[];
  /** Count of A/B/C events today (the rooms with consequence). */
  highStakesCount: number;
  /** Summed stakes weight: A=3, B=3, C=3, D=2, F=1, E/G/H=0. */
  stakesWeight: number;
  /** Hours of contiguous (<=15min gap) timed meetings. */
  backToBackHours: number;
  conferenceDayNumber: number | null;
  conferenceTotalDays: number | null;
  /** True when a C (visibility) event sits inside a conference day. */
  presentingInsideConference: boolean;
  /** Evening social/external obligation on a conference day. */
  eveningSocialLoad: boolean;
  travelTier: "long_haul" | "short_haul" | "short_haul_round_trip" | null;
  travelDurationHours: number | null;
  /** Timed work after the travel leg lands. */
  meetingsAfterTravel: number;
  /** Timed work before the travel leg departs. */
  meetingsBeforeTravel: number;
}

export interface LeadNarrative {
  family: BriefNarrativeFamily;
  anchor: LeadNarrativeAnchor | null;
  phase: NarrativePhase;
  /** Poor sleep / poor recovery / heavy carry-over into today. */
  depletion: boolean;
  aggregates: LeadNarrativeAggregates;
  /** Never user-visible. Logged + persisted for parity debugging. */
  reason: string;
}

export interface LeadNarrativeEvent {
  title: string;
  startTime: string;
  endTime?: string | null;
  isAllDay?: boolean;
  stakesLevel?: string | null;
}

export interface LeadNarrativeInput {
  events: LeadNarrativeEvent[];
  now: Date;
  dayShape: DayShape | null;
  travelPhase: TravelPhase;
  travelTier?: "long_haul" | "short_haul" | "short_haul_round_trip" | null;
  conferenceDayNumber?: number | null;
  conferenceTotalDays?: number | null;
  /** Depletion inputs — all optional; any one can carry the overlay. */
  band?: "firing" | "sharp" | "steady" | "stretched" | "depleted" | null;
  sleepScore?: number | null;
  checkInOutcome?: "sharp" | "holding" | "drained" | null;
  physicalPillTier?: "green" | "amber" | "red" | "unread" | null;
  cognitivePillTier?: "green" | "amber" | "red" | "unread" | null;
  /** Yesterday's readiness score, when known. */
  yesterdayScore?: number | null;
  /** Yesterday's timed meeting count, when known. */
  yesterdayMeetingCount?: number | null;
}

const STAKES_WEIGHT: Record<EventCategoryId, number> = {
  A: 3,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 1,
  G: 0,
  H: 0,
};

interface ResolvedEvt {
  title: string;
  categoryId: EventCategoryId | null;
  subtypeId: string | null;
  startMs: number;
  endMs: number;
  isAllDay: boolean;
  minutesUntil: number;
  durationMinutes: number | null;
}

function resolveAll(
  events: LeadNarrativeEvent[],
  nowMs: number,
): ResolvedEvt[] {
  const out: ResolvedEvt[] = [];
  for (const e of events ?? []) {
    const title = String(e?.title ?? "").trim();
    if (!title) continue;
    const startMs = new Date(e.startTime).getTime();
    if (!Number.isFinite(startMs)) continue;
    const endMs = e.endTime ? new Date(e.endTime).getTime() : startMs;
    const durationMinutes = Number.isFinite(endMs) && endMs > startMs
      ? Math.round((endMs - startMs) / 60000)
      : null;
    // SSOT: the only allowed A–H resolver.
    const enriched = enrichEvent({
      title,
      start_time: e.startTime,
      end_time: e.endTime ?? e.startTime,
    });
    out.push({
      title,
      categoryId: enriched.categoryId ?? null,
      subtypeId: enriched.subtype?.id ?? null,
      startMs,
      endMs: Number.isFinite(endMs) ? endMs : startMs,
      isAllDay: e.isAllDay === true ||
        (durationMinutes != null && durationMinutes >= 23 * 60),
      minutesUntil: Math.round((startMs - nowMs) / 60000),
      durationMinutes,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

function computeBackToBackHours(timed: ResolvedEvt[]): number {
  if (timed.length < 2) return 0;
  let best = 0;
  let runStart = timed[0].startMs;
  let runEnd = timed[0].endMs;
  for (let i = 1; i < timed.length; i++) {
    const e = timed[i];
    if (e.startMs - runEnd <= 15 * 60000) {
      runEnd = Math.max(runEnd, e.endMs);
    } else {
      best = Math.max(best, runEnd - runStart);
      runStart = e.startMs;
      runEnd = e.endMs;
    }
  }
  best = Math.max(best, runEnd - runStart);
  return Math.round((best / 3600000) * 10) / 10;
}

function toAnchor(e: ResolvedEvt | null): LeadNarrativeAnchor | null {
  if (!e) return null;
  return {
    title: e.title,
    categoryId: e.categoryId,
    subtypeId: e.subtypeId,
    minutesUntil: e.minutesUntil,
    durationMinutes: e.durationMinutes,
  };
}

/** Poor sleep / poor recovery / heavy previous day going into today. */
export function resolveDepletion(input: LeadNarrativeInput): boolean {
  if (input.band === "depleted" || input.band === "stretched") return true;
  if (typeof input.sleepScore === "number" && input.sleepScore < 65) return true;
  if (input.checkInOutcome === "drained") return true;
  if (input.physicalPillTier === "red" || input.cognitivePillTier === "red") {
    return true;
  }
  if (
    typeof input.yesterdayMeetingCount === "number" &&
    input.yesterdayMeetingCount >= 6 &&
    typeof input.yesterdayScore === "number" &&
    input.yesterdayScore < 55
  ) return true;
  return false;
}

/**
 * Resolve the single narrative that both output paths render.
 * Pure. Never throws — worst case returns the `baseline` family.
 */
export function resolveLeadNarrative(input: LeadNarrativeInput): LeadNarrative {
  const nowMs = input.now instanceof Date
    ? input.now.getTime()
    : new Date(input.now).getTime();
  const all = resolveAll(input.events ?? [], nowMs);
  const timed = all.filter((e) => !e.isAllDay);
  const work = timed.filter((e) => e.categoryId !== "G");

  const categorySequence: EventCategoryId[] = [];
  for (const e of work) {
    if (e.categoryId && !categorySequence.includes(e.categoryId)) {
      categorySequence.push(e.categoryId);
    }
  }
  const highStakes = work.filter((e) =>
    e.categoryId === "A" || e.categoryId === "B" || e.categoryId === "C"
  );
  const stakesWeight = work.reduce(
    (sum, e) => sum + (e.categoryId ? STAKES_WEIGHT[e.categoryId] : 0),
    0,
  );
  const travelEvents = all.filter((e) => e.categoryId === "G");
  const travelLeg = travelEvents[0] ?? null;
  const travelDurationHours = travelLeg?.durationMinutes != null
    ? Math.round((travelLeg.durationMinutes / 60) * 10) / 10
    : null;
  const conferenceEvents = all.filter((e) => e.categoryId === "F");
  const eveningSocialLoad = work.some((e) => {
    const hourLocal = new Date(e.startMs).getUTCHours();
    return e.categoryId === "F" || (e.categoryId === "E" && hourLocal >= 17);
  }) && conferenceEvents.length > 0;

  const aggregates: LeadNarrativeAggregates = {
    meetingCount: work.length,
    distinctCategories: categorySequence.length,
    categorySequence,
    highStakesCount: highStakes.length,
    stakesWeight,
    backToBackHours: computeBackToBackHours(work),
    conferenceDayNumber: input.conferenceDayNumber ?? null,
    conferenceTotalDays: input.conferenceTotalDays ?? null,
    presentingInsideConference: conferenceEvents.length > 0 &&
      work.some((e) => e.categoryId === "C"),
    eveningSocialLoad,
    travelTier: input.travelTier ??
      (travelDurationHours != null
        ? (travelDurationHours >= 6 ? "long_haul" : "short_haul")
        : null),
    travelDurationHours,
    meetingsAfterTravel: travelLeg
      ? work.filter((e) => e.startMs >= travelLeg.endMs).length
      : 0,
    meetingsBeforeTravel: travelLeg
      ? work.filter((e) => e.endMs <= travelLeg.startMs).length
      : 0,
  };

  const depletion = resolveDepletion(input);

  const upcoming = work.filter((e) => e.minutesUntil >= -15);
  const nextOf = (cats: EventCategoryId[]) =>
    upcoming.find((e) => e.categoryId && cats.includes(e.categoryId)) ?? null;
  const recentlyEnded = (cats: EventCategoryId[]) =>
    [...work].reverse().find((e) =>
      e.categoryId && cats.includes(e.categoryId) &&
      e.endMs <= nowMs && nowMs - e.endMs <= 240 * 60000
    ) ?? null;

  const decide = (): { family: BriefNarrativeFamily; anchor: ResolvedEvt | null; phase: NarrativePhase; reason: string } => {
    // 1 — Travel owns the day whenever the shape says so.
    if (input.dayShape === "work_travel" || input.dayShape === "personal_travel") {
      const tier = aggregates.travelTier;
      const intercity = tier === "short_haul_round_trip" ||
        (travelEvents.length >= 2 && aggregates.travelDurationHours != null &&
          aggregates.travelDurationHours < 3);
      const family: BriefNarrativeFamily = intercity
        ? "travel_intercity"
        : tier === "long_haul"
        ? "travel_long_haul"
        : "travel_short_haul";
      const phase: NarrativePhase = input.travelPhase === "in_transit"
        ? "in_transit"
        : input.travelPhase === "post"
        ? "post"
        : "pre";
      return { family, anchor: travelLeg, phase, reason: `travel:${tier ?? "unknown"}` };
    }

    // 2 — Conference / summit arc.
    if (input.dayShape === "conference" || aggregates.conferenceDayNumber) {
      return {
        family: "conference_arc",
        anchor: conferenceEvents[0] ?? nextOf(["C"]) ?? null,
        phase: "during",
        reason: `conference:day${aggregates.conferenceDayNumber ?? 1}`,
      };
    }

    // 3 — Visibility (C) pre, then post.
    const nextC = nextOf(["C"]);
    if (nextC) {
      return { family: "visibility_pre", anchor: nextC, phase: "pre", reason: "visibility:upcoming" };
    }
    const doneC = recentlyEnded(["C"]);
    if (doneC) {
      return { family: "visibility_post", anchor: doneC, phase: "post", reason: "visibility:clear-down" };
    }

    // 4 — Influence & persuasion (B) before the room.
    const nextB = nextOf(["B"]);
    if (nextB) {
      return { family: "persuasion_pre", anchor: nextB, phase: "pre", reason: "persuasion:upcoming" };
    }

    // 5 — Context switching: four or more distinct A–H categories today.
    if (aggregates.distinctCategories >= 4 && aggregates.meetingCount >= 4) {
      return {
        family: "context_switching",
        anchor: nextOf(["A", "B", "C", "D", "E"]) ?? upcoming[0] ?? null,
        phase: "during",
        reason: `switching:${aggregates.distinctCategories}cats`,
      };
    }

    // 6 — Weight vs volume. Few heavy rooms vs many light ones.
    if (aggregates.highStakesCount >= 2 && aggregates.meetingCount <= 4) {
      return {
        family: "weight_heavy",
        anchor: nextOf(["A", "B", "C"]) ?? highStakes[0] ?? null,
        phase: "pre",
        reason: `weight:${aggregates.highStakesCount}hs/${aggregates.meetingCount}`,
      };
    }
    if (aggregates.meetingCount >= 6 && aggregates.stakesWeight <= aggregates.meetingCount) {
      return {
        family: "volume_heavy",
        anchor: upcoming[0] ?? null,
        phase: "during",
        reason: `volume:${aggregates.meetingCount}`,
      };
    }

    // 7 — Back-to-back compression.
    if (aggregates.backToBackHours >= 3 || aggregates.meetingCount >= 5) {
      return {
        family: "back_to_back",
        anchor: nextOf(["A", "B", "C", "D"]) ?? upcoming[0] ?? null,
        phase: "during",
        reason: `compression:${aggregates.backToBackHours}h`,
      };
    }

    return { family: "baseline", anchor: upcoming[0] ?? null, phase: null, reason: "baseline" };
  };

  const d = decide();
  return {
    family: d.family,
    anchor: toAnchor(d.anchor),
    phase: d.phase,
    depletion,
    aggregates,
    reason: `${d.reason}${depletion ? "+depleted" : ""}`,
  };
}

/** Compact serialisation for the LLM prompt block and snapshot persistence. */
export function formatLeadNarrativeBlock(n: LeadNarrative): string {
  const a = n.anchor;
  return [
    "",
    "",
    "=== TODAY'S LEAD NARRATIVE ===",
    `family: ${n.family}${n.phase ? ` (${n.phase})` : ""}`,
    a
      ? `anchor: "${a.title}" · category ${a.categoryId ?? "?"}${
        a.subtypeId ? `/${a.subtypeId}` : ""
      }${a.minutesUntil != null ? ` · in ${a.minutesUntil} min` : ""}`
      : "anchor: none",
    `load: ${n.aggregates.meetingCount} meetings · ${n.aggregates.distinctCategories} distinct categories · ${n.aggregates.backToBackHours}h contiguous · stakes weight ${n.aggregates.stakesWeight}`,
    n.depletion
      ? "carry-over: the body is starting today already down. The read must name the gap between demand and supply."
      : "carry-over: none.",
    "The body must lead on THIS story and this anchor. Do not lead on a different event.",
  ].join("\n");
}
