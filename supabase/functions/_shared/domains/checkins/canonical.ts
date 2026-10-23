// [KIND: implementation] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Check-in Canonical Builder & 15-Minute Slot Rounding.
// Source: Part 2 Layer 0 (Section 7, 12.1, 12.4).

import type { CheckInRecord, RawCheckinInput, CheckinWindow } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";
import { CHECKIN_WINDOWS, CHECKIN_ROUNDING_MINUTES, CHECKIN_DIMENSION_BOUNDS } from "./constants.ts";

/**
 * Rounds an ISO UTC timestamp to the nearest 15-minute floor.
 * Required for idempotency key: (user, localDate, window, atUtc rounded to 15m).
 */
export function roundTo15Minutes(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (isNaN(date.getTime())) return isoUtc;
  const ms = 1000 * 60 * CHECKIN_ROUNDING_MINUTES;
  const rounded = new Date(Math.floor(date.getTime() / ms) * ms);
  return rounded.toISOString();
}

/**
 * Computes deduplication key for check-ins (Layer 0, 12.4).
 */
export function computeCheckinDedupeKey(
  userId: string,
  localDate: string,
  window: CheckinWindow,
  atUtc: string,
): string {
  const slotUtc = roundTo15Minutes(atUtc);
  return `${userId}_${localDate}_${window}_${slotUtc}`;
}

/**
 * Normalises selected check-in words/tags (trimmed, lowercased, deduplicated).
 */
export function normalizeCheckinWords(words: string[] | null | undefined): string[] {
  if (!Array.isArray(words)) return [];
  const set = new Set<string>();
  for (const w of words) {
    if (typeof w === "string") {
      const clean = w.trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }
  return Array.from(set);
}

/**
 * Builds a Canonical CheckInRecord from raw input.
 */
export function toCanonicalCheckinRecord(input: {
  raw: RawCheckinInput;
  provenance: Provenance;
}): CheckInRecord {
  const { raw, provenance } = input;
  const atUtc = raw.atUtc ? new Date(raw.atUtc).toISOString() : new Date().toISOString();

  let win: CheckinWindow = "morning";
  if (raw.window && (CHECKIN_WINDOWS as readonly string[]).includes(raw.window)) {
    win = raw.window as CheckinWindow;
  }

  const dimensions: Record<string, number> = {};
  if (raw.dimensions && typeof raw.dimensions === "object") {
    for (const [dim, val] of Object.entries(raw.dimensions)) {
      if (typeof val === "number" && !isNaN(val)) {
        dimensions[dim] = Math.max(
          CHECKIN_DIMENSION_BOUNDS.min,
          Math.min(CHECKIN_DIMENSION_BOUNDS.max, Math.round(val)),
        );
      }
    }
  }

  const words = normalizeCheckinWords(raw.words);
  const chargeResidue = typeof raw.chargeResidue === "number" ? raw.chargeResidue : null;

  return {
    schemaVersion: 1,
    userId: raw.userId,
    localDate: raw.localDate,
    window: win,
    atUtc,
    dimensions,
    words,
    chargeResidue,
    provenance,
  };
}
