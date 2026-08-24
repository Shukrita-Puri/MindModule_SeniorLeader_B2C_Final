// Load Shape — the ONLY producer of a LoadShape.
//
// Called exclusively by build-daily-context. Every other surface reads the
// stored value from daily_context_snapshot.load_shape via
// getLoadShapeOrDefault(). This module is read-only with respect to the
// rest of the system: it consumes already-resolved A–H events plus the
// existing computeCognitiveFragmentation() helper, and returns one object.
//
// Precedence (first match wins):
//   travel_adjacent → back_to_back → switching →
//   weight_heavy → volume_heavy → focused → light

import { computeCognitiveFragmentation } from "../signal-engine/cognitive-fragmentation.ts";
import { CATEGORY_TO_MODE } from "./modes.ts";
import {
  type ClassifyLoadShapeEvent,
  type ClassifyLoadShapeInput,
  type DemandMode,
  getLoadShapeOrDefault,
  type LoadShape,
  SHAPE_DISPLAY_CONFIG,
  type ShapeId,
} from "./types.ts";

const STAKES_WEIGHT: Record<ClassifyLoadShapeEvent["stakesLevel"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const TRAVEL_ADJACENCY_WINDOW_MS = 12 * 60 * 60 * 1000;
const LONG_HAUL_MINUTES = 360;

function ms(d: Date): number {
  const t = d instanceof Date ? d.getTime() : new Date(d as unknown as string).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function hhmm(d: Date): string {
  const t = ms(d);
  if (!Number.isFinite(t)) return "--:--";
  return new Date(t).toISOString().slice(11, 16);
}

/** Distinct adjacent transitions in a mode sequence (A→B→B→C = 2). */
export function countModeSwitches(sequence: DemandMode[]): number {
  let n = 0;
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] !== sequence[i - 1]) n++;
  }
  return n;
}

export function classifyLoadShape(input: ClassifyLoadShapeInput): LoadShape {
  const raw = Array.isArray(input?.events) ? input.events : [];
  const events = raw
    .filter((e) =>
      e && e.category && Number.isFinite(ms(e.startTime)) &&
      Number.isFinite(ms(e.endTime)) && ms(e.endTime) > ms(e.startTime)
    )
    .sort((a, b) => ms(a.startTime) - ms(b.startTime));

  if (events.length === 0) return getLoadShapeOrDefault(null);

  // ── Back-to-back metrics: reuse the existing helper, never recompute ──
  const frag = computeCognitiveFragmentation(
    events.map((e) => ({
      start_time: new Date(ms(e.startTime)).toISOString(),
      end_time: new Date(ms(e.endTime)).toISOString(),
    })),
  );
  const backToBackHours = frag.back_to_back_hours;
  const shortGapRatio = frag.adjacent_gap_count > 0
    ? frag.short_gap_count / frag.adjacent_gap_count
    : 0;

  // ── Mode metrics ──
  const modeSequence = events.map((e) => CATEGORY_TO_MODE[e.category]).filter(
    Boolean,
  ) as DemandMode[];
  const modeSwitchCount = countModeSwitches(modeSequence);
  const distinctModes = new Set(modeSequence);

  // ── Weight vs volume ──
  const meetingCount = events.length;
  const stakesWeight = events.reduce(
    (a, e) => a + (STAKES_WEIGHT[e.stakesLevel] ?? 1),
    0,
  );
  const weightRatio = meetingCount > 0 ? stakesWeight / meetingCount : 0;

  // ── Travel adjacency: A/B/C event within 12h of a G event ──
  let travelAdjacency = false;
  let travelSubcategory: LoadShape["travelSubcategory"];
  let flightArcType: LoadShape["flightArcType"];
  const travelEvents = events.filter((e) => e.category === "G");
  const highStakesEvents = events.filter((e) =>
    e.category === "A" || e.category === "B" || e.category === "C"
  );
  for (const t of travelEvents) {
    const near = highStakesEvents.some((h) =>
      Math.abs(ms(h.startTime) - ms(t.startTime)) <= TRAVEL_ADJACENCY_WINDOW_MS ||
      Math.abs(ms(h.startTime) - ms(t.endTime)) <= TRAVEL_ADJACENCY_WINDOW_MS
    );
    if (!near) continue;
    travelAdjacency = true;
    if (
      t.subcategory === "G.flight" || t.subcategory === "G.travel_day" ||
      t.subcategory === "G.accommodation"
    ) {
      travelSubcategory = t.subcategory;
    }
    if (t.subcategory === "G.flight") {
      const mins = t.flightDurationMinutes ??
        Math.round((ms(t.endTime) - ms(t.startTime)) / 60000);
      flightArcType = mins >= LONG_HAUL_MINUTES ? "long_haul" : "short";
    }
    break;
  }

  // ── Precedence ──
  const evidence: string[] = [];
  let shapeId: ShapeId;

  const cognitiveMinutes = events
    .filter((e) => e.category === "E")
    .reduce((a, e) => a + (ms(e.endTime) - ms(e.startTime)) / 60000, 0);
  const totalMinutes = events.reduce(
    (a, e) => a + (ms(e.endTime) - ms(e.startTime)) / 60000,
    0,
  );

  if (travelAdjacency) {
    shapeId = "travel_adjacent";
    evidence.push(
      `High-stakes event within 12h of ${travelSubcategory ?? "a travel event"}`,
    );
  } else if (backToBackHours >= 4 && shortGapRatio > 0.6) {
    shapeId = "back_to_back";
    evidence.push(
      `${backToBackHours.toFixed(1)}h back-to-back chain ${
        hhmm(events[0].startTime)
      }–${hhmm(events[events.length - 1].endTime)}`,
      `${Math.round(shortGapRatio * 100)}% of gaps under 15 minutes`,
    );
  } else if (
    modeSwitchCount >= 3 ||
    (modeSwitchCount >= 2 && distinctModes.has("relational"))
  ) {
    shapeId = "switching";
    evidence.push(
      `${modeSwitchCount} mode switches across ${distinctModes.size} demand modes`,
      `Sequence: ${modeSequence.join(" → ")}`,
    );
  } else if (weightRatio >= 3 && meetingCount <= 4) {
    shapeId = "weight_heavy";
    evidence.push(
      `${meetingCount} events at an average stakes weight of ${
        weightRatio.toFixed(1)
      }`,
    );
  } else if (meetingCount >= 7 && weightRatio < 2) {
    shapeId = "volume_heavy";
    evidence.push(
      `${meetingCount} events at an average stakes weight of ${
        weightRatio.toFixed(1)
      }`,
    );
  } else if (
    totalMinutes > 0 && cognitiveMinutes / totalMinutes >= 0.5 &&
    modeSwitchCount <= 1
  ) {
    shapeId = "focused";
    evidence.push(
      `${
        Math.round((cognitiveMinutes / totalMinutes) * 100)
      }% of scheduled time is focus work`,
    );
  } else {
    shapeId = "light";
    evidence.push(
      `${meetingCount} event${meetingCount === 1 ? "" : "s"}, no switching or travel load`,
    );
  }

  return {
    shapeId,
    shapeLabel: SHAPE_DISPLAY_CONFIG[shapeId].label,
    backToBackHours,
    shortGapRatio: Math.round(shortGapRatio * 100) / 100,
    modeSequence,
    modeSwitchCount,
    stakesWeight,
    meetingCount,
    weightRatio: Math.round(weightRatio * 100) / 100,
    travelAdjacency,
    ...(travelSubcategory ? { travelSubcategory } : {}),
    ...(flightArcType ? { flightArcType } : {}),
    evidence,
  };
}
