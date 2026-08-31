import type { RankedJitCandidate } from "../events/jit-candidates.ts";
import type { Phase } from "../events/event-phase-map.ts";
import { EVENT_PHASE_MAP } from "../events/event-phase-map.ts";
import type { EventCategoryId } from "../events/event-categories.ts";
import { enrichEvent } from "../events/enrich-event.ts";

// WS4 — Plan Arc Selector.
// For Category G (travel) anchors the phase map advertises pre/during/post,
// but that is a capability declaration. The actual arc for a specific flight
// is short-haul (pre+post) vs long-haul (pre+during+post) per
// enrichEvent().travelArc. This helper prunes phases the specific event
// doesn't warrant so short-haul flights don't get pushed an in-flight slot.
function pruneTravelPhases(
  phases: Phase[],
  categoryId: EventCategoryId | null | undefined,
  title: string | null | undefined,
  durationMin?: number | null,
): Phase[] {
  if (categoryId !== "G") return phases;
  // Prefer the calendar-derived duration: a bland "Flight LHR→SIN" title
  // still resolves to long-haul when the event spans ≥6h.
  const startIso = new Date(0).toISOString();
  const endIso = durationMin != null && durationMin > 0
    ? new Date(durationMin * 60_000).toISOString()
    : null;
  const arc = enrichEvent(
    endIso
      ? { title: title ?? "", start_time: startIso, end_time: endIso }
      : { title: title ?? "" },
  ).travelArc;
  // Only long-haul / explicit travel_day keeps the "during" (in-flight) slot.
  // enrichEvent defaults null-duration flights to 'pre-post', which is the
  // conservative behaviour we want at the allocator boundary.
  if (arc === "pre-during-post") return phases;
  return phases.filter((p) => p !== "during");
}

export type DayShape =
  | "light_routine"
  | "dominant_structural_event"
  | "mixed_day"
  | "rest_day"
  | "saturday"
  | "holiday_pto"
  | "week_ahead"
  | "travel_day"
  | "conference_day";
export type SlotMode = "jit" | "state" | "jit+state" | "full_arc";
export type SlotRole =
  | "start_of_day"
  | "dominant_demand"
  | "recovery"
  | "current_priority"
  | "remaining_demand"
  | "close_of_day"
  | "protect_tonight"
  | "tomorrow_prep"
  | "pre"
  | "during"
  | "post"
  | "state_anchor";

export interface SlotAllocationInput {
  nowMs: number;
  rankedCandidates: RankedJitCandidate[];
  hasTravelDay?: boolean;
  hasConferenceDay?: boolean;
  hasOffsiteDay?: boolean;
  hasRestSignals?: boolean;
  /** 0=Sunday, 6=Saturday in the user's local timezone. */
  dayOfWeek?: number;
  /** True when the day should show the Week-Ahead planning surface. */
  isWeekAhead?: boolean;
  /** PTO/public holiday day that is not being handled as Week-Ahead. */
  isPtoOrHoliday?: boolean;
  /** Weekend work evidence strong enough to use normal workday cadence. */
  isFullWorkingWeekend?: boolean;
  /** F1.3: Country-aware weekend rest day flag (true = Sat/Fri in GCC/IL, or Sat elsewhere). */
  isWeekendRestDay?: boolean;
  mrsWindow?: "morning" | "afternoon" | "evening";
  preferredPracticeWindows?: Array<"morning" | "afternoon" | "evening">;
  forceArcCategoryIds?: EventCategoryId[];
}

