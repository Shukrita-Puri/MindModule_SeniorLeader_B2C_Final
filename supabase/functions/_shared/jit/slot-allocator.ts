import type { RankedJitCandidate } from "../events/jit-candidates.ts";
import type { Phase } from "../events/event-phase-map.ts";
import { EVENT_PHASE_MAP } from "../events/event-phase-map.ts";
import type { EventCategoryId } from "../events/event-categories.ts";

export type DayShape = "light_routine" | "dominant_structural_event" | "mixed_day" | "rest_day";
export type SlotMode = "jit" | "state" | "jit+state" | "full_arc";
export type SlotRole =
  | "start_of_day"
  | "dominant_demand"
  | "recovery"
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
}

export interface SlotAllocation {
  dayShape: DayShape;
  mode: SlotMode;
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
    !!top && (top.categoryId === "A" || top.categoryId === "C" || top.categoryId === "F" || top.categoryId === "G");
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
    dayShape === "light_routine" ? "jit+state" :
    dayShape === "dominant_structural_event" ? "full_arc" :
    "jit+state";

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
    ? [
        makeSlot(0, dayShape, mode, pickForDominant("pre") ?? top, "start_of_day", "pre"),
        makeSlot(1, dayShape, mode, pickForDominant("during"), "dominant_demand", "during"),
        makeSlot(2, dayShape, mode, pickForDominant("post") ?? top, "recovery", "post"),
      ]
    : [
        // Sprint 3 (Phase 5): non-dominant days must NOT recycle the
        // single top candidate across all three slots. If only one
        // meaningful candidate cleared the floor, slots 1 & 2 fall back
        // to state anchors instead of re-anchoring the same event.
        makeSlot(0, dayShape, mode, top, "start_of_day"),
        makeSlot(1, dayShape, mode, second, "dominant_demand"),
        makeSlot(2, dayShape, mode, third, "recovery"),
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
  const phase = effectiveCandidate?.phase ?? null;
  const arcLabel = phase === "during" ? "During" : phase === "post" ? "Recover" : phase === "pre" ? "Prepare" : "Steady";
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
          : "state_fallback",
  };
}
