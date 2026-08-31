// OWNERSHIP: engineering. Tiered evidence bundle behind the Today's-3
// "Why this matters" line.
//
// One entry point — `buildWhyEvidence()` — returns ranked evidence items,
// each carrying tier, valence, confidence, n and a rendered phrase. The SAME
// bundle feeds the deterministic composer and the Why-line LLM prompt, so the
// two paths can never disagree on the facts.
//
// Tiers (why-now strength): pattern > behavioural > strategic > immediate.
// Valence drives the app's proactive role (see copy-contract.ts):
//   positive → Protect · risk → Prevent · strategic → Prepare/Build.
//
// Pure module: no DB, no fetch, no Date-dependent branching beyond what the
// caller passes in. Fully unit-testable.

import type { EventCategoryId } from "../events/event-categories.ts";
import type { EvidenceValence, SlotRole } from "./copy-contract.ts";
import { roleFromValence } from "./copy-contract.ts";

export type EvidenceTier =
  | "pattern"
  | "behavioural"
  | "strategic"
  | "immediate";

export type EvidenceConfidence = "strong" | "emerging" | "weak";

export interface WhyEvidence {
  id: string;
  tier: EvidenceTier;
  valence: EvidenceValence;
  confidence: EvidenceConfidence;
  /** Sample size behind the claim; 0 for single readings. */
  n: number;
  /** Rendered, one-clause phrase — already user-facing English. */
  phrase: string;
}

export interface CausalitySignalSummary {
  event_to_hrv?: Array<{
    event_type?: string;
    n?: number;
    hrvDeltaPct?: number;
    rhrElevated?: boolean;
    confidence?: string;
  }>;
  event_to_rhr?: Array<{
    event_type?: string;
    n?: number;
    rhrDeltaPct?: number;
    confidence?: string;
  }>;
  sleep_to_prs?:
    | { lowSleepPrsDeltaPct?: number; n?: number; confidence?: string }
    | null;
  consecutive_load?:
    | { tailDeltaPct?: number; n?: number; confidence?: string }
    | null;
  performance_lift?: {
    category_lift?: Array<{
      categoryId?: string;
      categoryName?: string;
      compositeLift?: number;
      n?: number;
      confidence?: string;
    }>;
  } | null;
}

export interface ImmediateSignals {
  /** HRV vs the user's own baseline, in percent. */
  hrvDeltaPct: number | null;
  sleepScore: number | null;
  restingHR: number | null;
  /** 14-day resting-HR baseline. Required for any "elevated" claim. */
  restingHRBaseline: number | null;
  /** Count of back-to-back / same-slot collapsed meetings today. */
  backToBackCount: number | null;
  /** Self-declared clarity 1–5. */
  clarity: number | null;
  /** Self-declared body/energy 1–5. */
  bodyState: number | null;
  travelDebtActive: boolean | null;
}

export interface StrategicContext {
  /** Onboarding v8 — events the leader flagged as high-stakes. */
  stakesChips: string[];
  /** Onboarding v8 — sources of organisational load. */
  loadChips: string[];
  /** Onboarding v8 — what personally drains them. */
  burdenChips: string[];
  /** Onboarding v8 — declared growth goals. */
  goals: string[];
  /** CoS profile — primary depletion pattern, when synthesised. */
  depletionPattern: string | null;
  archetype: string | null;
}

export interface BehaviouralSignals {
  /** Practice-impact history: what has actually shifted this leader. */
  practiceImpact: Array<{
    practiceId: string;
    avgOutcomeShift: number;
    count: number;
  }>;
  /** Id of the practice selected for this slot, when known. */
  selectedPracticeId?: string | null;
  /** Consecutive days the leader has completed their plan. */
  completionStreakDays?: number | null;
}

