/**
 * exclusion-evaluator.ts — SSOT for Week Ahead → Plan exclusion decisions.
 *
 * A single helper is called by every consumer that can surface a calendar
 * event: Week Ahead priority generation, JIT selection, daily-context builder,
 * LLM prompt assembly, deterministic Mastery Plan fallback. No consumer may
 * re-interpret `not_this_week` independently.
 *
 * Precedence (top wins):
 *   1. `never` on (category, type_key) or title_specific     → permanent
 *   2. `not_this_week` with resolved_event_id === candidate  → occurrence
 *   3. `not_this_week` on matching (category, type_key)      → category_week
 *   4. Restore rules (see supersedeReason).
 *   5. Otherwise not excluded.
 *
 * Legacy rows (scope IS NULL): if source='week_ahead_picker' AND occurred_at
 * was on a local Sunday, treat as target-week = the immediately following
 * Mon–Sun (documented Sunday rule). Otherwise fall back to ISO week of
 * occurred_at and record a diagnostic.
 */

import { toLocalDateString, localWeekOf, upcomingWeek } from "./exclusion-scope.ts";
import { TITLE_SPECIFIC_MEMORY_CATEGORY, normalizeEventTitleMemoryKey } from "./event-priority-memory.ts";
import { dayOfWeekFromIsoDate } from "../signal-engine/day-kind-detector.ts";