export interface SlotAllocation {
  dayShape: DayShape;
  mode: SlotMode;
  /**
   * Sprint 4 (Phase 6): true for a genuine no-demand day where the Plan
   * card must render a rest-day state rather than three fabricated
   * priorities. When `restDay` is true, `slots` MUST be empty.
   */
  restDay?: boolean;
  /** Top-level allocation reason — populated for the rest-day contract. */
  allocationReason?: string;
  slots: Array<{
    index: 0 | 1 | 2;
    slotRole: SlotRole;
    arcLabel: "Prepare" | "During" | "Recover" | "Steady";
    jitPhase: "pre" | "during" | "post" | null;
    jitEventTitle: string | null;
    /**
     * Event id the allocator anchored this slot on (Sprint 1). Null when the
     * slot is a state fallback. Downstream merges MUST honour this over any
     * legacy anchor derivation.
     */
    jitEventId: string | null;
    /**
     * Category id from the ranked candidate that anchored this slot. Null
     * when the slot is a state fallback.
     */
    jitCategoryId: EventCategoryId | null;
    allocationReason: string;
  }>;
  debug: {
    dayShape: DayShape;
    mode: SlotMode;
    candidateCount: number;
    multiPhaseEligible: boolean;
    /** True when top-N ranked candidates all share the same `eventId`. */
    sameEventFan: boolean;
    /** Set of phases available for the dominant event, when applicable. */
    dominantEventPhases?: Array<"pre" | "during" | "post">;
  };
}

