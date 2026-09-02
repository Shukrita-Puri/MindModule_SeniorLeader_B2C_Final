/**
 * event-phase.ts — SSOT for how a calendar event may be REFERRED TO at send
 * time.
 *
 * The launch bug: an OHS block running 10:00–15:00 was described at noon as
 * "next". An event that is underway is never "next". Both the deterministic
 * bank and the LLM prompt/validator consume this module so the wording always
 * matches the clock.
 *
 * Pure module. No IO.
 */

export type EventPhase = "upcoming" | "underway" | "completed" | "tomorrow";

export interface PhaseInput {
  startMs: number;
  endMs: number;
  nowMs: number;
  /** Start of the user's local "tomorrow", in epoch ms. */
  tomorrowStartMs?: number | null;
}

/** Full-day arc threshold: a block this long is one arc, not a meeting. */
export const FULL_DAY_ARC_MINUTES = 180;

export function resolveEventPhase(input: PhaseInput): EventPhase {
  const { startMs, endMs, nowMs } = input;
  const tomorrowStart = input.tomorrowStartMs ?? null;
  if (tomorrowStart !== null && startMs >= tomorrowStart) return "tomorrow";
  if (nowMs >= startMs && nowMs < endMs) return "underway";
  if (nowMs >= endMs) return "completed";
  return "upcoming";
}

export function minutesUntil(startMs: number, nowMs: number): number {
  return Math.round((startMs - nowMs) / 60000);
}

export function minutesRemaining(endMs: number, nowMs: number): number {
  return Math.max(0, Math.round((endMs - nowMs) / 60000));
}

function humanDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return h === 1 ? "an hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

/** True when the block is long enough to be described as a full-day arc. */
export function isFullDayArc(startMs: number, endMs: number): boolean {
  return (endMs - startMs) / 60000 >= FULL_DAY_ARC_MINUTES;
}

/**
 * Phase-correct clause for a named event, e.g.
 *   upcoming  → `Board Review in 40 min`
 *   underway  → `Board Review is underway, another 2 hours to run`
 *   completed → `Board Review is behind you`
 *   tomorrow  → `Board Review tomorrow`
 */
export function phaseClause(
  title: string,
  phase: EventPhase,
  input: Pick<PhaseInput, "startMs" | "endMs" | "nowMs">,
): string {
  const name = title.trim() || "your next block";
  switch (phase) {
    case "upcoming": {
      const mins = Math.max(1, minutesUntil(input.startMs, input.nowMs));
      return `${name} in ${humanDuration(mins)}`;
    }
    case "underway": {
      const left = minutesRemaining(input.endMs, input.nowMs);
      const arc = isFullDayArc(input.startMs, input.endMs);
      if (left <= 0) return `${name} is wrapping up`;
      return arc
        ? `${name} is running, another ${humanDuration(left)} to go`
        : `${name} is underway for another ${humanDuration(left)}`;
    }
    case "completed":
      return `${name} is behind you`;
    case "tomorrow":
      return `${name} tomorrow`;
  }
}

/**
 * Words that assert an event has not started yet. Copy may not use them when
 * the anchor event is underway or completed.
 */
const FUTURE_MARKERS = [
  " is next",
  "is next.",
  "up next",
  "coming up",
  "ahead of you",
  "before your next",
];

/** Returns a violation string when the copy's tense contradicts the phase. */
export function validateEventPhaseInCopy(
  body: string,
  phase: EventPhase,
): string | null {
  if (phase !== "underway" && phase !== "completed") return null;
  const lower = body.toLowerCase();
  const hit = FUTURE_MARKERS.find((m) => lower.includes(m));
  return hit ? `future-tense phrase "${hit.trim()}" on an ${phase} event` : null;
}