export interface MemoryRow {
  id: string;
  user_id?: string;
  event_category: string;
  event_type_key: string;
  signal: string;
  source: string;
  event_id?: string | null;
  occurred_at: string;              // ISO
  scope?: string | null;
  effective_week_start?: string | null; // YYYY-MM-DD
  effective_week_end?: string | null;   // YYYY-MM-DD
  timezone?: string | null;
  resolved_event_id?: string | null;
  identity_confidence?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface ExclusionCandidate {
  eventId?: string | null;
  title: string;
  startTimeISO: string;
  category: string;
  typeKey: string;
}

export type ExclusionScopeResult =
  | "permanent"
  | "occurrence"
  | "category_week"
  | "title_specific"
  | "none";

export interface ExclusionResult {
  excluded: boolean;
  scope: ExclusionScopeResult;
  reason: string;
  matchedSignalId: string | null;
  matchedIdentity: "resolved_event" | "category_type" | "title_specific" | null;
  effectiveWeekStart: string | null;
  effectiveWeekEnd: string | null;
  diagnostics?: string[];
}

function withinWeek(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

/**
 * Derive the effective (start,end) week for a legacy row that has no
 * persisted scope. Sunday `week_ahead_picker` rows apply to the following
 * Mon–Sun; everything else falls back to the ISO week of occurred_at.
 */
function legacyEffectiveWeek(row: MemoryRow, timezone: string): { start: string; end: string; ambiguous: boolean } {
  const occurred = new Date(row.occurred_at);
  const localDay = dayOfWeekFromIsoDate(toLocalDateString(occurred, timezone)); // 0=Sun
  if (row.source === "week_ahead_picker" && localDay === 0) {
    // Sunday → upcoming week.
    const wk = upcomingWeek(occurred, timezone);
    return { start: wk.start, end: wk.end, ambiguous: false };
  }
  const wk = localWeekOf(occurred, timezone);
  return { start: wk.start, end: wk.end, ambiguous: true };
}

/** Effective week for any row (persisted takes precedence over legacy derivation). */
function effectiveWeekOf(row: MemoryRow, timezone: string): { start: string; end: string; legacyAmbiguous: boolean } {
  if (row.effective_week_start && row.effective_week_end) {
    return { start: row.effective_week_start, end: row.effective_week_end, legacyAmbiguous: false };
  }
  const wk = legacyEffectiveWeek(row, timezone);
  return { start: wk.start, end: wk.end, legacyAmbiguous: wk.ambiguous };
}

/**
 * Was `row` superseded by a LATER matching row of a compatible restore signal?
 *   - Occurrence-level (resolved_event_id match): occurrence `priority` or `tag_cleared`.
 *   - Category-level: category `priority` or `tag_cleared` — but never for `never`.
 */
function isSuperseded(row: MemoryRow, all: MemoryRow[]): boolean {
  const rowTime = new Date(row.occurred_at).getTime();
  const isOccurrence = !!row.resolved_event_id;

  for (const other of all) {
    if (other.id === row.id) continue;
    if (other.signal !== "priority" && other.signal !== "tag_cleared") continue;
    if (new Date(other.occurred_at).getTime() <= rowTime) continue;

    // `never` can only be cleared by an explicit category-level `tag_cleared`
    // newer than the row on the same (category, type_key).
    if (row.signal === "never") {
      if (other.signal !== "tag_cleared") continue;
      if (other.event_category === row.event_category && other.event_type_key === row.event_type_key) {
        return true;
      }
      continue;
    }

    if (isOccurrence) {
      if (other.resolved_event_id && other.resolved_event_id === row.resolved_event_id) return true;
      // A category-level restore also clears occurrence exclusions on same key.
      if (!other.resolved_event_id
          && other.event_category === row.event_category
          && other.event_type_key === row.event_type_key) return true;
    } else {
      // Row is category_week — only category-level restores supersede.
      if (!other.resolved_event_id
          && other.event_category === row.event_category
          && other.event_type_key === row.event_type_key) return true;
    }
  }
  return false;
}

export interface EvaluateInput {
  memoryRows: MemoryRow[];
  candidate: ExclusionCandidate;
  targetDate: string;       // YYYY-MM-DD in the user's local zone
  timezone: string;         // IANA zone
}

export function evaluateEventPriorityExclusion(input: EvaluateInput): ExclusionResult {
  const { memoryRows, candidate, targetDate, timezone } = input;
  const diagnostics: string[] = [];
  const titleKey = normalizeEventTitleMemoryKey(candidate.title || "");

  // Step 1 — permanent (`never`). Match (category,type_key) OR title-specific.
  for (const row of memoryRows) {
    if (row.signal !== "never") continue;
    const catMatch = row.event_category === candidate.category && row.event_type_key === candidate.typeKey;
    const titleMatch = row.event_category === TITLE_SPECIFIC_MEMORY_CATEGORY && row.event_type_key === titleKey;
    if (!catMatch && !titleMatch) continue;
    if (isSuperseded(row, memoryRows)) continue;
    return {
      excluded: true,
      scope: titleMatch && !catMatch ? "title_specific" : "permanent",
      reason: "user_marked_never",
      matchedSignalId: row.id,
      matchedIdentity: titleMatch && !catMatch ? "title_specific" : "category_type",
      effectiveWeekStart: null,
      effectiveWeekEnd: null,
      diagnostics,
    };
  }

  // Step 2 — occurrence-scoped `not_this_week` (resolved_event_id match).
  if (candidate.eventId) {
    for (const row of memoryRows) {
      if (row.signal !== "not_this_week") continue;
      if (!row.resolved_event_id || row.resolved_event_id !== candidate.eventId) continue;
      const wk = effectiveWeekOf(row, timezone);
      if (wk.legacyAmbiguous) diagnostics.push(`legacy_ambiguous:${row.id}`);
      if (!withinWeek(targetDate, wk.start, wk.end)) continue;
      if (isSuperseded(row, memoryRows)) continue;
      return {
        excluded: true,
        scope: "occurrence",
        reason: "user_deprioritised_occurrence_target_week",
        matchedSignalId: row.id,
        matchedIdentity: "resolved_event",
        effectiveWeekStart: wk.start,
        effectiveWeekEnd: wk.end,
        diagnostics,
      };
    }
  }

  // Step 3 — category/type `not_this_week`.
  for (const row of memoryRows) {
    if (row.signal !== "not_this_week") continue;
    if (row.resolved_event_id) continue; // handled above
    if (row.event_category !== candidate.category || row.event_type_key !== candidate.typeKey) continue;
    const wk = effectiveWeekOf(row, timezone);
    if (wk.legacyAmbiguous) diagnostics.push(`legacy_ambiguous:${row.id}`);
    if (!withinWeek(targetDate, wk.start, wk.end)) continue;
    if (isSuperseded(row, memoryRows)) continue;
    return {
      excluded: true,
      scope: "category_week",
      reason: "user_deprioritised_target_week",
      matchedSignalId: row.id,
      matchedIdentity: "category_type",
      effectiveWeekStart: wk.start,
      effectiveWeekEnd: wk.end,
      diagnostics,
    };
  }

  return {
    excluded: false,
    scope: "none",
    reason: "no_match",
    matchedSignalId: null,
    matchedIdentity: null,
    effectiveWeekStart: null,
    effectiveWeekEnd: null,
    diagnostics,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Recurring-series soft demotion.
 *
 * Rule (product): "not this week" hard-excludes for its tagged week only —
 * the user sees the event again the following week. But when the event is a
 * RECURRING series, the tag is a weak lasting preference: for the 4 weeks
 * after the tagged week we keep a soft demotion so the series stops being
 * the automatic plan-slot pick, while still appearing in Week Ahead (where
 * it carries the existing `historically_low_signal` tag).
 *
 * Recurrence is inferred from the memory row's canonical event_id, which
 * embeds the tagged occurrence's start epoch:
 *   `canonical:<normalised title>|<startMs>|<durationHours>`
 * A candidate on the same local weekday as the tagged occurrence is treated
 * as the same recurring series. When the epoch cannot be read we do NOT
 * demote (conservative — a one-off must not be punished for 4 weeks).
 *
 * `never` is untouched here: it is permanent and handled by
 * `evaluateEventPriorityExclusion` above.
 * ──────────────────────────────────────────────────────────────────────── */

/** Soft penalty applied to a recurring series in its post-tag decay window. */
export const RECURRING_DEPRIORITISE_PENALTY = -25;

/** Number of weeks after the tagged week that the soft demotion survives. */
export const RECURRING_DEPRIORITISE_WEEKS = 4;

function startMsFromCanonicalEventId(eventId: string | null | undefined): number | null {
  if (!eventId || typeof eventId !== "string") return null;
  const parts = eventId.split("|");
  if (parts.length < 2) return null;
  const ms = Number(parts[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function localWeekdayOf(ms: number, timezone: string): number | null {
  try {
    return dayOfWeekFromIsoDate(toLocalDateString(new Date(ms), timezone));
  } catch {
    return null;
  }
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface RecurringDemotionResult {
  /** Negative score delta to add (0 when the rule does not apply). */
  delta: number;
  reason: string | null;
  matchedSignalId: string | null;
}

/**
 * Soft demotion for a recurring series previously tagged "not this week".
 * Returns `{ delta: 0 }` unless every condition holds:
 *   - a `not_this_week` row matches the candidate by (category, type_key)
 *   - its effective week ENDED before `targetDate` (the tagged week itself is
 *     a hard exclusion handled by `evaluateEventPriorityExclusion`)
 *   - `targetDate` is within RECURRING_DEPRIORITISE_WEEKS of that week
 *   - the tagged occurrence falls on the same local weekday as the candidate
 *   - no later `priority` / `tag_cleared` row supersedes it
 */
export function evaluateRecurringDeprioritisation(input: {
  memoryRows: MemoryRow[];
  candidate: ExclusionCandidate;
  targetDate: string;
  timezone: string;
}): RecurringDemotionResult {
  const { memoryRows, candidate, targetDate, timezone } = input;
  const none: RecurringDemotionResult = { delta: 0, reason: null, matchedSignalId: null };

  const candidateStartMs = Date.parse(candidate.startTimeISO || "");
  if (!Number.isFinite(candidateStartMs)) return none;
  const candidateWeekday = localWeekdayOf(candidateStartMs, timezone);
  if (candidateWeekday === null) return none;

  for (const row of memoryRows) {
    if (row.signal !== "not_this_week") continue;
    if (row.event_category !== candidate.category || row.event_type_key !== candidate.typeKey) {
      continue;
    }
    const wk = effectiveWeekOf(row, timezone);
    // Inside the tagged week → hard exclusion path owns it.
    if (withinWeek(targetDate, wk.start, wk.end)) continue;
    // Only forward-looking decay; earlier dates are irrelevant.
    if (targetDate <= wk.end) continue;
    if (targetDate > addDaysISO(wk.end, RECURRING_DEPRIORITISE_WEEKS * 7)) continue;

    const taggedMs = startMsFromCanonicalEventId(row.event_id);
    if (taggedMs === null) continue;
    if (localWeekdayOf(taggedMs, timezone) !== candidateWeekday) continue;

    if (isSuperseded(row, memoryRows)) continue;

    return {
      delta: RECURRING_DEPRIORITISE_PENALTY,
      reason: "recurring_series_deprioritised_recently",
      matchedSignalId: row.id,
    };
  }

  return none;
}

/**
 * Deterministic per-user revision hash used inside snapshot input signatures.
 * Change → snapshot signature changes → regeneration on next fetch.
 *
 * Passes rows that are potentially relevant for `targetDate`:
 *   - permanent (`never`, always relevant)
 *   - target_week signals whose window contains targetDate (persisted OR legacy-derived)
 *   - restore rows in the last 21 days that could supersede either of the above
 */
export async function computeExclusionRevision(
  rows: MemoryRow[],
  targetDate: string,
  timezone: string,
): Promise<string> {
  const relevant = rows.filter((row) => {
    if (row.signal === "never") return true;
    if (row.signal === "not_this_week") {
      const wk = effectiveWeekOf(row, timezone);
      return withinWeek(targetDate, wk.start, wk.end);
    }
    if (row.signal === "priority" || row.signal === "tag_cleared") {
      const ageMs = Date.now() - new Date(row.occurred_at).getTime();
      return ageMs <= 21 * 86_400_000;
    }
    return false;
  });

  relevant.sort((a, b) => {
    const t = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const canonical = relevant.map((r) => [
    r.signal,
    r.event_category,
    r.event_type_key,
    r.resolved_event_id ?? "",
    r.effective_week_start ?? "",
    r.effective_week_end ?? "",
    (r.meta as any)?.deleted === true ? "1" : "0",
  ].join("|")).join("\n");

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