export function allocatePlanSlots(input: SlotAllocationInput): SlotAllocation {
  const ranked = input.rankedCandidates || [];
  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const third = ranked[2] ?? null;
  // NB: renamed from hasSecondJit / hasThirdJit — a "second candidate" may
  // just be another PHASE of the SAME event (rankJitCandidates fans one
  // event into one candidate per available phase). It is not another event.
  const hasSecondCandidate = !!second;
  const hasThirdCandidate = !!third;
  const structuralSignals = [input.hasTravelDay, input.hasConferenceDay, input.hasOffsiteDay].filter(Boolean).length;
  const restSignals = input.hasRestSignals === true;
  const forceArcCategoryIds = new Set(input.forceArcCategoryIds ?? []);

  if (input.isWeekAhead) {
    return buildSingleStateSlotResult("week_ahead", "week_ahead_planning", ranked.length, input.preferredPracticeWindows);
  }

  // F1.3.1: Bug B fix — Use country-aware isWeekendRestDay instead of hardcoded dayOfWeek===6
  // This ensures Friday=rest in GCC/Israel, Saturday=rest elsewhere
  if (input.isWeekendRestDay && !input.isFullWorkingWeekend) {
    return buildSingleStateSlotResult("saturday", "saturday_habit_only", ranked.length, input.preferredPracticeWindows);
  }

  if (input.isPtoOrHoliday) {
    return buildSingleStateSlotResult("holiday_pto", "holiday_habit_only", ranked.length, input.preferredPracticeWindows);
  }

  // Travel reservation (mirrors the Brief's travel rule): on a travel day a
  // Category G anchor ALWAYS owns the arc, even when another category
  // out-ranks it on score. Without this, a flight can be scored below a
  // meeting and vanish from the plan entirely on the one day it matters most.
  if (input.hasTravelDay && top && top.categoryId !== "G") {
    const travelIdx = ranked.findIndex((c) => c.categoryId === "G");
    if (travelIdx > 0) {
      const travelEventId = ranked[travelIdx].eventId;
      const travelFan = ranked.filter((c) => c.eventId === travelEventId);
      const rest = ranked.filter((c) => c.eventId !== travelEventId);
      return buildNamedFullArcResult(
        "travel_day",
        "travel_day_full_arc",
        [...travelFan, ...rest],
        "G",
      );
    }
  }

  if (input.hasTravelDay && (!top || top.categoryId === "G")) {
    return buildNamedFullArcResult("travel_day", "travel_day_full_arc", ranked, "G");
  }

  if (input.hasConferenceDay && (!top || top.categoryId === "F")) {
    return buildNamedFullArcResult("conference_day", "conference_day_full_arc", ranked, "F");
  }

  // Same-event fan detection (Sprint 1 fix): if the top candidate has no
  // sibling from a *different* event, it still qualifies as a dominant
  // structural event even when its own pre/during/post phases occupy the
  // #2 / #3 ranked slots.
  const topEventId = top?.eventId || null;
  const differentEventCandidate = ranked.find(
    (c) => topEventId && c.eventId && c.eventId !== topEventId,
  ) ?? null;
  const sameEventFan =
    !!top && !!topEventId && !differentEventCandidate && ranked.length > 1;

  const topIsStructural =
    !!top && (top.categoryId === "A" || top.categoryId === "C" || top.categoryId === "F" || top.categoryId === "G" || forceArcCategoryIds.has(top.categoryId));
  const dominantStructuralEvent =
    topIsStructural && (!hasSecondCandidate || sameEventFan || !differentEventCandidate);
  const dayShape: DayShape = restSignals
    ? "rest_day"
    : structuralSignals >= 2 || (top && top.categoryId === "F" && hasSecondCandidate && hasThirdCandidate && !!differentEventCandidate)
      ? "mixed_day"
      : dominantStructuralEvent
        ? "dominant_structural_event"
        : ranked.length <= 1
          ? "light_routine"
          : "mixed_day";

  const mode: SlotMode =
    dayShape === "rest_day" ? "state" :
    dayShape === "light_routine" ? (ranked.length > 0 ? "jit+state" : "state") :
    dayShape === "dominant_structural_event" ? "full_arc" :
    "jit+state";

  // ── Sprint 4 (Phase 6) — rest-day contract ─────────────────────────
  // A true rest day has no calendar demand and no ranked candidates.
  // We MUST NOT fabricate three state_anchor slots (which the frontend
  // would render as three normal Performance Priorities). Return zero
  // slots and mark the allocation as rest-day so downstream persistence
  // and rendering can show a truthful rest state.
  if (dayShape === "rest_day") {
    return {
      dayShape,
      mode,
      restDay: true,
      allocationReason: "rest_day_no_priorities",
      slots: [],
      debug: {
        dayShape,
        mode,
        candidateCount: ranked.length,
        multiPhaseEligible: false,
        sameEventFan: false,
      },
    };
  }

  // ---- Phase-aware slot picking (Sprint 1 fix) --------------------------
  // For a dominant structural event, choose ranked candidates by intended
  // phase (pre / during / post) from the dominant event's own fan — never
  // by array position. Invent no phase the phase map does not declare.
  // Category A (board / governance) only defines pre + post, so slot 1
  // MUST fall back to a state slot rather than fabricate a "During".
  let dominantEventPhases: Phase[] | undefined;
  let phaseCandidates: Partial<Record<Phase, RankedJitCandidate>> | null = null;
  if (dominantStructuralEvent && top) {
    const map = EVENT_PHASE_MAP[top.categoryId as EventCategoryId] || {};
    dominantEventPhases = (["pre", "during", "post"] as const).filter((p) => !!map[p]);
    // WS4: prune "during" from short-haul flight anchors.
    dominantEventPhases = pruneTravelPhases(
      dominantEventPhases,
      top.categoryId as EventCategoryId,
      top.title,
      top.durationMinutes,
    );
    phaseCandidates = {};
    for (const c of ranked) {
      if (topEventId && c.eventId !== topEventId) continue;
      if (!dominantEventPhases.includes(c.phase)) continue;
      if (!phaseCandidates[c.phase] || (phaseCandidates[c.phase]!.score < c.score)) {
        phaseCandidates[c.phase] = c;
      }
    }
  }

  const pickForDominant = (want: Phase): RankedJitCandidate | null =>
    phaseCandidates?.[want] ?? null;

  const slots: SlotAllocation["slots"] = dominantStructuralEvent
    ? top?.categoryId === "A"
      ? [
          makeSlot(0, dayShape, mode, pickForDominant("pre") ?? top, windowRole(input.mrsWindow, 0), "pre"),
          makeBoardProtectSlot(1),
          makeSlot(2, dayShape, mode, pickForDominant("post") ?? top, windowRole(input.mrsWindow, 2), "post"),
        ]
      : [
          makeSlot(0, dayShape, mode, pickForDominant("pre") ?? top, windowRole(input.mrsWindow, 0), "pre"),
          makeSlot(1, dayShape, mode, pickForDominant("during"), windowRole(input.mrsWindow, 1), "during"),
          makeSlot(2, dayShape, mode, pickForDominant("post") ?? top, windowRole(input.mrsWindow, 2), "post"),
        ]
    : [
        // Sprint 3 (Phase 5): non-dominant days must NOT recycle the
        // single top candidate across all three slots. If only one
        // meaningful candidate cleared the floor, slots 1 & 2 fall back
        // to state anchors instead of re-anchoring the same event.
        makeSlot(0, dayShape, mode, top, windowRole(input.mrsWindow, 0)),
        makeSlot(1, dayShape, mode, second, windowRole(input.mrsWindow, 1)),
        makeSlot(2, dayShape, mode, third, windowRole(input.mrsWindow, 2)),
      ];

  return {
    dayShape,
    mode,
    slots,
    debug: {
      dayShape,
      mode,
      candidateCount: ranked.length,
      multiPhaseEligible: !!top && (top.categoryId === "A" || top.categoryId === "D" || top.categoryId === "F" || top.categoryId === "G"),
      sameEventFan,
      dominantEventPhases,
    },
  };
}

