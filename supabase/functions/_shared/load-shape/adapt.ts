// Load Shape — raw calendar row → ClassifyLoadShapeEvent adapter.
//
// The ONLY place raw calendar rows are shaped for classifyLoadShape().
// Category and subcategory resolution always goes through enrichEvent()
// (which wraps resolveEvent) — Load Shape never classifies an event itself.
//
// Additive and read-only: nothing here mutates or re-scores existing rules.

import { enrichEvent } from "../events/enrich-event.ts";
import { stakesScore } from "../events/event-classifier.ts";
import type {
  ClassifyLoadShapeEvent,
  EventSubcategory,
} from "./types.ts";

/** Resolver → locked schema subcategory aliases (see subcategory-parity.test.ts). */
const SUBCATEGORY_ALIASES: Record<string, EventSubcategory> = {
  "G.travel": "G.travel_day",
};

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

/** Band the shared stakesScore() into the four Load Shape stakes levels. */
export function stakesLevelFromScore(
  score: number | null,
): ClassifyLoadShapeEvent["stakesLevel"] {
  if (score == null || !Number.isFinite(score)) return "low";
  if (score >= 110) return "critical";
  if (score >= 90) return "high";
  if (score >= 70) return "medium";
  return "low";
}

/**
 * Adapt raw `primary_calendar_events`-shaped rows into classifier input.
 * Rows without a resolvable A–H category or valid time range are dropped —
 * an unresolved event must never influence the shape.
 */
export function toLoadShapeEvents(rows: unknown[]): ClassifyLoadShapeEvent[] {
  if (!Array.isArray(rows)) return [];
  const out: ClassifyLoadShapeEvent[] = [];
  for (const row of rows) {
    try {
      const r = row as Record<string, unknown>;
      const startTime = toDate(r?.start_time ?? r?.startTime);
      const endTime = toDate(r?.end_time ?? r?.endTime);
      if (!startTime || !endTime || endTime.getTime() <= startTime.getTime()) {
        continue;
      }

      const enriched = enrichEvent(row);
      if (!enriched.categoryId) continue;

      const rawSub = enriched.subcategory ?? enriched.categoryId;
      const subcategory = (SUBCATEGORY_ALIASES[rawSub] ??
        rawSub) as EventSubcategory;

      const score = enriched.subtype ? stakesScore(enriched.subtype) : null;

      const event: ClassifyLoadShapeEvent = {
        category: enriched.categoryId,
        subcategory,
        startTime,
        endTime,
        stakesLevel: stakesLevelFromScore(score),
      };

      if (subcategory === "G.flight") {
        event.flightDurationMinutes = enriched.durationMinutes ??
          Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      }

      out.push(event);
    } catch {
      // A single malformed row must never break the shape.
      continue;
    }
  }
  return out;
}
