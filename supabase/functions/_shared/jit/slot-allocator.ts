import type { RankedJitCandidate } from "../events/jit-candidates.ts";

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
    allocationReason: string;
  }>;
  debug: {
    dayShape: DayShape;
    mode: SlotMode;
    candidateCount: number;
    multiPhaseEligible: boolean;
  };
}

export function allocatePlanSlots(input: SlotAllocationInput): SlotAllocation {
  const ranked = input.rankedCandidates || [];
  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const third = ranked[2] ?? null;
  const hasSecondJit = !!second;
  const hasThirdJit = !!third;
  const structuralSignals = [input.hasTravelDay, input.hasConferenceDay, input.hasOffsiteDay].filter(Boolean).length;
  const restSignals = input.hasRestSignals === true;
  const dominantStructuralEvent = !!top && (top.categoryId === "A" || top.categoryId === "C" || top.categoryId === "F" || top.categoryId === "G") && !hasSecondJit;
  const dayShape: DayShape = restSignals
    ? "rest_day"
    : structuralSignals >= 2 || (top && top.categoryId === "F" && hasSecondJit && hasThirdJit)
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

  const slots = [
    makeSlot(0, dayShape, mode, top, "start_of_day"),
    makeSlot(1, dayShape, mode, second ?? top, "dominant_demand"),
    makeSlot(2, dayShape, mode, third ?? second ?? top, "recovery"),
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
    },
  };
}

function makeSlot(
  index: 0 | 1 | 2,
  dayShape: DayShape,
  mode: SlotMode,
  candidate: RankedJitCandidate | null,
  defaultRole: SlotRole,
): SlotAllocation["slots"][number] {
  const isJit = !!candidate;
  const phase = candidate?.phase ?? null;
  const arcLabel = phase === "during" ? "During" : phase === "post" ? "Recover" : phase === "pre" ? "Prepare" : "Steady";
  const slotRole: SlotRole =
    dayShape === "rest_day" ? "state_anchor" :
    dayShape === "dominant_structural_event" && index === 0 ? "pre" :
    dayShape === "dominant_structural_event" && index === 1 ? "during" :
    dayShape === "dominant_structural_event" && index === 2 ? "post" :
    defaultRole;
  return {
    index,
    slotRole,
    arcLabel,
    jitPhase: isJit ? phase : null,
    jitEventTitle: candidate?.title ?? null,
    allocationReason: dayShape === "rest_day"
      ? "rest_day_uses_state_only"
      : isJit
        ? `ranked_candidate_${index + 1}`
        : "state_fallback",
  };
}
