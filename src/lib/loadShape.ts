// Frontend mirror of the Load Shape layer — ids + display copy ONLY.
//
// No formulas, no thresholds, no metrics: shapes are classified once in
// build-daily-context and read from daily_context_snapshot.load_shape.
// Mirrors the pattern of src/lib/events/categories.ts; the drift test at
// src/lib/__tests__/loadShape.test.ts parses
// supabase/functions/_shared/load-shape/types.ts and fails if the ids or
// labels here diverge.

export type ShapeId =
  | "back_to_back"
  | "switching"
  | "weight_heavy"
  | "volume_heavy"
  | "travel_adjacent"
  | "focused"
  | "light";

export const SHAPE_LABELS: Record<ShapeId, string> = {
  back_to_back: "Back-to-back day",
  switching: "Mode-switching day",
  weight_heavy: "High-weight day",
  volume_heavy: "High-volume day",
  travel_adjacent: "Travel-adjacent day",
  focused: "Focused day",
  light: "Light day",
};

/** Only these shapes may render copy pre-launch. */
export const LAUNCH_READY_SHAPES: ShapeId[] = ["back_to_back", "switching"];

export const SHAPE_TOOLTIPS: Record<ShapeId, string> = {
  back_to_back:
    "Four or more hours of consecutive meetings with less than 15 minutes between them.",
  switching:
    "Three or more different types of demand — e.g. board-level decisions, then a difficult 1:1, then deep work — in a single day.",
  weight_heavy:
    "Few meetings but each one carries major consequence. The drain is intensity, not volume.",
  volume_heavy:
    "Seven or more meetings, most of them low-stakes. Fatigue accumulates through sheer count.",
  travel_adjacent:
    "A high-stakes event falls within 12 hours of a flight or travel day. Circadian disruption meets peak performance demand.",
  focused:
    "Most of the day is deep work, analysis, or learning — with minimal switching. A positive shape worth protecting.",
  light:
    "Low meeting count, low stakes, no travel, no switching. Recovery days build next-week performance.",
};

/** Short qualifier appended to a day-type label, e.g. "Mixed · mode-switching". */
export const SHAPE_QUALIFIERS: Partial<Record<ShapeId, string>> = {
  back_to_back: "back-to-back",
  switching: "mode-switching",
};

export function isShapeId(value: unknown): value is ShapeId {
  return typeof value === "string" && value in SHAPE_LABELS;
}

export function isLaunchReadyShape(shapeId: ShapeId): boolean {
  return LAUNCH_READY_SHAPES.includes(shapeId);
}

export function shapeLabel(shapeId: ShapeId): string {
  return SHAPE_LABELS[shapeId];
}

export function shapeQualifier(shapeId: ShapeId): string | null {
  if (!isLaunchReadyShape(shapeId)) return null;
  return SHAPE_QUALIFIERS[shapeId] ?? null;
}

/** Null-safe read of the snapshot column for UI use. */
export function shapeIdFromSnapshot(loadShape: unknown): ShapeId | null {
  if (!loadShape || typeof loadShape !== "object") return null;
  const id = (loadShape as { shapeId?: unknown }).shapeId;
  return isShapeId(id) ? id : null;
}