export interface WhyEvidenceInput {
  anchor: {
    eventTitle: string | null;
    categoryId: EventCategoryId | null;
    /** Pattern bucket the causality engine keys `event_type` on. */
    patternBucket: string | null;
    phase: "pre" | "during" | "post" | null;
  };
  timeOfDay: "morning" | "afternoon" | "evening" | null;
  signalSummary: CausalitySignalSummary | null;
  immediate: ImmediateSignals;
  strategic: StrategicContext | null;
  behavioural: BehaviouralSignals | null;
}

export interface WhyEvidenceBundle {
  ranked: WhyEvidence[];
  top: WhyEvidence | null;
  /** Immediate-tier proof to pair with the top "why now", when distinct. */
  proof: WhyEvidence | null;
  role: SlotRole;
  /** True when neither pattern nor behavioural evidence exists yet. */
  coldStart: boolean;
}

const TIER_WEIGHT: Record<EvidenceTier, number> = {
  pattern: 40,
  behavioural: 30,
  strategic: 20,
  immediate: 10,
};

const VALENCE_WEIGHT: Record<EvidenceValence, number> = {
  risk: 3,
  positive: 2,
  strategic: 1,
  neutral: 0,
};

const CONFIDENCE_WEIGHT: Record<EvidenceConfidence, number> = {
  strong: 2,
  emerging: 1,
  weak: 0,
};

function normConfidence(raw: unknown): EvidenceConfidence {
  const c = String(raw || "").toLowerCase();
  if (c === "strong") return "strong";
  if (c === "emerging" || c === "moderate") return "emerging";
  return "weak";
}

function countPhrase(n: number): string {
  if (n >= 5) return `your last ${n}`;
  if (n === 4) return "your last four";
  if (n === 3) return "your last three";
  return "recent";
}

function lower(s: string): string {
  return String(s || "").toLowerCase().trim();
}

/** Light noun for the anchor: the event title itself, or the bucket. */
function anchorNoun(input: WhyEvidenceInput): string {
  const t = (input.anchor.eventTitle || "").trim();
  if (t) return t;
  const b = (input.anchor.patternBucket || "").replace(/_/g, " ").trim();
  return b || "these days";
}

// ════════════════════════════════════════════════════════════════════════
// Tier builders
// ════════════════════════════════════════════════════════════════════════