function windowRole(
  mrsWindow: SlotAllocationInput["mrsWindow"],
  index: 0 | 1 | 2,
): SlotRole {
  if (mrsWindow === "afternoon") {
    return index === 0 ? "current_priority" : index === 1 ? "remaining_demand" : "close_of_day";
  }
  if (mrsWindow === "evening") {
    return index === 0 ? "current_priority" : index === 1 ? "protect_tonight" : "tomorrow_prep";
  }
  return index === 0 ? "start_of_day" : index === 1 ? "dominant_demand" : "recovery";
}

function makeBoardProtectSlot(index: 1): SlotAllocation["slots"][number] {
  return {
    index,
    slotRole: "state_anchor",
    arcLabel: "Steady",
    jitPhase: null,
    jitEventTitle: null,
    jitEventId: null,
    jitCategoryId: null,
    allocationReason: "board_protect_state",
  };
}

function buildSingleStateSlotResult(
  dayShape: Extract<DayShape, "saturday" | "holiday_pto" | "week_ahead">,
  allocationReason: string,
  candidateCount: number,
  preferredPracticeWindows: Array<"morning" | "afternoon" | "evening"> = [],
): SlotAllocation {
  const preferredWindow = preferredPracticeWindows.includes("evening")
    ? "evening"
    : preferredPracticeWindows.includes("morning")
    ? "morning"
    : null;
  const slotRole: SlotRole = preferredWindow === "evening" ? "close_of_day" : "state_anchor";
  const reason = preferredWindow ? `${allocationReason}_${preferredWindow}` : allocationReason;
  return {
    dayShape,
    mode: "state",
    allocationReason: reason,
    slots: [
      {
        index: 0,
        slotRole,
        arcLabel: "Steady",
        jitPhase: null,
        jitEventTitle: null,
        jitEventId: null,
        jitCategoryId: null,
        allocationReason: reason,
      },
    ],
    debug: {
      dayShape,
      mode: "state",
      candidateCount,
      multiPhaseEligible: false,
      sameEventFan: false,
    },
  };
}

