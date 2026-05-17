/**
 * CLUSTER: Conference / Summit / Multi-day external event (v2)
 *
 * APPLICATION ACROSS SURFACES (all rules unless noted): brief, plan, nudge.
 *   The single exception is `conferenceMidSessionReset` which is nudge-only —
 *   it fires an inline somatic prompt without pulling the user into the brief
 *   or plan UI.
 *
 * SEVERITY MODEL: engagement-type-led, day-count-amplified.
 *   Base: attend-only=low | drop-in speaking=medium | attend+speaking=high
 *   Amplifier: +1 severity step per consecutive conference day beyond Day 1,
 *              capped at "high".
 *
 * SIGNAL SOURCE: brief-signal-coverage.ts is the universal mechanical signal
 * builder for brief, plan AND nudge. Triangulation fields (userTagged*,
 * conferenceSocialLoadHigh) are written by the Edge consumer.
 *
 * TRAVEL ↔ SUMMIT HANDOFF: Travel cluster still overrides on the travel day
 * itself. The `conferenceNightBeforeSummit` rule reads
 * `yesterdayWasTravelDay` and `travelDay` to escalate evening framing toward
 * "offload travel + ground for summit" — this is the only place the two
 * clusters intentionally co-fire.
 *
 * NUDGE → BRIEF/PLAN HANDOFF: every rule that fires on the `nudge` surface
 * carries a `copyHint` ending in either `· open-brief` or `· open-plan`,
 * except `conferenceMidSessionReset` which ends in `· inline-somatic`.
 */

import type {
  BehaviourFlag,
  RuleContext,
  Severity,
  SignalMatrix,
} from "../brief-context.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_LADDER: Severity[] = ["low", "medium", "high"];

export function amplifyByDayCount(base: Severity, dayNumber: number | null | undefined): Severity {
  const day = typeof dayNumber === "number" ? dayNumber : 1;
  const baseIdx = SEVERITY_LADDER.indexOf(base);
  const idx = Math.min(2, baseIdx + Math.max(0, day - 1));
  return SEVERITY_LADDER[idx];
}

export function engagementBaseSeverity(
  hasSpeaking: boolean,
  hasFullDayWrapper: boolean,
): Severity {
  if (hasSpeaking && hasFullDayWrapper) return "high";
  if (hasSpeaking) return "medium"; // drop-in or stand-alone speaking
  return "low";                     // attend-only
}

function isConferenceDay(s: SignalMatrix): boolean {
  return typeof s.conferenceDayNumber === "number" && s.conferenceDayNumber >= 1;
}

function hasSpeakingToday(s: SignalMatrix): boolean {
  return (s.speakingBlocksToday?.length ?? 0) > 0;
}

