// [KIND: implementation] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Identity Key and Title Normalization for Calendar Events.
// Source: Part 2 Layer 0 (Section 4), rules/calendar-merge.ts.

import type { CalendarMergeInput } from "./types.ts";
import { MAX_NORMALIZED_TITLE_LEN } from "./constants.ts";

/**
 * Normalises a calendar event title for matching and classification.
 */
export function normalizeForClassify(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NORMALIZED_TITLE_LEN);
}

/**
 * Compares two titles for fuzzy equality ignoring whitespace and case.
 */
export function titlesMatch(rowTitle: string, groupTitle: string): boolean {
  const normA = normalizeForClassify(rowTitle);
  const normB = normalizeForClassify(groupTitle);
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

/**
 * Computes an invariant identity key for a calendar item across providers.
 * Pattern: `time_start_iso:time_end_iso:normalized_title`
 */
export function computeIdentityKey(input: CalendarMergeInput): string | null {
  const start = input.startTime ?? input.start_time;
  const end = input.endTime ?? input.end_time;
  const title = input.title;

  if (!start || !title) return null;

  const startIso = new Date(start).toISOString();
  const endIso = end ? new Date(end).toISOString() : "";
  const normTitle = normalizeForClassify(title);

  return `${startIso}_${endIso}_${normTitle}`;
}