function patternEvidence(input: WhyEvidenceInput): WhyEvidence[] {
  const out: WhyEvidence[] = [];
  const ss = input.signalSummary;
  if (!ss) return out;
  const bucket = lower(input.anchor.patternBucket || "");
  const noun = anchorNoun(input);

  for (const row of ss.event_to_hrv || []) {
    const n = Number(row?.n ?? 0);
    const delta = Number(row?.hrvDeltaPct ?? 0);
    const conf = normConfidence(row?.confidence);
    if (n < 3 || conf === "weak") continue;
    if (!bucket || lower(row?.event_type || "") !== bucket) continue;
    if (delta <= -10) {
      out.push({
        id: `pattern.event_to_hrv.${row.event_type}`,
        tier: "pattern",
        valence: "risk",
        confidence: conf,
        n,
        phrase: `Recovery drops after ${noun} — ${countPhrase(n)} times running.`,
      });
    } else if (delta >= 10) {
      out.push({
        id: `pattern.event_to_hrv.positive.${row.event_type}`,
        tier: "pattern",
        valence: "positive",
        confidence: conf,
        n,
        phrase: `You come out of ${noun} recovered, not drained.`,
      });
    }
    if (row?.rhrElevated) {
      out.push({
        id: `pattern.rhr_elevated.${row.event_type}`,
        tier: "pattern",
        valence: "risk",
        confidence: conf,
        n,
        phrase: `Elevated heart rate before ${countPhrase(n)} ${noun}.`,
      });
    }
  }

  for (const row of ss.event_to_rhr || []) {
    const n = Number(row?.n ?? 0);
    const delta = Number(row?.rhrDeltaPct ?? 0);
    const conf = normConfidence(row?.confidence);
    if (n < 3 || conf === "weak" || delta < 5) continue;
    if (!bucket || lower(row?.event_type || "") !== bucket) continue;
    out.push({
      id: `pattern.event_to_rhr.${row.event_type}`,
      tier: "pattern",
      valence: "risk",
      confidence: conf,
      n,
      phrase: `Your heart rate runs high around ${noun}, ${countPhrase(n)} times.`,
    });
  }

  const sleep = ss.sleep_to_prs;
  if (sleep && Number(sleep.n ?? 0) >= 3) {
    const conf = normConfidence(sleep.confidence);
    const d = Number(sleep.lowSleepPrsDeltaPct ?? 0);
    if (conf !== "weak" && d <= -5) {
      out.push({
        id: "pattern.sleep_to_prs",
        tier: "pattern",
        valence: "risk",
        confidence: conf,
        n: Number(sleep.n ?? 0),
        phrase: `Short sleep reliably costs you performance the next day.`,
      });
    }
  }

  const load = ss.consecutive_load;
  if (load && Number(load.n ?? 0) >= 3) {
    const conf = normConfidence(load.confidence);
    const d = Number(load.tailDeltaPct ?? 0);
    if (conf !== "weak" && d <= -5) {
      out.push({
        id: "pattern.consecutive_load",
        tier: "pattern",
        valence: "risk",
        confidence: conf,
        n: Number(load.n ?? 0),
        phrase: `Back-to-back heavy days take a measurable toll on you.`,
      });
    }
  }

  const catLift = ss.performance_lift?.category_lift || [];
  const cat = input.anchor.categoryId;
  if (cat) {
    for (const row of catLift) {
      if (String(row?.categoryId || "") !== cat) continue;
      const n = Number(row?.n ?? 0);
      const conf = normConfidence(row?.confidence);
      const lift = Number(row?.compositeLift ?? 0);
      if (n < 3 || conf === "weak" || lift < 5) continue;
      out.push({
        id: `pattern.category_lift.${cat}`,
        tier: "pattern",
        valence: "positive",
        confidence: conf,
        n,
        phrase: `This is the kind of work you consistently perform best in.`,
      });
    }
  }

  return out;
}

function behaviouralEvidence(input: WhyEvidenceInput): WhyEvidence[] {
  const out: WhyEvidence[] = [];
  const b = input.behavioural;
  if (!b) return out;
  const selected = b.selectedPracticeId || null;
  if (selected) {
    const hit = (b.practiceImpact || []).find((p) =>
      p.practiceId === selected && p.count >= 3
    );
    if (hit && hit.avgOutcomeShift > 0.2) {
      out.push({
        id: `behavioural.practice_impact.${hit.practiceId}`,
        tier: "behavioural",
        valence: "positive",
        confidence: hit.count >= 5 ? "strong" : "emerging",
        n: hit.count,
        phrase: `This is the move that has actually shifted your state before.`,
      });
    }
  }
  const streak = Number(b.completionStreakDays ?? 0);
  if (streak >= 3) {
    out.push({
      id: "behavioural.streak",
      tier: "behavioural",
      valence: "positive",
      confidence: "emerging",
      n: streak,
      phrase: `${streak} days running — the rhythm is holding.`,
    });
  }
  return out;
}