function firstSpeakingMinutesUntil(s: SignalMatrix): number | null {
  const list = s.speakingBlocksToday ?? [];
  const upcoming = list.filter((b) => b.minutesUntil >= 0)
                       .sort((a, b) => a.minutesUntil - b.minutesUntil);
  return upcoming[0]?.minutesUntil ?? null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** PRE — night before Day 1 of a summit. Evening only.
 *  Escalates when paired with a same-day or prior-day travel signal. */
export function conferenceNightBeforeSummit(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (!s.conferenceStartsTomorrow) return null;
  if (ctx.localHour < 17) return null;

  const travelBridge = s.yesterdayWasTravelDay === true || s.travelDay === true;
  const severity: Severity = travelBridge ? "high" : "medium";
  const framing = travelBridge
    ? "offload travel fatigue and ground for the summit week ahead"
    : "set the tone for tomorrow — name what matters, protect rest tonight";

  return {
    rule: "conferenceNightBeforeSummit",
    severity,
    evidence: travelBridge
      ? ["summit starts tomorrow", "travel fatigue in last 24h"]
      : ["summit starts tomorrow"],
    anchorEvent: s.conferenceEventTitle ?? undefined,
    stake: "Physical Recovery",
    copyHint: `night-before-summit · ${framing} · open-brief`,
  };
}

/** Conference day, no speaking. Recovery-emphasis ladder by day count. */
export function conferenceDayAttend(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (!isConferenceDay(s)) return null;
  if (hasSpeakingToday(s)) return null; // attend+speak rule wins

  // Engagement-led base: a true "attend & explore" day has zero parallel
  // meetings (the user is browsing sessions, learning, no people-load).
  // Anything ≥1 parallel meeting is active engagement (in-venue 1:1s OR
  // external meetings clocked in alongside the summit) → social/cognitive
  // load is materially higher even on Day 1.
  const parallel = s.conferenceParallelMeetingsToday ?? 0;
  const engagementBase: Severity =
    parallel >= 3 ? "high" : parallel >= 1 ? "medium" : "low";
  const severity = amplifyByDayCount(engagementBase, s.conferenceDayNumber);
  const day = s.conferenceDayNumber!;
  const engagementTag =
    parallel >= 1
      ? `attend + ${parallel} parallel meeting${parallel === 1 ? "" : "s"}`
      : "attend-only (exploring)";
  const framing =
    parallel >= 1
      ? "attend + parallel meetings · morning intent now; protect a recovery beat between blocks; end-of-day offload · prevents social/cognitive load compounding"
      : "attend-only conference day · morning intent + end-of-day offload · prevents cumulative fatigue across the event";
  return {
    rule: "conferenceDayAttend",
    severity,
    evidence: [`conference day ${day}`, engagementTag],
    anchorEvent: s.conferenceEventTitle ?? undefined,
    stake: "Physical Recovery",
    copyHint: `${framing} · open-plan`,
  };
}

/** Conference day with at least one speaking sub-block. High-stakes layered on
 *  top of cumulative load. Drives both the morning Mindset-Flow and the 45-min
 *  pre-stage JIT nudge (delivered by the nudge surface when minutesUntil is in
 *  the [40,50] window — the rule itself fires for the day; the nudge layer
 *  windows it). */
export function conferenceDayWithSpeaking(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (!isConferenceDay(s)) return null;
  if (!hasSpeakingToday(s)) return null;

  const day = s.conferenceDayNumber ?? 1;
  const base = engagementBaseSeverity(true, s.hasFullDayConferenceWrapper === true);
  // attend+speaking already starts at high; day-count keeps it at high.
  const severity: Severity = day >= 2 ? "high" : base;

  const nextStageMins = firstSpeakingMinutesUntil(s);
  const evidence = [`conference day ${day}`, `${s.speakingBlocksToday!.length} speaking block(s)`];
  if (typeof nextStageMins === "number") evidence.push(`next stage in ${nextStageMins}m`);

  return {
    rule: "conferenceDayWithSpeaking",
    severity,
    evidence,
    anchorEvent: s.speakingBlocksToday![0].title,
    stake: "Executive Presence",
    copyHint:
      `attend + speaking day · morning Mindset-Flow now; ~45m before stage tighten presence; end-of-day Somatic-Reenergise to prevent next-day crash · open-plan`,
  };
}

/** Standalone speaking block with no full-day conference wrapper. Treat as a
 *  high-stakes proximity event. MVP: no 24h advance — proximity only. */
export function dropInSpeakingHighStakes(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (isConferenceDay(s)) return null;          // covered by attend+speaking rule
  if (!hasSpeakingToday(s)) return null;

  const next = firstSpeakingMinutesUntil(s);
  const block = s.speakingBlocksToday![0];
  return {
    rule: "dropInSpeakingHighStakes",
    severity: "medium",
    evidence: typeof next === "number"
      ? [`drop-in ${block.kind}`, `${next}m to stage`]
      : [`drop-in ${block.kind}`],
    anchorEvent: block.title,
    stake: "Executive Presence",
    copyHint:
      `drop-in stage commitment · morning Mindset-Flow + 45m pre-stage presence; recover after · open-plan`,
  };
}

/** DURING — mid-session reset. Nudge-scope only (no brief/plan handoff).
 *  Fires when first inter-session gap on a conference day is ≥30 min. */
export function conferenceMidSessionReset(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (!isConferenceDay(s)) return null;
  const gap = s.firstSessionGapMinutesToday;
  if (typeof gap !== "number" || gap < 30) return null;

  return {
    rule: "conferenceMidSessionReset",
    severity: "medium",
    evidence: [`${gap}m inter-session gap`],
    stake: "Physical Recovery",
    copyHint:
      `mid-session reset · 3–5 min Somatic-Flow between sessions to clear sympathetic load · inline-somatic`,
  };
}

/** POST (trailing) — conference fatigue carried into a non-conference day. */
export function conferenceCarryFatigue(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  if (isConferenceDay(s)) return null;
  const trailing = s.conferenceDaysInTrailing4 ?? 0;
  if (trailing < 1) return null;

  const load = s.trailingConferenceLoad ?? "low";
  const severity: Severity = load === "high" ? "high" : load === "medium" ? "medium" : "low";

  return {
    rule: "conferenceCarryFatigue",
    severity,
    evidence: [`${trailing} conference day(s) in trailing 4`, `load:${load}`],
    stake: "Physical Recovery",
    copyHint:
      `post-conference carry · lighter touch this morning + Somatic-Reenergise tonight; prevents the re-entry-week crash · open-plan`,
  };
}

/** POST — re-entry the day after the LAST day of a multi-day event. */
export function postConferenceReentry(ctx: RuleContext): BehaviourFlag | null {
  const s = ctx.signals;
  const yDay = s.conferenceDayNumberYesterday;
  if (typeof yDay !== "number" || yDay < 2) return null;

  const dense = (s.nextThreeDaysMeetingCount ?? 0) >= 10;
  const severity: Severity = dense ? "high" : "medium";

  return {
    rule: "postConferenceReentry",
    severity,
    evidence: dense
      ? [`yesterday was day ${yDay} of multi-day event`, "next 3 days dense"]
      : [`yesterday was day ${yDay} of multi-day event`],
    stake: "Physical Recovery",
    copyHint:
      `re-entry close-out · Mindset-Pause to set the week's intent + Somatic-Reenergise to clear residue · open-brief`,
  };
}

// ---------------------------------------------------------------------------
// Legacy escalator — kept for backward-compat and as a multi-day severity
// reference other rules can read. Detection unchanged.
// ---------------------------------------------------------------------------

export function conferenceDepletion(ctx: RuleContext): BehaviourFlag | null {
  const day = ctx.conferenceDayNumber ?? ctx.signals.conferenceDayNumber ?? null;
  if (typeof day !== "number" || day < 2) return null;
  const severity: Severity = day >= 3 ? "high" : "medium";
  return {
    rule: "conferenceDepletion",
    severity,
    evidence: [`conference day ${day}`],
    stake: "Physical Recovery",
    copyHint:
      "name the cumulative cost of multi-day on-stage time; orient to recovery protection, not output expansion",
  };
}