function buildNamedFullArcResult(
  dayShape: Extract<DayShape, "travel_day" | "conference_day">,
  allocationReason: string,
  ranked: RankedJitCandidate[],
  categoryId: EventCategoryId,
): SlotAllocation {
  const phaseCandidates: Partial<Record<Phase, RankedJitCandidate>> = {};
  for (const c of ranked) {
    if (c.categoryId !== categoryId) continue;
    if (!phaseCandidates[c.phase] || phaseCandidates[c.phase]!.score < c.score) {
      phaseCandidates[c.phase] = c;
    }
  }
  // WS4: for a travel_day, prune the "during" (in-flight) slot when the
  // top-ranked G candidate is not long-haul. Conference days are unaffected.
  const topG = ranked.find((c) => c.categoryId === categoryId) ?? null;
  const allowedPhases = pruneTravelPhases(
    (["pre", "during", "post"] as const).slice(),
    categoryId,
    topG?.title,
    topG?.durationMinutes,
  );
  const includeDuring = allowedPhases.includes("during");
  const duringSlot = includeDuring
    ? makeSlot(1, dayShape, "full_arc", phaseCandidates.during ?? null, "during", "during")
    // Degrade slot-1 to a state anchor rather than fabricate an in-flight
    // phase for a short-haul flight. Mirrors the Category A slot-1 pattern.
    : makeSlot(1, dayShape, "full_arc", null, "state_anchor");
  return {
    dayShape,
    mode: "full_arc",
    allocationReason,
    slots: [
      makeSlot(0, dayShape, "full_arc", phaseCandidates.pre ?? null, "pre", "pre"),
      duringSlot,
      makeSlot(2, dayShape, "full_arc", phaseCandidates.post ?? null, "post", "post"),
    ],
    debug: {
      dayShape,
      mode: "full_arc",
      candidateCount: ranked.length,
      multiPhaseEligible: true,
      sameEventFan: ranked.length > 1 && new Set(ranked.map((c) => c.eventId).filter(Boolean)).size === 1,
      dominantEventPhases: (["pre", "during", "post"] as const).filter(
        (p) => !!phaseCandidates[p] && (p !== "during" || includeDuring),
      ),
    },
  };
}

function makeSlot(
  index: 0 | 1 | 2,
  dayShape: DayShape,
  mode: SlotMode,
  candidate: RankedJitCandidate | null,
  defaultRole: SlotRole,
  /**
   * For dominant_structural_event, the phase this positional slot is
   * supposed to represent. When the map has no candidate for that phase
   * (e.g. Category A slot-1 "during"), the slot degrades to state fallback
   * — we do NOT fabricate a phase the event does not support.
   */
  intendedPhase?: Phase,
): SlotAllocation["slots"][number] {
  // Guard against handing back a candidate whose phase does not match the
  // intended slot phase (e.g. slot-1 "during" on a Category A event where
  // the fallback for pickForDominant is `top` in the pre phase).
  const phaseMismatch =
    !!intendedPhase && !!candidate && candidate.phase !== intendedPhase;
  // For dominant_structural_event, an intendedPhase with no candidate at all
  // (e.g. Cat A slot-1 "during") is also a phase-unavailability case, not a
  // generic state fallback.
  const phaseUnavailable =
    dayShape === "dominant_structural_event" && !!intendedPhase && (!candidate || phaseMismatch);
  const effectiveCandidate = phaseMismatch ? null : candidate;
  const isJit = !!effectiveCandidate;
  // The phase actually represented by this slot: the selected candidate's
  // phase, or none when the slot degraded to a state fallback.
  const phase: Phase | null = phaseUnavailable
    ? null
    : (effectiveCandidate?.phase ?? null);
  const arcLabel = phase === "during"
    ? "During"
    : phase === "post"
    ? "Recover"
    : phase === "pre"
    ? "Prepare"
    : defaultRole === "start_of_day"
    ? "Prepare"
    : defaultRole === "recovery" || defaultRole === "close_of_day"
    ? "Recover"
    : "Steady";
  // slotRole reflects the ACTUAL selected phase for dominant days; if the
  // phase was unavailable (e.g. Cat A "during"), degrade to state_anchor
  // rather than mis-label a state fallback as "during".
  const slotRole: SlotRole =
    dayShape === "rest_day" ? "state_anchor" :
    dayShape === "dominant_structural_event"
      ? (phase === "pre" ? "pre" :
         phase === "during" ? "during" :
         phase === "post" ? "post" : "state_anchor")
      : defaultRole;
  return {
    index,
    slotRole,
    arcLabel,
    jitPhase: isJit ? phase : null,
    jitEventTitle: effectiveCandidate?.title ?? null,
    jitEventId: effectiveCandidate?.eventId ?? null,
    jitCategoryId: effectiveCandidate?.categoryId ?? null,
    allocationReason: dayShape === "rest_day"
      ? "rest_day_uses_state_only"
      : phaseUnavailable
        ? "state_fallback_phase_unavailable"
        : isJit
          ? `ranked_candidate_${index + 1}`
          : "state_fallback_no_meaningful_jit",
  };
}