/** Onboarding v8 chips that match this slot's anchor. */
function strategicEvidence(input: WhyEvidenceInput): WhyEvidence[] {
  const out: WhyEvidence[] = [];
  const s = input.strategic;
  if (!s) return out;
  const title = lower(input.anchor.eventTitle || "");
  const bucket = lower(input.anchor.patternBucket || "").replace(/_/g, " ");
  const haystack = `${title} ${bucket}`;

  const matches = (chip: string): boolean => {
    const tokens = lower(chip).split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    return tokens.some((t) => haystack.includes(t));
  };

  for (const chip of s.stakesChips || []) {
    if (!chip || !matches(chip)) continue;
    out.push({
      id: `strategic.stakes.${chip}`,
      tier: "strategic",
      valence: "strategic",
      confidence: "strong",
      n: 0,
      phrase: `You flagged ${lower(chip)} as one of your highest-stakes moments.`,
    });
    break;
  }

  for (const chip of s.burdenChips || []) {
    if (!chip) continue;
    if (matches(chip)) {
      out.push({
        id: `strategic.burden.${chip}`,
        tier: "strategic",
        valence: "strategic",
        confidence: "strong",
        n: 0,
        phrase: `You named ${lower(chip)} as what drains you most.`,
      });
      break;
    }
  }

  if (out.length === 0) {
    const burden = (s.burdenChips || [])[0];
    if (burden) {
      out.push({
        id: `strategic.burden.generic.${burden}`,
        tier: "strategic",
        valence: "strategic",
        confidence: "emerging",
        n: 0,
        phrase: `${burden} is the load you told us wears you down.`,
      });
    } else if (s.depletionPattern) {
      out.push({
        id: "strategic.depletion",
        tier: "strategic",
        valence: "strategic",
        confidence: "emerging",
        n: 0,
        phrase: `${s.depletionPattern} is your recurring drain pattern.`,
      });
    }
  }

  return out;
}

function immediateEvidence(input: WhyEvidenceInput): WhyEvidence[] {
  const out: WhyEvidence[] = [];
  const i = input.immediate;

  if (typeof i.hrvDeltaPct === "number") {
    if (i.hrvDeltaPct <= -12) {
      out.push({
        id: "immediate.hrv_down",
        tier: "immediate",
        valence: "risk",
        confidence: "emerging",
        n: 0,
        phrase: `Recovery is running below your own baseline this morning.`,
      });
    } else if (i.hrvDeltaPct >= 15) {
      out.push({
        id: "immediate.hrv_up",
        tier: "immediate",
        valence: "positive",
        confidence: "emerging",
        n: 0,
        phrase: `Recovery is running well above your baseline going in.`,
      });
    }
  }

  // RHR only counts as elevated against the user's own baseline.
  if (
    typeof i.restingHR === "number" && typeof i.restingHRBaseline === "number" &&
    i.restingHRBaseline > 0
  ) {
    const delta = i.restingHR - i.restingHRBaseline;
    if (delta >= 3) {
      out.push({
        id: "immediate.rhr_elevated",
        tier: "immediate",
        valence: "risk",
        confidence: "emerging",
        n: 0,
        phrase: `Resting heart rate is sitting above your baseline.`,
      });
    } else if (delta <= -2) {
      out.push({
        id: "immediate.rhr_low",
        tier: "immediate",
        valence: "positive",
        confidence: "emerging",
        n: 0,
        phrase: `Resting heart rate has settled back to baseline.`,
      });
    }
  }

  if (typeof i.sleepScore === "number") {
    if (i.sleepScore < 65) {
      out.push({
        id: "immediate.sleep_short",
        tier: "immediate",
        valence: "risk",
        confidence: "emerging",
        n: 0,
        phrase: `Sleep ran short last night.`,
      });
    } else if (i.sleepScore >= 85) {
      out.push({
        id: "immediate.sleep_strong",
        tier: "immediate",
        valence: "positive",
        confidence: "emerging",
        n: 0,
        phrase: `Sleep landed well last night.`,
      });
    }
  }

  if (typeof i.backToBackCount === "number" && i.backToBackCount >= 4) {
    out.push({
      id: "immediate.back_to_back",
      tier: "immediate",
      valence: "risk",
      confidence: "emerging",
      n: i.backToBackCount,
      phrase:
        `${i.backToBackCount} meetings back-to-back with no gap between them.`,
    });
  }

  if (typeof i.clarity === "number" && i.clarity > 0 && i.clarity <= 2) {
    out.push({
      id: "immediate.clarity_low",
      tier: "immediate",
      valence: "risk",
      confidence: "emerging",
      n: 0,
      phrase: `Clarity is already reading low at check-in.`,
    });
  }

  if (typeof i.bodyState === "number" && i.bodyState > 0 && i.bodyState <= 2) {
    out.push({
      id: "immediate.body_low",
      tier: "immediate",
      valence: "risk",
      confidence: "emerging",
      n: 0,
      phrase: `Body energy is reading low at check-in.`,
    });
  }

  if (i.travelDebtActive) {
    out.push({
      id: "immediate.travel_debt",
      tier: "immediate",
      valence: "risk",
      confidence: "emerging",
      n: 0,
      phrase: `You are still carrying the cost of the time-zone move.`,
    });
  }

  return out;
}

