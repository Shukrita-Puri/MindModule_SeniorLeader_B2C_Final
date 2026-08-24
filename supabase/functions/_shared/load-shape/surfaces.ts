// Load Shape — surface adapters. The FOUR reader surfaces (Insights,
// Brief, Plan, Nudges) call these helpers; none of them re-classifies,
// re-labels, or hardcodes shape copy.
//
// Every helper is silent (null / "" / 0) unless the shape is launch-ready.
// The render gate itself lives in ./read.ts (fetchRenderableLoadShape).

import {
  type LoadShape,
  type ShapeId,
} from "./types.ts";
import {
  briefShapeSentence,
  isLaunchReady,
  shapeInsightSentence,
  shapeLabel,
  shapeQualifier,
  shapeTooltip,
} from "./labels.ts";

// ── 1. Insights (cause-effect-engine v23) ─────────────────────────────
export interface InsightsShapePayload {
  shapeId: ShapeId;
  label: string;
  tooltip: string;
  insightSentence: string | null;
  qualifier: string | null;
  backToBackHours: number;
  modeSwitchCount: number;
  evidence: string[];
}

/** Render-ready Insights block, or `null` when the shape has no copy. */
export function insightsShapePayload(
  shape: LoadShape | null,
): InsightsShapePayload | null {
  if (!shape || !isLaunchReady(shape.shapeId)) return null;
  return {
    shapeId: shape.shapeId,
    label: shapeLabel(shape.shapeId),
    tooltip: shapeTooltip(shape.shapeId),
    insightSentence: shapeInsightSentence(shape.shapeId),
    qualifier: shapeQualifier(shape.shapeId),
    backToBackHours: shape.backToBackHours ?? 0,
    modeSwitchCount: shape.modeSwitchCount ?? 0,
    evidence: Array.isArray(shape.evidence) ? shape.evidence : [],
  };
}

// ── 2. Brief (compute-outer-readiness, BUCKET 2 — Day Shape) ──────────
/** Prompt lines for the Brief's Day Shape bucket. "" = stay silent. */
export function briefShapePromptBlock(shape: LoadShape | null): string {
  if (!shape || !isLaunchReady(shape.shapeId)) return "";
  const sentence = briefShapeSentence(shape);
  if (!sentence) return "";
  const lines = [
    `\n\n=== LOAD SHAPE ===`,
    `Shape: ${shapeLabel(shape.shapeId)}`,
    `Read: ${sentence}`,
  ];
  if (shape.shapeId === "back_to_back") {
    lines.push(
      `Back-to-back hours: ${shape.backToBackHours} · short-gap ratio: ${
        Math.round((shape.shortGapRatio ?? 0) * 100)
      }%`,
    );
  }
  if (shape.shapeId === "switching") {
    lines.push(
      `Mode switches: ${shape.modeSwitchCount} · sequence: ${
        (shape.modeSequence ?? []).join(" → ") || "n/a"
      }`,
    );
  }
  lines.push(
    `Use this as day-shape context only. Never restate the numbers; never invent a shape that is not stated here.`,
  );
  return lines.join("\n");
}

// ── 3. Plan scorer (generate-mastery-plan) — tie-breaker only ─────────
/**
 * Focus tags favoured by each launch shape. Non-launch shapes contribute
 * nothing, so the Plan behaves exactly as today for them.
 */
const SHAPE_PLAN_FOCUS_TAGS: Partial<Record<ShapeId, string[]>> = {
  back_to_back: ["restore", "breathing", "grounding", "reset"],
  switching: ["focus", "clarity", "grounding", "transition"],
};

/** Small additive tie-break (+2 max). Never gates or excludes content. */
export const PLAN_SHAPE_TIE_BREAK = 2;

export function planShapeTieBreak(
  shapeId: ShapeId | null | undefined,
  contentTags: string[],
): number {
  if (!shapeId || !isLaunchReady(shapeId)) return 0;
  const focus = SHAPE_PLAN_FOCUS_TAGS[shapeId];
  if (!focus || focus.length === 0) return 0;
  const tags = contentTags.filter(Boolean).map((t) => t.toLowerCase());
  return focus.some((f) => tags.some((t) => t.includes(f)))
    ? PLAN_SHAPE_TIE_BREAK
    : 0;
}

// ── 4. Nudge evaluator (smart-nudges) ─────────────────────────────────
/** `meetingPrepCliff` stacks on a mode-switching day. */
export function nudgeShapeStacksOnCliff(
  shapeId: ShapeId | null | undefined,
): boolean {
  return shapeId === "switching";
}

/** Prompt lines for the nudge copy contract. "" = stay silent. */
export function nudgeShapePromptBlock(
  shape: LoadShape | null,
  opts: { cliffActive?: boolean } = {},
): string {
  if (!shape || !isLaunchReady(shape.shapeId)) return "";
  const lines = [
    `\n\n=== LOAD SHAPE (nudge context) ===`,
    `Shape: ${shapeLabel(shape.shapeId)}`,
  ];
  if (shape.shapeId === "back_to_back") {
    lines.push(
      `${shape.backToBackHours}h of the day runs back-to-back. Keep the nudge to one in-body action; no planning ask.`,
    );
  }
  if (shape.shapeId === "switching") {
    lines.push(
      `${shape.modeSwitchCount} mode switches today. The cost is the transition, not any single meeting.`,
    );
    if (opts.cliffActive) {
      lines.push(
        `Stacking: meetingPrepCliff is active on a mode-switching day — clear the residue of the previous mode first, then name the next one. Still no app-open CTA.`,
      );
    }
  }
  return lines.join("\n");
}
