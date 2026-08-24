// Load Shape — copy helpers. Surfaces read labels/tooltips/sentences from
// here; they never hardcode a shape label.

import {
  type LoadShape,
  SHAPE_DISPLAY_CONFIG,
  type ShapeDisplayConfig,
  type ShapeId,
} from "./types.ts";

export { SHAPE_DISPLAY_CONFIG };
export type { ShapeDisplayConfig };

export function shapeLabel(shapeId: ShapeId): string {
  return SHAPE_DISPLAY_CONFIG[shapeId].label;
}

export function shapeTooltip(shapeId: ShapeId): string {
  return SHAPE_DISPLAY_CONFIG[shapeId].tooltip;
}

/** Only launch-ready shapes may render copy on any surface. */
export function isLaunchReady(shapeId: ShapeId): boolean {
  return SHAPE_DISPLAY_CONFIG[shapeId].launchReady === true;
}

/** Insight sentences — locked copy for the two launch shapes. */
const SHAPE_INSIGHT_SENTENCE: Partial<Record<ShapeId, string>> = {
  back_to_back:
    "Your back-to-back days correlate with lower next-day readiness scores.",
  switching: "Mode-switching days are costing you more than any single meeting type.",
};

export function shapeInsightSentence(shapeId: ShapeId): string | null {
  if (!isLaunchReady(shapeId)) return null;
  return SHAPE_INSIGHT_SENTENCE[shapeId] ?? null;
}

/** Short qualifier appended to a day-type label, e.g. "Mixed · mode-switching". */
const SHAPE_QUALIFIER: Partial<Record<ShapeId, string>> = {
  back_to_back: "back-to-back",
  switching: "mode-switching",
};

export function shapeQualifier(shapeId: ShapeId): string | null {
  if (!isLaunchReady(shapeId)) return null;
  return SHAPE_QUALIFIER[shapeId] ?? null;
}

/** One-line Brief sentence for the Day Shape bucket. Launch shapes only. */
export function briefShapeSentence(
  shape: Pick<LoadShape, "shapeId" | "backToBackHours" | "modeSwitchCount">,
): string | null {
  if (!isLaunchReady(shape.shapeId)) return null;
  if (shape.shapeId === "back_to_back") {
    const hours = Math.round(shape.backToBackHours * 10) / 10;
    return `Today runs ${hours}h back-to-back — protect one gap before the chain starts.`;
  }
  if (shape.shapeId === "switching") {
    return `Today switches register ${shape.modeSwitchCount} times — reset between modes, not just between meetings.`;
  }
  return null;
}