function score(e: WhyEvidence): number {
  return TIER_WEIGHT[e.tier] + VALENCE_WEIGHT[e.valence] * 2 +
    CONFIDENCE_WEIGHT[e.confidence] + Math.min(e.n, 5) * 0.1;
}

/**
 * Build the ranked evidence bundle for one slot. Never throws; a fully empty
 * input yields a cold-start bundle with `top === null`.
 */
export function buildWhyEvidence(input: WhyEvidenceInput): WhyEvidenceBundle {
  const items = [
    ...patternEvidence(input),
    ...behaviouralEvidence(input),
    ...strategicEvidence(input),
    ...immediateEvidence(input),
  ];
  const ranked = items.sort((a, b) => score(b) - score(a));
  const top = ranked[0] ?? null;
  const proof = ranked.find((e) =>
    e.tier === "immediate" && e.id !== top?.id
  ) ?? null;

  const coldStart = !ranked.some((e) =>
    e.tier === "pattern" || e.tier === "behavioural"
  );

  const hasAnchor = !!(input.anchor.eventTitle || "").trim();
  const valence: EvidenceValence = top?.valence ?? "neutral";
  const role = roleFromValence(valence, hasAnchor);

  return { ranked, top, proof, role, coldStart };
}

/**
 * Deterministic Why line — exactly one clause off the top-ranked evidence.
 * Falls back to the app's proactive role against the anchor when there is no
 * evidence at all (genuinely new user, no wearable, no patterns).
 */
export function composeEvidenceWhyLine(
  bundle: WhyEvidenceBundle,
  ctx: {
    anchorTitle: string | null;
    timeOfDay: "morning" | "afternoon" | "evening" | null;
    lightDay?: boolean;
  },
): string {
  if (bundle.top) return bundle.top.phrase;

  const anchor = (ctx.anchorTitle || "").trim();
  if (anchor) {
    return `${anchor} is the moment today that most rewards being ready.`;
  }
  if (ctx.timeOfDay === "evening") {
    return `Nothing heavy left today — this is where tomorrow's capacity is built.`;
  }
  if (ctx.lightDay) {
    return `Open day — the one block you actually control.`;
  }
  return `Early days — this is the base your harder weeks run on.`;
}

/** Ranked evidence rendered for the LLM prompt. */
export function renderEvidenceBlock(bundle: WhyEvidenceBundle): string {
  if (!bundle.ranked.length) {
    return [
      `=== EVIDENCE (ranked) ===`,
      `- none available (cold start) — justify by the app's role: ${bundle.role}.`,
    ].join("\n");
  }
  const lines = bundle.ranked.slice(0, 4).map((e) =>
    `- [${e.tier}/${e.valence}/${e.confidence}${e.n ? `/n=${e.n}` : ""}] ${e.phrase}`
  );
  return [
    `=== EVIDENCE (ranked — use the top item; the rest is context) ===`,
    ...lines,
    `Slot role: ${bundle.role} (the title already carries this verb — do not repeat it).`,
  ].join("\n");
}
